// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Thin wrapper around the classroom websocket: auto-reconnects on drop
// (handy on flaky classroom WiFi), and dispatches messages by "type" to
// whichever module subscribed to it.
const WSHub = (() => {
  let socket = null;
  let clientId = null;
  let reconnectDelay = 800;
  const handlers = {};
  const stateHandlers = [];

  function on(type, fn) {
    (handlers[type] ||= []).push(fn);
  }

  function onStateChange(fn) {
    stateHandlers.push(fn);
  }

  function setState(state) {
    stateHandlers.forEach((fn) => fn(state));
  }

  function send(obj) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(obj));
    }
  }

  function connect() {
    setState("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/ws`);

    socket.onopen = () => {
      setState("connected");
      reconnectDelay = 800;
    };

    socket.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (msg.type === "welcome") {
        clientId = msg.client_id;
      }
      (handlers[msg.type] || []).forEach((fn) => fn(msg));
    };

    socket.onclose = () => {
      setState("disconnected");
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.6, 8000);
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  function getClientId() {
    return clientId;
  }

  return { connect, send, on, onStateChange, getClientId };
})();
