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
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_URL = "http://localhost:8000"

PIN_TARGETS = [
    "whiteboard", "chat", "traffic", "qna", "timer", "tags",
    "poll", "blanks", "order", "spider", "groups",
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


def cmd_qna(url, args):
    if args.action == "list":
        questions = call(url, "GET", "/api/session")["state"]["qna"]["questions"]
        if not questions:
            print("(no questions)")
        for qid, q in sorted(
            questions.items(),
            key=lambda kv: (
                kv[1]["answered"],
                -sum(1 for r in kv[1]["reactions"].values() if r == "up")
                + sum(1 for r in kv[1]["reactions"].values() if r == "down"),
            ),
        ):
            up = sum(1 for r in q["reactions"].values() if r == "up")
            down = sum(1 for r in q["reactions"].values() if r == "down")
            answered_mark = "✓" if q["answered"] else " "
            approved_mark = "★" if q.get("approved") else " "
            print(f"  [{answered_mark}][{approved_mark}] 👍{up} 👎{down}  {q['text']}   (id: {qid})")
        print("  ([answered] [approved] — approved is your own curation signal, separate from answered)")
    elif args.action == "answer":
        call(url, "POST", "/api/admin/qna/answer", {"question_id": args.id, "answered": not args.unanswer})
        print("Updated.")
    elif args.action == "approve":
        call(url, "POST", "/api/admin/qna/approve", {"question_id": args.id, "answered": not args.unapprove})
        print("Updated.")
    elif args.action == "delete":
        call(url, "POST", "/api/admin/qna/delete", {"question_id": args.id})
        print("Deleted.")
    elif args.action == "clear":
        call(url, "POST", "/api/admin/qna/clear")
        print("Queue cleared.")


def cmd_groups(url, args):
    if args.action == "make":
        call(url, "POST", "/api/admin/groups/make", {"mode": args.mode, "param": args.param})
        print("Groups made.")
        maybe_pin(url, "groups", args.pin)
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
    s = qna_sub.add_parser("answer"); s.add_argument("id"); s.add_argument("--unanswer", action="store_true")
    s = qna_sub.add_parser("approve", help="Mark a question as instructor-approved (independent of answered).")
    s.add_argument("id"); s.add_argument("--unapprove", action="store_true")
    s = qna_sub.add_parser("delete"); s.add_argument("id")
    qna_sub.add_parser("clear")

    groups = sub.add_parser("groups", help="Make/clear random groups from currently-connected people.")
    groups_sub = groups.add_subparsers(dest="action", required=True)
    s = groups_sub.add_parser("make")
    s.add_argument("--mode", choices=["size", "count"], default="size")
    s.add_argument("--param", type=int, default=4)
    s.add_argument("--pin", action="store_true", help="Also pin everyone to the Groups tab right now.")
    groups_sub.add_parser("clear")

    timer = sub.add_parser("timer", help="Set/start/pause/reset the shared countdown timer.")
    timer_sub = timer.add_subparsers(dest="action", required=True)
    s = timer_sub.add_parser("set"); s.add_argument("minutes", type=float)
    timer_sub.add_parser("start")
    timer_sub.add_parser("pause")
    timer_sub.add_parser("reset")

    whiteboard = sub.add_parser("whiteboard", help="Clear the whole whiteboard for everyone (clients can only undo/erase their own work).")
    whiteboard_sub = whiteboard.add_subparsers(dest="action", required=True)
    whiteboard_sub.add_parser("clear")

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
    "whiteboard": cmd_whiteboard,
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
  8) Q&A: list / answer / approve / delete / clear
  9) Groups: make / clear
 10) Timer: set / start / pause / reset
 11) Clear tag cloud
 12) Chat moderation: list / add / remove / load / save / reset
 13) Whiteboard: clear (for everyone)
  q) Quit

Enter a number, or type a full command line (e.g. "pin poll"): """


def interactive(url: str) -> None:
    print(f"Talking to {url}. Ctrl+C to quit.")
    shortcuts = {
        "1": "status", "2": "pin ", "3": "session ", "4": "poll ", "5": "blanks ",
        "6": "order ", "7": "spider ", "8": "qna ", "9": "groups ", "10": "timer ",
        "11": "tags", "12": "moderation ", "13": "whiteboard ",
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
