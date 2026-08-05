// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Random groups: the instructor picks how (fixed size or fixed count) and
// what the task is from control.py; everyone sees the result here — one
// screen with the task prompt, the group cards, and a live timer readout
// together, rather than needing to flip between separate tabs to
// remember what they're supposed to be doing and how long they have left.
const GroupsModule = (() => {
  let lastGroups = null;
  let lastTimer = null;

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function remainingSeconds(t) {
    if (t.running && t.end_at) return Math.max(0, t.end_at - Date.now() / 1000);
    if (t.remaining_at_pause !== null && t.remaining_at_pause !== undefined) return t.remaining_at_pause;
    return t.duration_seconds;
  }

  function formatTime(seconds) {
    const s = Math.ceil(seconds);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function render() {
    const body = document.getElementById("groups-body");
    if (!body) return;
    body.innerHTML = "";

    if (lastGroups && lastGroups.prompt) {
      const promptPanel = document.createElement("div");
      promptPanel.className = "panel groups-prompt";
      promptPanel.innerHTML = `<h3>${I18N.t("groups_prompt_title")}</h3><p>${escapeHtml(lastGroups.prompt).replace(/\n/g, "<br>")}</p>`;
      body.appendChild(promptPanel);
    }

    if (lastTimer) {
      const remaining = remainingSeconds(lastTimer);
      const timerEl = document.createElement("div");
      timerEl.className = "panel groups-timer-inline";
      timerEl.innerHTML = `
        <div class="timer-display ${lastTimer.running ? "running" : ""} ${remaining <= 0 && lastTimer.running ? "done" : ""}">${formatTime(remaining)}</div>
        <p class="hint">${lastTimer.running ? I18N.t("timer_running") : I18N.t("timer_paused")}</p>
      `;
      body.appendChild(timerEl);
    }

    if (!lastGroups || !lastGroups.groups || !lastGroups.groups.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = I18N.t("groups_empty");
      body.appendChild(p);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "groups-grid";
    lastGroups.groups.forEach((members, i) => {
      const card = document.createElement("div");
      card.className = "panel groups-card";
      const names = members.length
        ? members.map((m) => `<li>${escapeHtml(m.name)}</li>`).join("")
        : `<li class="hint">—</li>`;
      card.innerHTML = `<h3>${I18N.t("groups_group_label", { n: i + 1 })}</h3><ul>${names}</ul>`;
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  function tick() {
    if (lastTimer && lastTimer.running) render();
  }

  function init() {
    WSHub.on("session_state", (msg) => {
      lastGroups = msg.state.groups;
      lastTimer = msg.state.timer;
      render();
    });
    WSHub.on("groups_update", (msg) => {
      lastGroups = msg.groups;
      render();
    });
    WSHub.on("timer_update", (msg) => {
      lastTimer = msg.timer;
      render();
    });
    I18N.onChange(render);
    setInterval(tick, 1000);
  }

  return { init };
})();
