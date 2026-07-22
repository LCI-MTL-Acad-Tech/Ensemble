"""
Classroom interaction tool — server.

Built through an iterative collaboration between Elisa Schaeffer (Dean of
Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
See the "How this tool was made" footer in client/index.html for the full
attribution note, and README.md for functionality/setup docs.

Run with:
    uvicorn server.main:app --host 0.0.0.0 --port 8000

Then on the projector / teacher machine open:
    http://<this-machine's-LAN-ip>:8000/

Students on the same WiFi (e.g. a portable router's network) open the same
URL from their own devices.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import session_manager as sm

BASE_DIR = Path(__file__).parent.parent
CLIENT_DIR = BASE_DIR / "client"

app = FastAPI(title="Classroom Interaction Tool")

# The single live session, created blank on server start.
live = sm.Session(name="Untitled session")


class ConnectionManager:
    """Tracks connected websocket clients and broadcasts messages to all."""

    def __init__(self) -> None:
        self.clients: dict[str, WebSocket] = {}
        self.names: dict[str, str] = {}

    async def connect(self, client_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.clients[client_id] = ws

    def disconnect(self, client_id: str) -> None:
        self.clients.pop(client_id, None)
        self.names.pop(client_id, None)

    async def send_to(self, client_id: str, message: dict) -> None:
        ws = self.clients.get(client_id)
        if ws is not None:
            await ws.send_json(message)

    async def broadcast(self, message: dict, exclude: str | None = None) -> None:
        dead = []
        for cid, ws in self.clients.items():
            if cid == exclude:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(cid)
        for cid in dead:
            self.disconnect(cid)


manager = ConnectionManager()


def full_state_message() -> dict:
    return {
        "type": "session_state",
        "name": live.name,
        "state": live.state,
        "clients": manager.names,
    }


# ---------------------------------------------------------------- websocket

@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    client_id = str(uuid.uuid4())
    await manager.connect(client_id, websocket)
    try:
        # Tell the new client who it is and give it the full current state.
        await manager.send_to(client_id, {"type": "welcome", "client_id": client_id})
        await manager.send_to(client_id, full_state_message())

        while True:
            raw = await websocket.receive_text()
            try:
                msg: dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await handle_message(client_id, msg)
    except WebSocketDisconnect:
        pass
    finally:
        live.remove_client(client_id)
        manager.disconnect(client_id)
        await manager.broadcast({
            "type": "traffic_light_update",
            "statuses": live.state["traffic_light"]["statuses"],
        })
        live.recompute_ordering_finished(list(manager.clients.keys()))
        await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})
        await manager.broadcast({"type": "client_left", "client_id": client_id})


async def handle_message(client_id: str, msg: dict) -> None:
    mtype = msg.get("type")

    if mtype == "join":
        name = str(msg.get("name", "Anonymous"))[:40]
        manager.names[client_id] = name
        live.ensure_blanks_default_vote(client_id, name)
        await manager.broadcast({"type": "client_joined", "client_id": client_id, "name": name})
        await manager.broadcast({"type": "blanks_update", "fill_blanks": live.state["fill_blanks"]})
        live.recompute_ordering_finished(list(manager.clients.keys()))
        await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})

    elif mtype == "chat_message":
        name = manager.names.get(client_id, "Anonymous")
        text = str(msg.get("text", "")).strip()[:1000]
        if not text:
            return
        parent_id = msg.get("parent_id")
        parent_id = str(parent_id) if parent_id else None
        entry = live.add_chat_message(name, text, parent_id)
        await manager.broadcast({"type": "chat_message", "message": entry})

    elif mtype == "traffic_light":
        name = manager.names.get(client_id, "Anonymous")
        color = msg.get("color")
        if color not in ("green", "yellow", "red", "gray"):
            return
        live.set_traffic_status(client_id, name, color)
        await manager.broadcast({
            "type": "traffic_light_update",
            "statuses": live.state["traffic_light"]["statuses"],
        })

    elif mtype == "tag_add":
        word = str(msg.get("word", ""))
        entry = live.add_tag(word)
        if entry:
            await manager.broadcast({"type": "tag_cloud_update", "words": live.state["tag_cloud"]["words"]})

    elif mtype == "poll_vote":
        idx = msg.get("option_index")
        if isinstance(idx, int) and live.vote_poll(client_id, idx):
            await manager.broadcast({"type": "poll_update", "poll": live.state["poll"]})

    elif mtype == "whiteboard_stroke_start":
        stroke = {
            "id": str(msg.get("id") or uuid.uuid4()),
            "color": msg.get("color", "#000000"),
            "size": msg.get("size", 3),
            "points": msg.get("points", []),
        }
        live.add_stroke(stroke)
        await manager.broadcast({"type": "whiteboard_stroke_start", "stroke": stroke}, exclude=client_id)

    elif mtype == "whiteboard_stroke_points":
        stroke_id = str(msg.get("id", ""))
        points = msg.get("points", [])
        live.add_stroke_points(stroke_id, points)
        await manager.broadcast(
            {"type": "whiteboard_stroke_points", "id": stroke_id, "points": points}, exclude=client_id
        )

    elif mtype == "whiteboard_postit":
        postit = {
            "id": str(msg.get("id") or uuid.uuid4()),
            "x": msg.get("x", 20),
            "y": msg.get("y", 20),
            "color": msg.get("color", "#fff59d"),
            "text": msg.get("text", ""),
        }
        live.upsert_postit(postit)
        await manager.broadcast({"type": "whiteboard_postit", "postit": postit}, exclude=client_id)

    elif mtype == "whiteboard_postit_delete":
        postit_id = str(msg.get("id", ""))
        live.remove_postit(postit_id)
        await manager.broadcast({"type": "whiteboard_postit_delete", "id": postit_id}, exclude=client_id)

    elif mtype == "blanks_move_piece":
        name = manager.names.get(client_id, "Anonymous")
        piece_id = str(msg.get("piece_id", ""))
        blank_id = msg.get("blank_id")
        blank_id = str(blank_id) if blank_id is not None else None
        if live.move_blank_piece(piece_id, blank_id, name):
            await manager.broadcast({"type": "blanks_update", "fill_blanks": live.state["fill_blanks"]})

    elif mtype == "blanks_react":
        name = manager.names.get(client_id, "Anonymous")
        piece_id = str(msg.get("piece_id", ""))
        reaction = msg.get("reaction")
        if live.react_to_blank_piece(piece_id, client_id, name, reaction):
            await manager.broadcast({"type": "blanks_update", "fill_blanks": live.state["fill_blanks"]})

    elif mtype == "blanks_vote":
        name = manager.names.get(client_id, "Anonymous")
        vote = msg.get("vote")
        if live.set_blanks_vote(client_id, name, vote):
            await manager.broadcast({"type": "blanks_update", "fill_blanks": live.state["fill_blanks"]})

    elif mtype == "spider_set_value":
        name = manager.names.get(client_id, "Anonymous")
        axis_id = str(msg.get("axis_id", ""))
        try:
            value = float(msg.get("value"))
        except (TypeError, ValueError):
            return
        if live.set_spider_value(client_id, name, axis_id, value):
            await manager.broadcast({"type": "spider_update", "spider": live.state["spider"]})

    elif mtype == "order_move_item":
        item_id = str(msg.get("item_id", ""))
        new_index = msg.get("new_index")
        if isinstance(new_index, int) and live.move_ordering_item(item_id, new_index):
            await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})

    elif mtype == "order_react":
        name = manager.names.get(client_id, "Anonymous")
        item_id = str(msg.get("item_id", ""))
        reaction = msg.get("reaction")
        if live.react_to_ordering_item(item_id, client_id, name, reaction):
            live.recompute_ordering_finished(list(manager.clients.keys()))
            await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})

    elif mtype == "qna_submit":
        text = str(msg.get("text", ""))
        q = live.add_qna_question(text)
        if q:
            await manager.broadcast({"type": "qna_update", "qna": live.state["qna"]})

    elif mtype == "qna_upvote":
        question_id = str(msg.get("question_id", ""))
        if live.toggle_qna_upvote(question_id, client_id):
            await manager.broadcast({"type": "qna_update", "qna": live.state["qna"]})


# ---------------------------------------------------------------- admin API
# No auth beyond "you're on the classroom's local WiFi" — this tool is meant
# to run on a closed portable-router network, not the open internet.

class SaveRequest(BaseModel):
    filename: str | None = None


class DuplicateRequest(BaseModel):
    source: str
    new_name: str


class LoadRequest(BaseModel):
    filename: str


class ResetRequest(BaseModel):
    name: str | None = None


class PollCreateRequest(BaseModel):
    question: str
    options: list[str]
    type: str = "bar"


class BlanksLoadRequest(BaseModel):
    title: str = ""
    text: str
    answers: dict[str, str]
    distractors: list[str] = []


class SpiderAxis(BaseModel):
    id: str
    label: str
    max: float = 5


class SpiderLoadRequest(BaseModel):
    title: str = ""
    axes: list[SpiderAxis]


class OrderLoadRequest(BaseModel):
    title: str = ""
    criterion: str = ""
    elements: list[str]


class PinRequest(BaseModel):
    target: str


class QnaModerateRequest(BaseModel):
    question_id: str
    answered: bool = True


class QnaDeleteRequest(BaseModel):
    question_id: str


class GroupsMakeRequest(BaseModel):
    mode: str = "size"  # "size" or "count"
    param: int = 4


class TimerSetRequest(BaseModel):
    seconds: int


@app.get("/api/session")
async def get_session():
    return full_state_message()


@app.get("/api/admin/sessions")
async def api_list_sessions():
    return sm.list_saved_sessions()


@app.post("/api/admin/save")
async def api_save_session(req: SaveRequest):
    saved_id = sm.save_session(live, req.filename)
    return {"ok": True, "id": saved_id}


@app.post("/api/admin/load")
async def api_load_session(req: LoadRequest):
    global live
    try:
        live = sm.load_session(req.filename)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    await manager.broadcast(full_state_message())
    return {"ok": True}


@app.post("/api/admin/duplicate")
async def api_duplicate_session(req: DuplicateRequest):
    try:
        new_id = sm.duplicate_session(req.source, req.new_name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Source session not found")
    return {"ok": True, "id": new_id}


@app.post("/api/admin/reset")
async def api_reset_session(req: ResetRequest):
    live.reset(req.name)
    await manager.broadcast(full_state_message())
    return {"ok": True}


@app.delete("/api/admin/sessions/{filename}")
async def api_delete_session(filename: str):
    sm.delete_session(filename)
    return {"ok": True}


@app.post("/api/admin/poll")
async def api_create_poll(req: PollCreateRequest):
    live.set_poll(req.question, req.options, req.type)
    await manager.broadcast({"type": "poll_update", "poll": live.state["poll"]})
    return {"ok": True}


@app.post("/api/admin/poll/close")
async def api_close_poll():
    live.close_poll()
    await manager.broadcast({"type": "poll_update", "poll": live.state["poll"]})
    return {"ok": True}


@app.post("/api/admin/tags/clear")
async def api_clear_tags():
    live.clear_tags()
    await manager.broadcast({"type": "tag_cloud_update", "words": live.state["tag_cloud"]["words"]})
    return {"ok": True}


@app.post("/api/admin/whiteboard/clear")
async def api_clear_whiteboard():
    live.clear_whiteboard()
    await manager.broadcast({"type": "whiteboard_clear"})
    return {"ok": True}


@app.post("/api/admin/blanks/load")
async def api_load_blanks(req: BlanksLoadRequest):
    live.load_blanks_template(req.title, req.text, req.answers, req.distractors)
    await manager.broadcast({"type": "blanks_update", "fill_blanks": live.state["fill_blanks"]})
    return {"ok": True}


@app.post("/api/admin/blanks/reset")
async def api_reset_blanks():
    live.reset_blanks_progress()
    await manager.broadcast({"type": "blanks_update", "fill_blanks": live.state["fill_blanks"]})
    return {"ok": True}


@app.post("/api/admin/spider/load")
async def api_load_spider(req: SpiderLoadRequest):
    live.load_spider_template(req.title, [a.model_dump() for a in req.axes])
    await manager.broadcast({"type": "spider_update", "spider": live.state["spider"]})
    return {"ok": True}


@app.post("/api/admin/spider/reset")
async def api_reset_spider():
    live.reset_spider_responses()
    await manager.broadcast({"type": "spider_update", "spider": live.state["spider"]})
    return {"ok": True}


@app.post("/api/admin/order/load")
async def api_load_order(req: OrderLoadRequest):
    live.load_ordering_template(req.title, req.criterion, req.elements)
    await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})
    return {"ok": True}


@app.post("/api/admin/order/reset")
async def api_reset_order():
    live.reset_ordering()
    await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})
    return {"ok": True}


@app.post("/api/admin/order/reveal")
async def api_reveal_order():
    live.reveal_ordering()
    await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})
    return {"ok": True}


@app.post("/api/admin/pin")
async def api_pin_tab(req: PinRequest):
    live.set_pinned_tab(req.target)
    await manager.broadcast({"type": "pin_update", "target": req.target})
    return {"ok": True}


@app.post("/api/admin/pin/clear")
async def api_clear_pin():
    live.set_pinned_tab(None)
    await manager.broadcast({"type": "pin_update", "target": None})
    return {"ok": True}


@app.post("/api/admin/qna/answer")
async def api_qna_answer(req: QnaModerateRequest):
    live.set_qna_answered(req.question_id, req.answered)
    await manager.broadcast({"type": "qna_update", "qna": live.state["qna"]})
    return {"ok": True}


@app.post("/api/admin/qna/delete")
async def api_qna_delete(req: QnaDeleteRequest):
    live.delete_qna_question(req.question_id)
    await manager.broadcast({"type": "qna_update", "qna": live.state["qna"]})
    return {"ok": True}


@app.post("/api/admin/qna/clear")
async def api_qna_clear():
    live.clear_qna()
    await manager.broadcast({"type": "qna_update", "qna": live.state["qna"]})
    return {"ok": True}


@app.post("/api/admin/groups/make")
async def api_groups_make(req: GroupsMakeRequest):
    connected = [
        {"client_id": cid, "name": name}
        for cid, name in manager.names.items()
        if cid in manager.clients
    ]
    live.make_groups(connected, req.mode, req.param)
    await manager.broadcast({"type": "groups_update", "groups": live.state["groups"]})
    return {"ok": True}


@app.post("/api/admin/groups/clear")
async def api_groups_clear():
    live.clear_groups()
    await manager.broadcast({"type": "groups_update", "groups": live.state["groups"]})
    return {"ok": True}


@app.post("/api/admin/timer/set")
async def api_timer_set(req: TimerSetRequest):
    live.set_timer_duration(req.seconds)
    await manager.broadcast({"type": "timer_update", "timer": live.state["timer"]})
    return {"ok": True}


@app.post("/api/admin/timer/start")
async def api_timer_start():
    live.start_timer()
    await manager.broadcast({"type": "timer_update", "timer": live.state["timer"]})
    return {"ok": True}


@app.post("/api/admin/timer/pause")
async def api_timer_pause():
    live.pause_timer()
    await manager.broadcast({"type": "timer_update", "timer": live.state["timer"]})
    return {"ok": True}


@app.post("/api/admin/timer/reset")
async def api_timer_reset():
    live.reset_timer()
    await manager.broadcast({"type": "timer_update", "timer": live.state["timer"]})
    return {"ok": True}


# ---------------------------------------------------------------- static

app.mount("/static", StaticFiles(directory=CLIENT_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(CLIENT_DIR / "index.html")
