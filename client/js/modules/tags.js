// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// A small Archimedean-spiral word-cloud layout: the most frequent word
// gets placed dead center at its full size, then each subsequent word
// (smaller as frequency drops) spirals outward from the middle until it
// finds a spot that doesn't overlap anything already placed. Same
// principle as d3-cloud, just a compact version with no dependency.
const TagsModule = (() => {
  let lastWords = {};
  let resizeTimer = null;

  function rectsOverlap(a, b, pad) {
    return !(
      a.x + a.w + pad < b.x ||
      b.x + b.w + pad < a.x ||
      a.y + a.h + pad < b.y ||
      b.y + b.h + pad < a.y
    );
  }

  function layoutCloud(container, entries) {
    container.innerHTML = "";
    if (!entries.length) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const maxCount = Math.max(...entries.map(([, c]) => c));
    const placed = [];

    entries
      .sort((a, b) => b[1] - a[1])
      .forEach(([word, count]) => {
        const span = document.createElement("span");
        span.className = "tag-word";
        span.title = `${word} — ${count}`;
        const scale = 0.9 + (count / maxCount) * 3.2; // 0.9rem up to ~4.1rem for the most frequent word
        span.style.fontSize = `${scale}rem`;
        span.style.visibility = "hidden"; // measure before placing, so nothing flashes at (0,0)
        span.textContent = word;
        container.appendChild(span);

        const w = span.offsetWidth;
        const h = span.offsetHeight;

        let angle = 0;
        let radius = 0;
        let x = cx - w / 2;
        let y = cy - h / 2;
        const angleStep = 0.28;
        const radiusStep = 3.2;
        const maxRadius = Math.hypot(rect.width, rect.height);

        for (let tries = 0; tries < 3000; tries++) {
          const candidate = {
            x: cx + radius * Math.cos(angle) - w / 2,
            y: cy + radius * Math.sin(angle) * 0.72 - h / 2, // slightly squashed to suit wide containers
            w, h,
          };
          const overlaps = placed.some((p) => rectsOverlap(candidate, p, 5));
          if (!overlaps) {
            x = candidate.x;
            y = candidate.y;
            break;
          }
          angle += angleStep;
          radius += radiusStep * (angleStep / (2 * Math.PI));
          if (radius > maxRadius) {
            x = candidate.x;
            y = candidate.y;
            break; // give up trying to avoid overlap — better a rare overlap than an infinite loop
          }
        }

        span.style.left = `${x}px`;
        span.style.top = `${y}px`;
        span.style.visibility = "visible";
        placed.push({ x, y, w, h });
      });
  }

  function render(words) {
    lastWords = words;
    const container = document.getElementById("tag-cloud-display");
    layoutCloud(container, Object.entries(words));
  }

  function showBlockedNotice() {
    const existing = document.getElementById("tag-blocked-notice");
    if (existing) existing.remove();
    const notice = document.createElement("p");
    notice.id = "tag-blocked-notice";
    notice.className = "chat-blocked-notice";
    notice.textContent = I18N.t("tag_blocked_notice");
    document.getElementById("tag-form").insertAdjacentElement("afterend", notice);
    setTimeout(() => notice.remove(), 4000);
  }

  function init() {
    const form = document.getElementById("tag-form");
    const input = document.getElementById("tag-input");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const word = input.value.trim();
      if (!word) return;
      WSHub.send({ type: "tag_add", word });
      input.value = "";
    });

    const container = document.getElementById("tag-cloud-display");
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => layoutCloud(container, Object.entries(lastWords)), 150);
    }).observe(container);

    WSHub.on("session_state", (msg) => render(msg.state.tag_cloud.words));
    WSHub.on("tag_cloud_update", (msg) => render(msg.words));
    WSHub.on("tag_blocked", showBlockedNotice);
  }

  return { init };
})();
