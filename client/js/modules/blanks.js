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

  function reactionCounts(fb, pieceId) {
    const reactions = fb.reactions[pieceId] || {};
    const endorse = [];
    const object = [];
    Object.values(reactions).forEach((r) => {
      (r.type === "endorse" ? endorse : object).push(r.name);
    });
    return { endorse, object };
  }

  function renderPieceEl(fb, pieceId, placed) {
    const el = document.createElement("div");
    el.className = "piece" + (placed ? " placed" : "");
    el.dataset.pieceId = pieceId;
    el.textContent = pieceLabel(fb, pieceId);

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
        WSHub.send({ type: "blanks_move_piece", piece_id: draggingPieceId, blank_id: blankId });
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
        const pieceId = placedByBlank[seg.id];
        if (pieceId) {
          slot.appendChild(renderPieceEl(fb, pieceId, true));
        } else {
          slot.classList.add("empty");
        }
        textWrap.appendChild(slot);
      }
    });
    passage.appendChild(textWrap);
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
      .forEach((pid) => poolTray.appendChild(renderPieceEl(fb, pid, false)));
    poolPanel.appendChild(poolTray);
    body.appendChild(poolPanel);

    body.appendChild(renderVotes(fb));
  }

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.fill_blanks));
    WSHub.on("blanks_update", (msg) => render(msg.fill_blanks));
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
