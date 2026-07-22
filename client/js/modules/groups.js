// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Random groups: the instructor picks how (fixed size or fixed count) from
// the Admin tab; everyone just sees the result here.
const GroupsModule = (() => {
  let lastState = null;

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function render(groups) {
    lastState = groups;
    const body = document.getElementById("groups-body");
    body.innerHTML = "";

    if (!groups || !groups.groups || !groups.groups.length) {
      body.innerHTML = `<p class="hint">${I18N.t("groups_empty")}</p>`;
      return;
    }

    const grid = document.createElement("div");
    grid.className = "groups-grid";
    groups.groups.forEach((members, i) => {
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

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.groups));
    WSHub.on("groups_update", (msg) => render(msg.groups));
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
