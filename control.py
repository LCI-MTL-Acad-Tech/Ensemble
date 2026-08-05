#!/usr/bin/env python3
"""
Classroom Live — instructor control tool.

Built through an iterative collaboration between Elisa Schaeffer (Dean of
Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
See client/index.html's footer for the full attribution note.

Talks to the running server's REST admin API — nothing here runs the
server itself (that's still `uvicorn server.main:app ...`, see README).
There is no browser admin panel by design: session control lives here
instead, so a student glancing at your screen sees the same view as
everyone else, and the "who can click the dangerous buttons" question is
answered by "whoever has a terminal open," not by a UI element sitting in
everyone's browser.

One-off command examples:
    python control.py status
    python control.py pin poll
    python control.py order reveal
    python control.py session save "Week 3 - Databases"

Run with no arguments at all for an interactive menu instead of having to
remember exact subcommand syntax:
    python control.py
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_URL = "http://localhost:8000"

PIN_TARGETS = [
    "whiteboard", "chat", "traffic", "qna", "timer", "tags",
    "poll", "blanks", "order", "spider", "groups", "slide",
]


class ApiError(Exception):
    pass


def call(base_url: str, method: str, path: str, body: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise ApiError(f"{e.code} {e.reason}: {detail}") from e
    except urllib.error.URLError as e:
        raise ApiError(
            f"Couldn't reach {url} ({e.reason}). Is the server running? "
            f"(uvicorn server.main:app --host 0.0.0.0 --port 8000)"
        ) from e


def load_json_file(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        raise ApiError(f"No such file: {path}")
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ApiError(f"{path} isn't valid JSON: {e}") from e


# ---------------------------------------------------------------- commands

def cmd_status(url, args):
    state = call(url, "GET", "/api/session")["state"]
    print(f"Session: {call(url, 'GET', '/api/session')['name']}")
    print(f"  chat messages:     {len(state['chat']['messages'])}")
    print(f"  traffic statuses:  {len(state['traffic_light']['statuses'])} people reporting")
    print(f"  tag cloud words:   {len(state['tag_cloud']['words'])}")
    poll = state["poll"]
    print(f"  poll:              {'active — ' + poll['question'] if poll['active'] else '(none active)'}")
    fb = state["fill_blanks"]
    print(f"  fill-blanks:       {'loaded — ' + fb['title'] if fb['loaded'] else '(none loaded)'}")
    od = state["ordering"]
    print(f"  order-the-steps:   {'loaded — ' + od['title'] if od['loaded'] else '(none loaded)'}"
          + (f" [finished, revealed={od['revealed']}]" if od.get("finished") else ""))
    sp = state["spider"]
    print(f"  self-assessment:   {'loaded — ' + sp['title'] if sp['loaded'] else '(none loaded)'}")
    print(f"  Q&A questions:     {len(state['qna']['questions'])}")
    print(f"  groups:            {len(state['groups']['groups'])} group(s)")
    t = state["timer"]
    print(f"  timer:             {'running' if t['running'] else 'stopped'}, duration {t['duration_seconds']}s")
    pinned = state["ui"]["pinned_tab"]
    print(f"  pinned tab:        {pinned or '(none)'}")


def cmd_pin(url, args):
    if args.target == "clear":
        call(url, "POST", "/api/admin/pin/clear")
        print("Pin cleared.")
    else:
        if args.target not in PIN_TARGETS:
            raise ApiError(f"Unknown pin target {args.target!r}. Choose from: {', '.join(PIN_TARGETS)}")
        call(url, "POST", "/api/admin/pin", {"target": args.target})
        print(f"Pinned everyone to: {args.target}")


def cmd_session(url, args):
    if args.action == "save":
        r = call(url, "POST", "/api/admin/save", {"filename": args.name})
        print(f"Saved as: {r['id']}")
    elif args.action == "restore":
        call(url, "POST", "/api/admin/load", {"filename": args.name})
        print(f"Restored: {args.name}")
    elif args.action == "duplicate":
        r = call(url, "POST", "/api/admin/duplicate", {"source": args.source, "new_name": args.new_name})
        print(f"Duplicated as: {r['id']}")
    elif args.action == "reset":
        call(url, "POST", "/api/admin/reset", {"name": args.name} if args.name else {})
        print("Live session reset.")
    elif args.action == "list":
        sessions = call(url, "GET", "/api/admin/sessions")
        if not sessions:
            print("(no saved sessions)")
        for s in sessions:
            print(f"  {s['id']:<30} {s['name']}")
    elif args.action == "delete":
        call(url, "DELETE", f"/api/admin/sessions/{args.name}")
        print(f"Deleted: {args.name}")


def maybe_pin(url, target, do_pin):
    if do_pin:
        call(url, "POST", "/api/admin/pin", {"target": target})
        print(f"  ...and pinned everyone to {target}.")


def cmd_poll(url, args):
    if args.action == "start":
        options = [o.strip() for o in args.options.split(",") if o.strip()]
        if len(options) < 2:
            raise ApiError("Need at least two comma-separated options.")
        call(url, "POST", "/api/admin/poll", {"question": args.question, "options": options, "type": args.type})
        print("Poll started.")
        maybe_pin(url, "poll", args.pin)
    elif args.action == "close":
        call(url, "POST", "/api/admin/poll/close")
        print("Poll closed.")


def cmd_blanks(url, args):
    if args.action == "load":
        t = load_json_file(args.file)
        call(url, "POST", "/api/admin/blanks/load", {
            "title": t.get("title", ""), "text": t.get("text", ""),
            "answers": t.get("answers", {}), "distractors": t.get("distractors", []),
        })
        print("Fill-in-the-blanks exercise loaded.")
        maybe_pin(url, "blanks", args.pin)
    elif args.action == "reveal":
        call(url, "POST", "/api/admin/blanks/reveal")
        print("Answer key revealed — everyone can now see which pieces are correct, plus a score.")
    elif args.action == "reset":
        call(url, "POST", "/api/admin/blanks/reset")
        print("Pieces reset.")


def cmd_order(url, args):
    if args.action == "load":
        t = load_json_file(args.file)
        call(url, "POST", "/api/admin/order/load", {
            "title": t.get("title", ""), "criterion": t.get("criterion", ""),
            "elements": t.get("elements", []),
        })
        print("Ordering exercise loaded.")
        maybe_pin(url, "order", args.pin)
    elif args.action == "reveal":
        call(url, "POST", "/api/admin/order/reveal")
        print("Answer key revealed — everyone can now see the correct order alongside their own.")
    elif args.action == "reset":
        call(url, "POST", "/api/admin/order/reset")
        print("Order reset and reshuffled.")


def cmd_spider(url, args):
    if args.action == "load":
        t = load_json_file(args.file)
        call(url, "POST", "/api/admin/spider/load", {"title": t.get("title", ""), "axes": t.get("axes", [])})
        print("Self-assessment axes loaded.")
        maybe_pin(url, "spider", args.pin)
    elif args.action == "reset":
        call(url, "POST", "/api/admin/spider/reset")
        print("Responses reset.")


def _qna_render(questions: dict) -> None:
    print("\n--- Live Q&A ---")
    print("  q<N> <text>      = post an instructor reply")
    print("  a/d/x q<N>       = approve/disapprove/delete a QUESTION")
    print("  ra/rr/rx q<N>r<M> = accept/reject/delete reply M of question N")
    print("  b                = back")
    if not questions:
        print("  (no questions yet)")
        return
    for qid, q in sorted(questions.items(), key=lambda kv: (kv[1]["answered"], kv[1]["ts"])):
        up = sum(1 for r in q["reactions"].values() if r == "up")
        down = sum(1 for r in q["reactions"].values() if r == "down")
        mark = "✓" if q["answered"] else " "
        approval = q.get("approval")
        amark = "★" if approval == "approved" else ("🛑" if approval == "disapproved" else " ")
        asker = q.get("asker_name") or "?"
        qseq = q.get("seq", "?")
        print(f"  [{mark}][{amark}] 👍{up} 👎{down}  q{qseq}  ({asker})  {q['text']}")
        for r in q.get("replies", []):
            rup = sum(1 for v in r["reactions"].values() if v == "up")
            rdown = sum(1 for v in r["reactions"].values() if v == "down")
            decision = r.get("decision")
            dmark = "✓accepted" if decision == "accepted" else ("✗rejected" if decision == "rejected" else "")
            who = "Instructor" if r.get("from_instructor") else (r.get("author_name") or "Anonymous")
            tag = f" [{dmark}]" if dmark else ""
            print(f"          ↳ q{qseq}r{r.get('seq', '?')}  ({who}) 👍{rup} 👎{rdown}{tag}  {r['text']}")


def _find_question_by_ref(questions: dict, ref: str):
    """Match a question by its short display id (q3, or bare 3) — not the
    underlying uuid, which nobody should have to read or type."""
    ref = ref.strip().lower()
    if ref.startswith("q"):
        ref = ref[1:]
    if not ref.isdigit():
        return None
    n = int(ref)
    return next((qid for qid, q in questions.items() if q.get("seq") == n), None)


_REPLY_REF_RE = re.compile(r"^q?(\d+)r(\d+)$", re.IGNORECASE)


def _find_reply_by_ref(questions: dict, ref: str):
    """Match a reply by its q{i}r{j} display id — the jth reply to the
    ith question, both numbered from 1 within their own scope. Accepts
    the ref with or without the leading 'q'."""
    m = _REPLY_REF_RE.match(ref.strip())
    if not m:
        return None, None
    q_seq, r_seq = int(m.group(1)), int(m.group(2))
    for qid, q in questions.items():
        if q.get("seq") == q_seq:
            for r in q.get("replies", []):
                if r.get("seq") == r_seq:
                    return qid, r
            return None, None
    return None, None


async def _qna_watch_async(url: str) -> None:
    import websockets

    ws_url = url.replace("http://", "ws://").replace("https://", "wss://").rstrip("/") + "/ws"
    questions: dict = {}

    async def refresh():
        # session_state/qna_update over the websocket are sanitized (no
        # asker names, for participants) — control.py talks to the
        # unsanitized REST endpoint instead, specifically so the
        # instructor-facing watch view can show who asked.
        questions.clear()
        questions.update(call(url, "GET", "/api/session")["state"]["qna"]["questions"])
        _qna_render(questions)

    async with websockets.connect(ws_url) as ws:
        async def receiver():
            async for raw in ws:
                msg = json.loads(raw)
                if msg.get("type") in ("session_state", "qna_update"):
                    await refresh()

        recv_task = asyncio.create_task(receiver())
        await refresh()
        try:
            while True:
                line = (await asyncio.to_thread(input, "\nqna> ")).strip()
                if not line or line in ("b", "back", "q", "quit"):
                    return
                parts = line.split(maxsplit=1)
                cmd0 = parts[0]

                if cmd0 in ("a", "d", "x") and len(parts) == 2:
                    match = _find_question_by_ref(questions, parts[1])
                    if not match:
                        print("  no question with that id")
                        continue
                    if cmd0 == "a":
                        call(url, "POST", "/api/admin/qna/approval", {"question_id": match, "value": "approved"})
                    elif cmd0 == "d":
                        call(url, "POST", "/api/admin/qna/approval", {"question_id": match, "value": "disapproved"})
                    else:
                        call(url, "POST", "/api/admin/qna/delete", {"question_id": match})
                    continue

                if cmd0 in ("ra", "rr", "rx") and len(parts) == 2:
                    qid, reply = _find_reply_by_ref(questions, parts[1])
                    if not reply:
                        print("  no reply with that id")
                        continue
                    if cmd0 == "ra":
                        call(url, "POST", "/api/admin/qna/reply_decision", {"question_id": qid, "reply_id": reply["id"], "value": "accepted"})
                    elif cmd0 == "rr":
                        call(url, "POST", "/api/admin/qna/reply_decision", {"question_id": qid, "reply_id": reply["id"], "value": "rejected"})
                    else:
                        call(url, "POST", "/api/admin/qna/reply_delete", {"question_id": qid, "reply_id": reply["id"]})
                    continue

                if len(parts) == 2:
                    match = _find_question_by_ref(questions, parts[0])
                    if match:
                        call(url, "POST", "/api/admin/qna/reply", {"question_id": match, "text": parts[1]})
                        continue

                print("  usage: q<N> <reply text>  |  a/d/x q<N>  |  ra/rr/rx q<N>r<M>  |  b to go back")
        finally:
            recv_task.cancel()
            try:
                await recv_task
            except (asyncio.CancelledError, Exception):
                pass


def qna_watch(url: str) -> None:
    try:
        asyncio.run(_qna_watch_async(url))
    except (KeyboardInterrupt, EOFError):
        print()


def cmd_qna(url, args):
    if args.action == "watch":
        qna_watch(url)
        return
    if args.action == "list":
        questions = call(url, "GET", "/api/session")["state"]["qna"]["questions"]
        _qna_render(questions)
    elif args.action == "answer":
        call(url, "POST", "/api/admin/qna/answer", {"question_id": args.id, "answered": not args.unanswer})
        print("Updated.")
    elif args.action == "reply":
        text = " ".join(args.text)
        call(url, "POST", "/api/admin/qna/reply", {"question_id": args.id, "text": text})
        print("Reply posted as Instructor — visible to everyone under that question, and it's now marked answered.")
    elif args.action == "reply-accept":
        call(url, "POST", "/api/admin/qna/reply_decision", {"question_id": args.id, "reply_id": args.reply_id, "value": "accepted"})
        print("Toggled accepted on that reply.")
    elif args.action == "reply-reject":
        call(url, "POST", "/api/admin/qna/reply_decision", {"question_id": args.id, "reply_id": args.reply_id, "value": "rejected"})
        print("Toggled rejected on that reply.")
    elif args.action == "reply-delete":
        call(url, "POST", "/api/admin/qna/reply_delete", {"question_id": args.id, "reply_id": args.reply_id})
        print("Reply deleted.")
    elif args.action == "approve":
        call(url, "POST", "/api/admin/qna/approval", {"question_id": args.id, "value": "approved"})
        print("Toggled ★ approved.")
    elif args.action == "disapprove":
        call(url, "POST", "/api/admin/qna/approval", {"question_id": args.id, "value": "disapproved"})
        print("Toggled 🛑 disapproved.")
    elif args.action == "delete":
        call(url, "POST", "/api/admin/qna/delete", {"question_id": args.id})
        print("Deleted.")
    elif args.action == "clear":
        call(url, "POST", "/api/admin/qna/clear")
        print("Queue cleared.")


def cmd_groups(url, args):
    if args.action == "make":
        call(url, "POST", "/api/admin/groups/make", {"mode": args.mode, "param": args.param, "prompt": args.prompt})
        print("Groups made.")
        maybe_pin(url, "groups", args.pin)
    elif args.action == "prompt":
        text = " ".join(args.text)
        call(url, "POST", "/api/admin/groups/prompt", {"text": text})
        print("Prompt updated — shown above the group cards for everyone.")
    elif args.action == "clear":
        call(url, "POST", "/api/admin/groups/clear")
        print("Groups cleared.")


def cmd_timer(url, args):
    if args.action == "set":
        call(url, "POST", "/api/admin/timer/set", {"seconds": round(args.minutes * 60)})
        print(f"Timer set to {args.minutes} minute(s).")
    elif args.action == "start":
        call(url, "POST", "/api/admin/timer/start")
        print("Timer started.")
    elif args.action == "pause":
        call(url, "POST", "/api/admin/timer/pause")
        print("Timer paused.")
    elif args.action == "reset":
        call(url, "POST", "/api/admin/timer/reset")
        print("Timer reset.")


def cmd_whiteboard(url, args):
    if args.action == "clear":
        call(url, "POST", "/api/admin/whiteboard/clear")
        print("Whiteboard cleared for everyone. (Clients can only undo/erase their own work — this is the only way to wipe the whole board.)")
    elif args.action == "background":
        image_url = _project_path_to_url(args.image)
        call(url, "POST", "/api/admin/whiteboard/background", {"image_url": image_url})
        print("Background image set — everyone draws on top of it now.")
    elif args.action == "background-clear":
        call(url, "POST", "/api/admin/whiteboard/background/clear")
        print("Background image cleared. (Strokes and notes are untouched.)")


def _project_path_to_url(path: str) -> str:
    """A path relative to the project root (e.g. 'workshops/x/assets/a.png')
    becomes a servable URL by prefixing '/' — see the /workshops static
    mount in main.py. Used anywhere a template references a local image."""
    path = path.strip()
    return ("/" + path.lstrip("/")) if path else ""


def cmd_slide(url, args):
    if args.action == "load":
        t = load_json_file(args.file)
        image_url = _project_path_to_url(t.get("image", ""))
        call(url, "POST", "/api/admin/slide/load", {
            "title": t.get("title", ""), "text": t.get("text", ""),
            "image_url": image_url, "qr_url": t.get("qr_url", ""),
        })
        print("Slide loaded.")
        maybe_pin(url, "slide", args.pin)
    elif args.action == "clear":
        call(url, "POST", "/api/admin/slide/clear")
        print("Slide cleared.")


def cmd_log(url, args):
    import urllib.parse
    qs = {"limit": args.n}
    if args.activity:
        qs["activity"] = args.activity
    entries = call(url, "GET", f"/api/admin/action_log?{urllib.parse.urlencode(qs)}")["entries"]
    if not entries:
        print("(no logged actions yet)")
        return
    for e in entries:
        when = time.strftime("%H:%M:%S", time.localtime(e["ts"]))
        outcome = e["outcome"]
        marker = "✓" if outcome == "applied" else "✗"
        print(f"{marker} {when}  [{e['activity']}/{e['action']}]  {e['name']:<16} rev={e['rev']:<4} {outcome:<18} {e['detail']}")


def cmd_tags(url, args):
    call(url, "POST", "/api/admin/tags/clear")
    print("Tag cloud cleared.")


def cmd_moderation(url, args):
    if args.action == "list":
        words = call(url, "GET", "/api/admin/moderation")["words"]
        if not words:
            print("(no blocked words)")
        for w in words:
            print(f"  {w}")
    elif args.action == "add":
        r = call(url, "POST", "/api/admin/moderation/add", {"word": args.word})
        print(f"Added {args.word!r}." if r["added"] else f"{args.word!r} was already on the list.")
    elif args.action == "remove":
        r = call(url, "POST", "/api/admin/moderation/remove", {"word": args.word})
        print(f"Removed {args.word!r}." if r["removed"] else f"{args.word!r} wasn't on the list.")
    elif args.action == "load":
        t = load_json_file(args.file)
        words = t.get("words", t if isinstance(t, list) else [])
        r = call(url, "POST", "/api/admin/moderation/load", {"words": words})
        print(f"Loaded {len(r['words'])} blocked word(s).")
    elif args.action == "save":
        words = call(url, "GET", "/api/admin/moderation")["words"]
        Path(args.file).write_text(json.dumps({"words": words}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Saved {len(words)} word(s) to {args.file}")
    elif args.action == "reset":
        r = call(url, "POST", "/api/admin/moderation/reset")
        print(f"Reset to the {len(r['words'])} shipped default word(s).")


# ---------------------------------------------------------------- facilitator script runner
#
# A script is a JSON file: {"title": "...", "steps": [{"name": ..., "say": ...,
# "actions": [...]}]}. Each action is a small dict with a "cmd" and whatever
# parameters that action needs — see _script_action() for the full list.
# Actions are deliberately idempotent (loading/pinning something twice just
# redoes it) so that stepping "back" to redo a previous step is always safe:
# it doesn't try to diff or undo state, it just re-runs whatever that step
# does, which is enough to bring the room's screens back to where they were.

def _script_action(url: str, action: dict, base_dir: Path) -> str:
    cmd = action["cmd"]

    if cmd == "pin":
        call(url, "POST", "/api/admin/pin", {"target": action["target"]})
        return f"pinned everyone to {action['target']}"
    if cmd == "pin_clear":
        call(url, "POST", "/api/admin/pin/clear")
        return "cleared the pin"
    if cmd == "order_load":
        t = load_json_file(str(base_dir / action["file"]))
        call(url, "POST", "/api/admin/order/load", {
            "title": t.get("title", ""), "criterion": t.get("criterion", ""), "elements": t.get("elements", []),
        })
        if action.get("pin"):
            call(url, "POST", "/api/admin/pin", {"target": "order"})
        return f"loaded order exercise ({action['file']})" + (", pinned" if action.get("pin") else "")
    if cmd == "order_reveal":
        call(url, "POST", "/api/admin/order/reveal")
        return "revealed the order answer key"
    if cmd == "order_reset":
        call(url, "POST", "/api/admin/order/reset")
        return "reset the order exercise"
    if cmd == "blanks_load":
        t = load_json_file(str(base_dir / action["file"]))
        call(url, "POST", "/api/admin/blanks/load", {
            "title": t.get("title", ""), "text": t.get("text", ""),
            "answers": t.get("answers", {}), "distractors": t.get("distractors", []),
        })
        if action.get("pin"):
            call(url, "POST", "/api/admin/pin", {"target": "blanks"})
        return f"loaded blanks exercise ({action['file']})" + (", pinned" if action.get("pin") else "")
    if cmd == "blanks_reveal":
        call(url, "POST", "/api/admin/blanks/reveal")
        return "revealed the blanks answer key"
    if cmd == "blanks_reset":
        call(url, "POST", "/api/admin/blanks/reset")
        return "reset the blanks exercise"
    if cmd == "spider_load":
        t = load_json_file(str(base_dir / action["file"]))
        call(url, "POST", "/api/admin/spider/load", {"title": t.get("title", ""), "axes": t.get("axes", [])})
        if action.get("pin"):
            call(url, "POST", "/api/admin/pin", {"target": "spider"})
        return f"loaded self-assessment axes ({action['file']})" + (", pinned" if action.get("pin") else "")
    if cmd == "spider_reset":
        call(url, "POST", "/api/admin/spider/reset")
        return "reset self-assessment responses"
    if cmd == "poll_start":
        call(url, "POST", "/api/admin/poll", {
            "question": action["question"], "options": action["options"], "type": action.get("type", "bar"),
        })
        if action.get("pin"):
            call(url, "POST", "/api/admin/pin", {"target": "poll"})
        return "started the poll" + (", pinned" if action.get("pin") else "")
    if cmd == "poll_close":
        call(url, "POST", "/api/admin/poll/close")
        return "closed the poll"
    if cmd == "groups_make":
        call(url, "POST", "/api/admin/groups/make", {
            "mode": action.get("mode", "size"), "param": action.get("param", 4),
            "prompt": action.get("prompt"),
        })
        if action.get("pin"):
            call(url, "POST", "/api/admin/pin", {"target": "groups"})
        return "made groups" + (", pinned" if action.get("pin") else "")
    if cmd == "groups_clear":
        call(url, "POST", "/api/admin/groups/clear")
        return "cleared groups"
    if cmd == "timer_set":
        call(url, "POST", "/api/admin/timer/set", {"seconds": round(action["minutes"] * 60)})
        return f"timer set to {action['minutes']} min"
    if cmd == "timer_start":
        call(url, "POST", "/api/admin/timer/start")
        return "timer started"
    if cmd == "timer_pause":
        call(url, "POST", "/api/admin/timer/pause")
        return "timer paused"
    if cmd == "timer_reset":
        call(url, "POST", "/api/admin/timer/reset")
        return "timer reset"
    if cmd == "tags_clear":
        call(url, "POST", "/api/admin/tags/clear")
        return "cleared the tag cloud"
    if cmd == "session_reset":
        call(url, "POST", "/api/admin/reset", {})
        return "reset the whole session"
    if cmd == "whiteboard_clear":
        call(url, "POST", "/api/admin/whiteboard/clear")
        return "cleared the whiteboard for everyone"
    if cmd == "slide_load":
        t = load_json_file(str(base_dir / action["file"]))
        image_url = _project_path_to_url(t.get("image", ""))
        call(url, "POST", "/api/admin/slide/load", {
            "title": t.get("title", ""), "text": t.get("text", ""),
            "image_url": image_url, "qr_url": t.get("qr_url", ""),
        })
        if action.get("pin"):
            call(url, "POST", "/api/admin/pin", {"target": "slide"})
        return f"loaded slide ({action['file']})" + (", pinned" if action.get("pin") else "")
    if cmd == "whiteboard_background":
        image_url = _project_path_to_url(action.get("image", ""))
        call(url, "POST", "/api/admin/whiteboard/background", {"image_url": image_url})
        return f"set whiteboard background ({action.get('image', '')})"
    if cmd == "whiteboard_background_clear":
        call(url, "POST", "/api/admin/whiteboard/background/clear")
        return "cleared whiteboard background"
    if cmd == "slide_clear":
        call(url, "POST", "/api/admin/slide/clear")
        return "cleared the slide"

    raise ApiError(f"Unknown script action: {cmd!r}")


def _run_step(url: str, step: dict, base_dir: Path, index: int, total: int) -> None:
    print(f"\n[{index + 1}/{total}] {step['name']}")
    if step.get("say"):
        print(f'  Say: "{step["say"]}"')
    for action in step.get("actions", []):
        try:
            print(f"    -> {_script_action(url, action, base_dir)}")
        except ApiError as e:
            print(f"    !! {e}", file=sys.stderr)


def _peek_line(steps: list[dict], index: int) -> str:
    """One-line preview of the step after `index` — never executes anything."""
    nxt = index + 1
    if nxt >= len(steps):
        return "  (this is the last step)"
    return f"  Up next: [{nxt + 1}/{len(steps)}] {steps[nxt]['name']}"


def _step_pins_qna(step: dict) -> bool:
    return any(a.get("cmd") == "pin" and a.get("target") == "qna" for a in step.get("actions", []))


def run_script(url: str, path: str) -> None:
    script_path = Path(path)
    data = load_json_file(path)
    steps = data.get("steps", [])
    if not steps:
        print("Script has no steps.")
        return
    base_dir = script_path.parent
    current = 0

    print(f"\nScript: {data.get('title', path)} — {len(steps)} steps.")
    _run_step(url, steps[current], base_dir, current, len(steps))
    print(_peek_line(steps, current))
    if _step_pins_qna(steps[current]):
        print("  (this step opens Q&A for the room — dropping into live Q&A now; 'b' to return here)")
        qna_watch(url)

    while True:
        try:
            raw = input("\n[Enter]=next  b=back  r=repeat  p[N]=peek  a=Q&A  g N=goto  l=list  q=quit > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return

        if raw in ("q", "quit"):
            return
        if raw in ("a", "qna"):
            # Slip into live Q&A from wherever you are in the script, at
            # any point — doesn't touch `current` or re-run anything.
            qna_watch(url)
            continue
        if raw in ("l", "list"):
            for i, s in enumerate(steps):
                marker = "->" if i == current else "  "
                print(f"  {marker} {i + 1}. {s['name']}")
            continue
        if raw == "p" or raw.startswith("p "):
            # Peek at a step's name/talking point without executing anything
            # or moving `current` — the whole point is being able to see
            # what's coming up without committing to it.
            parts = raw.split()
            if len(parts) == 2 and parts[1].isdigit() and 1 <= int(parts[1]) <= len(steps):
                idx = int(parts[1]) - 1
            else:
                idx = current + 1
            if idx >= len(steps):
                print("  (no such step — that's past the end)")
            else:
                s = steps[idx]
                print(f"  Peek [{idx + 1}/{len(steps)}] {s['name']}")
                if s.get("say"):
                    print(f'    Say: "{s["say"]}"')
                print("  (not executed — nothing changed, still on step "
                      f"{current + 1})")
            continue
        if raw in ("r", "repeat"):
            pass  # re-run the current step as-is
        elif raw in ("b", "back"):
            current = max(0, current - 1)
        elif raw.startswith("g"):
            parts = raw.split()
            if len(parts) == 2 and parts[1].isdigit() and 1 <= int(parts[1]) <= len(steps):
                current = int(parts[1]) - 1
            else:
                print("  usage: g <step number>")
                continue
        else:  # Enter or anything unrecognized = advance
            if current == len(steps) - 1:
                print("  (already on the last step — b to revisit, q to quit)")
                continue
            current += 1

        _run_step(url, steps[current], base_dir, current, len(steps))
        print(_peek_line(steps, current))
        if _step_pins_qna(steps[current]):
            print("  (this step opens Q&A for the room — dropping into live Q&A now; 'b' to return here)")
            qna_watch(url)


def cmd_script(url, args):
    if args.action == "run":
        run_script(url, args.file)


# ---------------------------------------------------------------- CLI wiring

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Classroom Live — instructor control tool.")
    p.add_argument("--url", default=DEFAULT_URL, help=f"Server address (default: {DEFAULT_URL})")
    sub = p.add_subparsers(dest="command")

    sub.add_parser("status", help="Show a summary of the live session.")

    pin = sub.add_parser("pin", help="Send every connected client to a tab/drawer, or 'clear' the pin.")
    pin.add_argument("target", choices=PIN_TARGETS + ["clear"])

    sess = sub.add_parser("session", help="Save / restore / duplicate / reset / list saved sessions.")
    sess_sub = sess.add_subparsers(dest="action", required=True)
    s = sess_sub.add_parser("save"); s.add_argument("name", nargs="?", default=None)
    s = sess_sub.add_parser("restore"); s.add_argument("name")
    s = sess_sub.add_parser("duplicate"); s.add_argument("source"); s.add_argument("new_name")
    s = sess_sub.add_parser("reset"); s.add_argument("name", nargs="?", default=None)
    sess_sub.add_parser("list")
    s = sess_sub.add_parser("delete"); s.add_argument("name")

    poll = sub.add_parser("poll", help="Start/close a poll.")
    poll_sub = poll.add_subparsers(dest="action", required=True)
    s = poll_sub.add_parser("start")
    s.add_argument("--question", required=True)
    s.add_argument("--options", required=True, help="Comma-separated, e.g. 'yes,no,unsure'")
    s.add_argument("--type", choices=["bar", "pie"], default="bar")
    s.add_argument("--pin", action="store_true", help="Also pin everyone to the Poll tab right now.")
    poll_sub.add_parser("close")

    blanks = sub.add_parser("blanks", help="Load/reset the fill-in-the-blanks exercise.")
    blanks_sub = blanks.add_subparsers(dest="action", required=True)
    s = blanks_sub.add_parser("load")
    s.add_argument("file")
    s.add_argument("--pin", action="store_true", help="Also pin everyone to the Fill blanks tab right now.")
    blanks_sub.add_parser("reveal", help="Show which pieces are correct, plus a score.")
    blanks_sub.add_parser("reset")

    order = sub.add_parser("order", help="Load/reveal/reset the ordering exercise.")
    order_sub = order.add_subparsers(dest="action", required=True)
    s = order_sub.add_parser("load")
    s.add_argument("file")
    s.add_argument("--pin", action="store_true", help="Also pin everyone to the Order tab right now.")
    order_sub.add_parser("reveal", help="Show the right answer alongside the room's current order.")
    order_sub.add_parser("reset")

    spider = sub.add_parser("spider", help="Load/reset the self-assessment radar axes.")
    spider_sub = spider.add_subparsers(dest="action", required=True)
    s = spider_sub.add_parser("load")
    s.add_argument("file")
    s.add_argument("--pin", action="store_true", help="Also pin everyone to the Self-assessment tab right now.")
    spider_sub.add_parser("reset")

    qna = sub.add_parser("qna", help="Moderate the anonymous Q&A queue.")
    qna_sub = qna.add_subparsers(dest="action", required=True)
    qna_sub.add_parser("list")
    qna_sub.add_parser("watch", help="Live-updating Q&A view — reply/approve/disapprove/delete without leaving the terminal.")
    s = qna_sub.add_parser("answer"); s.add_argument("id"); s.add_argument("--unanswer", action="store_true")
    s = qna_sub.add_parser("reply", help="Post a typed reply, visible to everyone under that question; also marks it answered.")
    s.add_argument("id"); s.add_argument("text", nargs="+", help="The reply text (wrap in quotes, or it's joined from multiple words)")
    s = qna_sub.add_parser("reply-accept", help="Toggle accepted on one reply (instructor-only; full ids — use 'qna watch' with its short q<N>/r<N> ids instead).")
    s.add_argument("id", help="question id"); s.add_argument("reply_id")
    s = qna_sub.add_parser("reply-reject", help="Toggle rejected on one reply (instructor-only; full ids — use 'qna watch' with its short q<N>/r<N> ids instead).")
    s.add_argument("id", help="question id"); s.add_argument("reply_id")
    s = qna_sub.add_parser("reply-delete", help="Delete one reply (full ids — use 'qna watch' with its short q<N>/r<N> ids instead).")
    s.add_argument("id", help="question id"); s.add_argument("reply_id")
    s = qna_sub.add_parser("approve", help="Toggle ★ approved (instructor-only; clicking again clears it).")
    s.add_argument("id")
    s = qna_sub.add_parser("disapprove", help="Toggle 🛑 disapproved (instructor-only; clicking again clears it).")
    s.add_argument("id")
    s = qna_sub.add_parser("delete"); s.add_argument("id")
    qna_sub.add_parser("clear")

    groups = sub.add_parser("groups", help="Make/clear random groups from currently-connected people.")
    groups_sub = groups.add_subparsers(dest="action", required=True)
    s = groups_sub.add_parser("make")
    s.add_argument("--mode", choices=["size", "count"], default="size")
    s.add_argument("--param", type=int, default=4)
    s.add_argument("--prompt", default=None, help="What the groups should do — shown above the cards. Omit to keep whatever prompt is already set.")
    s.add_argument("--pin", action="store_true", help="Also pin everyone to the Groups tab right now.")
    s = groups_sub.add_parser("prompt", help="Set/update the task prompt shown above the group cards, without remaking the groups.")
    s.add_argument("text", nargs="+")
    groups_sub.add_parser("clear")

    timer = sub.add_parser("timer", help="Set/start/pause/reset the shared countdown timer.")
    timer_sub = timer.add_subparsers(dest="action", required=True)
    s = timer_sub.add_parser("set"); s.add_argument("minutes", type=float)
    timer_sub.add_parser("start")
    timer_sub.add_parser("pause")
    timer_sub.add_parser("reset")

    whiteboard = sub.add_parser("whiteboard", help="Clear the whole whiteboard for everyone, or set a background image for collective annotation.")
    whiteboard_sub = whiteboard.add_subparsers(dest="action", required=True)
    whiteboard_sub.add_parser("clear")
    s = whiteboard_sub.add_parser("background", help="Load an image underneath the drawing layer — for annotating a diagram/photo together.")
    s.add_argument("image", help="Path relative to the project root, e.g. workshops/my-session/en/assets/diagram.png")
    whiteboard_sub.add_parser("background-clear", help="Remove the background image (strokes and notes are untouched).")

    slide = sub.add_parser("slide", help="Show text/an image in-app (a 'loading screen' or discussion prompt) — no need to alt-tab to a deck.")
    slide_sub = slide.add_subparsers(dest="action", required=True)
    s = slide_sub.add_parser("load")
    s.add_argument("file")
    s.add_argument("--pin", action="store_true", help="Also pin everyone to the Slide tab right now.")
    slide_sub.add_parser("clear")

    log = sub.add_parser("log", help="Show recent move requests on the blanks/order exercises — applied and denied.")
    log.add_argument("--n", type=int, default=30, help="How many entries to show (default 30)")
    log.add_argument("--activity", choices=["blanks", "order"], default=None, help="Filter to one activity")

    script = sub.add_parser("script", help="Step through a facilitator run-sheet (JSON) — next/back/goto, safe to redo a step.")
    script_sub = script.add_subparsers(dest="action", required=True)
    s = script_sub.add_parser("run"); s.add_argument("file")

    sub.add_parser("tags", help="Clear the tag cloud.").set_defaults(action="clear")

    mod = sub.add_parser("moderation", help="Manage the chat word-filter denylist.")
    mod_sub = mod.add_subparsers(dest="action", required=True)
    mod_sub.add_parser("list")
    s = mod_sub.add_parser("add"); s.add_argument("word")
    s = mod_sub.add_parser("remove"); s.add_argument("word")
    s = mod_sub.add_parser("load"); s.add_argument("file", help='JSON file: {"words": [...]}')
    s = mod_sub.add_parser("save"); s.add_argument("file")
    mod_sub.add_parser("reset", help="Reset to the shipped defaults in moderation_defaults.json.")

    return p


DISPATCH = {
    "status": cmd_status, "pin": cmd_pin, "session": cmd_session, "poll": cmd_poll,
    "blanks": cmd_blanks, "order": cmd_order, "spider": cmd_spider, "qna": cmd_qna,
    "groups": cmd_groups, "timer": cmd_timer, "tags": cmd_tags, "moderation": cmd_moderation,
    "whiteboard": cmd_whiteboard, "log": cmd_log, "script": cmd_script, "slide": cmd_slide,
}


def run_one(url: str, argv: list[str]) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return
    try:
        DISPATCH[args.command](url, args)
    except ApiError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


MENU = """
Classroom Live — control menu
  1) Status
  2) Pin a tab for everyone
  3) Session: save / restore / duplicate / reset / list
  4) Poll: start / close
  5) Fill-in-the-blanks: load / reset
  6) Order the steps: load / reveal / reset
  7) Self-assessment radar: load / reset
  8) Q&A: list / answer / approve / disapprove / delete / clear
  9) Groups: make / clear
 10) Timer: set / start / pause / reset
 11) Clear tag cloud
 12) Chat moderation: list / add / remove / load / save / reset
 13) Whiteboard: clear (for everyone)
 14) Log: recent move requests (applied/denied) on blanks + order
 15) Script: step through a facilitator run-sheet (next/back/goto)
 16) Slide: show text/an image in-app / clear
  q) Quit

Enter a number, or type a full command line (e.g. "pin poll"): """


def interactive(url: str) -> None:
    print(f"Talking to {url}. Ctrl+C to quit.")
    shortcuts = {
        "1": "status", "2": "pin ", "3": "session ", "4": "poll ", "5": "blanks ",
        "6": "order ", "7": "spider ", "8": "qna ", "9": "groups ", "10": "timer ",
        "11": "tags", "12": "moderation ", "13": "whiteboard ", "14": "log", "15": "script ", "16": "slide ",
    }
    while True:
        try:
            raw = input(MENU).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not raw:
            continue
        if raw.lower() in ("q", "quit", "exit"):
            return
        expanded = shortcuts.get(raw, raw)
        if expanded.endswith(" "):
            try:
                rest = input(f"  {expanded}").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                continue
            expanded = expanded + rest
        run_one(url, expanded.split())


def main() -> None:
    # Peel off --url before deciding one-shot vs interactive, so both modes honor it.
    argv = sys.argv[1:]
    url = DEFAULT_URL
    if "--url" in argv:
        i = argv.index("--url")
        url = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]

    if argv:
        run_one(url, argv)
    else:
        interactive(url)


if __name__ == "__main__":
    main()
