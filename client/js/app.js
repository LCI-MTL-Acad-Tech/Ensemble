// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
(function () {
  // Tabs are the full-page modalities (whiteboard, poll, etc). Drawers are
  // the two lightweight side panels (chat, status) that stay reachable
  // without leaving whatever tab you're on. "Pinning" is the instructor's
  // way of sending everyone to the same place — it flips the switch on
  // every connected client the moment it's set, but doesn't lock anyone
  // there afterwards.
  let pinnedTarget = null;
  let myName = null; // set once the person joins; used to silently rejoin after a WiFi drop

  function isDrawerTarget(target) {
    return target === "chat" || target === "traffic" || target === "qna" || target === "timer";
  }

  function goToTab(view) {
    document.querySelectorAll("#tabs button[data-view]").forEach((b) => b.classList.remove("active"));
    const btn = document.querySelector(`#tabs button[data-view="${view}"]`);
    if (btn) btn.classList.add("active");
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const section = document.getElementById(`view-${view}`);
    if (section) section.classList.add("active");
  }

  function openDrawer(target) {
    ["chat", "traffic", "qna", "timer"].forEach((t) => {
      document.getElementById(`drawer-${t}`).classList.toggle("open", t === target);
    });
    document.getElementById("drawer-backdrop").classList.add("open");
  }

  function closeDrawers() {
    document.querySelectorAll(".drawer").forEach((d) => d.classList.remove("open"));
    document.getElementById("drawer-backdrop").classList.remove("open");
  }

  function goToTarget(target) {
    if (isDrawerTarget(target)) {
      openDrawer(target);
    } else {
      closeDrawers();
      goToTab(target);
    }
  }

  function updatePinBadges() {
    document.querySelectorAll("[data-target], #tabs button[data-view]").forEach((el) => {
      const target = el.dataset.target || el.dataset.view;
      const badge = el.querySelector(".pin-badge");
      if (badge) badge.hidden = target !== pinnedTarget;
    });
  }

  function initTabs() {
    document.querySelectorAll("#tabs button[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeDrawers();
        goToTab(btn.dataset.view);
      });
    });
  }

  function initDrawers() {
    document.querySelectorAll(".drawer-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        const alreadyOpen = document.getElementById(`drawer-${target}`).classList.contains("open");
        if (alreadyOpen) closeDrawers();
        else openDrawer(target);
      });
    });
    document.querySelectorAll(".drawer-close").forEach((btn) => {
      btn.addEventListener("click", closeDrawers);
    });
    document.getElementById("drawer-backdrop").addEventListener("click", closeDrawers);
  }

  function initPinAdmin() {
    document.getElementById("btn-pin-send").addEventListener("click", async () => {
      const target = document.getElementById("pin-target-select").value;
      await fetch("/api/admin/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
    });
    document.getElementById("btn-pin-clear").addEventListener("click", async () => {
      await fetch("/api/admin/pin/clear", { method: "POST" });
    });
  }

  function initSettings() {
    const themeSelect = document.getElementById("theme-select");
    const fontSelect = document.getElementById("font-select");
    const langSelect = document.getElementById("lang-select");

    themeSelect.addEventListener("change", () => {
      document.documentElement.dataset.theme = themeSelect.value;
    });
    fontSelect.addEventListener("change", () => {
      document.documentElement.dataset.font = fontSelect.value;
    });
    langSelect.addEventListener("change", () => I18N.setLang(langSelect.value));

    // Respect the device's OS-level preference as a starting point only.
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      themeSelect.value = "dark";
      document.documentElement.dataset.theme = "dark";
    }
  }

  function initConnectionBadge() {
    const badge = document.getElementById("conn-badge");
    WSHub.onStateChange((state) => {
      badge.dataset.state = state;
      badge.textContent = I18N.t(`connection_${state}`);
      I18N.onChange(() => {}); // no-op placeholder to keep intent clear
    });
    I18N.onChange(() => {
      badge.textContent = I18N.t(`connection_${badge.dataset.state}`);
    });
  }

  function initJoin() {
    const overlay = document.getElementById("join-overlay");
    const input = document.getElementById("join-name-input");
    const button = document.getElementById("join-button");

    function join() {
      const name = input.value.trim();
      if (!name) {
        input.focus();
        return;
      }
      myName = name;
      WSHub.send({ type: "join", name });
      overlay.style.display = "none";
    }

    button.addEventListener("click", join);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") join();
    });
    input.focus();

    // A dropped WiFi connection reconnects automatically (see ws.js), but
    // the server sees it as a brand-new client with no name yet. Rejoin
    // silently with the same name rather than dumping the person back on
    // the join screen or leaving them stuck as "Anonymous".
    WSHub.on("welcome", () => {
      if (myName) WSHub.send({ type: "join", name: myName });
    });
  }

  function initPinSync() {
    // Reconnecting or first loading: just show the badge, don't yank the
    // person somewhere they didn't navigate to themselves.
    WSHub.on("session_state", (msg) => {
      pinnedTarget = (msg.state.ui && msg.state.ui.pinned_tab) || null;
      updatePinBadges();
    });
    // A live pin event, though, means the instructor wants everyone there
    // right now.
    WSHub.on("pin_update", (msg) => {
      pinnedTarget = msg.target;
      updatePinBadges();
      if (pinnedTarget) goToTarget(pinnedTarget);
    });
  }

  async function boot() {
    await I18N.setLang("en");
    initTabs();
    initDrawers();
    initPinAdmin();
    initPinSync();
    initSettings();
    initConnectionBadge();
    initJoin();

    ChatModule.init();
    TrafficModule.init();
    TagsModule.init();
    PollModule.init();
    WhiteboardModule.init();
    BlanksModule.init();
    OrderModule.init();
    SpiderModule.init();
    QnaModule.init();
    GroupsModule.init();
    TimerModule.init();
    AdminModule.init();

    WSHub.connect();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
