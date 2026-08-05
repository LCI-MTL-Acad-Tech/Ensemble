# AI Policy 101 — a one-hour, in-person faculty workshop
### English pilot — built for Classroom Live (`control.py`)

Built from Elisa Schaeffer's LCI Éducation intranet pages (ethics, practice,
tools, evaluation, training) and the AQPC 2026 talk *"Rester sur la même
page sur l'IA."* This is the English pilot; a French version
(`workshops/ai-policy-101/fr/`) mirrors the same run-sheet, templates, and
script structure exactly.

**Audience:** teaching staff, not students. **Group size:** 40–60 people
across different programs, headcount unknown until the day of — nothing
below requires knowing it in advance (see the note on group-making below).
**Goal:** everyone leaves able to (1) state the 5-level AI usage scale from
memory, (2) know where to find the two governing policies, and (3) have
tried writing Level 1 vs. Level 3 instructions for a real assignment.

### A note on group size and shared activities

At 40–60 people, three activities share a small, fixed number of "slots"
that everyone is reaching for at once: the order exercise (5 rows), and
both fill-in-the-blanks exercises (5–6 blanks each). Only a handful of
people can win each individual drag — say so out loud before the first one
("only a few of you will land a piece each round, and that's fine — you
can all still react and see the result build live, this isn't a race
you're expected to win personally"). It's been stress-tested at this scale
(55 simulated participants racing for the same single slot: exactly one
succeeded, the rest got a clean "someone beat you to it, try again" —
nobody's action is ever silently lost or applied on top of a stale
picture), so the mechanics hold up; the only thing to manage is the room's
expectations about who gets to actually drag something.

## Before the room opens

```bash
uvicorn server.main:app --host 0.0.0.0 --port 8000        # on the host laptop
python control.py session reset                            # blank slate
python control.py moderation reset                          # shipped defaults are fine for a faculty room
```

Open the join URL yourself first (`http://<laptop-LAN-IP>:8000/`), join
with a name, then open the 📱 **Join by QR code** drawer in the top bar
and put it up on the projector before people arrive. It always encodes
whatever address is actually in your browser bar, so it's correct
whether you're on port 8000 or something else, and on whatever LAN IP the
router handed out that day — nothing to type into a QR generator by hand.
Anyone can open that same drawer on their own device too, so a latecomer
can scan it off a neighbor's screen instead of waiting for you.

### Network capacity

The portable travel router this is designed around handles up to 90
devices. 40–60 teachers is comfortably inside that, even allowing for
some people bringing both a phone and a laptop. If a session ever grows
past roughly 80–85 expected devices, or you're told it'll run in a much
larger hall, loop in IT ahead of time for a proper event WiFi rather than
relying on the travel router — this isn't something to discover by
watching people fail to connect mid-session.

### Running it: the easy way

Everything below is also encoded as a steppable script — `script.json` in
this folder. Instead of typing each command by hand during the session:

```bash
python control.py script run workshops/ai-policy-101/en/script.json
```

This shows you the current step's name and talking point, fires its
actions (loading/pinning things) immediately, then waits:

- **Enter** → advance to the next step
- **b** → go back one step (safe to use if you advanced by accident — it
  just re-runs the previous step's actions, which re-pins/re-loads
  whatever that step was showing, so the room's screens land back where
  they were)
- **r** → re-run the current step (handy if a pin didn't visibly land for
  someone, or you want to re-show something)
- **g N** → jump straight to step N (e.g. `g 5`)
- **l** → list all steps with your current position marked
- **q** → quit the stepper (the live session itself keeps running — this
  only exits the script controller)

Step 1 is a welcome slide, not a timed part of the hour — run
`script run` as soon as you're set up, well before the official start
time, and just leave it sitting there while people trickle in and join.
Since it's pinned, everyone who joins during that window lands on it
directly instead of an empty whiteboard. Move on to step 2 (the
icebreaker) once most of the room has arrived.

The rest of this guide is the same run-sheet as prose, with the reasoning
and talking points spelled out — useful for rehearsing beforehand and for
adapting the session later, but the actual button-pressing during class is
the `script run` command above plus Enter/b/r/g/l/q.

---

## 0:00–0:05 — Icebreaker: one word

**Say:** "Before we start, add one word to the shared board: what's your
current relationship with AI in your teaching, right now, honestly?"

```bash
python control.py pin tags
```

Let it fill up for ~2 minutes, then glance at it together — don't over-analyze
it, just note out loud if there's an obvious cluster ("a lot of 'curious' and
'overwhelmed' in the same room — that's normal, that's why we're here").

---

## 0:05–0:10 — Baseline gut-check

**Say:** "Before any content — set your status. 🙂 = I feel clear about
what's allowed in my own evaluations right now. 😕 = somewhat unsure. 🆘 =
pretty lost. 💤 = honestly haven't thought about it yet. No wrong answer,
we're coming back to this at the end."

```bash
python control.py pin traffic
```

Note the rough split out loud, then move on — don't discuss it yet, the
point is the *comparison* at 0:57.

---

## 0:10–0:20 — The five-level scale

**Talking points** (2–3 minutes, from the évaluer page):

- Ambiguity about AI in assignments creates anxiety for students and
  inconsistency between sections. When expectations aren't stated, some
  over-rely on AI at the expense of their own learning; others avoid it
  entirely out of fear. Neither serves them.
- LCI Éducation uses a **five-level scale** to classify AI use in graded
  work — it gives everyone shared vocabulary, and it has to be declared
  **per assignment**, not as a blanket course policy, because the right
  level depends on what you're actually trying to measure.
- Walk through the five levels briefly (0 = prohibited, 1 = planning only,
  2 = collaboration on drafts/feedback, 3 = AI used extensively but directed
  and justified, 4 = AI as a creative partner, assessment co-designed).

**Activity:** load the ordering exercise and pin it.

```bash
python control.py order load workshops/ai-policy-101/en/order-ai-scale.json --pin
```

**Say:** "These are the five 'consigne type' statements, shuffled. Drag them
into order from most restrictive to most open. Green checkmark when your
row looks right to you; we'll reveal once most of the room has settled."

After ~5 minutes or once `python control.py status` shows the exercise
finished:

```bash
python control.py order reveal
```

Walk through anything that surprised people. This is the one activity you
should not skip or rush — everything else in the hour refers back to these
five levels by number.

---

## 0:20–0:30 — Match the concern to the discipline

**Say:** "Different fields worry about different things when it comes to
AI, and it's worth hearing why — nobody's concern is 'wrong,' it just comes
from a different place. Drag each worry into the discipline most likely to
raise it. A couple of pieces are decoys — cross-cutting concerns that don't
belong to one field more than another."

```bash
python control.py blanks load workshops/ai-policy-101/en/blanks-disciplines.json --pin
```

Every piece also has a small numbered dropdown next to it — a drag
alternative for anyone who finds dragging on a phone difficult, always
visible rather than a setting someone has to find and turn on first.
Mention it exists once, briefly, in case anyone needs it, then let the
room work.

The five matches (Nursing/clinical judgment, CS/code you can't debug,
Design/whose work is it, Business/fabricated data, Humanities/close
reading) plus three decoys (environmental cost, detector reliability,
license availability — all real concerns, just not discipline-specific).
Once most people have settled:

```bash
python control.py blanks reveal
```

This grades every blank in place (✓/✗ next to each piece, plus a score)
and works the same way `order reveal` does — dragging still works
afterward if anyone wants to fix a wrong match. Read through the five
correct matches together and ask: **"which of these is closest to a
worry you've actually had?"** — this is usually where the room starts
talking to each other rather than just to you.

**Worth a 30-second aside here, no activity needed:** a spring 2026 survey
of the LCI network — 136 respondents, 11 institutions, 340 programs — found
93% see AI as a creative partner or an accelerator rather than a threat,
and 66% specifically mentioned "hybrid employability," the expectation that
graduates will work alongside AI tools professionally. Useful context for
"the concerns are real, but so is the overall stance" before moving on.

---

## 0:30–0:40 — Facts worth remembering

**Say:** "Quick reinforcement round — drag the right piece into each blank.
There are a couple of decoys in the pool."

```bash
python control.py blanks load workshops/ai-policy-101/en/blanks-ai-ethics.json --pin
```

Once most people have filled it in:

```bash
python control.py blanks reveal
```

Read the completed paragraph aloud with the score showing, and briefly
unpack the two facts most likely to be new to the room:

- **Detectors and false positives**: detectors over-flag strong, fluent
  writing (the style we're trying to teach) and are biased against
  non-native English writers. An "85% probably AI" score is not 85%
  certainty — it's a probability from an imperfect model. Detectors can
  point an investigation somewhere; they can never close one.
- **What actually works instead**: authentic, specific context the AI can't
  invent; an oral defense (someone who doesn't understand their own work
  can't defend it live); documenting process, not just product; asking for
  personal reflection on lived experience.

---

## 0:40–0:50 — Redesign in groups

**Say:** "Find your group on this tab — the task is right there with it,
and it stays visible the whole time, even once the timer's running."

```bash
python control.py groups make --mode size --param 4 \
  --prompt "Spend 10 minutes reflecting on how a course concept connects to a real-world example, and be ready to talk about what you noticed.

In your group, rewrite these instructions twice:

Level 1 — AI only for planning.
The final reflection must be entirely the student's own thinking.

Level 3 — AI used extensively.
The student must direct and justify how they used it.

Post your Level 3 version as a sticky note on the Whiteboard tab." \
  --pin
```

The Groups tab is one unified view now — the task prompt, the group
cards, and a live timer readout all together, so nobody has to remember
a verbally-stated task or flip to a different tab to check how much time
is left. With an unknown headcount (40–60), `--mode size --param 4` is
easier to reason about live than guessing a group *count* — you're saying
"aim for groups of 4" rather than pre-calculating how many that implies.
The grouping never lets a group shrink below the size you asked for: if
the room doesn't divide evenly by 4, some groups grow to 5 rather than a
leftover group of 1 or 2 showing up (e.g. 47 people becomes eight groups
of 4 and three of 5 — check with `python control.py status` right after
if you want to see the actual split before people go looking for their
name). If discussion quality matters more than exact group size for a
given room, `--param 3` or `--param 5` both work the same way.

Note the prompt is deliberately worded as a *time-boxed, spoken*
reflection — "spend 10 minutes reflecting... be ready to talk about it" —
rather than a word-limited written one. An earlier version asked for "a
500-word reflection," which reads as something participants themselves
need to sit down and write during the workshop, and there's nowhere in
the app for that (post-its are for short notes, not essays). The actual
written output of this block is the *rewritten instructions*, which do
have a place to go — the sticky note.

Give them a minute to find their group and read the task, then start the
timer — the room stays on the same Groups screen throughout, they just
switch to Whiteboard whenever they're ready to post a note and can switch
back to check the prompt or the time left:

```bash
python control.py timer set 7
python control.py timer start
```

While they work, circulate. When the timer runs out, bring the room back
and read two or three of the posted Level 3 notes aloud — the differences
between groups are usually the most useful part of this block.

```bash
python control.py timer reset
```

---

## 0:50–0:57 — Closing self-check

```bash
python control.py spider load workshops/ai-policy-101/en/spider-reflection.json --pin
```

**Say:** "Rate yourself on these four right now — no one else sees your
name attached to your answer, just the shape of the room. The last one is
about the session itself, not the content — be honest, it's the only way
this gets better next time."

Let the group polygon build live for a minute, then point out the shape:
where's the room strongest, where's the spread widest (a wide spread on
"comfort declaring my own use" is worth naming directly — it means people
need to hear from each other, not just from this session). The
"productivity" axis is for you as facilitator more than for them — a low
score there is worth following up on directly in the Q&A that follows.

---

## 0:57–1:00 — Re-check and open questions

```bash
python control.py pin traffic
```

**Say:** "Same check as the start — 🙂/😕/🆘/💤 on clarity about what's
allowed. Let's see if that moved." Compare out loud to the 0:05 read.

```bash
python control.py pin qna
```

**Say:** "Anonymous question queue is open — ask anything, including things
you didn't want to say out loud. I'll keep it open after we leave the room
and follow up on anything I can't answer right now."

If you're running this via `python control.py script run ...`, this step
pins the Q&A tab and automatically drops you into a live view — questions
appear the instant they're submitted, and you can type an id-prefix plus
reply text to answer one on the spot, right there in the terminal, without
switching windows. Press **b** to step back out to the script when you're
ready to wrap up (or **a** at any earlier point in the script if you want
to check in on questions before the very end — you don't have to wait
until this step). Running `qna list`/`qna watch` standalone works the
same way outside the script, e.g. to keep following up after the session:

```bash
python control.py qna watch          # live view, updates itself
python control.py qna list           # one-off snapshot instead
```

---

## 1:00 — Thank you / contact

```bash
python control.py slide load workshops/ai-policy-101/en/slide-thankyou.json --pin
```

**Say:** "Thanks, everyone. Here's how to find the Guide again and reach
me afterward — and if you're on the portable router rather than your
usual WiFi, disconnect from it now to get your regular internet back."

The QR code points at the AI Guide's real intranet URL and the slide
shows your actual contact email — both are already filled in, not
placeholders, so this step is ready to use as-is.

---

## After the session

```bash
python control.py session save "ai-policy-101-en-pilot-$(date +%Y%m%d)"
python control.py log --n 100       # sanity-check nothing broke during live use
```

Saving under a dated name keeps this pilot run as a reference distinct from
the reusable templates in `workshops/ai-policy-101/en/`, which stay as
clean starting points for the next run. The French version lives in
`workshops/ai-policy-101/fr/` with its own facilitator guide.

## Sources this workshop draws on

- LCI Éducation intranet: *Éthique et IA*, *Pratiquer l'IA*, *Outils IA et
  politiques*, *Évaluer avec l'IA*, *Se former à l'IA* (Elisa Schaeffer /
  Sous-comité IA du Global Academic Committee, 2026).
- Satu Elisa Schaeffer, *"Rester sur la même page sur l'IA,"* AQPC 2026
  (Drummondville, June 4 2026) — <https://satuelisa.github.io/talks/aqpc2026.html>.
- Politique sur l'utilisation responsable de l'IA; Politique institutionnelle
  d'évaluation des apprentissages (PIEA) — both on the Agora portal.
