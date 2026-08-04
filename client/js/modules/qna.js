// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Q&A: questions are anonymous (nobody's name is ever attached to a
// question or a question-level reaction). Replies are different —
// attributed by name by default, since "who answered" carries real
// information for a room of colleagues, but with a per-reply "reply
// anonymously" checkbox for anyone who'd rather not have their name on
// a given answer. Each reply gets its own 👍/👎 from everyone, and its
// own instructor accept/reject call (★/🛑-style, set via control.py —
// display-only here, same pattern as question approval). None of these
// signals affect each other: a question's approval, a reply's votes, and
// a reply's accept/reject are all independent.
const QnaModule = (() => {
  let lastState = null;
  let rememberAnonymous = false; // in-memory only (no localStorage) — just saves re-checking the box every reply within this page load

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function score(reactions) {
    const vals = Object.values(reactions);
    return vals.filter((r) => r === "up").length - vals.filter((r) => r === "down").length;
  }

  function sortedQuestions(qna) {
    return Object.values(qna.questions).sort((a, b) => {
      if (a.answered !== b.answered) return a.answered ? 1 : -1;
      return score(b.reactions) - score(a.reactions) || a.ts - b.ts;
    });
  }

  function sortedReplies(replies) {
    return [...replies].sort((a, b) => {
      const rejA = a.decision === "rejected", rejB = b.decision === "rejected";
      if (rejA !== rejB) return rejA ? 1 : -1; // rejected sinks to the bottom, but stays visible
      const accA = a.decision === "accepted", accB = b.decision === "accepted";
      if (accA !== accB) return accA ? -1 : 1; // accepted floats to the top
      return score(b.reactions) - score(a.reactions) || a.ts - b.ts;
    });
  }

  function renderReply(question, reply, myId) {
    const up = Object.values(reply.reactions).filter((r) => r === "up").length;
    const down = Object.values(reply.reactions).filter((r) => r === "down").length;
    const mine = reply.reactions[myId];
    const who = reply.from_instructor ? I18N.t("qna_reply_instructor") : (reply.author_name || I18N.t("qna_reply_anonymous"));

    const el = document.createElement("div");
    el.className = "qna-reply" + (reply.decision === "rejected" ? " rejected" : "");
    el.innerHTML = `
      <div class="qna-reply-head">
        <span class="qna-reply-author ${reply.from_instructor ? "instructor" : ""}">${escapeHtml(who)}</span>
        ${reply.decision === "accepted" ? `<span class="qna-decision-badge accepted">${I18N.t("qna_reply_accepted")}</span>` : ""}
        ${reply.decision === "rejected" ? `<span class="qna-decision-badge rejected">${I18N.t("qna_reply_rejected")}</span>` : ""}
      </div>
      <div class="qna-reply-text">${escapeHtml(reply.text)}</div>
      <div class="qna-reactions">
        <button class="qna-react-btn ${mine === "up" ? "chosen" : ""}" data-reaction="up">👍 <span>${up}</span></button>
        <button class="qna-react-btn ${mine === "down" ? "chosen" : ""}" data-reaction="down">👎 <span>${down}</span></button>
      </div>
    `;
    el.querySelectorAll(".qna-react-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        WSHub.send({ type: "qna_reply_react", question_id: question.id, reply_id: reply.id, reaction: btn.dataset.reaction });
      });
    });
    return el;
  }

  function renderReplyComposer(question) {
    const wrap = document.createElement("div");
    wrap.className = "qna-reply-composer";
    wrap.hidden = true;
    wrap.innerHTML = `
      <input class="qna-reply-input" placeholder="${I18N.t("qna_reply_placeholder")}" maxlength="500" autocomplete="off">
      <label class="qna-reply-anon-label">
        <input type="checkbox" class="qna-reply-anon-check" ${rememberAnonymous ? "checked" : ""}>
        ${I18N.t("qna_reply_anonymous_checkbox")}
      </label>
      <button class="qna-reply-send">${I18N.t("qna_reply_send")}</button>
    `;
    const input = wrap.querySelector(".qna-reply-input");
    const check = wrap.querySelector(".qna-reply-anon-check");
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      rememberAnonymous = check.checked;
      WSHub.send({ type: "qna_reply_submit", question_id: question.id, text, anonymous: check.checked });
      input.value = "";
    };
    wrap.querySelector(".qna-reply-send").addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    return wrap;
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
        const item = document.createElement("div");
        item.className = "qna-item";
        const row = document.createElement("div");
        row.className = "qna-row" + (q.answered ? " answered" : "");
        row.innerHTML = `
          <span class="qna-text">${escapeHtml(q.text)}</span>
          ${q.approval === "approved" ? `<span class="qna-approval-badge qna-approved" title="${I18N.t("qna_approved_title")}">★</span>` : ""}
          ${q.approval === "disapproved" ? `<span class="qna-approval-badge qna-disapproved" title="${I18N.t("qna_disapproved_title")}">🛑</span>` : ""}
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
        item.appendChild(row);

        const replies = q.replies || [];
        if (replies.length) {
          const repliesEl = document.createElement("div");
          repliesEl.className = "qna-replies";
          sortedReplies(replies).forEach((r) => repliesEl.appendChild(renderReply(q, r, myId)));
          item.appendChild(repliesEl);
        }

        const toggleBtn = document.createElement("button");
        toggleBtn.className = "qna-reply-toggle";
        toggleBtn.textContent = I18N.t("qna_reply_toggle", { count: replies.length });
        const composer = renderReplyComposer(q);
        toggleBtn.addEventListener("click", () => {
          composer.hidden = !composer.hidden;
          if (!composer.hidden) composer.querySelector(".qna-reply-input").focus();
        });
        item.appendChild(toggleBtn);
        item.appendChild(composer);

        list.appendChild(item);
      });
    }
    body.appendChild(list);
  }

  function showBlockedNotice() {
    const existing = document.getElementById("qna-blocked-notice");
    if (existing) existing.remove();
    const notice = document.createElement("p");
    notice.id = "qna-blocked-notice";
    notice.className = "chat-blocked-notice";
    notice.textContent = I18N.t("qna_blocked_notice");
    document.getElementById("qna-form").insertAdjacentElement("afterend", notice);
    setTimeout(() => notice.remove(), 4500);
  }

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.qna));
    WSHub.on("qna_update", (msg) => render(msg.qna));
    WSHub.on("qna_blocked", showBlockedNotice);
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
