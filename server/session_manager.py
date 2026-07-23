"""
In-memory classroom session state + JSON persistence.

Built through an iterative collaboration between Elisa Schaeffer (Dean of
Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
See client/index.html's footer for the full attribution note.

Only one session is "live" at a time. Saved sessions live as JSON files
in SESSIONS_DIR and can be restored, duplicated (used as a template), or
the live one can be reset to a blank slate.
"""
from __future__ import annotations

import json
import random
import re
import time
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

SESSIONS_DIR = Path(__file__).parent.parent / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)


def _blank_state() -> dict[str, Any]:
    return {
        "chat": {
            "messages": []  # {id, name, text, ts}
        },
        "traffic_light": {
            "statuses": {}  # client_id -> {name, color, ts}
        },
        "tag_cloud": {
            "words": {}  # word (lowercased) -> count
        },
        "poll": {
            "question": "",
            "type": "bar",  # "bar" or "pie"
            "options": [],  # ["Option A", ...]
            "votes": {},  # client_id -> option_index
            "active": False,
        },
        "whiteboard": {
            "strokes": [],  # {id, color, size, points: [[x,y],...], owner: client_id}
            "postits": [],  # {id, x, y, color, text_color, font_size, text, owner: client_id}
            "history": {},  # client_id -> [{"type": "stroke"|"postit", "id": ...}, ...] — undo stack
        },
        "fill_blanks": {
            "title": "",
            "text": "",  # raw template text with {{id}} markers
            "segments": [],  # [{"type": "text", "value": "..."} | {"type": "blank", "id": "1"}]
            "pieces": {},  # piece_id -> {text, correct_blank}  (correct_blank None for distractors)
            "pool_order": [],  # piece_id order for the shared pool tray
            "placements": {},  # piece_id -> {"blank_id": str|None, "moved_by": name}
            "reactions": {},  # piece_id -> {client_id: {"name": name, "type": "endorse"|"object"}}
            "votes": {},  # client_id -> {"name": name, "vote": "yes"|"no"|"unsure"}
            "loaded": False,
        },
        "spider": {
            "title": "",
            "axes": [],  # [{"id": "1", "label": "...", "max": 5}]
            "responses": {},  # client_id -> {"name": name, "values": {axis_id: number}}
            "loaded": False,
        },
        "ordering": {
            "title": "",
            "criterion": "",  # e.g. "Order from first to last"
            "items": {},  # item_id -> text
            "correct_order": [],  # [item_id, ...] — the answer key
            "current_order": [],  # [item_id, ...] — shared, live-reorderable list
            "reactions": {},  # item_id -> {client_id: {"name": name, "type": "up"|"down"|"check"}}
            "last_moved_at": {},  # item_id -> epoch float, bumped whenever its position shifts
            "finished": False,  # every connected client has checkmarked every item
            "revealed": False,  # instructor has revealed the answer key
            "loaded": False,
        },
        "ui": {
            "pinned_tab": None,  # the tab/drawer id the instructor last pinned, or None
        },
        "qna": {
            "questions": {}  # question_id -> {id, text, reactions: {client_id: "up"|"down"}, answered, approved, ts}
            # deliberately no submitter name anywhere in here — anonymous by design
        },
        "groups": {
            "mode": "size",  # "size" (groups of N people) or "count" (N groups total)
            "param": 4,
            "groups": [],  # [[{"client_id":.., "name":..}, ...], ...]
            "generated_at": None,
        },
        "timer": {
            "duration_seconds": 300,
            "running": False,
            "end_at": None,  # epoch when it hits zero, only meaningful while running
            "remaining_at_pause": None,  # seconds left, set when paused rather than reset
        },
    }


class Session:
    """Holds the live, in-memory state of the current classroom session."""

    def __init__(self, name: str = "Untitled session"):
        self.name = name
        self.created_at = time.time()
        self.state = _blank_state()

    # ---- mutation helpers used by the websocket handlers ----

    def add_chat_message(self, name: str, text: str, parent_id: str | None = None) -> dict:
        msg = {
            "id": str(uuid.uuid4()),
            "name": name,
            "text": text,
            "ts": time.time(),
            "parent_id": parent_id,  # None = top-level message; otherwise the id of the root it replies to
        }
        self.state["chat"]["messages"].append(msg)
        # keep memory bounded on a modest laptop
        if len(self.state["chat"]["messages"]) > 500:
            self.state["chat"]["messages"] = self.state["chat"]["messages"][-500:]
        return msg

    def set_traffic_status(self, client_id: str, name: str, color: str) -> dict:
        entry = {"name": name, "color": color, "ts": time.time()}
        self.state["traffic_light"]["statuses"][client_id] = entry
        return entry

    def remove_client(self, client_id: str) -> None:
        self.state["traffic_light"]["statuses"].pop(client_id, None)
        self.state["poll"]["votes"].pop(client_id, None)
        self.remove_client_from_blanks(client_id)
        self.remove_client_from_spider(client_id)

    def add_tag(self, word: str) -> dict:
        word = word.strip().lower()[:40]
        if not word:
            return {}
        words = self.state["tag_cloud"]["words"]
        words[word] = words.get(word, 0) + 1
        return {"word": word, "count": words[word]}

    def clear_tags(self) -> None:
        self.state["tag_cloud"]["words"] = {}

    def set_poll(self, question: str, options: list[str], poll_type: str = "bar") -> None:
        self.state["poll"] = {
            "question": question,
            "type": poll_type if poll_type in ("bar", "pie") else "bar",
            "options": options,
            "votes": {},
            "active": True,
        }

    def close_poll(self) -> None:
        self.state["poll"]["active"] = False

    def vote_poll(self, client_id: str, option_index: int) -> bool:
        if not self.state["poll"]["active"]:
            return False
        if not (0 <= option_index < len(self.state["poll"]["options"])):
            return False
        self.state["poll"]["votes"][client_id] = option_index
        return True

    def add_stroke(self, stroke: dict) -> None:
        self.state["whiteboard"]["strokes"].append(stroke)

    def add_stroke_points(self, stroke_id: str, points: list[list[float]]) -> None:
        for s in self.state["whiteboard"]["strokes"]:
            if s["id"] == stroke_id:
                s["points"].extend(points)
                return

    def clear_whiteboard(self) -> None:
        # instructor-only ("clear for everyone") — clients get undo / erase-my-work instead
        self.state["whiteboard"]["strokes"] = []
        self.state["whiteboard"]["postits"] = []
        self.state["whiteboard"]["history"] = {}

    def upsert_postit(self, postit: dict, owner: str | None = None) -> bool:
        """Create or update a postit. Returns True if this was a brand-new
        note (so the caller can record undo history) — an edit/move of an
        existing note keeps its *original* owner and isn't undo-able by
        whoever nudged it, only by whoever created it."""
        postits = self.state["whiteboard"]["postits"]
        for i, p in enumerate(postits):
            if p["id"] == postit["id"]:
                postit["owner"] = p.get("owner")
                postits[i] = postit
                return False
        postit["owner"] = owner
        postits.append(postit)
        return True

    def remove_postit(self, postit_id: str) -> None:
        self.state["whiteboard"]["postits"] = [
            p for p in self.state["whiteboard"]["postits"] if p["id"] != postit_id
        ]

    def push_whiteboard_history(self, client_id: str, kind: str, item_id: str) -> None:
        history = self.state["whiteboard"]["history"].setdefault(client_id, [])
        history.append({"type": kind, "id": item_id})
        if len(history) > 50:  # bound memory for a very prolific drawer
            history.pop(0)

    def undo_whiteboard_action(self, client_id: str) -> dict | None:
        """Pop and revert this client's own most recent stroke or postit
        creation. Only reverses what *they* added — never touches other
        people's work, since only their own actions are on their stack."""
        history = self.state["whiteboard"]["history"].get(client_id)
        if not history:
            return None
        entry = history.pop()
        wb = self.state["whiteboard"]
        if entry["type"] == "stroke":
            wb["strokes"] = [s for s in wb["strokes"] if s["id"] != entry["id"]]
        else:
            wb["postits"] = [p for p in wb["postits"] if p["id"] != entry["id"]]
        return entry

    def erase_client_whiteboard_work(self, client_id: str) -> None:
        """Remove every stroke and postit this client originally created —
        not the whole board, just their own contributions."""
        wb = self.state["whiteboard"]
        wb["strokes"] = [s for s in wb["strokes"] if s.get("owner") != client_id]
        wb["postits"] = [p for p in wb["postits"] if p.get("owner") != client_id]
        wb["history"].pop(client_id, None)

    # ---- fill-in-the-blanks ----

    BLANK_PATTERN = re.compile(r"\{\{\s*([\w-]+)\s*\}\}")

    def load_blanks_template(self, title: str, text: str, answers: dict[str, str], distractors: list[str]) -> None:
        segments = []
        pieces: dict[str, dict] = {}
        pool_order: list[str] = []
        pos = 0
        for m in self.BLANK_PATTERN.finditer(text):
            if m.start() > pos:
                segments.append({"type": "text", "value": text[pos:m.start()]})
            blank_id = m.group(1)
            segments.append({"type": "blank", "id": blank_id})
            piece_id = f"ans-{blank_id}"
            answer_text = answers.get(blank_id, "")
            pieces[piece_id] = {"text": answer_text, "correct_blank": blank_id}
            pool_order.append(piece_id)
            pos = m.end()
        if pos < len(text):
            segments.append({"type": "text", "value": text[pos:]})

        for i, d in enumerate(distractors):
            piece_id = f"dist-{i}"
            pieces[piece_id] = {"text": d, "correct_blank": None}
            pool_order.append(piece_id)

        random.shuffle(pool_order)

        self.state["fill_blanks"] = {
            "title": title,
            "text": text,
            "segments": segments,
            "pieces": pieces,
            "pool_order": pool_order,
            "placements": {pid: {"blank_id": None, "moved_by": None} for pid in pieces},
            "reactions": {pid: {} for pid in pieces},
            "votes": {},
            "loaded": True,
        }

    def reset_blanks_progress(self) -> None:
        fb = self.state["fill_blanks"]
        if not fb.get("loaded"):
            return
        fb["placements"] = {pid: {"blank_id": None, "moved_by": None} for pid in fb["pieces"]}
        fb["reactions"] = {pid: {} for pid in fb["pieces"]}
        fb["votes"] = {}

    def move_blank_piece(self, piece_id: str, blank_id: str | None, mover_name: str) -> bool:
        fb = self.state["fill_blanks"]
        if piece_id not in fb.get("pieces", {}):
            return False
        # a blank can only hold one piece at a time — bump anything already there back to the pool
        if blank_id is not None:
            for pid, placement in fb["placements"].items():
                if pid != piece_id and placement["blank_id"] == blank_id:
                    placement["blank_id"] = None
                    placement["moved_by"] = None
                    fb["reactions"][pid] = {}
        fb["placements"][piece_id] = {"blank_id": blank_id, "moved_by": mover_name}
        fb["reactions"][piece_id] = {}  # moving clears reactions on the old placement
        return True

    def react_to_blank_piece(self, piece_id: str, client_id: str, name: str, reaction: str) -> bool:
        fb = self.state["fill_blanks"]
        if piece_id not in fb.get("pieces", {}) or reaction not in ("endorse", "object"):
            return False
        reactions = fb["reactions"].setdefault(piece_id, {})
        # clicking the same reaction again toggles it off
        existing = reactions.get(client_id)
        if existing and existing["type"] == reaction:
            del reactions[client_id]
        else:
            reactions[client_id] = {"name": name, "type": reaction}
        return True

    def set_blanks_vote(self, client_id: str, name: str, vote: str) -> bool:
        if vote not in ("yes", "no", "unsure"):
            return False
        self.state["fill_blanks"]["votes"][client_id] = {"name": name, "vote": vote}
        return True

    def ensure_blanks_default_vote(self, client_id: str, name: str) -> None:
        fb = self.state["fill_blanks"]
        if fb.get("loaded") and client_id not in fb["votes"]:
            fb["votes"][client_id] = {"name": name, "vote": "unsure"}

    def remove_client_from_blanks(self, client_id: str) -> None:
        self.state["fill_blanks"]["votes"].pop(client_id, None)

    # ---- self-assessment radar ----

    def load_spider_template(self, title: str, axes: list[dict]) -> None:
        clean_axes = []
        for i, ax in enumerate(axes):
            clean_axes.append({
                "id": str(ax.get("id", i + 1)),
                "label": str(ax.get("label", f"Axis {i + 1}"))[:80],
                "max": float(ax.get("max", 5)) or 5,
            })
        self.state["spider"] = {
            "title": title,
            "axes": clean_axes,
            "responses": {},
            "loaded": True,
        }

    def reset_spider_responses(self) -> None:
        self.state["spider"]["responses"] = {}

    def set_spider_value(self, client_id: str, name: str, axis_id: str, value: float) -> bool:
        sp = self.state["spider"]
        if not sp.get("loaded"):
            return False
        if not any(a["id"] == axis_id for a in sp["axes"]):
            return False
        resp = sp["responses"].setdefault(client_id, {"name": name, "values": {}})
        resp["name"] = name
        resp["values"][axis_id] = value
        return True

    def remove_client_from_spider(self, client_id: str) -> None:
        self.state["spider"]["responses"].pop(client_id, None)

    # ---- order-the-steps ----

    def load_ordering_template(self, title: str, criterion: str, elements: list[str]) -> None:
        items = {}
        correct_order = []
        for i, text in enumerate(elements):
            item_id = f"item-{i}"
            items[item_id] = text
            correct_order.append(item_id)
        current_order = correct_order[:]
        random.shuffle(current_order)
        now = time.time()
        self.state["ordering"] = {
            "title": title,
            "criterion": criterion,
            "items": items,
            "correct_order": correct_order,
            "current_order": current_order,
            "reactions": {iid: {} for iid in items},
            "last_moved_at": {iid: now for iid in items},
            "finished": False,
            "revealed": False,
            "loaded": True,
        }

    def reset_ordering(self) -> None:
        od = self.state["ordering"]
        if not od.get("loaded"):
            return
        order = od["correct_order"][:]
        random.shuffle(order)
        now = time.time()
        od["current_order"] = order
        od["reactions"] = {iid: {} for iid in od["items"]}
        od["last_moved_at"] = {iid: now for iid in od["items"]}
        od["finished"] = False
        od["revealed"] = False

    def move_ordering_item(self, item_id: str, new_index: int) -> bool:
        od = self.state["ordering"]
        order = od.get("current_order", [])
        if item_id not in order:
            return False
        old_index = order.index(item_id)
        new_index = max(0, min(new_index, len(order) - 1))
        if old_index == new_index:
            return False
        order.pop(old_index)
        order.insert(new_index, item_id)
        # every row whose position shifted (not just the one dragged) has its
        # judgment invalidated — a "too low" reaction made sense at the old
        # index, not necessarily at the new one
        lo, hi = sorted((old_index, new_index))
        now = time.time()
        for iid in order[lo:hi + 1]:
            od["reactions"][iid] = {}
            od["last_moved_at"][iid] = now
        od["finished"] = False
        return True

    def react_to_ordering_item(self, item_id: str, client_id: str, name: str, reaction: str) -> bool:
        od = self.state["ordering"]
        if item_id not in od.get("items", {}) or reaction not in ("up", "down", "check"):
            return False
        reactions = od["reactions"].setdefault(item_id, {})
        existing = reactions.get(client_id)
        if existing and existing["type"] == reaction:
            del reactions[client_id]
        else:
            reactions[client_id] = {"name": name, "type": reaction}
        return True

    def recompute_ordering_finished(self, connected_client_ids: list[str]) -> bool:
        od = self.state["ordering"]
        if not od.get("loaded") or not od["items"] or not connected_client_ids:
            od["finished"] = False
            return False
        all_checked = True
        for item_id in od["items"]:
            reactions = od["reactions"].get(item_id, {})
            for cid in connected_client_ids:
                r = reactions.get(cid)
                if not r or r["type"] != "check":
                    all_checked = False
                    break
            if not all_checked:
                break
        od["finished"] = all_checked
        return all_checked

    def reveal_ordering(self) -> None:
        od = self.state["ordering"]
        if od.get("loaded"):
            od["revealed"] = True

    # ---- pinned tab ----

    def set_pinned_tab(self, target: str | None) -> None:
        self.state["ui"]["pinned_tab"] = target

    # ---- anonymous Q&A queue ----

    def add_qna_question(self, text: str) -> dict:
        text = text.strip()[:500]
        if not text:
            return {}
        qid = str(uuid.uuid4())
        q = {
            "id": qid, "text": text, "reactions": {},  # client_id -> "up"|"down"
            "answered": False, "approved": False, "ts": time.time(),
        }
        self.state["qna"]["questions"][qid] = q
        return q

    def react_to_qna_question(self, question_id: str, client_id: str, reaction: str) -> bool:
        q = self.state["qna"]["questions"].get(question_id)
        if not q or reaction not in ("up", "down"):
            return False
        # clicking the same reaction again toggles it off, like the other reaction widgets
        if q["reactions"].get(client_id) == reaction:
            del q["reactions"][client_id]
        else:
            q["reactions"][client_id] = reaction
        return True

    def set_qna_answered(self, question_id: str, answered: bool) -> bool:
        q = self.state["qna"]["questions"].get(question_id)
        if not q:
            return False
        q["answered"] = answered
        return True

    def set_qna_approved(self, question_id: str, approved: bool) -> bool:
        """Instructor's curation signal — orthogonal to 'answered': marks
        a question as one worth everyone's attention, independent of
        whether it's been dealt with yet."""
        q = self.state["qna"]["questions"].get(question_id)
        if not q:
            return False
        q["approved"] = approved
        return True

    def delete_qna_question(self, question_id: str) -> bool:
        return self.state["qna"]["questions"].pop(question_id, None) is not None

    def clear_qna(self) -> None:
        self.state["qna"]["questions"] = {}

    # ---- random groups ----

    def make_groups(self, connected: list[dict], mode: str, param: int) -> None:
        people = connected[:]
        random.shuffle(people)
        groups: list[list[dict]] = []
        if mode == "count":
            k = max(1, int(param))
            groups = [[] for _ in range(k)]
            for i, p in enumerate(people):
                groups[i % k].append(p)
        else:  # "size"
            size = max(1, int(param))
            for i in range(0, len(people), size):
                groups.append(people[i:i + size])
        self.state["groups"] = {
            "mode": mode if mode in ("size", "count") else "size",
            "param": param,
            "groups": groups,
            "generated_at": time.time(),
        }

    def clear_groups(self) -> None:
        self.state["groups"] = {"mode": "size", "param": 4, "groups": [], "generated_at": None}

    # ---- shared countdown timer ----

    def set_timer_duration(self, seconds: int) -> None:
        t = self.state["timer"]
        t["duration_seconds"] = max(1, int(seconds))
        t["running"] = False
        t["end_at"] = None
        t["remaining_at_pause"] = None

    def start_timer(self) -> None:
        t = self.state["timer"]
        if t["running"]:
            return
        base = t["remaining_at_pause"] if t["remaining_at_pause"] is not None else t["duration_seconds"]
        t["end_at"] = time.time() + base
        t["running"] = True
        t["remaining_at_pause"] = None

    def pause_timer(self) -> None:
        t = self.state["timer"]
        if not t["running"]:
            return
        t["remaining_at_pause"] = max(0.0, t["end_at"] - time.time())
        t["running"] = False
        t["end_at"] = None

    def reset_timer(self) -> None:
        t = self.state["timer"]
        t["running"] = False
        t["end_at"] = None
        t["remaining_at_pause"] = None

    # ---- persistence ----

    def to_dict(self) -> dict:
        return {"name": self.name, "created_at": self.created_at, "state": self.state}

    @classmethod
    def from_dict(cls, data: dict) -> "Session":
        s = cls(name=data.get("name", "Untitled session"))
        s.created_at = data.get("created_at", time.time())
        s.state = data.get("state", _blank_state())
        return s

    def reset(self, name: str | None = None) -> None:
        self.name = name or self.name
        self.created_at = time.time()
        self.state = _blank_state()


def _safe_filename(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip()).strip("-").lower()
    return slug or "session"


def save_session(session: Session, filename: str | None = None) -> str:
    if filename:
        session.name = filename
    fname = _safe_filename(filename or session.name)
    path = SESSIONS_DIR / f"{fname}.json"
    path.write_text(json.dumps(session.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return path.stem


def load_session(filename: str) -> Session:
    path = SESSIONS_DIR / f"{_safe_filename(filename)}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return Session.from_dict(data)


def duplicate_session(filename: str, new_name: str) -> str:
    src = load_session(filename)
    src.name = new_name
    return save_session(src, new_name)


def list_saved_sessions() -> list[dict]:
    out = []
    for path in sorted(SESSIONS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            out.append({
                "id": path.stem,
                "name": data.get("name", path.stem),
                "created_at": data.get("created_at"),
            })
        except Exception:
            continue
    return out


def delete_session(filename: str) -> None:
    path = SESSIONS_DIR / f"{_safe_filename(filename)}.json"
    path.unlink(missing_ok=True)
