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
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import moderation as mod
from . import session_manager as sm

BASE_DIR = Path(__file__).parent.parent
CLIENT_DIR = BASE_DIR / "client"
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
ACTION_LOG_FILE = LOGS_DIR / "action_log.jsonl"

app = FastAPI(title="Classroom Interaction Tool")

# The single live session, created blank on server start.
live = sm.Session(name="Untitled session")
moderation_list = mod.ModerationList()

# A record of every move request on the "collaborative position" actions
# (fill-in-the-blanks piece moves, ordering item moves) — both the ones
# that were applied and the ones denied for being based on a state that
# had already moved on. Bounded in memory for quick inspection via
# control.py; also appended to a JSONL file for anything longer-lived
# than the server process.
action_log: deque[dict] = deque(maxlen=1000)


def log_action(activity: str, action: str, client_id: str, name: str, detail: dict, outcome: str, rev: int) -> None:
    entry = {
        "ts": time.time(),
        "activity": activity,
        "action": action,
        "client_id": client_id,
        "name": name,
        "detail": detail,
        "outcome": outcome,  # "applied" | "denied_stale" | "denied_not_found" | "denied_no_change"
        "rev": rev,
    }
    action_log.append(entry)
    try:
        with open(ACTION_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        pass  # logging to disk is a nice-to-have, never worth crashing a live class over


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


def _sanitize_qna_for_clients(qna: dict) -> dict:
    """Strip asker identity before this crosses the WS wire to browsers —
    questions are anonymous to participants; only the REST-only
    /api/session endpoint (used by control.py) includes who asked, so
    `qna list`/`qna watch` can show it to the instructor."""
    sanitized_questions = {}
    for qid, q in qna["questions"].items():
        q2 = dict(q)
        q2.pop("asker_client_id", None)
        q2.pop("asker_name", None)
        sanitized_questions[qid] = q2
    return {**qna, "questions": sanitized_questions}


def raw_state_snapshot() -> dict:
    """The real, unsanitized state — includes qna asker identity. Used by
    the REST /api/session endpoint (control.py's data source) and nothing
    that reaches a browser directly."""
    return {
        "name": live.name,
        "state": live.state,
        "clients": manager.names,
    }


def full_state_message() -> dict:
    """The session_state message sent to browsers over the websocket —
    qna asker identity stripped, since questions are anonymous to
    participants (see _sanitize_qna_for_clients)."""
    state_copy = dict(live.state)
    state_copy["qna"] = _sanitize_qna_for_clients(live.state["qna"])
    return {
        "type": "session_state",
        "name": live.name,
        "state": state_copy,
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
        if moderation_list.contains_blocked_word(text):
            await manager.send_to(client_id, {"type": "chat_blocked"})
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
        if moderation_list.contains_blocked_word(word):
            await manager.send_to(client_id, {"type": "tag_blocked"})
            return
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
            "owner": client_id,
        }
        live.add_stroke(stroke)
        live.push_whiteboard_history(client_id, "stroke", stroke["id"])
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
            "text_color": msg.get("text_color", "#1b2330"),
            "font_size": msg.get("font_size", 14),
            "text": msg.get("text", ""),
        }
        created = live.upsert_postit(postit, client_id)
        if created:
            live.push_whiteboard_history(client_id, "postit", postit["id"])
        await manager.broadcast({"type": "whiteboard_postit", "postit": postit}, exclude=client_id)

    elif mtype == "whiteboard_postit_delete":
        postit_id = str(msg.get("id", ""))
        live.remove_postit(postit_id)
        await manager.broadcast({"type": "whiteboard_postit_delete", "id": postit_id}, exclude=client_id)

    elif mtype == "whiteboard_undo":
        entry = live.undo_whiteboard_action(client_id)
        if entry:
            await manager.broadcast({"type": "whiteboard_undo", "kind": entry["type"], "id": entry["id"]})

    elif mtype == "whiteboard_erase_mine":
        live.erase_client_whiteboard_work(client_id)
        await manager.broadcast({"type": "whiteboard_replace", "whiteboard": live.state["whiteboard"]})

    elif mtype == "blanks_move_piece":
        name = manager.names.get(client_id, "Anonymous")
        piece_id = str(msg.get("piece_id", ""))
        blank_id = msg.get("blank_id")
        blank_id = str(blank_id) if blank_id is not None else None
        client_rev = msg.get("rev")
        result = live.move_blank_piece(piece_id, blank_id, name, client_rev)
        log_action(
            "blanks", "move_piece", client_id, name,
            {"piece_id": piece_id, "blank_id": blank_id, "client_rev": client_rev},
            "applied" if result["ok"] else f"denied_{result['reason']}",
            result["rev"],
        )
        if result["ok"]:
            await manager.broadcast({"type": "blanks_update", "fill_blanks": live.state["fill_blanks"]})
            await manager.send_to(client_id, {
                "type": "action_applied", "activity": "blanks", "action": "move_piece",
                "piece_id": piece_id, "blank_id": blank_id,
            })
        else:
            await manager.send_to(client_id, {
                "type": "action_denied", "activity": "blanks", "action": "move_piece",
                "piece_id": piece_id, "reason": result["reason"], "current_rev": result["rev"],
            })

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
        name = manager.names.get(client_id, "Anonymous")
        item_id = str(msg.get("item_id", ""))
        new_index = msg.get("new_index")
        client_rev = msg.get("rev")
        if not isinstance(new_index, int):
            return
        result = live.move_ordering_item(item_id, new_index, client_rev)
        log_action(
            "order", "move_item", client_id, name,
            {"item_id": item_id, "new_index": new_index, "client_rev": client_rev},
            "applied" if result["ok"] else f"denied_{result['reason']}",
            result["rev"],
        )
        if result["ok"]:
            await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})
            await manager.send_to(client_id, {
                "type": "action_applied", "activity": "order", "action": "move_item",
                "item_id": item_id, "new_index": new_index,
            })
        elif result["reason"] != "no_change":  # dropping back in the same spot isn't worth a denial notice
            await manager.send_to(client_id, {
                "type": "action_denied", "activity": "order", "action": "move_item",
                "item_id": item_id, "reason": result["reason"], "current_rev": result["rev"],
            })

    elif mtype == "order_react":
        name = manager.names.get(client_id, "Anonymous")
        item_id = str(msg.get("item_id", ""))
        reaction = msg.get("reaction")
        if live.react_to_ordering_item(item_id, client_id, name, reaction):
            live.recompute_ordering_finished(list(manager.clients.keys()))
            await manager.broadcast({"type": "order_update", "ordering": live.state["ordering"]})

    elif mtype == "qna_submit":
        text = str(msg.get("text", "")).strip()[:500]
        if not text:
            return
        if moderation_list.contains_blocked_word(text):
            await manager.send_to(client_id, {"type": "qna_blocked"})
            return
        name = manager.names.get(client_id, "Anonymous")
        q = live.add_qna_question(text, client_id, name)
        if q:
            await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})

    elif mtype == "qna_react":
        question_id = str(msg.get("question_id", ""))
        reaction = msg.get("reaction")
        if live.react_to_qna_question(question_id, client_id, reaction):
            await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})

    elif mtype == "qna_reply_submit":
        name = manager.names.get(client_id, "Anonymous")
        question_id = str(msg.get("question_id", ""))
        text = str(msg.get("text", "")).strip()[:500]
        anonymous = bool(msg.get("anonymous"))
        if not text:
            return
        if moderation_list.contains_blocked_word(text):
            await manager.send_to(client_id, {"type": "qna_blocked"})
            return
        reply = live.add_qna_reply(question_id, client_id, name, text, anonymous, from_instructor=False)
        if reply:
            await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})

    elif mtype == "qna_reply_react":
        question_id = str(msg.get("question_id", ""))
        reply_id = str(msg.get("reply_id", ""))
        reaction = msg.get("reaction")
        if live.react_to_qna_reply(question_id, reply_id, client_id, reaction):
            await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})


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


class WhiteboardBackgroundRequest(BaseModel):
    image_url: str


class SlideLoadRequest(BaseModel):
    title: str = ""
    text: str = ""
    image_url: str = ""
    qr_url: str = ""


class ModerationLoadRequest(BaseModel):
    words: list[str]


class ModerationWordRequest(BaseModel):
    word: str


class QnaModerateRequest(BaseModel):
    question_id: str
    answered: bool = True


class QnaApprovalRequest(BaseModel):
    question_id: str
    value: str  # "approved" or "disapproved"


class QnaReplyRequest(BaseModel):
    question_id: str
    text: str


class QnaReplyDecisionRequest(BaseModel):
    question_id: str
    reply_id: str
    value: str  # "accepted" or "rejected"


class QnaReplyDeleteRequest(BaseModel):
    question_id: str
    reply_id: str


class QnaDeleteRequest(BaseModel):
    question_id: str


class GroupsMakeRequest(BaseModel):
    mode: str = "size"  # "size" or "count"
    param: int = 4
    prompt: str | None = None  # None = keep whatever prompt was already set


class GroupsPromptRequest(BaseModel):
    text: str


class TimerSetRequest(BaseModel):
    seconds: int


@app.get("/api/session")
async def get_session():
    return raw_state_snapshot()


@app.get("/api/admin/action_log")
async def api_action_log(limit: int = 50, activity: str | None = None):
    entries = list(action_log)
    if activity:
        entries = [e for e in entries if e["activity"] == activity]
    entries = entries[-limit:]
    entries.reverse()  # most recent first
    return {"entries": entries}


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


@app.post("/api/admin/whiteboard/background")
async def api_whiteboard_background(req: WhiteboardBackgroundRequest):
    live.set_whiteboard_background(req.image_url)
    await manager.broadcast({"type": "whiteboard_background", "image_url": req.image_url})
    return {"ok": True}


@app.post("/api/admin/whiteboard/background/clear")
async def api_whiteboard_background_clear():
    live.clear_whiteboard_background()
    await manager.broadcast({"type": "whiteboard_background", "image_url": ""})
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


@app.post("/api/admin/blanks/reveal")
async def api_reveal_blanks():
    live.reveal_blanks()
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


@app.post("/api/admin/slide/load")
async def api_slide_load(req: SlideLoadRequest):
    live.load_slide(req.title, req.text, req.image_url, req.qr_url)
    await manager.broadcast({"type": "slide_update", "slide": live.state["slide"]})
    return {"ok": True}


@app.post("/api/admin/slide/clear")
async def api_slide_clear():
    live.clear_slide()
    await manager.broadcast({"type": "slide_update", "slide": live.state["slide"]})
    return {"ok": True}


@app.get("/api/admin/moderation")
async def api_moderation_list():
    return {"words": moderation_list.to_list()}


@app.post("/api/admin/moderation/add")
async def api_moderation_add(req: ModerationWordRequest):
    added = moderation_list.add(req.word)
    return {"ok": True, "added": added, "words": moderation_list.to_list()}


@app.post("/api/admin/moderation/remove")
async def api_moderation_remove(req: ModerationWordRequest):
    removed = moderation_list.remove(req.word)
    return {"ok": True, "removed": removed, "words": moderation_list.to_list()}


@app.post("/api/admin/moderation/load")
async def api_moderation_load(req: ModerationLoadRequest):
    moderation_list.load_words(req.words)
    return {"ok": True, "words": moderation_list.to_list()}


@app.post("/api/admin/moderation/reset")
async def api_moderation_reset():
    moderation_list.load_defaults()
    return {"ok": True, "words": moderation_list.to_list()}


@app.post("/api/admin/qna/answer")
async def api_qna_answer(req: QnaModerateRequest):
    live.set_qna_answered(req.question_id, req.answered)
    await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})
    return {"ok": True}


@app.post("/api/admin/qna/approval")
async def api_qna_approval(req: QnaApprovalRequest):
    live.set_qna_approval(req.question_id, req.value)
    await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})
    return {"ok": True}


@app.post("/api/admin/qna/reply")
async def api_qna_reply(req: QnaReplyRequest):
    live.add_qna_reply(req.question_id, None, "Instructor", req.text, anonymous=False, from_instructor=True)
    await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})
    return {"ok": True}


@app.post("/api/admin/qna/reply_decision")
async def api_qna_reply_decision(req: QnaReplyDecisionRequest):
    live.set_qna_reply_decision(req.question_id, req.reply_id, req.value)
    await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})
    return {"ok": True}


@app.post("/api/admin/qna/reply_delete")
async def api_qna_reply_delete(req: QnaReplyDeleteRequest):
    live.delete_qna_reply(req.question_id, req.reply_id)
    await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})
    return {"ok": True}


@app.post("/api/admin/qna/delete")
async def api_qna_delete(req: QnaDeleteRequest):
    live.delete_qna_question(req.question_id)
    await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})
    return {"ok": True}


@app.post("/api/admin/qna/clear")
async def api_qna_clear():
    live.clear_qna()
    await manager.broadcast({"type": "qna_update", "qna": _sanitize_qna_for_clients(live.state["qna"])})
    return {"ok": True}


@app.post("/api/admin/groups/make")
async def api_groups_make(req: GroupsMakeRequest):
    connected = [
        {"client_id": cid, "name": name}
        for cid, name in manager.names.items()
        if cid in manager.clients
    ]
    live.make_groups(connected, req.mode, req.param, req.prompt)
    await manager.broadcast({"type": "groups_update", "groups": live.state["groups"]})
    return {"ok": True}


@app.post("/api/admin/groups/clear")
async def api_groups_clear():
    live.clear_groups()
    await manager.broadcast({"type": "groups_update", "groups": live.state["groups"]})
    return {"ok": True}


@app.post("/api/admin/groups/prompt")
async def api_groups_prompt(req: GroupsPromptRequest):
    live.set_groups_prompt(req.text)
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

# Slide images live alongside the rest of a workshop's content (its JSON
# templates, the facilitator guide) rather than under client/, so they get
# their own mount — this is what makes a plain project-root-relative path
# like "workshops/my-session/en/assets/diagram.png" in a slide template
# resolve to a real, servable URL.
WORKSHOPS_DIR = BASE_DIR / "workshops"
WORKSHOPS_DIR.mkdir(exist_ok=True)
app.mount("/workshops", StaticFiles(directory=WORKSHOPS_DIR), name="workshops")


@app.get("/")
async def index():
    return FileResponse(CLIENT_DIR / "index.html")


@app.get("/favicon.ico")
async def favicon():
    # Some browsers request this at the root regardless of the <link
    # rel="icon"> tags in index.html, so it needs its own route rather
    # than relying solely on /static/favicon.ico being found via a link.
    return FileResponse(CLIENT_DIR / "favicon.ico")
