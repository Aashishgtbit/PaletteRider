// Live riders: who else is in the paintings right now.
//
// There is no game server. Each browser tells a public message relay (an MQTT broker, reached
// over a WebSocket) where its rider is a few times a second, and listens for everyone else's.
// Nothing personal is sent: a random id, a made-up guest name, two colours and a position.
// If the relay can't be reached the game simply plays solo.
//
// To use your own relay later, change RELAYS (any MQTT 3.1.1 broker with WebSocket support works).
const RELAYS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const ROOT = 'paletterider/v1';
const STALE = 7; // seconds without news before a rider is dropped
const MAX_PEERS = 40;

const ADJ = ['Amber', 'Azure', 'Coral', 'Crimson', 'Golden', 'Indigo', 'Ivory', 'Jade', 'Lilac', 'Olive', 'Ochre', 'Rosy',
  'Ruby', 'Saffron', 'Scarlet', 'Silver', 'Teal', 'Umber', 'Violet', 'Cobalt'];
const NOUN = ['Sparrow', 'Otter', 'Heron', 'Fox', 'Finch', 'Hare', 'Kite', 'Lynx', 'Robin', 'Swift', 'Wren', 'Koi',
  'Panda', 'Tiger', 'Crane', 'Mynah', 'Gecko', 'Bison', 'Ibis', 'Lark'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// who this browser is: kept so the same guest name and colours come back next visit
function identity() {
  let me = null;
  try { me = JSON.parse(localStorage.getItem('paletterider-guest')); } catch { /* private mode */ }
  if (!me || !me.name || !Number.isFinite(me.bike) || !Number.isFinite(me.dress)) {
    const bike = Math.floor(Math.random() * 360);
    me = { name: `Guest ${pick(ADJ)} ${pick(NOUN)}`, bike, dress: (bike + 90 + Math.floor(Math.random() * 180)) % 360 };
    try { localStorage.setItem('paletterider-guest', JSON.stringify(me)); } catch { /* private mode */ }
  }
  // the id is new for every tab, so two tabs of one browser are two riders
  me.id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('');
  return me;
}

// ---- the few MQTT packets we need ----
const enc = new TextEncoder(), dec = new TextDecoder();
const str = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
function packet(type, body) {
  const len = [];
  let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
  return new Uint8Array([type, ...len, ...body]);
}
const connectPacket = (clientId, willTopic) =>
  packet(0x10, [...str('MQTT'), 4, 0x02 | 0x04, 0, 30, ...str(clientId), ...str(willTopic), 0, 0]); // will: an empty goodbye
const subscribePacket = (topic) => packet(0x82, [0, 1, ...str(topic), 0]);
const publishPacket = (topic, text) => packet(0x30, [...str(topic), ...enc.encode(text)]);

const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
const cleanName = (s) => String(s ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 22) || 'Guest';

export function createNet(chapter) {
  const me = identity();
  const peers = new Map(); // id -> { id, name, bike, dress, chapter, playing, x, y, z, yaw, speed, seen, fresh }
  const myTopic = `${ROOT}/${chapter}/${me.id}`;
  let ws = null, open = false, relay = 0, retry = 0, buf = new Uint8Array(0), pingTimer = 0, lastSent = 0, lastState = null;
  const now = () => performance.now() / 1000;

  function onMessage(topic, text) {
    const [, , ch, id] = topic.split('/');
    if (!id || id === me.id) return;
    if (!text) return void peers.delete(id); // a goodbye
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    let p = peers.get(id);
    if (!p) {
      if (peers.size >= MAX_PEERS) return;
      p = { id, fresh: true };
      peers.set(id, p);
    }
    Object.assign(p, {
      name: cleanName(m.n), bike: num(m.b, 0, 360), dress: num(m.d, 0, 360), chapter: ch, playing: m.p === 1, foot: m.f === 1,
      x: num(m.x, -5000, 5000), y: num(m.y, -500, 5000), z: num(m.z, -5000, 5000),
      yaw: num(m.h, -1000, 1000), speed: num(m.s, 0, 80), seen: now(),
    });
  }

  function onBytes(chunk) {
    const joined = new Uint8Array(buf.length + chunk.length);
    joined.set(buf); joined.set(chunk, buf.length);
    buf = joined;
    for (;;) {
      if (buf.length < 2) return;
      let len = 0, mult = 1, i = 1;
      for (;; i++) {
        if (i >= buf.length) return; // length not all here yet
        len += (buf[i] & 127) * mult; mult *= 128;
        if (!(buf[i] & 128)) { i++; break; }
        if (i > 4) return void ws.close();
      }
      if (buf.length < i + len) return;
      const type = buf[0] >> 4, body = buf.subarray(i, i + len);
      if (type === 2) { // connected
        if (body[1] !== 0) return void ws.close();
        open = true; retry = 0;
        ws.send(subscribePacket(`${ROOT}/+/+`));
        if (lastState) publish(lastState, true);
      } else if (type === 3 && body.length >= 2) {
        const tl = (body[0] << 8) | body[1];
        const skip = 2 + tl + ((buf[0] & 6) ? 2 : 0);
        if (skip <= body.length) onMessage(dec.decode(body.subarray(2, 2 + tl)), dec.decode(body.subarray(skip)));
      }
      buf = buf.slice(i + len);
    }
  }

  function connect() {
    try { ws = new WebSocket(RELAYS[relay % RELAYS.length], 'mqtt'); } catch { return void schedule(); }
    ws.binaryType = 'arraybuffer';
    const sock = ws;
    sock.onopen = () => sock.send(connectPacket(`pr-${me.id}`, myTopic));
    sock.onmessage = (e) => { if (sock === ws && e.data instanceof ArrayBuffer) onBytes(new Uint8Array(e.data)); };
    sock.onclose = () => {
      if (sock !== ws) return;
      const was = open;
      open = false; buf = new Uint8Array(0);
      if (!was) relay++; // never got in: try the next relay
      schedule();
    };
    sock.onerror = () => {};
  }
  function schedule() {
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 1500 * retry);
  }
  function publish(state, force) {
    lastState = state;
    if (!open || ws.readyState !== 1) return;
    const t = now();
    if (!force && t - lastSent < (state.p && state.s > 0.3 ? 0.22 : 1.5)) return; // moving: ~4 a second
    lastSent = t;
    const r = (v) => Math.round(v * 100) / 100;
    ws.send(publishPacket(myTopic, JSON.stringify({
      n: me.name, b: me.bike, d: me.dress, p: state.p ? 1 : 0, f: state.f ? 1 : 0, x: r(state.x), y: r(state.y), z: r(state.z), h: r(state.h), s: r(state.s),
    })));
  }
  pingTimer = setInterval(() => {
    if (open && ws.readyState === 1) ws.send(new Uint8Array([0xc0, 0]));
    const t = now();
    for (const [id, p] of peers) if (t - p.seen > STALE) peers.delete(id);
  }, 10000);
  addEventListener('pagehide', () => {
    if (open && ws.readyState === 1) ws.send(publishPacket(myTopic, ''));
  });
  connect();

  return {
    me,
    peers,
    /** Tell the others where this rider is: { p: playing?, f: on foot?, x, y, z, h: heading, s: speed }. */
    send: (state) => publish(state, false),
    connected: () => open,
    /** Riders in a ride right now, counting this one if it is playing. */
    riding(selfPlaying) {
      const t = now();
      let n = selfPlaying ? 1 : 0;
      for (const p of peers.values()) if (p.playing && t - p.seen < STALE) n++;
      return n;
    },
    stop: () => clearInterval(pingTimer),
  };
}
