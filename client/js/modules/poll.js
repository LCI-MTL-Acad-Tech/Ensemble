// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
const PollModule = (() => {
  const COLORS = ["#2f6690", "#2f9e51", "#d9a72c", "#c1443c", "#8a5fbf", "#3fb0c9", "#c97a3f"];
  let myVote = null;

  function tally(poll) {
    const counts = poll.options.map(() => 0);
    Object.values(poll.votes).forEach((idx) => {
      if (counts[idx] !== undefined) counts[idx]++;
    });
    return counts;
  }

  function barChart(options, counts) {
    const max = Math.max(1, ...counts);
    const barH = 28, gap = 12, labelW = 140, chartW = 360, height = options.length * (barH + gap);
    let rows = "";
    options.forEach((opt, i) => {
      const w = (counts[i] / max) * chartW;
      const y = i * (barH + gap);
      rows += `
        <text x="0" y="${y + barH * 0.7}" font-size="13" fill="currentColor">${escapeHtml(opt)}</text>
        <rect x="${labelW}" y="${y}" width="${chartW}" height="${barH}" fill="var(--line)" opacity="0.3" rx="4"></rect>
        <rect x="${labelW}" y="${y}" width="${Math.max(2, w)}" height="${barH}" fill="${COLORS[i % COLORS.length]}" rx="4"></rect>
        <text x="${labelW + chartW + 10}" y="${y + barH * 0.7}" font-size="13" fill="currentColor">${counts[i]}</text>
      `;
    });
    return `<svg viewBox="0 0 ${labelW + chartW + 50} ${height}" width="100%" height="${height}">${rows}</svg>`;
  }

  function pieChart(options, counts) {
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const r = 90, cx = 100, cy = 100;
    let angle = -Math.PI / 2;
    let slices = "";
    options.forEach((opt, i) => {
      const frac = counts[i] / total;
      const next = angle + frac * 2 * Math.PI;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(next), y2 = cy + r * Math.sin(next);
      const large = frac > 0.5 ? 1 : 0;
      if (counts[i] > 0) {
        slices += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z" fill="${COLORS[i % COLORS.length]}"></path>`;
      }
      angle = next;
    });
    let legend = "";
    options.forEach((opt, i) => {
      legend += `<div style="display:flex;align-items:center;gap:0.4rem;margin-top:0.3rem;">
        <span style="width:12px;height:12px;border-radius:50%;background:${COLORS[i % COLORS.length]};display:inline-block;"></span>
        <span>${escapeHtml(opt)} — ${counts[i]}</span></div>`;
    });
    return `<div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center;">
      <svg viewBox="0 0 200 200" width="220" height="220">${slices}</svg>
      <div>${legend}</div></div>`;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function render(poll) {
    const body = document.getElementById("poll-body");
    if (!poll || !poll.active) {
      body.innerHTML = `<p class="hint" data-i18n="poll_no_active">${I18N.t("poll_no_active")}</p>`;
      myVote = null;
      return;
    }
    const counts = tally(poll);
    const total = counts.reduce((a, b) => a + b, 0);

    const optionsHtml = poll.options
      .map((opt, i) => `<div class="poll-option-row">
          <button data-idx="${i}" class="${myVote === i ? "chosen" : ""}">${escapeHtml(opt)}</button>
        </div>`)
      .join("");

    body.innerHTML = `
      <div class="poll-question">${escapeHtml(poll.question)}</div>
      <div id="poll-options">${optionsHtml}</div>
      <p class="hint">${I18N.t("poll_total_votes", { count: total })}</p>
      <div id="poll-chart">${poll.type === "pie" ? pieChart(poll.options, counts) : barChart(poll.options, counts)}</div>
    `;

    body.querySelectorAll("#poll-options button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        myVote = idx;
        WSHub.send({ type: "poll_vote", option_index: idx });
      });
    });
  }

  let lastPoll = null;

  function init() {
    WSHub.on("session_state", (msg) => {
      lastPoll = msg.state.poll;
      render(lastPoll);
    });
    WSHub.on("poll_update", (msg) => {
      lastPoll = msg.poll;
      render(lastPoll);
    });
    I18N.onChange(() => render(lastPoll));
  }

  return { init };
})();
