// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Slide: a plain text + optional image display, loaded from control.py.
// The whole point is to avoid alt-tabbing to a slideshow app for a
// "loading screen" while people join, a discussion prompt, or a diagram —
// this tab (like the others) is hidden until something's actually loaded
// into it, and picks up Presenter mode's font scaling for free since its
// text sizing is in rem like everything else.
const SlideModule = (() => {
  let lastState = null;

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function render(slide) {
    lastState = slide;
    const body = document.getElementById("slide-body");
    body.innerHTML = "";

    if (!slide || !slide.loaded) {
      body.innerHTML = `<p class="hint">${I18N.t("slide_no_content")}</p>`;
      return;
    }

    const panel = document.createElement("div");
    panel.className = "panel slide-panel";

    if (slide.title) {
      const h = document.createElement("h2");
      h.textContent = slide.title;
      panel.appendChild(h);
    }

    if (slide.image_url) {
      const img = document.createElement("img");
      img.className = "slide-image";
      img.src = slide.image_url;
      img.alt = slide.title || "";
      panel.appendChild(img);
    }

    if (slide.text) {
      const p = document.createElement("p");
      p.className = "slide-text";
      // preserve the line breaks the facilitator wrote in the template,
      // without interpreting any other HTML in what's otherwise plain text
      p.innerHTML = escapeHtml(slide.text).replace(/\n/g, "<br>");
      panel.appendChild(p);
    }

    if (slide.qr_url) {
      // Unlike the join-QR drawer (which always encodes this server's own
      // address), a slide's QR code can point anywhere — a resource page,
      // a form, a contact link — since a slide is content the facilitator
      // chose, not a fixed "how do I connect" affordance.
      const qrWrap = document.createElement("div");
      qrWrap.className = "slide-qr-wrap";
      panel.appendChild(qrWrap);
      new QRCode(qrWrap, {
        text: slide.qr_url,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M,
      });
      const urlText = document.createElement("p");
      urlText.className = "slide-qr-url";
      urlText.textContent = slide.qr_url;
      panel.appendChild(urlText);
    }

    body.appendChild(panel);
  }

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.slide));
    WSHub.on("slide_update", (msg) => render(msg.slide));
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
