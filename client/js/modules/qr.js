// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Join-by-QR-code drawer. Deliberately not synced over the websocket and
// not pin-able — this is purely local to whichever screen it's opened on
// (typically the host laptop on a projector), and it encodes
// window.location.origin, so it automatically matches whatever address
// was actually used to reach this page: change the port, change the LAN
// IP, doesn't matter, the code always points at "wherever you are right
// now" rather than a hardcoded address that could drift out of date.
const QrModule = (() => {
  function init() {
    const container = document.getElementById("qr-code-display");
    const urlText = document.getElementById("qr-url-text");
    const url = window.location.origin;

    urlText.textContent = url;

    // qrcodejs (vendored, MIT licensed — see client/js/vendor/) draws
    // straight into the given element using canvas or a <table> fallback.
    new QRCode(container, {
      text: url,
      width: 220,
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  return { init };
})();
