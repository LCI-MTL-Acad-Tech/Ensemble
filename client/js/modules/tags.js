// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
const TagsModule = (() => {
  function render(words) {
    const container = document.getElementById("tag-cloud-display");
    container.innerHTML = "";
    const entries = Object.entries(words);
    if (!entries.length) return;
    const maxCount = Math.max(...entries.map(([, c]) => c));

    entries
      .sort((a, b) => b[1] - a[1])
      .forEach(([word, count]) => {
        const span = document.createElement("span");
        span.className = "tag-word";
        const scale = 0.85 + (count / maxCount) * 1.6; // 0.85rem .. ~2.45rem
        span.style.fontSize = `${scale}rem`;
        span.textContent = `${word} (${count})`;
        container.appendChild(span);
      });
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

    WSHub.on("session_state", (msg) => render(msg.state.tag_cloud.words));
    WSHub.on("tag_cloud_update", (msg) => render(msg.words));
  }

  return { init };
})();
