// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
const AdminModule = (() => {
  async function refreshSessionList() {
    const res = await fetch("/api/admin/sessions");
    const sessions = await res.json();
    const list = document.getElementById("saved-sessions-list");
    if (!sessions.length) {
      list.innerHTML = `<p class="hint">${I18N.t("admin_no_sessions")}</p>`;
      return;
    }
    list.innerHTML = sessions
      .map(
        (s) => `
        <div class="saved-session-row" data-id="${s.id}">
          <span class="name">${escapeHtml(s.name)}</span>
          <button data-action="load">${I18N.t("admin_load")}</button>
          <button data-action="duplicate">${I18N.t("admin_duplicate")}</button>
          <button data-action="delete" class="danger">${I18N.t("admin_delete")}</button>
        </div>`
      )
      .join("");

    list.querySelectorAll(".saved-session-row").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-action="load"]').addEventListener("click", async () => {
        await fetch("/api/admin/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: id }),
        });
      });
      row.querySelector('[data-action="duplicate"]').addEventListener("click", async () => {
        const newName = prompt(I18N.t("admin_new_session_name"));
        if (!newName) return;
        await fetch("/api/admin/duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: id, new_name: newName }),
        });
        refreshSessionList();
      });
      row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        await fetch(`/api/admin/sessions/${id}`, { method: "DELETE" });
        refreshSessionList();
      });
    });
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderQnaAdminList(qna) {
    const list = document.getElementById("admin-qna-list");
    if (!list) return;
    const questions = Object.values(qna.questions).sort((a, b) => {
      if (a.answered !== b.answered) return a.answered ? 1 : -1;
      return Object.keys(b.upvotes).length - Object.keys(a.upvotes).length;
    });
    if (!questions.length) {
      list.innerHTML = `<p class="hint">${I18N.t("admin_qna_empty")}</p>`;
      return;
    }
    list.innerHTML = questions
      .map(
        (q) => `
        <div class="saved-session-row" data-id="${q.id}">
          <span class="name">${escapeHtml(q.text)} — ▲${Object.keys(q.upvotes).length}</span>
          <button data-action="toggle">${q.answered ? I18N.t("admin_qna_mark_unanswered") : I18N.t("admin_qna_mark_answered")}</button>
          <button data-action="delete" class="danger">${I18N.t("admin_qna_delete")}</button>
        </div>`
      )
      .join("");
    list.querySelectorAll(".saved-session-row").forEach((row) => {
      const id = row.dataset.id;
      const q = questions.find((x) => x.id === id);
      row.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
        await fetch("/api/admin/qna/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question_id: id, answered: !q.answered }),
        });
      });
      row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        await fetch("/api/admin/qna/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question_id: id }),
        });
      });
    });
  }

  function init() {
    document.getElementById("btn-save").addEventListener("click", async () => {
      const filename = document.getElementById("save-as-name").value.trim() || null;
      await fetch("/api/admin/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      refreshSessionList();
    });

    document.getElementById("btn-reset").addEventListener("click", async () => {
      if (!confirm(I18N.t("admin_reset_confirm"))) return;
      await fetch("/api/admin/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    });

    document.getElementById("btn-poll-start").addEventListener("click", async () => {
      const question = document.getElementById("poll-q-input").value.trim();
      const options = document
        .getElementById("poll-options-input")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const type = document.getElementById("poll-type-input").value;
      if (!question || options.length < 2) {
        alert("Need a question and at least two options.");
        return;
      }
      await fetch("/api/admin/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, options, type }),
      });
    });

    document.getElementById("btn-poll-close").addEventListener("click", async () => {
      await fetch("/api/admin/poll/close", { method: "POST" });
    });

    document.getElementById("btn-clear-tags").addEventListener("click", async () => {
      await fetch("/api/admin/tags/clear", { method: "POST" });
    });

    document.getElementById("btn-blanks-load").addEventListener("click", async () => {
      let parsed;
      try {
        parsed = JSON.parse(document.getElementById("blanks-template-input").value);
      } catch (e) {
        alert("That doesn't look like valid JSON:\n" + e.message);
        return;
      }
      const res = await fetch("/api/admin/blanks/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: parsed.title || "",
          text: parsed.text || "",
          answers: parsed.answers || {},
          distractors: parsed.distractors || [],
        }),
      });
      if (!res.ok) alert("Couldn't load that exercise — check the fields match the template format.");
    });

    document.getElementById("btn-blanks-reset").addEventListener("click", async () => {
      await fetch("/api/admin/blanks/reset", { method: "POST" });
    });

    document.getElementById("btn-spider-load").addEventListener("click", async () => {
      let axes;
      try {
        axes = JSON.parse(document.getElementById("spider-axes-input").value);
      } catch (e) {
        alert("That doesn't look like valid JSON:\n" + e.message);
        return;
      }
      const res = await fetch("/api/admin/spider/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: document.getElementById("spider-title-input").value.trim(),
          axes,
        }),
      });
      if (!res.ok) alert("Couldn't load those axes — check the fields match the template format.");
    });

    document.getElementById("btn-spider-reset").addEventListener("click", async () => {
      await fetch("/api/admin/spider/reset", { method: "POST" });
    });

    document.getElementById("btn-order-load").addEventListener("click", async () => {
      let elements;
      try {
        elements = JSON.parse(document.getElementById("order-elements-input").value);
      } catch (e) {
        alert("That doesn't look like valid JSON:\n" + e.message);
        return;
      }
      const res = await fetch("/api/admin/order/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "",
          criterion: document.getElementById("order-criterion-input").value.trim(),
          elements,
        }),
      });
      if (!res.ok) alert("Couldn't load that exercise — check the fields match the template format.");
    });

    document.getElementById("btn-order-reveal").addEventListener("click", async () => {
      await fetch("/api/admin/order/reveal", { method: "POST" });
    });

    document.getElementById("btn-order-reset").addEventListener("click", async () => {
      await fetch("/api/admin/order/reset", { method: "POST" });
    });

    document.getElementById("btn-qna-clear").addEventListener("click", async () => {
      await fetch("/api/admin/qna/clear", { method: "POST" });
    });

    document.getElementById("btn-groups-make").addEventListener("click", async () => {
      const mode = document.getElementById("groups-mode-select").value;
      const param = parseInt(document.getElementById("groups-param-input").value, 10) || 1;
      await fetch("/api/admin/groups/make", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, param }),
      });
    });

    document.getElementById("btn-groups-clear").addEventListener("click", async () => {
      await fetch("/api/admin/groups/clear", { method: "POST" });
    });

    document.getElementById("btn-timer-set").addEventListener("click", async () => {
      const minutes = parseFloat(document.getElementById("timer-minutes-input").value) || 1;
      await fetch("/api/admin/timer/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: Math.round(minutes * 60) }),
      });
    });

    document.getElementById("btn-timer-start").addEventListener("click", async () => {
      await fetch("/api/admin/timer/start", { method: "POST" });
    });

    document.getElementById("btn-timer-pause").addEventListener("click", async () => {
      await fetch("/api/admin/timer/pause", { method: "POST" });
    });

    document.getElementById("btn-timer-reset").addEventListener("click", async () => {
      await fetch("/api/admin/timer/reset", { method: "POST" });
    });

    WSHub.on("session_state", (msg) => renderQnaAdminList(msg.state.qna));
    WSHub.on("qna_update", (msg) => renderQnaAdminList(msg.qna));

    refreshSessionList();
  }

  return { init };
})();
