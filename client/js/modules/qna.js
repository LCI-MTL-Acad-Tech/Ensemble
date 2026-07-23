// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Anonymous Q&A: nobody's name is ever attached to a question or a
// reaction — the server doesn't even store it. Sorted unanswered-first,
// then by (thumbs up - thumbs down), then by submission time. "Approved"
// is the instructor's own curation signal (set via control.py), separate
// from "answered" — a question can be approved as worth everyone's
// attention whether or not it's been dealt with yet.
const QnaModule = (() => {
  let lastState = null;

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function score(q) {
    const vals = Object.values(q.reactions);
    return vals.filter((r) => r === "up").length - vals.filter((r) => r === "down").length;
  }

  function sortedQuestions(qna) {
    return Object.values(qna.questions).sort((a, b) => {
      if (a.answered !== b.answered) return a.answered ? 1 : -1;
      return score(b) - score(a) || a.ts - b.ts;
    });
  }

  function render(qna) {
    lastState = qna;
    const body = document.getElementById("qna-body");
    body.innerHTML = "";

    const form = document.createElement("form");
    form.id = "qna-form";
    form.innerHTML = `
      <input id="qna-input" placeholder="${I18N.t("qna_placeholder")}" maxlength="500" autocomplete="off">
      <button class="primary" type="submit">${I18N.t("qna_submit")}</button>
    `;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("#qna-input");
      const text = input.value.trim();
      if (!text) return;
      WSHub.send({ type: "qna_submit", text });
      input.value = "";
    });
    body.appendChild(form);

    const list = document.createElement("div");
    list.className = "qna-list";
    const questions = sortedQuestions(qna);
    if (!questions.length) {
      list.innerHTML = `<p class="hint">${I18N.t("qna_empty")}</p>`;
    } else {
      const myId = WSHub.getClientId();
      questions.forEach((q) => {
        const up = Object.values(q.reactions).filter((r) => r === "up").length;
        const down = Object.values(q.reactions).filter((r) => r === "down").length;
        const mine = q.reactions[myId];
        const row = document.createElement("div");
        row.className = "qna-row" + (q.answered ? " answered" : "");
        row.innerHTML = `
          <span class="qna-text">${escapeHtml(q.text)}</span>
          ${q.approved ? `<span class="qna-approved-badge" title="${I18N.t("qna_approved_title")}">★</span>` : ""}
          ${q.answered ? `<span class="qna-answered-badge">${I18N.t("qna_answered_label")}</span>` : ""}
          <span class="qna-reactions">
            <button class="qna-react-btn ${mine === "up" ? "chosen" : ""}" data-reaction="up">👍 <span>${up}</span></button>
            <button class="qna-react-btn ${mine === "down" ? "chosen" : ""}" data-reaction="down">👎 <span>${down}</span></button>
          </span>
        `;
        row.querySelectorAll(".qna-react-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            WSHub.send({ type: "qna_react", question_id: q.id, reaction: btn.dataset.reaction });
          });
        });
        list.appendChild(row);
      });
    }
    body.appendChild(list);
  }

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.qna));
    WSHub.on("qna_update", (msg) => render(msg.qna));
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
