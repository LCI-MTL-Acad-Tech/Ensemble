// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Order the steps: a shared, reorderable list. Anyone can drag any row to
// a new position. Reactions (up = should be earlier, down = should be
// later, check = this is right) attach to a row and reset whenever that
// row's position shifts — including rows that got nudged out of the way
// by someone else's drag, not just the one that moved. When every
// connected client has checked every row, the exercise is "finished" and
// the instructor can reveal the answer key to grade it.
const OrderModule = (() => {
  let lastState = null;
  const lastSeenMovedAt = {}; // item_id -> last last_moved_at we rendered, to detect "just changed"
  let dragEl = null;

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
      <span class="order-handle" title="drag to reorder">⠿</span>
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

    row.querySelector(".order-handle").addEventListener("pointerdown", (e) => startDrag(e, row));
    return row;
  }

  function startDrag(e, row) {
    e.preventDefault();
    const list = row.parentElement;
    const itemId = row.dataset.itemId;
    dragEl = row;
    row.classList.add("dragging");
    const startY = e.clientY;

    function siblingsExcept() {
      return [...list.children].filter((el) => el !== row);
    }

    function onMove(ev) {
      const dy = ev.clientY - startY;
      row.style.transform = `translateY(${dy}px)`;
      row.style.zIndex = "5";

      // reorder DOM live so the list previews the drop position
      const sibs = siblingsExcept();
      const rowMidY = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      let target = null;
      for (const sib of sibs) {
        const r = sib.getBoundingClientRect();
        if (rowMidY < r.top + r.height / 2) { target = sib; break; }
      }
      if (target) {
        list.insertBefore(row, target);
      } else {
        list.appendChild(row);
      }
      row.style.transform = "translateY(0px)"; // DOM move already accounts for position
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      row.classList.remove("dragging");
      row.style.transform = "";
      row.style.zIndex = "";
      const finalIndex = [...list.children].indexOf(row);
      dragEl = null;
      WSHub.send({ type: "order_move_item", item_id: itemId, new_index: finalIndex });
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

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.ordering));
    WSHub.on("order_update", (msg) => render(msg.ordering));
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
