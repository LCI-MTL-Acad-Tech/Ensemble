// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Coordinates are normalised to [0,1] of the board's current size so that
// drawings line up whether they came from a phone or the projector laptop.
const WhiteboardModule = (() => {
  // Not crypto.randomUUID(): that API is gated to secure contexts (https
  // or localhost) in Chrome/Safari/Edge, and this app is deliberately
  // served over plain http:// on a LAN IP — randomUUID() would throw on
  // every device except the host laptop itself. These ids are ephemeral
  // and never need to be unguessable, just unique within a session.
  function genId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  let canvas, ctx, wrap;
  let drawing = false;
  let currentStroke = null;
  let pendingPoints = [];
  let flushTimer = null;
  const strokes = new Map(); // id -> {color, size, points:[[x,y]...]}
  const postitEls = new Map(); // id -> element

  function resizeCanvas() {
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawAll();
  }

  function toNorm(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
  }

  function drawSegment(color, size, p1, p2) {
    const rect = canvas.getBoundingClientRect();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p1[0] * rect.width, p1[1] * rect.height);
    ctx.lineTo(p2[0] * rect.width, p2[1] * rect.height);
    ctx.stroke();
  }

  function redrawAll() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    strokes.forEach((s) => {
      for (let i = 1; i < s.points.length; i++) {
        drawSegment(s.color, s.size, s.points[i - 1], s.points[i]);
      }
    });
  }

  function loadState(wb) {
    strokes.clear();
    (wb.strokes || []).forEach((s) => strokes.set(s.id, { color: s.color, size: s.size, points: s.points }));
    redrawAll();

    document.querySelectorAll(".postit").forEach((el) => el.remove());
    postitEls.clear();
    (wb.postits || []).forEach(renderPostit);
  }

  function flushPending() {
    if (currentStroke && pendingPoints.length) {
      WSHub.send({ type: "whiteboard_stroke_points", id: currentStroke, points: pendingPoints });
      pendingPoints = [];
    }
  }

  function pointerDown(e) {
    const tool = document.getElementById("wb-tool-postit").classList.contains("primary") ? "postit" : "pen";
    const [x, y] = toNorm(e.clientX, e.clientY);

    if (tool === "postit") {
      const id = genId();
      const postit = { id, x, y, color: "#fff59d", text: "" };
      WSHub.send({ type: "whiteboard_postit", ...postit });
      renderPostit(postit, true);
      return;
    }

    drawing = true;
    currentStroke = genId();
    const color = document.getElementById("wb-color").value;
    const size = parseInt(document.getElementById("wb-size").value, 10);
    strokes.set(currentStroke, { color, size, points: [[x, y]] });
    WSHub.send({ type: "whiteboard_stroke_start", id: currentStroke, color, size, points: [[x, y]] });
    canvas.setPointerCapture(e.pointerId);
  }

  function pointerMove(e) {
    if (!drawing || !currentStroke) return;
    const [x, y] = toNorm(e.clientX, e.clientY);
    const s = strokes.get(currentStroke);
    const prev = s.points[s.points.length - 1];
    s.points.push([x, y]);
    drawSegment(s.color, s.size, prev, [x, y]);
    pendingPoints.push([x, y]);
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushPending();
        flushTimer = null;
      }, 60); // batch ~60ms of points per network message to save bandwidth
    }
  }

  function pointerUp() {
    if (drawing) {
      flushPending();
      drawing = false;
      currentStroke = null;
    }
  }

  function renderPostit(postit, editingNow) {
    let el = postitEls.get(postit.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "postit";
      el.innerHTML = `
        <div class="postit-bar"><button data-action="delete" title="delete">✕</button></div>
        <textarea data-i18n-placeholder="postit_placeholder" placeholder="Note…"></textarea>
      `;
      wrap.appendChild(el);
      postitEls.set(postit.id, el);

      const textarea = el.querySelector("textarea");
      let saveTimer = null;
      textarea.addEventListener("input", () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const rect = wrap.getBoundingClientRect();
          const x = parseFloat(el.style.left) / rect.width;
          const y = parseFloat(el.style.top) / rect.height;
          WSHub.send({ type: "whiteboard_postit", id: postit.id, x, y, color: el.style.background, text: textarea.value });
        }, 300);
      });

      el.querySelector('[data-action="delete"]').addEventListener("click", () => {
        WSHub.send({ type: "whiteboard_postit_delete", id: postit.id });
        el.remove();
        postitEls.delete(postit.id);
      });

      makeDraggable(el);
    }

    const rect = wrap.getBoundingClientRect();
    el.style.left = `${postit.x * rect.width}px`;
    el.style.top = `${postit.y * rect.height}px`;
    el.style.background = postit.color;
    const ta = el.querySelector("textarea");
    if (document.activeElement !== ta) ta.value = postit.text;
    if (editingNow) ta.focus();
  }

  function makeDraggable(el) {
    let sx, sy, ox, oy, dragging = false;
    el.addEventListener("pointerdown", (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON") return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = parseFloat(el.style.left); oy = parseFloat(el.style.top);
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      el.style.left = `${ox + (e.clientX - sx)}px`;
      el.style.top = `${oy + (e.clientY - sy)}px`;
    });
    el.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      const rect = wrap.getBoundingClientRect();
      const x = parseFloat(el.style.left) / rect.width;
      const y = parseFloat(el.style.top) / rect.height;
      const ta = el.querySelector("textarea");
      WSHub.send({ type: "whiteboard_postit", id: [...postitEls.entries()].find(([, v]) => v === el)[0], x, y, color: el.style.background, text: ta.value });
    });
  }

  function init() {
    canvas = document.getElementById("whiteboard-canvas");
    wrap = document.getElementById("whiteboard-wrap");
    ctx = canvas.getContext("2d");

    new ResizeObserver(resizeCanvas).observe(wrap);
    window.addEventListener("resize", resizeCanvas);

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);

    document.getElementById("wb-tool-pen").addEventListener("click", () => {
      document.getElementById("wb-tool-pen").classList.add("primary");
      document.getElementById("wb-tool-postit").classList.remove("primary");
    });
    document.getElementById("wb-tool-postit").addEventListener("click", () => {
      document.getElementById("wb-tool-postit").classList.add("primary");
      document.getElementById("wb-tool-pen").classList.remove("primary");
    });

    document.getElementById("wb-clear").addEventListener("click", () => {
      if (confirm(I18N.t("whiteboard_clear_confirm"))) {
        fetch("/api/admin/whiteboard/clear", { method: "POST" });
      }
    });

    WSHub.on("session_state", (msg) => loadState(msg.state.whiteboard));

    WSHub.on("whiteboard_stroke_start", (msg) => {
      strokes.set(msg.stroke.id, { color: msg.stroke.color, size: msg.stroke.size, points: msg.stroke.points });
      redrawAll();
    });
    WSHub.on("whiteboard_stroke_points", (msg) => {
      const s = strokes.get(msg.id);
      if (!s) return;
      let prev = s.points[s.points.length - 1];
      msg.points.forEach((p) => {
        if (prev) drawSegment(s.color, s.size, prev, p);
        s.points.push(p);
        prev = p;
      });
    });
    WSHub.on("whiteboard_postit", (msg) => renderPostit(msg.postit));
    WSHub.on("whiteboard_postit_delete", (msg) => {
      const el = postitEls.get(msg.id);
      if (el) el.remove();
      postitEls.delete(msg.id);
    });
    WSHub.on("whiteboard_clear", () => {
      strokes.clear();
      redrawAll();
      document.querySelectorAll(".postit").forEach((el) => el.remove());
      postitEls.clear();
    });
  }

  return { init };
})();
