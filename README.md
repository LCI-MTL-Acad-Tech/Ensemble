# Classroom Live

A local-network classroom interaction tool. One laptop runs the server;
students connect from their own phones or laptops over the classroom's
WiFi — no accounts, no internet dependency once it's installed, no data
leaves the room.

Built for a single teacher running a single live session with a room full
of people, not for scale or multi-tenant use. It intentionally stays
small enough that you can read the whole server in one sitting.

## What it does

**Full-page modalities** (the tabs across the top — Poll, Fill blanks,
Order the steps, Self-assessment, and Groups stay hidden until the
instructor actually loads something into them; see **Tab visibility**
below):

- **Whiteboard** — freehand drawing plus draggable post-it notes, all
  shared live. The Pen and Post-it tools each get their own contextual
  controls: the pen has a colour picker and a thickness slider; a note
  has its own background colour, text colour, and text size, chosen
  *before* you place it, with high-contrast defaults (pale yellow
  background, near-black text). Anyone can **undo** their own last action
  (a stroke or a note) or **erase my work** (everything *they* added, in
  one go) — but clearing the *whole* board for everyone is
  instructor-only, from `control.py`, not a button in the browser.
- **Tag cloud** — anyone adds a word; the most frequent word sits at the
  center at its full size, and everything else spirals outward around it
  (an Archimedean-spiral layout, same principle as d3-cloud), sized by
  frequency and colour-cycled for visual variety. Filtered by the same
  chat moderation word list (see below).
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
  by default behind a "N replies" toggle. Filtered by the chat moderation
  word list (see below) — a blocked message never reaches anyone but the
  person who tried to send it. Works well for a "muddiest point" prompt —
  post the question as a top-level message, let people thread their
  answers under it.
- **Status** (traffic light) — one vertical stack of lamp buttons doubles
  as both the picker and the overview: click a lamp (🙂 doing ok, 😕
  confused, 🆘 stuck, 💤 away) to set your own status, the number shows
  how many people are currently on it, and a small ▸ marks your own pick.
- **Q&A** — anonymous question queue with 👍/👎 reactions. Nobody's name
  is ever attached to a question or a reaction — the server doesn't store
  who asked or who reacted. Sorted unanswered-first, then by (👍 − 👎).
  The instructor can additionally mark a question **approved** (★) from
  `control.py` — a curation signal that's independent of "answered": a
  question can be worth everyone's attention whether or not it's been
  dealt with yet.
- **Timer** — a shared countdown for group work. View-only for students;
  the instructor sets the duration and starts/pauses/resets it from
  `control.py`, and everyone's display ticks in sync since the server
  (not each browser) is the authority on how much time is left.

**Viewer mode** — a 👁 toggle in the top bar, available to *any* client,
not just the instructor. Flipping it on grays out and disables every
control (forms, drag handles, drawing, votes, reactions) while leaving
navigation — tabs, drawers, theme/font/language — fully usable. Useful
for a projector display, or for your own device when you want to look
without accidentally changing something. Since it's just a display mode
anyone can flip on their own screen, it also doubles as a live
chat/Q&A viewer for the instructor — no separate moderation app needed
just to *watch* what's happening (see **Do we need a moderation GUI?**
below for the fuller answer).

**Instructor control** happens from `control.py`, a small command-line
tool — not a panel in the browser. See **Instructor control** below for
why, and **Chat moderation** for the word-filter feature.

## Tab visibility

Poll, Fill blanks, Order the steps, Self-assessment, and Groups start
hidden — there's no point showing five empty "nothing loaded yet" tabs to
a room full of people who just joined. Each one appears automatically the
moment the instructor loads something into it (`control.py poll start`,
`blanks load`, etc.), and if that happens while people are already
looking at the app, the tab doesn't just silently appear — it pulses
briefly to catch the eye, the same way a pinned tab gets a 📌 badge.
Whiteboard and Chat/Status/Q&A/Timer aren't gated; they're always there.

## Chat moderation

Every chat message (including replies) is checked against an editable,
whole-word, case-insensitive denylist before it's stored or broadcast. A
blocked message never reaches the class — only the person who tried to
send it gets a quiet private notice ("Message not sent…"), and nothing
they typed is stored anywhere.

- **Sensible defaults are loaded automatically** the moment the server
  starts, from `moderation_defaults.json` at the project root — a short,
  editable starting point covering common profanity in English, French,
  and Spanish. It is deliberately **not** an exhaustive moderation-grade
  list; review and extend it for your own context before relying on it.
- Matching is **whole-word**, so a blocked word like `shit` won't
  accidentally catch `shiitake`, and `ass` (if you added it) won't catch
  `class` or `assignment` — no Scunthorpe-problem false positives.
- The list is **not** tied to session save/restore/reset — it's a
  standing configuration, not part of any one class's activity, so
  resetting or restoring a session never touches it.
- Manage it entirely from `control.py`:

  ```bash
  python control.py moderation list                  # see the current list
  python control.py moderation add "some-word"        # add one, live
  python control.py moderation remove "some-word"      # remove one, live
  python control.py moderation load custom-list.json   # replace the whole list
  python control.py moderation save custom-list.json   # write the current list to a file
  python control.py moderation reset                   # back to the shipped defaults
  ```

  The load/save file format is the same as `moderation_defaults.json`:
  `{"words": ["word1", "word2", ...]}`.

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
6. In a second terminal on the same machine (or any machine that can
   reach the server), run `python control.py` for the interactive control
   menu — this is how you load exercises, start polls, pin tabs, reveal
   answers, and everything else instructor-side. See **Instructor
   control** below.

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

## Instructor control

There's deliberately no admin panel in the browser. Every instructor
action — loading an exercise, starting a poll, pinning a tab, revealing
an answer, moderating chat, managing sessions — happens through
`control.py`, a small command-line tool that talks to the server's REST
API. Two ways to use it:

**One-off commands**, for scripting or quick single actions:

```bash
python control.py status                 # what's currently loaded/active
python control.py pin poll                # send everyone to the Poll tab
python control.py order reveal            # show the right answer
python control.py session save "Week 3"
python control.py poll start --question "How's the pace?" --options "too slow,just right,too fast"
```

**Interactive menu**, if you'd rather not remember exact syntax — run it
with no arguments:

```bash
python control.py
```

This drops into a numbered menu; pick a number or type a full command
line directly. `python control.py --help` (or `python control.py
<command> --help`) lists every command and its options.

By default it talks to `http://localhost:8000` — the assumption is you're
running it on the same laptop as the server. If you're controlling the
session from a different machine on the same network, pass `--url`:

```bash
python control.py --url http://<server-laptop-LAN-IP>:8000 status
```

**Silent add vs. add-and-pin.** Loading an exercise (`poll start`, `blanks
load`, `order load`, `spider load`, `groups make`) is silent by default —
it just makes the tab appear (see **Tab visibility**), without forcing
anyone's screen to jump there. Add `--pin` to do both in one command:

```bash
python control.py order load steps.json          # loads quietly, tab appears
python control.py order load steps.json --pin    # loads AND sends everyone there now
```

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

These are JSON files you point `control.py` at (e.g. `python control.py
order load my-exercise.json`). All three examples below are complete and
ready to save as a file and try as-is.

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

## Q&A, groups, timer, and the whiteboard-wipe

These don't need a JSON template — they're driven entirely from
`control.py`:

- **Q&A** — nothing to load; the queue just starts empty and fills up as
  people ask, reacted to with 👍/👎. Moderate with `python control.py qna
  list` / `qna answer <id>` (toggle answered — it stays visible but grays
  out and sinks to the bottom, so there's still a record of what was
  asked) / `qna approve <id>` (toggle a ★ curation mark, independent of
  answered) / `qna delete <id>` / `qna clear`. Anonymity is structural,
  not just a UI choice — the server never stores a name against a
  question or a reaction, so there's nothing to accidentally leak later.
- **Groups** — `python control.py groups make --mode size --param 4` for
  groups of 4 people each (however many groups that takes), or
  `--mode count --param 3` for exactly 3 groups sized as evenly as
  possible. It only groups people who are currently connected and have
  joined with a name — if someone joins after the fact, re-run it.
  `python control.py groups clear` empties the Groups tab back out.
- **Timer** — `python control.py timer set 5` (minutes) then `timer
  start`; `timer pause` freezes the remaining time (rather than losing
  it) so you can resume later; `timer reset` goes back to the last
  duration you set, unstarted. The countdown is computed from a server
  timestamp rather than each browser's own clock, so everyone's display
  agrees down to network latency, and a phone that was asleep for 10
  seconds still shows the right number the moment it wakes up.
- **Whiteboard "clear for everyone"** — `python control.py whiteboard
  clear` wipes the whole board. This is the *only* way to do that;
  clients only get **Undo** (their own last stroke or note) and **Erase
  my work** (everything they've personally added), never a wipe of
  anyone else's contributions.

## Do we need a moderation GUI?

Short answer: not a separate one. Two things cover what a dedicated
moderation window would do:

- **Watching** what's happening (chat, Q&A) is just the ordinary browser
  view — open it like anyone would, flip on **Viewer mode** so nothing
  gets accidentally clicked, and open the Chat or Q&A drawer. No special
  build needed for that; it's the same page everyone else is using.
- **Acting** on it (answering/approving/deleting a question, clearing the
  whole board) is what `control.py` is for, and already covers the whole
  surface: `qna answer/approve/delete/clear`, `whiteboard clear`,
  `moderation add/remove/load/save/reset` for the chat word filter.

If down the line a point-and-click experience genuinely earns its keep —
say, moderating from a phone without a terminal handy — a lightweight
browser page reusing the existing WebSocket connection and CSS, scoped to
just Chat + Q&A, would be a reasonable follow-up. It isn't built now
because nothing in the current workflow is missing without it; happy to
build it if that changes.

## Architecture

```
classroom-tool/
├── control.py                Instructor CLI — talks to the REST admin API (see below)
├── moderation_defaults.json  Starter chat word-filter list, loaded at server startup
├── server/
│   ├── main.py              FastAPI app: WebSocket hub + REST admin endpoints
│   ├── session_manager.py   Session state, mutations, JSON save/load
│   └── moderation.py         Chat word-filter list: load/add/remove/match
├── client/
│   ├── index.html           Single page: tabs, drawers, join flow, footer
│   ├── css/style.css        All styling — theme tokens, one file
│   ├── fonts/                Bundled OpenDyslexic + Atkinson Hyperlegible (no CDN)
│   ├── locales/              en.json / fr.json / es.json
│   └── js/
│       ├── i18n.js           Locale loader + data-i18n DOM binder
│       ├── ws.js              WebSocket wrapper (auto-reconnect, pub/sub)
│       ├── app.js             Orchestrator: tabs (incl. gating/pulse), drawers,
│                              viewer mode, pin sync, join, settings
│       └── modules/           One file per feature (chat, traffic, tags, poll,
│                              whiteboard, blanks, order, spider, groups, qna,
│                              timer) — no admin module; there's no browser admin UI
├── sessions/                 Saved session JSON files
└── requirements.txt
```

**Server → client protocol**: a single WebSocket connection per client at
`/ws`. On connect, the server sends `welcome` (with your `client_id`) and
`session_state` (the full current state). After that, each action
broadcasts a small typed message (`chat_message`, `chat_blocked`,
`tag_blocked`, `traffic_light_update`, `blanks_update`, `order_update`,
`spider_update`, `qna_update`, `groups_update`, `timer_update`,
`whiteboard_undo`, `whiteboard_replace`, `pin_update`, etc.) to every
connected client; each client-side module listens for the message types
it cares about and re-renders. `app.js` additionally watches
`poll_update`/`blanks_update`/`order_update`/`spider_update`/
`groups_update` to decide when a gated tab should appear (see **Tab
visibility**) — no separate message type needed for that, since whether
something is "loaded" is already part of each one's own payload.

**Instructor actions** go over plain REST (`/api/admin/...`) rather than
the WebSocket, matching how `control.py` actually uses them — one-off
calls triggered by a CLI command, not a stream of events. Each admin
endpoint mutates the live session and then broadcasts the resulting state
over the WebSocket, so the CLI and every connected browser stay in sync
automatically — run `python control.py pin poll` and every open tab
jumps there within a fraction of a second. There's no authentication
beyond "you're on the classroom's local network" — this is built for a
closed portable-router network, not the open internet.

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
   actions, and/or a REST endpoint for one-off admin actions.
4. Write a small JS module that subscribes to its message type via
   `WSHub.on(...)` and renders into a `<div>` in `index.html`.
5. Add the matching command(s) to `control.py` (a new subparser plus a
   `cmd_...` function) so it's controllable from the CLI.
6. If it should be pin-able, add its id to `PIN_TARGETS` in `control.py`.

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
