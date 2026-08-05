// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Fill-in-the-blanks: a shared pool of pieces (correct answers + exercise-wide
// distractors) that any client can drag into any blank or back to the pool.
// No ownership/locking — whoever drags last wins. Reactions attach to
// whatever's currently sitting in a blank and are cleared when it moves.
const BlanksModule = (() => {
  let lastState = null;
  let dragClone = null;
  let draggingPieceId = null;

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function pieceLabel(fb, pieceId) {
    const piece = fb.pieces[pieceId];
    return piece ? piece.text : "";
  }

  function computeBlankOrder(fb) {
    const order = [];
    fb.segments.forEach((seg) => { if (seg.type === "blank") order.push(seg.id); });
    return order;
  }

  function reactionCounts(fb, pieceId) {
    const reactions = fb.reactions[pieceId] || {};
    const endorse = [];
    const object = [];
    Object.values(reactions).forEach((r) => {
      (r.type === "endorse" ? endorse : object).push(r.name);
    });
    return { endorse, object };
  }

  function renderPieceEl(fb, pieceId, placed, blankOrder) {
    const el = document.createElement("div");
    el.className = "piece" + (placed ? " placed" : "");
    el.dataset.pieceId = pieceId;

    const textSpan = document.createElement("span");
    textSpan.className = "piece-label";
    textSpan.textContent = pieceLabel(fb, pieceId);
    el.appendChild(textSpan);

    // Accessibility alternative to dragging: a compact dropdown that sends
    // this piece to a numbered blank (or back to the pool) with a
    // selection instead of a drag gesture. Always present, not behind a
    // toggle — an accessibility affordance someone has to discover and
    // switch on first defeats a good part of the point.
    const select = document.createElement("select");
    select.className = "piece-slot-select";
    select.title = I18N.t("blanks_slot_select_title");
    select.addEventListener("pointerdown", (e) => e.stopPropagation());
    select.addEventListener("click", (e) => e.stopPropagation());
    const poolOpt = document.createElement("option");
    poolOpt.value = "";
    poolOpt.textContent = I18N.t("blanks_slot_select_pool");
    select.appendChild(poolOpt);
    blankOrder.forEach((blankId, i) => {
      const opt = document.createElement("option");
      opt.value = blankId;
      opt.textContent = String(i + 1);
      select.appendChild(opt);
    });
    const currentBlank = (fb.placements[pieceId] && fb.placements[pieceId].blank_id) || "";
    select.value = currentBlank;
    select.addEventListener("change", () => {
      WSHub.send({
        type: "blanks_move_piece", piece_id: pieceId, blank_id: select.value || null,
        rev: lastState ? lastState.rev : undefined,
      });
    });
    el.appendChild(select);

    if (placed) {
      const placement = fb.placements[pieceId];
      const { endorse, object } = reactionCounts(fb, pieceId);
      const bar = document.createElement("div");
      bar.className = "piece-reactions";
      bar.innerHTML = `
        <button class="react-btn" data-reaction="endorse" title="${escapeHtml(endorse.join(", "))}">👍 <span>${endorse.length}</span></button>
        <button class="react-btn" data-reaction="object" title="${escapeHtml(object.join(", "))}">👎 <span>${object.length}</span></button>
        ${placement.moved_by ? `<span class="moved-by">${I18N.t("blanks_moved_by", { name: escapeHtml(placement.moved_by) })}</span>` : ""}
      `;
      bar.querySelectorAll(".react-btn").forEach((btn) => {
        btn.addEventListener("pointerdown", (e) => e.stopPropagation()); // don't start a drag
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          WSHub.send({ type: "blanks_react", piece_id: pieceId, reaction: btn.dataset.reaction });
        });
      });
      el.appendChild(bar);
    }

    if (fb.revealed) {
      const piece = fb.pieces[pieceId];
      const placement = fb.placements[pieceId];
      if (placed && piece.correct_blank !== null) {
        const correct = piece.correct_blank === placement.blank_id;
        const badge = document.createElement("span");
        badge.className = "piece-grade " + (correct ? "correct" : "incorrect");
        badge.textContent = correct ? "✓" : "✗";
        el.appendChild(badge);
      } else if (placed) {
        // a distractor sitting in a blank — it can never be "correct", but
        // say so explicitly rather than leaving it looking ungraded
        const badge = document.createElement("span");
        badge.className = "piece-grade incorrect";
        badge.textContent = "✗";
        el.appendChild(badge);
      }
    }

    el.addEventListener("pointerdown", (e) => startDrag(e, pieceId, el));
    return el;
  }

  function startDrag(e, pieceId, sourceEl) {
    e.preventDefault();
    draggingPieceId = pieceId;
    const rect = sourceEl.getBoundingClientRect();
    dragClone = sourceEl.cloneNode(true);
    dragClone.classList.add("piece-dragging");
    dragClone.style.width = `${rect.width}px`;
    document.body.appendChild(dragClone);
    positionClone(e.clientX, e.clientY, rect.width, rect.height);

    function onMove(ev) {
      positionClone(ev.clientX, ev.clientY, rect.width, rect.height);
    }
    function onUp(ev) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dragClone.remove();
      dragClone = null;
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const blankEl = target && target.closest("[data-blank-id]");
      const poolEl = target && target.closest("[data-pool-zone]");
      let blankId = null;
      if (blankEl) blankId = blankEl.dataset.blankId;
      else if (!poolEl) blankId = undefined; // dropped outside anything — ignore
      if (blankId !== undefined) {
        WSHub.send({
          type: "blanks_move_piece", piece_id: draggingPieceId, blank_id: blankId,
          rev: lastState ? lastState.rev : undefined,
        });
      }
      draggingPieceId = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function positionClone(x, y, w, h) {
    dragClone.style.position = "fixed";
    dragClone.style.left = `${x - w / 2}px`;
    dragClone.style.top = `${y - h / 2}px`;
    dragClone.style.zIndex = "1000";
    dragClone.style.pointerEvents = "none";
  }

  function renderVotes(fb) {
    const votes = Object.values(fb.votes || {});
    const counts = { yes: 0, no: 0, unsure: 0 };
    votes.forEach((v) => { if (counts[v.vote] !== undefined) counts[v.vote]++; });
    const myId = WSHub.getClientId();
    const myVote = (fb.votes[myId] && fb.votes[myId].vote) || "unsure";

    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.style.marginTop = "1rem";
    wrap.innerHTML = `
      <h3>${I18N.t("blanks_completion_title")}</h3>
      <div class="vote-buttons">
        <button data-vote="yes" class="${myVote === "yes" ? "chosen" : ""}">${I18N.t("blanks_vote_yes")}</button>
        <button data-vote="no" class="${myVote === "no" ? "chosen" : ""}">${I18N.t("blanks_vote_no")}</button>
        <button data-vote="unsure" class="${myVote === "unsure" ? "chosen" : ""}">${I18N.t("blanks_vote_unsure")}</button>
      </div>
      <p class="hint">${I18N.t("blanks_vote_counts", { yes: counts.yes, no: counts.no, unsure: counts.unsure })}</p>
    `;
    wrap.querySelectorAll("[data-vote]").forEach((btn) => {
      btn.addEventListener("click", () => WSHub.send({ type: "blanks_vote", vote: btn.dataset.vote }));
    });
    return wrap;
  }

  function render(fb) {
    lastState = fb;
    const body = document.getElementById("blanks-body");
    body.innerHTML = "";

    if (!fb || !fb.loaded) {
      body.innerHTML = `<p class="hint">${I18N.t("blanks_no_exercise")}</p>`;
      return;
    }

    const placedByBlank = {};
    Object.entries(fb.placements).forEach(([pid, p]) => {
      if (p.blank_id !== null) placedByBlank[p.blank_id] = pid;
    });
    const blankOrder = computeBlankOrder(fb);

    const passage = document.createElement("div");
    passage.className = "panel blanks-passage";
    if (fb.title) {
      const h = document.createElement("h2");
      h.textContent = fb.title;
      passage.appendChild(h);
    }
    const textWrap = document.createElement("div");
    textWrap.className = "blanks-text";
    fb.segments.forEach((seg) => {
      if (seg.type === "text") {
        textWrap.appendChild(document.createTextNode(seg.value));
      } else {
        const slot = document.createElement("span");
        slot.className = "blank-slot";
        slot.dataset.blankId = seg.id;
        const numBadge = document.createElement("span");
        numBadge.className = "blank-number";
        numBadge.textContent = String(blankOrder.indexOf(seg.id) + 1);
        slot.appendChild(numBadge);
        const pieceId = placedByBlank[seg.id];
        if (pieceId) {
          slot.appendChild(renderPieceEl(fb, pieceId, true, blankOrder));
        } else {
          slot.classList.add("empty");
        }
        textWrap.appendChild(slot);
      }
    });
    passage.appendChild(textWrap);

    if (fb.revealed) {
      let correctCount = 0;
      Object.entries(fb.placements).forEach(([pid, p]) => {
        const piece = fb.pieces[pid];
        if (piece.correct_blank !== null && p.blank_id === piece.correct_blank) correctCount++;
      });
      const scoreP = document.createElement("p");
      scoreP.className = "hint";
      scoreP.style.marginTop = "0.75rem";
      scoreP.textContent = I18N.t("blanks_score", { correct: correctCount, total: blankOrder.length });
      passage.appendChild(scoreP);
    }

    body.appendChild(passage);

    const poolPanel = document.createElement("div");
    poolPanel.className = "panel";
    poolPanel.style.marginTop = "1rem";
    poolPanel.dataset.poolZone = "1";
    const poolTitle = document.createElement("h3");
    poolTitle.textContent = I18N.t("blanks_pool_title");
    poolPanel.appendChild(poolTitle);
    const poolTray = document.createElement("div");
    poolTray.className = "blanks-pool";
    poolTray.dataset.poolZone = "1";
    fb.pool_order
      .filter((pid) => fb.placements[pid].blank_id === null)
      .forEach((pid) => poolTray.appendChild(renderPieceEl(fb, pid, false, blankOrder)));
    poolPanel.appendChild(poolTray);
    body.appendChild(poolPanel);

    body.appendChild(renderVotes(fb));
  }

  function showActionNotice(kind, text) {
    const existing = document.getElementById("blanks-action-notice");
    if (existing) existing.remove();
    const notice = document.createElement("p");
    notice.id = "blanks-action-notice";
    notice.className = kind === "denied" ? "chat-blocked-notice" : "action-applied-notice";
    notice.textContent = text;
    const body = document.getElementById("blanks-body");
    body.insertBefore(notice, body.firstChild);
    setTimeout(() => notice.remove(), kind === "denied" ? 4500 : 1800);
  }

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.fill_blanks));
    WSHub.on("blanks_update", (msg) => render(msg.fill_blanks));
    WSHub.on("action_applied", (msg) => {
      if (msg.activity !== "blanks") return;
      showActionNotice("applied", I18N.t("action_applied_notice"));
    });
    WSHub.on("action_denied", (msg) => {
      if (msg.activity !== "blanks") return;
      const key = msg.reason === "stale" ? "action_denied_stale" : "action_denied_generic";
      showActionNotice("denied", I18N.t(key));
    });
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
