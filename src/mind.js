// Mind Games: a modern pavilion in the garden with a dark, neon-lit game lounge inside. Leave
// the bike outside, walk up to a table and play. The first game is the Tower of Hanoi, against
// the clock; when it is solved the game draws a score card that can be shared or saved.
//
// The pavilion is built facing the way given by `at.face` (+x by default), with its closed back
// wall behind the tables, so a game is always seen against a calm deep-blue backdrop rather than
// the busy painting outside.
import * as THREE from 'three';

// bright and far apart in hue, so neighbouring sizes never look alike against the dark backdrop
const DISC_COLORS = ['#ff3b5c', '#ff8a1f', '#ffd21f', '#2ee59d', '#1fb6ff', '#8a5cff', '#f2f3f8'];
const UI = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const NEON_A = 0x19e3d6, NEON_B = 0x8a5cff; // cyan and violet
const DISC_H = 0.15; // metres
const PEG_X = [-1.45, 0, 1.45]; // along the table
const PEG_H = 1.32;
const BOARD_Y = 1.12; // top of the board the pegs stand in
const TABLE_Z = -2.6; // the Hanoi table, in front of the back wall
const LIFT_Y = BOARD_Y + PEG_H + 0.38; // a lifted disc floats here, clear of the pegs
const SITE = 'aashishgtbit.github.io/PaletteRider';
const BEST_KEY = 'paletterider-hanoi-best';
const SOON = [
  { x: -5, z: TABLE_Z, name: 'Painting slide puzzle' },
  { x: 5, z: TABLE_Z, name: 'Memory match' },
];

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const fmtTime = (s) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};

function textTexture(lines, { w = 1024, h = 256, bg = '#fbf6ec', fg = '#2a2420', font = 'Georgia, serif', size = 110, border = '#2f7a52' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = h * 0.06; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
  g.fillStyle = fg;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((t, i) => {
    const s = i === 0 ? size : size * 0.55;
    g.font = `${i === 0 ? 'bold ' : ''}${s}px ${font}`;
    const y = lines.length === 1 ? h / 2 : h * (i === 0 ? 0.4 : 0.74);
    g.fillText(t, w / 2, y, w * 0.86);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// glowing letters on a transparent background, for signs that light up
function neonTexture(lines, { w = 1024, h = 256, size = 120 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((t, i) => {
    const big = i === 0, s = big ? size : size * 0.3;
    g.font = big ? `700 ${s}px ${UI}` : `600 ${s}px ${MONO}`;
    const y = lines.length === 1 ? h / 2 : big ? h * 0.42 : h * 0.82;
    if (big) {
      const grad = g.createLinearGradient(w * 0.15, 0, w * 0.85, 0);
      grad.addColorStop(0, '#5ffbf1'); grad.addColorStop(1, '#b49bff');
      g.fillStyle = grad;
      g.shadowColor = 'rgba(120, 220, 255, 0.9)'; g.shadowBlur = 28;
    } else { g.fillStyle = '#e8ecff'; g.shadowColor = 'rgba(160, 140, 255, 0.8)'; g.shadowBlur = 12; }
    if (!big) { g.save(); g.letterSpacing = '6px'; }
    g.fillText(t, w / 2, y, w * 0.92);
    g.fillText(t, w / 2, y, w * 0.92);
    if (!big) g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
// a dark panel with a faint grid of light lines, for the floor and the walls inside
function gridTexture(base, line, cells = 4) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (let i = 0; i <= cells; i++) {
    const p = (i * 256) / cells;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
// the backdrop behind the Hanoi table: deep blue, a little lighter in the middle
function backdropTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 150, 20, 256, 140, 300);
  grad.addColorStop(0, '#2c3770'); grad.addColorStop(0.6, '#1a2148'); grad.addColorStop(1, '#10142e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(140, 170, 255, 0.07)';
  g.lineWidth = 1;
  for (let x = 0; x <= 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 0; y <= 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// the top of a disc: its colour, a dark rim, the hole for the peg and its size number either side
function discTopTexture(color, num, radius) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(20, 16, 24, 0.9)';
  g.lineWidth = 12;
  g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#1a1620';
  g.beginPath(); g.arc(128, 128, (0.07 / radius) * 128, 0, Math.PI * 2); g.fill();
  const r = 128 * (0.07 / radius) + (128 - 128 * (0.07 / radius)) / 2; // halfway between hole and rim
  const size = Math.min(78, (128 - 128 * (0.07 / radius)) * 0.9);
  g.font = `700 ${size}px ${UI}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const light = parseInt(color.slice(1, 3), 16) + parseInt(color.slice(3, 5), 16) + parseInt(color.slice(5, 7), 16) > 560;
  g.fillStyle = light ? '#1a1d2e' : '#ffffff';
  g.strokeStyle = light ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.55)';
  g.lineWidth = 6;
  for (const sx of [-1, 1]) {
    g.save();
    g.translate(128 + sx * r, 128);
    g.rotate(-Math.PI / 2); // reads upright from the front of the table
    g.strokeText(String(num), 0, 0);
    g.fillText(String(num), 0, 0);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createMindGames({ scene, at, camera, renderer, composer, me, tone, toast, onLeave }) {
  // local frame: +z is the open front, -z the back wall. face = the world heading of +z.
  const face = at.face ?? Math.PI / 2;
  const cosF = Math.cos(face), sinF = Math.sin(face);
  const toWorld = (lx, ly, lz, out = new THREE.Vector3()) => out.set(at.x + lx * cosF + lz * sinF, ly, at.z - lx * sinF + lz * cosF);
  const toLocal = (wx, wz) => {
    const dx = wx - at.x, dz = wz - at.z;
    return { x: dx * cosF - dz * sinF, z: dx * sinF + dz * cosF };
  };
  const fromLocalXZ = (lx, lz) => ({ x: at.x + lx * cosF + lz * sinF, z: at.z - lx * sinF + lz * cosF });

  const root = new THREE.Group();
  root.position.set(at.x, 0, at.z);
  root.rotation.y = face;
  scene.add(root);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const box = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };

  // ---------- the pavilion ----------
  // Outside: crisp white with a flat roof, so it sits quietly in the garden. Inside: a dark game
  // lounge outlined in cyan and violet neon, with the game table under a spotlight.
  const neon = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const white = mat(0xf4f6fb, { roughness: 0.45 });
  const ink = mat(0x10131f, { roughness: 0.5, metalness: 0.2 });
  const chrome = mat(0xdfe3ee, { roughness: 0.22, metalness: 0.9 });
  const wallTex = gridTexture('#141830', 'rgba(120, 140, 255, 0.10)', 2);
  wallTex.repeat.set(7, 2.5);
  const inner = mat(0xffffff, { map: wallTex, roughness: 0.9, emissive: 0x0b0f22, emissiveIntensity: 1 });
  const floorTex = gridTexture('#1a1f36', 'rgba(25, 227, 214, 0.18)', 1);
  floorTex.repeat.set(7, 6);
  box(14.4, 0.12, 12.4, mat(0xffffff, { map: floorTex, roughness: 0.3, metalness: 0.25 }), 0, 0.06, 0); // floor
  box(14.4, 5.2, 0.3, white, 0, 2.6, -6.05); // back wall
  box(14.0, 5.0, 0.04, inner, 0, 2.55, -5.88); // its dark inside face
  for (const s of [-1, 1]) {
    box(0.3, 5.2, 5.4, white, s * 7.05, 2.6, -3.5); // side walls round the back half
    box(0.04, 5.0, 5.2, inner, s * 6.88, 2.55, -3.5);
    for (const z of [1.6, 6.0]) box(0.42, 5.2, 0.42, white, s * 7.05, 2.6, z); // columns
  }
  box(15.4, 0.42, 13.4, white, 0, 5.41, 0); // flat roof
  box(15.0, 0.04, 13.0, inner, 0, 5.19, 0); // dark ceiling
  // neon: round the roof edge, along the back wall top and floor, and up the inside corners
  box(15.42, 0.07, 0.07, neon(NEON_A), 0, 5.18, 6.72);
  for (const s of [-1, 1]) box(0.07, 0.07, 13.42, neon(NEON_B), s * 7.72, 5.18, 0);
  box(13.9, 0.05, 0.05, neon(NEON_B), 0, 4.55, -5.84);
  box(13.9, 0.05, 0.05, neon(NEON_A), 0, 0.2, -5.84);
  for (const s of [-1, 1]) box(0.05, 4.35, 0.05, neon(NEON_A), s * 6.84, 2.4, -5.84);
  // the backdrop behind the Hanoi table, framed in neon
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.9), new THREE.MeshBasicMaterial({ map: backdropTexture() }));
  back.position.set(0, 2.2, -5.85);
  root.add(back);
  for (const [w, h, x, y] of [[6.7, 0.04, 0, 3.67], [6.7, 0.04, 0, 0.73], [0.04, 2.98, -3.33, 2.2], [0.04, 2.98, 3.33, 2.2]]) box(w, h, 0.03, neon(NEON_B), x, y, -5.83);
  // a spotlight over the table, and a soft cool fill from the front
  const spot = new THREE.SpotLight(0xffffff, 26, 14, 0.62, 0.55, 1.4);
  spot.position.set(0, 4.9, TABLE_Z + 1.4);
  spot.target.position.set(0, BOARD_Y, TABLE_Z);
  root.add(spot, spot.target);
  const fill = new THREE.PointLight(0x9ab8ff, 6, 10, 1.5);
  fill.position.set(0, 2.6, 2);
  root.add(fill);

  // the neon sign over the front, readable from the avenue
  box(6.6, 1.5, 0.12, ink, 0, 4.42, 6.72);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 1.4), new THREE.MeshBasicMaterial({ map: neonTexture(['MIND GAMES', 'TOWER OF HANOI · MORE SOON']), transparent: true, toneMapped: false }));
  sign.position.set(0, 4.42, 6.79);
  root.add(sign);
  // a tall pole with a violet pennant beside it, seen over the flower beds
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 10, 8), white);
  pole.position.set(8.6, 5, 6.4);
  root.add(pole);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.3, 8, 1);
  flagGeo.translate(1.2, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: textTexture(['🧩'], { w: 256, h: 140, bg: '#7a4fc8', fg: '#ffffff', size: 96, border: null }), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(8.6, 9.2, 6.4);
  root.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();

  // the Hanoi table: black top with a cyan edge light, chrome legs, a dark board and chrome pegs
  box(5.2, 0.1, 1.8, ink, 0, 0.97, TABLE_Z);
  box(5.22, 0.03, 0.03, neon(NEON_A), 0, 0.93, TABLE_Z + 0.91);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.08, 0.92, 0.08, chrome, sx * 2.4, 0.46, TABLE_Z + sz * 0.75);
  box(4.6, 0.1, 1.3, mat(0x232a44, { roughness: 0.4, metalness: 0.3 }), 0, BOARD_Y - 0.05, TABLE_Z); // the board
  const pegs = PEG_X.map((x) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, PEG_H, 16), chrome);
    m.position.set(x, BOARD_Y + PEG_H / 2, TABLE_Z);
    root.add(m);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), neon(NEON_A));
    cap.position.set(x, BOARD_Y + PEG_H, TABLE_Z);
    root.add(cap);
    return m;
  });
  // a ring at the foot of each peg: lit green where the lifted disc may go, red where it may not
  const rings = PEG_X.map((x) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2ee59d, transparent: true, opacity: 0, toneMapped: false }));
    m.position.set(x, BOARD_Y + 0.006, TABLE_Z);
    root.add(m);
    return m;
  });
  // the name, lit, on the table edge
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.3), new THREE.MeshBasicMaterial({ map: neonTexture(['TOWER OF HANOI'], { w: 768, h: 136, size: 78 }), transparent: true, toneMapped: false }));
  plaque.position.set(0, 0.8, TABLE_Z + 0.92);
  root.add(plaque);

  // tables for the games still to come: a slowly turning hologram cube over each, and a lit card
  const holos = [];
  for (const s of SOON) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 40), ink);
    top.position.set(s.x, 0.95, s.z);
    root.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.018, 6, 48).rotateX(Math.PI / 2), neon(NEON_B));
    rim.position.set(s.x, 0.95, s.z);
    root.add(rim);
    box(0.1, 0.9, 0.1, chrome, s.x, 0.45, s.z);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshBasicMaterial({ color: NEON_B, wireframe: true, toneMapped: false }));
    cube.position.set(s.x, 1.55, s.z);
    root.add(cube);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: NEON_B, transparent: true, opacity: 0.12, depthWrite: false }));
    cube.add(core);
    holos.push(cube);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: neonTexture(['COMING SOON', s.name.toUpperCase()], { w: 768, h: 192, size: 70 }), transparent: true, toneMapped: false }));
    card.position.set(s.x, 2.25, s.z + 0.2);
    root.add(card);
  }

  // ---------- the puzzle ----------
  const H = { n: 4, pegs: [[], [], []], discs: [], held: null, from: 0, hover: -1, moves: 0, t0: 0, started: false, time: 0, done: false, doneAt: 0 };
  let active = false, cardShown = false;
  const radius = (i, n) => 0.24 + (n > 1 ? (i / (n - 1)) * 0.42 : 0.42);
  const restY = (k) => BOARD_Y + DISC_H / 2 + k * DISC_H;
  function clearDiscs() {
    for (const d of H.discs) {
      root.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.material.forEach((m) => { m.map?.dispose(); m.dispose(); });
    }
    H.discs = [];
  }
  function setup(n) {
    clearDiscs();
    Object.assign(H, { n, pegs: [[], [], []], held: null, hover: -1, moves: 0, started: false, time: 0, done: false });
    for (let i = n - 1; i >= 0; i--) {
      const r = radius(i, n), color = DISC_COLORS[Math.round((i / Math.max(1, n - 1)) * 6)];
      const geo = new THREE.CylinderGeometry(r, r, DISC_H, 48);
      const pale = color === '#f2f3f8'; // the white disc would glare if it glowed like the others
      const side = new THREE.MeshStandardMaterial({ color: pale ? '#d8dbe8' : color, roughness: 0.3, metalness: 0.05, emissive: color, emissiveIntensity: pale ? 0 : 0.15 });
      const top = new THREE.MeshStandardMaterial({ map: discTopTexture(color, i + 1, r), roughness: 0.35, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0 });
      const bottom = new THREE.MeshStandardMaterial({ color: 0x14172a });
      const mesh = new THREE.Mesh(geo, [side, top, bottom]);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0x14101a })));
      const k = H.pegs[0].length;
      mesh.position.set(PEG_X[0], restY(k), TABLE_Z);
      root.add(mesh);
      H.discs[i] = { i, mesh, path: [], shake: 0, glow: 0, base: pale ? 0 : 0.15 };
      H.pegs[0].push(i);
    }
    for (const b of document.querySelectorAll('#mindDiscs button')) b.classList.toggle('on', Number(b.dataset.n) === n);
    $('mindMinN').textContent = 2 ** n - 1;
    $('mindDone').classList.remove('on');
    cardShown = false;
    showBest();
  }
  const top = (p) => (H.pegs[p].length ? H.pegs[p][H.pegs[p].length - 1] : null);
  const allowed = (p) => H.held !== null && (top(p) === null || top(p) > H.held);
  const go = (d, ...pts) => { d.path = pts.map(([x, y]) => new THREE.Vector3(x, y, TABLE_Z)); };

  function pick(p) {
    const i = top(p);
    if (i === null) { tone(196, 0.15, 0.06, 'triangle'); return; }
    H.pegs[p].pop();
    H.held = i; H.from = p; H.hover = p;
    if (!H.started) { H.started = true; H.time = 0; }
    go(H.discs[i], [PEG_X[p], LIFT_Y]);
    tone(660 + (H.n - i) * 40, 0.18, 0.06);
  }
  function drop(p) {
    const d = H.discs[H.held];
    if (p !== H.from && !allowed(p)) {
      d.shake = 0.4;
      toast('A bigger disc can\'t go on a smaller one', true);
      tone(120, 0.3, 0.12, 'triangle');
      return;
    }
    const k = H.pegs[p].length;
    H.pegs[p].push(H.held);
    go(d, [PEG_X[p], LIFT_Y], [PEG_X[p], restY(k)]);
    if (p !== H.from) H.moves++;
    H.held = null; H.hover = -1;
    tone(520 + (H.n - d.i) * 30, 0.22, 0.07);
    if (H.pegs[1].length === H.n || H.pegs[2].length === H.n) win();
  }
  function tap(p) {
    if (!active || H.done || p < 0) return;
    if (H.held === null) pick(p);
    else drop(p);
  }
  function hoverTo(p) {
    if (H.held === null || p < 0 || p === H.hover) return;
    H.hover = p;
    go(H.discs[H.held], [PEG_X[p], LIFT_Y]);
  }

  function readBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; }
  }
  function showBest() {
    const b = readBest()[H.n];
    $('mindBest').textContent = b ? fmtTime(b.t) : '—';
    $('mindBestMoves').textContent = b ? `${b.m} moves` : `${H.n} discs`;
  }
  function win() {
    H.done = true;
    H.doneAt = 1.1;
    const all = readBest(), old = all[H.n];
    H.newBest = !old || H.time < old.t;
    if (H.newBest) {
      all[H.n] = { t: Math.round(H.time * 10) / 10, m: H.moves };
      try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* private mode */ }
    }
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => tone(f, 1.2, 0.08), i * 120));
    showBest();
  }
  const starsFor = () => (H.moves <= 2 ** H.n - 1 ? 3 : H.moves <= (2 ** H.n - 1) * 1.5 ? 2 : 1);

  // ---------- the score card ----------
  // A portrait card (1080 × 1350, the shape Instagram and WhatsApp show best): dark and glowing,
  // the solved tower as it stands on the table, a big timer and the stats in tiles.
  const RATING = ['', 'SOLVED', 'GREAT', 'PERFECT'];
  function makeCard() {
    const W = 1080, Hh = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    const g = c.getContext('2d');
    const round = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const text = (t, x, y, font, color, align = 'center', spacing = 0) => {
      g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
      g.letterSpacing = `${spacing}px`;
      g.fillText(t, x, y);
      g.letterSpacing = '0px';
    };
    // background: deep indigo, a faint grid, two soft glows
    const bg = g.createLinearGradient(0, 0, W, Hh);
    bg.addColorStop(0, '#0b0e22'); bg.addColorStop(1, '#1a1040');
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    for (const [x, y, r, col] of [[160, 180, 520, 'rgba(25, 227, 214, 0.20)'], [960, 1120, 620, 'rgba(138, 92, 255, 0.28)']]) {
      const gl = g.createRadialGradient(x, y, 0, x, y, r);
      gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl; g.fillRect(0, 0, W, Hh);
    }
    g.strokeStyle = 'rgba(140, 160, 255, 0.06)'; g.lineWidth = 1;
    for (let x = 0; x <= W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); }
    for (let y = 0; y <= Hh; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const accent = g.createLinearGradient(60, 0, W - 60, 0);
    accent.addColorStop(0, '#19e3d6'); accent.addColorStop(1, '#8a5cff');

    // header
    text('PALETTERIDER  ·  MIND GAMES', 64, 92, `600 26px ${MONO}`, '#5ffbf1', 'left', 3);
    text('Tower of Hanoi', 64, 160, `700 64px ${UI}`, '#ffffff', 'left');
    round(W - 64 - 196, 104, 196, 58, 29);
    g.fillStyle = 'rgba(46, 229, 157, 0.14)'; g.fill();
    g.strokeStyle = '#2ee59d'; g.lineWidth = 2; g.stroke();
    text('✓ SOLVED', W - 64 - 98, 143, `700 24px ${MONO}`, '#2ee59d', 'center', 2);

    // the game itself, as it looks right now, in a glowing frame
    composer.render();
    const src = renderer.domElement, sw = src.width, sh = src.height;
    const bx = 64, by = 200, bw = W - 128, bh = 500;
    const zoom = sw > sh * 1.2 ? 1.45 : 1; // on a wide screen, closer in on the table than the game view
    const k = Math.max(bw / sw, bh / sh) * zoom, cw = bw / k, ch = bh / k;
    g.save();
    g.shadowColor = 'rgba(25, 227, 214, 0.45)'; g.shadowBlur = 40;
    round(bx, by, bw, bh, 30); g.fillStyle = '#000'; g.fill();
    g.restore();
    g.save(); round(bx, by, bw, bh, 30); g.clip();
    g.drawImage(src, (sw - cw) / 2, Math.min(sh - ch, Math.max(0, sh * 0.56 - ch / 2)), cw, ch, bx, by, bw, bh);
    const fade = g.createLinearGradient(0, by + bh * 0.6, 0, by + bh);
    fade.addColorStop(0, 'rgba(11,14,34,0)'); fade.addColorStop(1, 'rgba(11,14,34,0.55)');
    g.fillStyle = fade; g.fillRect(bx, by, bw, bh);
    g.restore();
    round(bx, by, bw, bh, 30); g.strokeStyle = accent; g.lineWidth = 4; g.stroke();
    // the disc count, as a chip on the picture
    round(bx + 24, by + bh - 70, 150, 46, 23); g.fillStyle = 'rgba(11, 14, 34, 0.78)'; g.fill();
    text(`${H.n} DISCS`, bx + 99, by + bh - 38, `700 22px ${MONO}`, '#ffffff', 'center', 2);

    // the time, big
    text('TIME', W / 2, 790, `600 24px ${MONO}`, 'rgba(232, 236, 255, 0.6)', 'center', 8);
    g.save();
    g.shadowColor = 'rgba(95, 251, 241, 0.65)'; g.shadowBlur = 36;
    text(fmtTime(H.time), W / 2, 930, `700 156px ${MONO}`, '#ffffff', 'center');
    g.restore();
    if (H.newBest) {
      round(W / 2 - 200, 960, 400, 54, 27); g.fillStyle = accent; g.fill();
      text('★  NEW PERSONAL BEST', W / 2, 996, `700 24px ${MONO}`, '#0b0e22', 'center', 2);
    }

    // three stat tiles
    const min = 2 ** H.n - 1, stars = starsFor();
    const eff = Math.round((min / H.moves) * 100);
    const tiles = [
      ['MOVES', String(H.moves), `fewest ${min}`],
      ['EFFICIENCY', `${eff}%`, eff === 100 ? 'flawless' : 'of a perfect run'],
      ['RATING', '★'.repeat(stars) + '☆'.repeat(3 - stars), RATING[stars]],
    ];
    const ty = 1046, tw = (W - 128 - 2 * 20) / 3, th = 150;
    tiles.forEach(([label, value, sub], i) => {
      const tx = 64 + i * (tw + 20);
      round(tx, ty, tw, th, 22);
      g.fillStyle = 'rgba(255, 255, 255, 0.06)'; g.fill();
      g.strokeStyle = 'rgba(255, 255, 255, 0.14)'; g.lineWidth = 2; g.stroke();
      text(label, tx + 26, ty + 42, `600 20px ${MONO}`, 'rgba(232, 236, 255, 0.6)', 'left', 3);
      text(value, tx + 26, ty + 100, `700 ${i === 2 ? 46 : 54}px ${i === 2 ? UI : MONO}`, i === 2 ? '#ffd21f' : '#ffffff', 'left');
      text(sub, tx + 26, ty + 132, `500 20px ${UI}`, 'rgba(232, 236, 255, 0.55)', 'left');
    });

    // who played, and where to play
    const ay = 1262;
    const av = g.createLinearGradient(64, ay - 30, 124, ay + 30);
    av.addColorStop(0, `hsl(${me.bike}, 80%, 60%)`); av.addColorStop(1, `hsl(${me.dress}, 75%, 50%)`);
    g.fillStyle = av; g.beginPath(); g.arc(94, ay, 30, 0, Math.PI * 2); g.fill();
    const initials = me.name.replace(/^Guest\s+/, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    text(initials, 94, ay + 9, `700 24px ${UI}`, '#ffffff');
    text(me.name, 140, ay - 4, `700 28px ${UI}`, '#ffffff', 'left');
    text(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), 140, ay + 30, `500 22px ${UI}`, 'rgba(232, 236, 255, 0.55)', 'left');
    text('Can you beat it?', W - 64, ay - 4, `700 28px ${UI}`, '#ffffff', 'right');
    text(SITE, W - 64, ay + 30, `600 22px ${MONO}`, '#5ffbf1', 'right');
    g.fillStyle = accent; g.fillRect(0, Hh - 10, W, 10);
    return c;
  }
  let cardCanvas = null;
  async function showCard() {
    cardShown = true;
    // the card's lettering needs its fonts in place before it is drawn
    try { await Promise.race([Promise.all([document.fonts.load(`700 64px ${UI}`), document.fonts.load(`700 64px ${MONO}`), document.fonts.load(`500 20px ${UI}`), document.fonts.load(`600 20px ${MONO}`)]), new Promise((r) => setTimeout(r, 1500))]); } catch { /* system fonts will do */ }
    if (!active) return;
    cardCanvas = makeCard();
    $('mindCard').src = cardCanvas.toDataURL('image/png');
    $('mindDone').classList.add('on');
    $('mindShare').style.display = navigator.share ? '' : 'none';
    $('mindSave').classList.toggle('main', !navigator.share); // the lead button when there is no sharing
  }
  const cardBlob = () => new Promise((res) => cardCanvas.toBlob(res, 'image/png'));
  const fileName = () => `paletterider-hanoi-${H.n}-discs-${fmtTime(H.time).replace(/[:.]/g, '-')}.png`;
  async function saveCard() {
    const blob = await cardBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function shareCard() {
    const blob = await cardBlob();
    const file = new File([blob], fileName(), { type: 'image/png' });
    const text = `I solved the Tower of Hanoi (${H.n} discs) in ${fmtTime(H.time)} with ${H.moves} moves in PaletteRider. Can you beat it? https://${SITE}/`;
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share) await navigator.share({ text, url: `https://${SITE}/` });
      else await saveCard();
    } catch (e) {
      if (e?.name !== 'AbortError') saveCard();
    }
  }

  // ---------- input ----------
  const v = new THREE.Vector3();
  function pegAt(clientX) {
    const r = renderer.domElement.getBoundingClientRect();
    let best = -1, bd = Infinity;
    PEG_X.forEach((x, p) => {
      toWorld(x, BOARD_Y + 0.6, TABLE_Z, v).project(camera);
      const sx = r.left + ((v.x + 1) / 2) * r.width, d = Math.abs(sx - clientX);
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }
  let dragFrom = -1;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    if (!active || H.done) return;
    const p = pegAt(e.clientX);
    if (H.held === null) { tap(p); dragFrom = H.held === null ? -1 : p; } else tap(p);
  });
  el.addEventListener('pointermove', (e) => { if (active && !H.done) hoverTo(pegAt(e.clientX)); });
  el.addEventListener('pointerup', (e) => {
    if (!active || dragFrom < 0) return;
    const p = pegAt(e.clientX);
    if (H.held !== null && p !== dragFrom) tap(p); // dragged across to another peg
    dragFrom = -1;
  });
  addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Escape') { e.stopImmediatePropagation(); leave(); return; }
    if (H.done) { if (e.code === 'Enter' && cardShown) setup(H.n); return; }
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (n !== undefined) tap(n);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { if (H.held !== null) hoverTo(clamp(H.hover - 1, 0, 2)); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { if (H.held !== null) hoverTo(clamp(H.hover + 1, 0, 2)); }
    else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown' || e.code === 'KeyS') { if (H.held !== null) tap(H.hover); }
    else if (e.code === 'KeyR') setup(H.n);
  }, true);
  for (const b of document.querySelectorAll('#mindDiscs button')) b.onclick = (e) => { setup(Number(b.dataset.n)); e.currentTarget.blur(); };
  $('mindRestart').onclick = (e) => { setup(H.n); e.currentTarget.blur(); };
  $('mindLeave').onclick = () => leave();
  $('mindDoneLeave').onclick = () => leave();
  $('mindAgain').onclick = () => setup(H.n);
  $('mindSave').onclick = saveCard;
  $('mindShare').onclick = shareCard;

  function open() {
    if (active) return;
    active = true;
    setup(H.n);
    $('mind').classList.add('on');
  }
  function leave() {
    if (!active) return;
    active = false;
    if (H.held !== null) { // put a lifted disc back where it came from
      const d = H.discs[H.held];
      H.pegs[H.from].push(H.held);
      go(d, [PEG_X[H.from], restY(H.pegs[H.from].length - 1)]);
      H.held = null;
    }
    $('mind').classList.remove('on');
    $('mindDone').classList.remove('on');
    onLeave?.();
  }

  // ---------- each frame ----------
  function update(dt, t) {
    // the pennant ripples
    const pos = flagGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = flagBase[i * 3];
      pos.setZ(i, Math.sin(t * 3 - x * 2.2) * 0.12 * (x / 2.4));
    }
    pos.needsUpdate = true;
    holos.forEach((h, i) => { h.rotation.set(t * 0.4 + i, t * 0.6 + i, 0); h.position.y = 1.55 + Math.sin(t * 1.6 + i * 2) * 0.06; });
    if (!H.discs.length) return;
    if (active && H.started && !H.done) H.time += dt; // game time: stops whenever the game does
    for (const d of H.discs) {
      const m = d.mesh;
      if (d.path.length) {
        const to = d.path[0], step = 9 * dt;
        v.subVectors(to, m.position);
        const len = v.length();
        if (len <= step) { m.position.copy(to); d.path.shift(); } else m.position.addScaledVector(v, step / len);
      }
      let shakeX = 0;
      if (d.shake > 0) { d.shake -= dt; shakeX = Math.sin(d.shake * 60) * 0.06 * (d.shake / 0.4); }
      m.position.x += shakeX - (d.lastShake || 0);
      d.lastShake = shakeX;
      const lifted = d.i === H.held, celebrate = H.done ? 0.35 + 0.25 * Math.sin(t * 6 + d.i) : 0;
      d.glow += ((lifted ? 0.45 : celebrate) - d.glow) * Math.min(1, dt * 10);
      m.material[0].emissiveIntensity = d.base + d.glow * (d.base ? 1 : 0.4);
      m.material[1].emissiveIntensity = d.glow * 0.25;
    }
    rings.forEach((r, p) => {
      const want = H.held === null || p === H.from ? 0 : 0.9;
      r.material.color.set(allowed(p) ? 0x2ee59d : 0xff3b5c);
      r.material.opacity += (want - r.material.opacity) * Math.min(1, dt * 10);
    });
    if (H.done && !cardShown && (H.doneAt -= dt) <= 0) showCard();
    if (active) {
      $('mindTime').textContent = fmtTime(H.time);
      $('mindMoves').textContent = H.moves;
      const min = 2 ** H.n - 1;
      $('mindBarFill').style.width = `${Math.min(1, H.moves / min) * 100}%`;
      $('mindBarFill').classList.toggle('over', H.moves > min);
      const st = H.done ? 'solved' : H.started ? 'live' : 'ready';
      if ($('mindLive').dataset.s !== st) {
        $('mindLive').dataset.s = st;
        $('mindLive').textContent = st === 'solved' ? 'SOLVED' : st === 'live' ? 'LIVE' : 'READY';
        $('mind').classList.toggle('playing', st !== 'ready');
      }
    }
  }

  // Where the camera sits while playing: square on to the table, a little above it, far enough
  // back that all three pegs fit across the screen, whatever its shape.
  function cameraPose(pos, look) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), aspect = camera.aspect;
    const d = Math.max(5.2, 2.45 / (tanV * aspect), 1.6 / tanV);
    // kept below the roof and the sign, which a phone held upright has to look out from under
    toWorld(0, BOARD_Y + 0.75 + Math.min(d * 0.3, d > 7 ? 1.25 : 2.9), TABLE_Z + d, pos);
    toWorld(0, BOARD_Y + 0.75, TABLE_Z, look);
  }

  // ---------- around the pavilion ----------
  const R = 0.4; // how wide a walker or bike is
  function pushBox(L, x0, x1, z0, z1) {
    if (L.x < x0 - R || L.x > x1 + R || L.z < z0 - R || L.z > z1 + R) return false;
    const pen = [[L.x - (x0 - R), -1, 0], [(x1 + R) - L.x, 1, 0], [L.z - (z0 - R), 0, -1], [(z1 + R) - L.z, 0, 1]];
    pen.sort((a, b) => a[0] - b[0]);
    const [d, sx, sz] = pen[0];
    L.x += sx * d; L.z += sz * d;
    return true;
  }
  function pushOut(P) {
    if (Math.abs(P.x - at.x) > 12 || Math.abs(P.z - at.z) > 12 || P.y > 5) return false;
    const L = toLocal(P.x, P.z);
    let hit = pushBox(L, -7.3, 7.3, -6.3, -5.8);
    for (const s of [-1, 1]) {
      hit = pushBox(L, s > 0 ? 6.8 : -7.3, s > 0 ? 7.3 : -6.8, -6.3, -0.8) || hit;
      for (const z of [1.6, 6.0]) hit = pushBox(L, s * 7.05 - 0.21, s * 7.05 + 0.21, z - 0.21, z + 0.21) || hit;
    }
    hit = pushBox(L, -2.6, 2.6, TABLE_Z - 0.9, TABLE_Z + 0.9) || hit;
    for (const s of SOON) hit = pushBox(L, s.x - 0.95, s.x + 0.95, s.z - 0.95, s.z + 0.95) || hit;
    if (hit) Object.assign(P, fromLocalXZ(L.x, L.z));
    return hit;
  }
  // what the player is standing next to, if anything
  function near(P) {
    if (Math.abs(P.x - at.x) > 12 || Math.abs(P.z - at.z) > 12) return null;
    const L = toLocal(P.x, P.z);
    if (Math.abs(L.x) < 3 && L.z > TABLE_Z && L.z < TABLE_Z + 4.2) return { kind: 'hanoi', label: 'Play Tower of Hanoi' };
    for (const s of SOON) if (Math.hypot(L.x - s.x, L.z - (s.z + 1.2)) < 1.6) return { kind: 'soon', label: `${s.name}: coming soon` };
    if (Math.abs(L.x) < 7.5 && L.z > -6 && L.z < 9) return { kind: 'pavilion' };
    return null;
  }
  // a good place to stand when arriving by the title screen's Mind Games button
  const doorway = () => ({ ...fromLocalXZ(0, 9.5), yaw: face + Math.PI });

  setup(4);
  return { open, leave, update, cameraPose, pushOut, near, doorway, active: () => active, state: H };
}
