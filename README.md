# Classroom Live

A local-network classroom interaction tool. One laptop runs the server;
students connect from their own phones or laptops over the classroom's
WiFi — no accounts, no internet dependency once it's installed, no data
leaves the room.

Built for a single teacher running a single live session with a room full
of people, not for scale or multi-tenant use. It intentionally stays
small enough that you can read the whole server in one sitting.

## What it does

**Full-page modalities** (the tabs across the top):

- **Whiteboard** — freehand drawing (synced stroke-by-stroke) plus
  draggable post-it notes, all shared live.
- **Tag cloud** — anyone adds a word; size scales with frequency.
- **Poll** — instructor asks a question with options, bar or pie chart,
  live vote counts.
- **Fill in the blanks** — a shared pool of draggable pieces (correct
  answers + distractors) that anyone can drag into blanks in a passage;
  reactions and a completion vote included.
- **Order the steps** — a shared, reorderable list (also works as
  "rank most to least important"); up/down/check reactions, a
  reveal-and-grade step.
- **Self-assessment radar** — sliders per axis, live spider chart showing
  the room's spread (min–max band, interquartile band, median) with your
  own ratings drawn as a bold outline on top.
- **Groups** — instructor generates random groups (fixed size or fixed
  count) from whoever's currently connected; everyone sees the result as
  cards.

**Drawers** (small side panels, reachable from any tab without losing your
place):

- **Chat** — shared chat with lightweight one-level threading: reply to
  any message and the reply attaches to that message's thread, collapsed
  by default behind a "N replies" toggle. Works well for a "muddiest
  point" prompt — post the question as a top-level message, let people
  thread their answers under it.
- **Status** (traffic light) — green/yellow/red/gray self-report, with a
  live class-overview readout.
- **Q&A** — anonymous question queue with upvoting. Nobody's name is ever
  attached to a question, and upvotes are just deduplicated per
  connection — the server doesn't store who asked or who upvoted.
- **Timer** — a shared countdown for group work. View-only for students;
  the instructor sets the duration and starts/pauses/resets it from the
  Admin tab, and everyone's display ticks in sync since the server (not
  each browser) is the authority on how much time is left.

**Instructor controls** (Admin tab):

- Save / restore / duplicate-as-template / reset the live session.
- **Pin a tab for everyone** — jumps every connected person's view to the
  tab you pick. It's a nudge, not a lock: they can navigate elsewhere
  right after, and latecomers aren't yanked around by a stale pin, but
  they do see a small 📌 badge marking where the room currently is.
- Per-exercise controls: start/close polls, load/reset the fill-in-the-
  blanks and ordering exercises, reveal-and-grade the ordering exercise,
  load/reset the self-assessment axes, clear the tag cloud, moderate the
  Q&A queue (mark answered / delete / clear all), generate or clear
  random groups, and set/start/pause/reset the shared timer.

## Requirements

- Python 3.10+
- A laptop that can run a small web server and that everyone's devices
  can reach over the same WiFi network (a portable travel router works
  well for a room with no existing WiFi, or with WiFi you don't control).
- Any modern phone or desktop browser for the students — nothing to
  install on their end.

## Installation

Do this once, while you still have internet access (fonts and everything
else are bundled locally afterwards — no CDN calls at runtime):

```bash
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Running a session

1. Connect your laptop to the classroom's WiFi (or set up a portable
   router and connect to that). Find your laptop's LAN IP address:
   - macOS/Linux: `ip addr` or `ifconfig`
   - Windows: `ipconfig`
2. Start the server:

   ```bash
   uvicorn server.main:app --host 0.0.0.0 --port 8000
   ```

3. On your own machine (or the projector), open `http://localhost:8000/`.
4. Give students the address `http://<your-laptop's-LAN-IP>:8000/` to
   open on their own devices, on the same network.
5. Everyone picks a display name on entry. There's no login, no
   persistence in the browser — closing the tab just means picking a name
   again next time.

Stop the server with `Ctrl+C` in the terminal it's running in.

### Troubleshooting the first run

- **Students can't reach the address at all.** The most common cause is
  your OS firewall blocking incoming connections the first time a Python
  process asks to listen on a network port — macOS and Windows both pop
  up a permission prompt for this ("Allow incoming connections?"); say
  yes. If you didn't see a prompt (or dismissed it), check your firewall
  settings for `python`/`uvicorn`.
- **Some phones connect, others don't, on the "same" WiFi.** Some
  routers/access points enable "client isolation" or "AP isolation" by
  default, which blocks devices from talking to each other even on the
  same network — common on hotel, café, or some campus guest WiFi. A
  portable travel router you control (mentioned above) avoids this
  because you can turn isolation off, or it's off by default.
- **The laptop went to sleep and everyone got disconnected.** Turn off
  sleep/screen-lock on the host laptop for the duration of class — the
  server process pauses when the OS sleeps.
- **A page looks broken or a feature doesn't respond.** Open the
  browser's developer console (F12, or Cmd+Opt+I on Mac) and check for
  red errors — since this whole app is static files plus one WebSocket
  connection, a console error almost always points straight at the
  problem.

### A note on the network

Everything runs over WebSockets with small JSON messages, and the server
pushes only what changed (not the whole state) on most updates — this
keeps data transfer low even on a modest, crowded WiFi network. Whiteboard
strokes batch their points (~every 60ms while drawing) rather than
sending one message per pixel for the same reason.

## Managing sessions

A **session** is everything currently live: chat history, statuses, tag
cloud, poll, whiteboard, and the state of any loaded exercises. Only one
session is live at a time.

- **Save current session** writes it to `sessions/<name>.json`.
- **Restore** loads a saved session back as the live one, pushing it to
  every connected client immediately.
- **Duplicate as template** copies a saved session under a new name — set
  up a whiteboard diagram and a standard poll once, then reuse that
  combination across multiple sections without redoing the setup.
- **Reset live session** clears everything back to blank for everyone,
  without touching your saved files.

Saved sessions are plain JSON in `sessions/` — easy to back up, diff, or
hand-edit if you're comfortable doing that.

If you keep this project in git, `.gitignore` excludes everything in
`sessions/` by default — day-to-day class activity isn't something to
version. If you've built a template worth keeping (a pre-drawn diagram +
a standard poll, say) and want *that specific one* in the repo, force-add
it past the ignore rule:

```bash
git add -f sessions/my-template.json
```

## Exercise template formats

These get pasted as JSON into the Admin tab. All three examples below are
complete and ready to paste as-is to try things out.

### Fill-in-the-blanks

```json
{
  "title": "Cell biology basics",
  "text": "The {{1}} is the powerhouse of the cell, while the {{2}} controls its activities.",
  "answers": {
    "1": "mitochondria",
    "2": "nucleus"
  },
  "distractors": ["ribosome", "chloroplast", "ATP"]
}
```

- Mark each blank in `text` as `{{id}}` — any short id works.
- `answers` maps each blank id to its one correct piece of text.
- `distractors` is a flat list of extra pieces that don't belong to any
  particular blank — exercise-wide, not tied to one slot.
- All pieces start shuffled in one shared pool. Any connected client can
  drag any piece into any blank or back out — no per-piece ownership.
- Once a piece sits in a blank, everyone can react to it (👍 endorse /
  👎 object); moving the piece clears its reactions.
- Everyone votes yes/no/unsure on whether the exercise is done. Not
  voting counts as "unsure" by default.
- **Reset pieces** puts everything back in the pool and clears
  reactions/votes without re-pasting the template.

### Order the steps

```json
{
  "criterion": "Order from first to last",
  "elements": ["Write code", "Run tests", "Code review", "Merge to main", "Deploy to production"]
}
```

- `criterion` is entered separately in the admin form; `elements` goes in
  its own textarea, listed in the **correct** order — the exercise
  shuffles them for display. The same mechanism works for "rank most to
  least important" or any other ordering criterion; the wording is just a
  label shown above the list.
- Any client can drag any row to a new position, no locking.
- Reactions: ⬆ (should be earlier), ⬇ (should be later), ✓ (this is
  right). They reset the instant a row's position shifts — including
  rows nudged out of the way by someone *else's* drag.
- A row briefly highlights right after it moves.
- Once every currently-connected client has checked (✓) every row, the
  exercise marks itself finished and shows a banner.
- **Reveal & grade** shows the answer key next to the room's current
  arrangement, with a ✓/↑/↓ badge per row and a score.
- **Reset order** reshuffles fresh, clearing reactions, the finished
  flag, and the reveal.

### Self-assessment radar

```json
{
  "title": "Teaching quality check-in",
  "axes": [
    {"id": "1", "label": "Clarity", "max": 5},
    {"id": "2", "label": "Pacing", "max": 5},
    {"id": "3", "label": "Engagement", "max": 5}
  ]
}
```

(Title is a separate field in the admin form; `axes` goes in its own
textarea.)

- Each axis needs an `id`, a `label`, and a `max` (slider goes 0–`max`).
  Any number of axes works.
- Sliders default to each axis's midpoint the moment someone opens the
  tab, and that gets sent immediately, so they're counted in the group
  view right away; adjusting from there updates live for everyone.
- The group view draws, per axis: a light band from the class minimum to
  maximum, a darker band for the interquartile range (Q1–Q3), a dashed
  median line, and each viewer's *own* ratings as a bold unfilled outline
  on top.
- This chart is an original interpretation of a "quartile polygon" view,
  not a pixel-for-pixel match to any specific existing dashboard.
- **Reset responses** clears everyone's ratings but keeps the axes
  loaded.

#### Confidence-weighted polling, without any new feature

The radar doubles nicely as a confidence-weighted poll: make each axis a
question, and have people rate their *confidence* in their answer rather
than a skill level. For example, after a quiz:

```json
{
  "title": "How sure are you about each answer?",
  "axes": [
    {"id": "q1", "label": "Q1 — Newton's third law", "max": 5},
    {"id": "q2", "label": "Q2 — Conservation of momentum", "max": 5},
    {"id": "q3", "label": "Q3 — Free-body diagrams", "max": 5}
  ]
}
```

The quartile bands then show you where confidence is spread out or
polarized per question — often more useful than a plain right/wrong tally,
since a question everyone's confidently wrong about is a very different
problem from one where people are unsure but split.

## Q&A, groups, and the timer

These three don't need a JSON template — they're driven entirely from the
Admin tab:

- **Q&A** — nothing to load; the queue just starts empty and fills up as
  people ask. Moderate from the Admin tab: mark a question answered
  (it stays visible but grays out and sinks to the bottom, so there's
  still a record of what was asked), delete one outright, or clear the
  whole queue between topics. Anonymity is structural, not just a UI
  choice — the server never stores a name against a question or an
  upvote, so there's nothing to accidentally leak later.
- **Groups** — pick "groups of a fixed size" (e.g. 4 people each,
  however many groups that takes) or "a fixed number of groups" (e.g.
  exactly 3 groups, sized as evenly as possible), enter the number, and
  click **Make groups now**. It only groups people who are currently
  connected and have joined with a name — if someone joins after the
  fact, re-run it. **Clear groups** empties the Groups tab back out.
- **Timer** — set a duration in minutes and hit **Start**; **Pause**
  freezes the remaining time (rather than losing it) so you can resume
  later; **Reset** goes back to the last duration you set, unstarted. The
  countdown is computed from a server timestamp rather than each
  browser's own clock, so everyone's display agrees down to network
  latency, and a phone that was asleep for 10 seconds still shows the
  right number the moment it wakes up.

## Architecture

```
classroom-tool/
├── server/
│   ├── main.py              FastAPI app: WebSocket hub + REST admin endpoints
│   └── session_manager.py   Session state, mutations, JSON save/load
├── client/
│   ├── index.html           Single page: tabs, drawers, join flow, footer
│   ├── css/style.css        All styling — theme tokens, one file
│   ├── fonts/                Bundled OpenDyslexic + Atkinson Hyperlegible (no CDN)
│   ├── locales/              en.json / fr.json / es.json
│   └── js/
│       ├── i18n.js           Locale loader + data-i18n DOM binder
│       ├── ws.js              WebSocket wrapper (auto-reconnect, pub/sub)
│       ├── app.js             Orchestrator: tabs, drawers, pin sync, join, settings
│       └── modules/           One file per feature (chat, traffic, tags, poll,
│                              whiteboard, blanks, order, spider, groups, qna,
│                              timer, admin)
├── sessions/                 Saved session JSON files
└── requirements.txt
```

**Server → client protocol**: a single WebSocket connection per client at
`/ws`. On connect, the server sends `welcome` (with your `client_id`) and
`session_state` (the full current state). After that, each action
broadcasts a small typed message (`chat_message`, `traffic_light_update`,
`blanks_update`, `order_update`, `spider_update`, `qna_update`,
`groups_update`, `timer_update`, `pin_update`, etc.) to every connected
client; each client-side module listens for the message types it cares
about and re-renders.

**Admin actions** go over plain REST (`/api/admin/...`) rather than the
WebSocket, matching how a teacher actually uses them — one-off clicks from
a form, not a stream of events. Each admin endpoint mutates the live
session and then broadcasts the resulting state over the WebSocket, so
REST and WebSocket clients stay in sync automatically. There's no
authentication beyond "you're on the classroom's local network" — this is
built for a closed portable-router network, not the open internet.

**No accounts, no browser storage.** Everyone picks a display name on
entry, kept in server memory for that connection only. State lives only
in the server process and in whatever's explicitly saved to
`sessions/*.json`. If someone's WiFi drops, the client reconnects
automatically and silently re-sends their name, so chat and future
actions keep their name attached — but because there's no persistent
identity across connections (by design, to avoid needing accounts), a few
things tied to their *old* connection won't follow them: their traffic
light status disappears from the overview until they tap a color again,
and an in-progress poll/fill-blanks/ordering vote needs to be recast. This
is a deliberate simplicity trade-off, not an oversight — worth knowing
about if you're testing by toggling WiFi on and off.

## Extending it

Each feature is a self-contained module in `client/js/modules/`, mirrored
by a block of message handling in `server/main.py`'s `handle_message()`
and a matching state block in `session_manager.py`'s `_blank_state()`. To
add a new interaction type:

1. Add its default state to `_blank_state()`.
2. Add mutation methods to `Session` in `session_manager.py`.
3. Add a case to `handle_message()` in `main.py` for any live (WebSocket)
   actions, and/or a REST endpoint for admin (one-off) actions.
4. Write a small JS module that subscribes to its message type via
   `WSHub.on(...)` and renders into a `<div>` in `index.html`.
5. If it should be pin-able, add it as an `<option>` in the Admin tab's
   pin-target `<select>`.

## Accessibility & internationalization

- Interface languages: French (Canadian), English (Canadian), Spanish
  (Latin American) — switch anytime from the top bar.
- Font options: system default, Atkinson Hyperlegible, and OpenDyslexic,
  both bundled locally as font files (no internet needed once installed;
  see **Licensing** below for their terms).
- Light/dark mode, respecting the device's OS preference on first load.

## Licensing

- **The bundled fonts** — OpenDyslexic and Atkinson Hyperlegible — are
  both released under the [SIL Open Font License (OFL) 1.1](https://scripts.sil.org/OFL),
  a license specifically designed to let fonts be bundled and
  redistributed with software, including in public repos. Its two real
  conditions: the license text has to travel with the font files (it
  does — see `client/fonts/OFL-OpenDyslexic.txt` and
  `client/fonts/OFL-AtkinsonHyperlegible.txt`), and you can't sell the
  font *by itself* (bundling it for free in an app is exactly the
  intended use). Nothing else to do here — pushing this repo as-is,
  fonts included, is fine.
- **Python/JS dependencies** (FastAPI, Uvicorn, Pydantic) aren't vendored
  in this repo at all — they're installed via `pip` from
  `requirements.txt`, so there's nothing of theirs to redistribute or
  license here. All three are MIT-licensed anyway.
- **The code in this repo** (server, client, everything under
  `server/` and `client/js`/`client/css`) is original work — there's no
  license file included yet, which by default means "all rights
  reserved." If you want this repo to be reusable by others (e.g. other
  instructors, or published as open source), add a `LICENSE` file with
  whichever license you prefer (MIT is a common, permissive default for
  this kind of project) — that's a decision for you to make, not
  something to assume.

## How this tool was made

This tool was built through an iterative collaboration between Elisa
Schaeffer, Dean of Technology and Design at Collège LaSalle Montréal, and
Claude (Anthropic), an AI assistant. The pedagogical content, structure,
features, priorities, and editorial choices were defined, questioned, and
refined by Elisa at every step. Claude generated the code, proposed
wording, and flagged inconsistencies — but every substantive decision was
made by a human. The same disclosure appears in the app itself, in the
collapsed "How this tool was made" footer at the bottom of the page —
that copy is the canonical one; keep this section and that footer in
sync if either is updated.
