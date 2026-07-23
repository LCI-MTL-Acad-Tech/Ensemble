// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Traffic light: one set of lamp buttons serves double duty — it's both
// how you set your own status (click a lamp) and the live class overview
// (each lamp shows how many people are currently on it). Your own choice
// gets a small ▸ marker rather than needing a separate picker row.
const TrafficModule = (() => {
  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderStatuses(statuses) {
    const counts = { green: 0, yellow: 0, red: 0, gray: 0 };
    Object.values(statuses).forEach(({ color }) => {
      if (counts[color] !== undefined) counts[color]++;
    });
    ["green", "yellow", "red", "gray"].forEach((c) => {
      document.getElementById(`lamp-${c}`).textContent = counts[c];
    });

    const myId = WSHub.getClientId();
    const myColor = statuses[myId] && statuses[myId].color;
    document.querySelectorAll(".lamp-btn").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.color === myColor);
    });

    const grid = document.getElementById("traffic-grid");
    grid.innerHTML = "";
    Object.values(statuses).forEach(({ name, color }) => {
      const chip = document.createElement("div");
      chip.className = "traffic-chip";
      chip.dataset.color = color;
      chip.innerHTML = `<span class="light"></span>${escapeHtml(name)}`;
      grid.appendChild(chip);
    });
  }

  function selectColor(color) {
    WSHub.send({ type: "traffic_light", color });
  }

  function init() {
    document.querySelectorAll(".lamp-btn").forEach((btn) => {
      btn.addEventListener("click", () => selectColor(btn.dataset.color));
    });

    WSHub.on("session_state", (msg) => renderStatuses(msg.state.traffic_light.statuses));
    WSHub.on("traffic_light_update", (msg) => renderStatuses(msg.statuses));
  }

  return { init };
})();
