// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Shared countdown timer: the server is authoritative (an end_at epoch
// while running, or a frozen remaining count while paused), and every
// client just ticks a local display off of that so everyone agrees on
// the time left even if they opened the drawer at different moments.
// Controls live in the Admin tab — this is a view-only readout.
const TimerModule = (() => {
  let lastState = null;
  let tickHandle = null;

  function remainingSeconds(t) {
    if (t.running && t.end_at) return Math.max(0, t.end_at - Date.now() / 1000);
    if (t.remaining_at_pause !== null && t.remaining_at_pause !== undefined) return t.remaining_at_pause;
    return t.duration_seconds;
  }

  function format(seconds) {
    const s = Math.ceil(seconds);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function render(t) {
    lastState = t;
    const body = document.getElementById("timer-body");
    if (!body) return;
    const remaining = remainingSeconds(t);
    body.innerHTML = `
      <div class="timer-display ${t.running ? "running" : ""} ${remaining <= 0 && t.running ? "done" : ""}">${format(remaining)}</div>
      <p class="hint">${t.running ? I18N.t("timer_running") : I18N.t("timer_paused")}</p>
    `;
  }

  function tick() {
    if (lastState) render(lastState);
  }

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.timer));
    WSHub.on("timer_update", (msg) => render(msg.timer));
    I18N.onChange(() => render(lastState));
    tickHandle = setInterval(tick, 1000);
  }

  return { init };
})();
