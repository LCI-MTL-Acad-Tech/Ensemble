// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
const TrafficModule = (() => {
  let myColor = null;

  function renderStatuses(statuses) {
    const grid = document.getElementById("traffic-grid");
    grid.innerHTML = "";
    const counts = { green: 0, yellow: 0, red: 0, gray: 0 };

    Object.values(statuses).forEach(({ name, color }) => {
      if (counts[color] !== undefined) counts[color]++;
      const chip = document.createElement("div");
      chip.className = "traffic-chip";
      chip.dataset.color = color;
      chip.innerHTML = `<span class="light"></span>${escapeHtml(name)}`;
      grid.appendChild(chip);
    });

    ["green", "yellow", "red", "gray"].forEach((c) => {
      document.getElementById(`lamp-${c}`).textContent = counts[c];
    });
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function selectColor(color) {
    myColor = color;
    document.querySelectorAll(".traffic-btn").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.color === color);
    });
    WSHub.send({ type: "traffic_light", color });
  }

  function init() {
    document.querySelectorAll(".traffic-btn").forEach((btn) => {
      btn.addEventListener("click", () => selectColor(btn.dataset.color));
    });

    WSHub.on("session_state", (msg) => renderStatuses(msg.state.traffic_light.statuses));
    WSHub.on("traffic_light_update", (msg) => renderStatuses(msg.statuses));
  }

  return { init };
})();
