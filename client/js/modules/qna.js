// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Anonymous Q&A: nobody's name is ever attached to a question or an
// upvote — the server doesn't even store it. Sorted unanswered-first,
// then by upvote count, then by submission time.
const QnaModule = (() => {
  let lastState = null;

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function sortedQuestions(qna) {
    return Object.values(qna.questions).sort((a, b) => {
      if (a.answered !== b.answered) return a.answered ? 1 : -1;
      const av = Object.keys(a.upvotes).length, bv = Object.keys(b.upvotes).length;
      if (av !== bv) return bv - av;
      return a.ts - b.ts;
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
        const row = document.createElement("div");
        row.className = "qna-row" + (q.answered ? " answered" : "");
        const mine = !!q.upvotes[myId];
        row.innerHTML = `
          <button class="qna-upvote ${mine ? "chosen" : ""}">▲ <span>${Object.keys(q.upvotes).length}</span></button>
          <span class="qna-text">${escapeHtml(q.text)}</span>
          ${q.answered ? `<span class="qna-answered-badge">${I18N.t("qna_answered_label")}</span>` : ""}
        `;
        row.querySelector(".qna-upvote").addEventListener("click", () => {
          WSHub.send({ type: "qna_upvote", question_id: q.id });
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
