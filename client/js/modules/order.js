// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Order the steps: a shared, reorderable list. Anyone can drag any row to
// a new position — the whole row is the drag target, not just the small
// handle icon, since a tiny precise target is genuinely hard to grab on
// both touch and mouse. While dragging, the row follows the pointer
// continuously and other rows slide out of the way to preview the drop
// slot; the actual reorder only commits once, on release, and that's the
// only point a move is sent to the server. Reactions (up = should be
// earlier, down = should be later, check = this is right) attach to a
// row and reset whenever that row's position shifts — including rows
// that got nudged out of the way by someone else's drag, not just the
// one that moved. When every connected client has checked every row, the
// exercise is "finished" and the instructor can reveal the answer key to
// grade it.
const OrderModule = (() => {
  let lastState = null;
  const lastSeenMovedAt = {}; // item_id -> last last_moved_at we rendered, to detect "just changed"

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function reactionInfo(od, itemId) {
    const reactions = od.reactions[itemId] || {};
    const groups = { up: [], down: [], check: [] };
    Object.values(reactions).forEach((r) => {
      if (groups[r.type]) groups[r.type].push(r.name);
    });
    return groups;
  }

  function renderRow(od, itemId, index, myClientId) {
    const row = document.createElement("div");
    row.className = "order-row";
    row.dataset.itemId = itemId;

    const justMoved = lastSeenMovedAt[itemId] !== undefined && lastSeenMovedAt[itemId] !== od.last_moved_at[itemId];
    if (justMoved) {
      row.classList.add("just-moved");
      setTimeout(() => row.classList.remove("just-moved"), 2200);
    }
    lastSeenMovedAt[itemId] = od.last_moved_at[itemId];

    const groups = reactionInfo(od, itemId);
    const myReaction = (od.reactions[itemId] && od.reactions[itemId][myClientId] && od.reactions[itemId][myClientId].type) || null;

    let gradeBadge = "";
    if (od.revealed) {
      const correctIndex = od.correct_order.indexOf(itemId);
      const correct = correctIndex === index;
      gradeBadge = `<span class="order-grade ${correct ? "correct" : "incorrect"}">${
        correct ? "✓" : (correctIndex < index ? "↑" : "↓")
      }</span>`;
    }

    row.innerHTML = `
      <span class="order-handle" title="Drag to reorder">⠿</span>
      <span class="order-index">${index + 1}</span>
      <span class="order-text">${escapeHtml(od.items[itemId])}</span>
      ${gradeBadge}
      <span class="order-reactions">
        <button class="react-btn" data-reaction="up" title="${escapeHtml(groups.up.join(", "))}">⬆ <span>${groups.up.length}</span></button>
        <button class="react-btn" data-reaction="down" title="${escapeHtml(groups.down.join(", "))}">⬇ <span>${groups.down.length}</span></button>
        <button class="react-btn" data-reaction="check" title="${escapeHtml(groups.check.join(", "))}">✓ <span>${groups.check.length}</span></button>
      </span>
    `;

    row.querySelectorAll(".react-btn").forEach((btn) => {
      if (btn.dataset.reaction === myReaction) btn.classList.add("chosen");
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        WSHub.send({ type: "order_react", item_id: itemId, reaction: btn.dataset.reaction });
      });
    });

    // The whole row is the drag target (buttons opt out via stopPropagation
    // above) — a tiny handle-only target is hard to hit precisely on touch
    // and not much easier with a mouse.
    row.addEventListener("pointerdown", (e) => startDrag(e, row));
    return row;
  }

  function startDrag(e, row) {
    e.preventDefault();
    const list = row.parentElement;
    const itemId = row.dataset.itemId;
    const rows = [...list.children];
    const startIndex = rows.indexOf(row);
    // Snapshot everyone's position before anything moves — the "which
    // slot is the pointer over" test below always compares against these
    // original positions, not the live (possibly already-shifted) DOM, so
    // the drag doesn't fight itself as rows slide out of the way.
    const startRects = rows.map((r) => r.getBoundingClientRect());
    const rowHeight = startRects[startIndex].height;
    const startY = e.clientY;

    row.classList.add("dragging");
    row.style.zIndex = "5";
    rows.forEach((r) => { r.style.transition = "transform 0.15s ease"; });

    let targetIndex = startIndex;

    function applyPreviewShift() {
      // Visually slide every *other* row out of the way to preview the
      // drop slot — nothing here touches the real DOM order yet.
      rows.forEach((r, i) => {
        if (r === row) return;
        let shift = 0;
        if (startIndex < targetIndex && i > startIndex && i <= targetIndex) shift = -rowHeight;
        else if (startIndex > targetIndex && i < startIndex && i >= targetIndex) shift = rowHeight;
        r.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    }

    function onMove(ev) {
      const dy = ev.clientY - startY;
      row.style.transform = `translateY(${dy}px)`; // the dragged row itself follows the pointer continuously

      const draggedCenter = startRects[startIndex].top + rowHeight / 2 + dy;
      let newTarget = 0;
      for (let i = 0; i < startRects.length; i++) {
        if (draggedCenter > startRects[i].top + startRects[i].height / 2) newTarget = i;
      }
      if (newTarget !== targetIndex) {
        targetIndex = newTarget;
        applyPreviewShift();
      }
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      rows.forEach((r) => { r.style.transition = ""; r.style.transform = ""; });
      row.classList.remove("dragging");
      row.style.zIndex = "";

      // Commit the previewed slot as one real DOM move, matching what was
      // already shown, then tell the server.
      if (targetIndex !== startIndex) {
        const ref = rows[targetIndex];
        if (targetIndex > startIndex) ref.after(row);
        else ref.before(row);
      }

      WSHub.send({
        type: "order_move_item", item_id: itemId, new_index: targetIndex,
        rev: lastState ? lastState.rev : undefined,
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function render(od) {
    lastState = od;
    const body = document.getElementById("order-body");
    body.innerHTML = "";

    if (!od || !od.loaded) {
      body.innerHTML = `<p class="hint">${I18N.t("order_no_exercise")}</p>`;
      return;
    }

    const myClientId = WSHub.getClientId();
    const panel = document.createElement("div");
    panel.className = "panel";
    if (od.title) {
      const h = document.createElement("h2");
      h.textContent = od.title;
      panel.appendChild(h);
    }
    if (od.criterion) {
      const crit = document.createElement("p");
      crit.className = "hint";
      crit.textContent = od.criterion;
      panel.appendChild(crit);
    }

    if (od.finished && !od.revealed) {
      const banner = document.createElement("p");
      banner.className = "order-finished-banner";
      banner.textContent = I18N.t("order_finished_banner");
      panel.appendChild(banner);
    }

    const list = document.createElement("div");
    list.className = "order-list";
    od.current_order.forEach((itemId, i) => list.appendChild(renderRow(od, itemId, i, myClientId)));
    panel.appendChild(list);

    if (od.revealed) {
      const correctCount = od.current_order.filter((id, i) => od.correct_order[i] === id).length;
      const scoreP = document.createElement("p");
      scoreP.className = "hint";
      scoreP.style.marginTop = "0.75rem";
      scoreP.textContent = I18N.t("order_score", { correct: correctCount, total: od.current_order.length });
      panel.appendChild(scoreP);
    }

    body.appendChild(panel);
  }

  function showActionNotice(kind, text) {
    const existing = document.getElementById("order-action-notice");
    if (existing) existing.remove();
    const notice = document.createElement("p");
    notice.id = "order-action-notice";
    notice.className = kind === "denied" ? "chat-blocked-notice" : "action-applied-notice";
    notice.textContent = text;
    const body = document.getElementById("order-body");
    body.insertBefore(notice, body.firstChild);
    setTimeout(() => notice.remove(), kind === "denied" ? 4500 : 1800);
  }

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.ordering));
    WSHub.on("order_update", (msg) => render(msg.ordering));
    WSHub.on("action_applied", (msg) => {
      if (msg.activity !== "order") return;
      showActionNotice("applied", I18N.t("action_applied_notice"));
    });
    WSHub.on("action_denied", (msg) => {
      if (msg.activity !== "order") return;
      const key = msg.reason === "stale" ? "action_denied_stale" : "action_denied_generic";
      showActionNotice("denied", I18N.t(key));
    });
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
