// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Chat with lightweight one-level threading: any message can be replied
// to, and the reply always attaches to that message's *root* (so a reply
// to a reply still lands in the same flat thread, rather than nesting
// arbitrarily deep). Handy for things like "muddiest point" — post a
// prompt, let people thread their answers under it — without needing a
// separate feature for it.
const ChatModule = (() => {
  let listEl, formEl, inputEl;
  let allMessages = [];
  const expandedThreads = new Set();
  let replyTarget = null; // root message id currently showing a reply box, or null

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function formatTime(ts) {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function messageBody(msg) {
    return `<span class="name">${escapeHtml(msg.name)}<span class="time">${formatTime(msg.ts)}</span></span>${escapeHtml(msg.text)}`;
  }

  function buildReplyBox(rootId) {
    const wrap = document.createElement("form");
    wrap.className = "chat-reply-form";
    wrap.innerHTML = `
      <input placeholder="${I18N.t("chat_reply_placeholder")}" maxlength="1000" autocomplete="off">
      <button class="primary" type="submit">${I18N.t("chat_reply_send")}</button>
      <button type="button" class="chat-reply-cancel">${I18N.t("chat_cancel")}</button>
    `;
    wrap.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = wrap.querySelector("input");
      const text = input.value.trim();
      if (!text) return;
      WSHub.send({ type: "chat_message", text, parent_id: rootId });
      replyTarget = null;
      render();
    });
    wrap.querySelector(".chat-reply-cancel").addEventListener("click", () => {
      replyTarget = null;
      render();
    });
    return wrap;
  }

  function renderOne(msg, { isReply } = {}) {
    const div = document.createElement("div");
    div.className = "chat-msg" + (isReply ? " chat-reply" : "");
    div.innerHTML = messageBody(msg);
    const replyBtn = document.createElement("button");
    replyBtn.className = "chat-reply-btn";
    replyBtn.textContent = I18N.t("chat_reply");
    replyBtn.addEventListener("click", () => {
      replyTarget = replyTarget === (msg.parent_id || msg.id) ? null : (msg.parent_id || msg.id);
      render();
    });
    div.appendChild(replyBtn);
    return div;
  }

  function render() {
    listEl.innerHTML = "";
    const byId = new Map(allMessages.map((m) => [m.id, m]));
    const roots = allMessages.filter((m) => !m.parent_id);
    const repliesByRoot = new Map();
    allMessages.forEach((m) => {
      if (m.parent_id && byId.has(m.parent_id)) {
        if (!repliesByRoot.has(m.parent_id)) repliesByRoot.set(m.parent_id, []);
        repliesByRoot.get(m.parent_id).push(m);
      }
    });

    roots.forEach((root) => {
      listEl.appendChild(renderOne(root));
      const replies = repliesByRoot.get(root.id) || [];
      if (replies.length) {
        const toggle = document.createElement("button");
        toggle.className = "chat-thread-toggle";
        const expanded = expandedThreads.has(root.id);
        toggle.textContent = expanded
          ? I18N.t("chat_hide_replies")
          : I18N.t("chat_show_replies", { count: replies.length });
        toggle.addEventListener("click", () => {
          if (expanded) expandedThreads.delete(root.id);
          else expandedThreads.add(root.id);
          render();
        });
        listEl.appendChild(toggle);
        if (expanded) {
          const threadWrap = document.createElement("div");
          threadWrap.className = "chat-thread";
          replies.forEach((r) => threadWrap.appendChild(renderOne(r, { isReply: true })));
          listEl.appendChild(threadWrap);
        }
      }
      if (replyTarget === root.id) {
        listEl.appendChild(buildReplyBox(root.id));
      }
    });

    listEl.scrollTop = listEl.scrollHeight;
  }

  function showBlockedNotice() {
    const existing = document.getElementById("chat-blocked-notice");
    if (existing) existing.remove();
    const notice = document.createElement("p");
    notice.id = "chat-blocked-notice";
    notice.className = "chat-blocked-notice";
    notice.textContent = I18N.t("chat_blocked_notice");
    formEl.insertAdjacentElement("afterend", notice);
    setTimeout(() => notice.remove(), 4000);
  }

  function init() {
    listEl = document.getElementById("chat-messages");
    formEl = document.getElementById("chat-form");
    inputEl = document.getElementById("chat-input");

    formEl.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = inputEl.value.trim();
      if (!text) return;
      WSHub.send({ type: "chat_message", text });
      inputEl.value = "";
    });

    WSHub.on("session_state", (msg) => {
      allMessages = msg.state.chat.messages;
      render();
    });
    WSHub.on("chat_message", (msg) => {
      allMessages.push(msg.message);
      render();
    });
    WSHub.on("chat_blocked", showBlockedNotice);
    I18N.onChange(render);
  }

  return { init };
})();
