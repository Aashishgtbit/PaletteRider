// Memory Match: pairs of cards on an upright board at the right-hand table of the Mind Games
// pavilion. Each face is a detail cut from one of the three chapter paintings (Klee's sun, Van
// Gogh's stars, Monet's bridge...). Turn two cards over; a pair stays face up, anything else
// turns back. Find every pair in as few turns as possible.
import * as THREE from 'three';

// details from the paintings: centre (cx, cy) and size (s) as fractions of the picture's width
const DETAILS = [
  { file: 'castle-and-sun.jpg', by: 'Klee', cx: 0.61, cy: 0.17, s: 0.2 }, // the sun
  { file: 'castle-and-sun.jpg', by: 'Klee', cx: 0.62, cy: 0.58, s: 0.2 }, // yellow roofs
  { file: 'castle-and-sun.jpg', by: 'Klee', cx: 0.2, cy: 0.16, s: 0.2 }, // the striped tower
  { file: 'castle-and-sun.jpg', by: 'Klee', cx: 0.85, cy: 0.86, s: 0.22 }, // the red arch
  { file: 'castle-and-sun.jpg', by: 'Klee', cx: 0.45, cy: 0.85, s: 0.2 }, // diamonds
  { file: 'cafe-terrace-at-night.jpg', by: 'Van Gogh', cx: 0.65, cy: 0.12, s: 0.3 }, // the stars
  { file: 'cafe-terrace-at-night.jpg', by: 'Van Gogh', cx: 0.38, cy: 0.3, s: 0.3 }, // the awning
  { file: 'cafe-terrace-at-night.jpg', by: 'Van Gogh', cx: 0.42, cy: 0.63, s: 0.3 }, // the waiter
  { file: 'cafe-terrace-at-night.jpg', by: 'Van Gogh', cx: 0.55, cy: 0.9, s: 0.3 }, // cobbles
  { file: 'cafe-terrace-at-night.jpg', by: 'Van Gogh', cx: 0.86, cy: 0.4, s: 0.26 }, // lit shop and tree
  { file: 'water-lily-pond.jpg', by: 'Monet', cx: 0.5, cy: 0.33, s: 0.35 }, // the bridge
  { file: 'water-lily-pond.jpg', by: 'Monet', cx: 0.55, cy: 0.78, s: 0.3 }, // water lilies
  { file: 'water-lily-pond.jpg', by: 'Monet', cx: 0.2, cy: 0.12, s: 0.3 }, // willow
  { file: 'water-lily-pond.jpg', by: 'Monet', cx: 0.84, cy: 0.47, s: 0.28 }, // the willow's reflection
];
const GRIDS = { '4×3': [4, 3], '4×4': [4, 4], '5×4': [5, 4] };
const BOARD_W = 2.3, BOARD_H = 1.95;
const CENTRE_Y = 2.1, TILT = -0.1;
const UI = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';

const images = {};
const loadImage = (file) => images[file] || (images[file] = new Promise((res) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = () => res(null);
  im.src = import.meta.env.BASE_URL + file;
}));
// one face per detail: the crop, a thin gold edge and the painter's name on a strip
const faces = [];
function faceTexture(i) {
  if (faces[i]) return faces[i];
  const d = DETAILS[i], c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a1a10';
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  loadImage(d.file).then((im) => {
    if (!im) return;
    const side = d.s * im.width;
    const x = Math.min(im.width - side, Math.max(0, d.cx * im.width - side / 2));
    const y = Math.min(im.height - side, Math.max(0, d.cy * im.height - side / 2));
    g.drawImage(im, x, y, side, side, 0, 0, 256, 256);
    g.fillStyle = 'rgba(30, 18, 8, 0.72)';
    g.fillRect(0, 214, 256, 42);
    g.font = `700 22px ${UI}`;
    g.fillStyle = '#f6d27e';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(d.by.toUpperCase(), 128, 236);
    g.strokeStyle = '#d9a441';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 248);
    tex.needsUpdate = true;
  });
  faces[i] = tex;
  return tex;
}
// the back of every card: dark walnut with a gold border and a diamond
let backTex = null;
function backTexture() {
  if (backTex) return backTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#6b4429'); grad.addColorStop(1, '#3e2615');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 40; k++) { // a little grain
    g.strokeStyle = `rgba(20, 8, 2, ${0.05 + Math.random() * 0.08})`;
    g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * 256;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y + 3); g.stroke();
  }
  g.strokeStyle = '#d9a441'; g.lineWidth = 8; g.strokeRect(12, 12, 232, 232);
  g.lineWidth = 3; g.strokeRect(26, 26, 204, 204);
  g.fillStyle = '#d9a441';
  g.beginPath(); g.moveTo(128, 78); g.lineTo(178, 128); g.lineTo(128, 178); g.lineTo(78, 128); g.closePath(); g.fill();
  g.fillStyle = '#3e2615';
  g.beginPath(); g.moveTo(128, 100); g.lineTo(156, 128); g.lineTo(128, 156); g.lineTo(100, 128); g.closePath(); g.fill();
  backTex = new THREE.CanvasTexture(c);
  backTex.colorSpace = THREE.SRGBColorSpace;
  return backTex;
}

export function createMemory({ root, at, toWorld, camera, renderer, tone, won, mats }) {
  const { glow, walnut, brass, GOLD, AMBER } = mats;
  const box = (w, h, d, m, x, y, z, parent = root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // ---------- the board ----------
  box(2.6, 0.95, 1.1, walnut, at.x, 0.475, at.z); // a walnut cabinet
  box(2.64, 0.035, 0.035, brass, at.x, 0.96, at.z + 0.56);
  const board = new THREE.Group();
  board.position.set(at.x, CENTRE_Y, at.z - 0.1);
  board.rotation.x = TILT;
  root.add(board);
  box(BOARD_W + 0.3, BOARD_H + 0.3, 0.1, walnut, 0, 0, -0.06, board);
  box(BOARD_W + 0.1, BOARD_H + 0.1, 0.02, mats.felt, 0, 0, -0.005, board); // green felt to lay the cards on
  const frameMat = glow(GOLD);
  const EX = BOARD_W / 2 + 0.15, EY = BOARD_H / 2 + 0.15;
  for (const [w, h, x, y] of [[2 * EX + 0.04, 0.04, 0, EY], [2 * EX + 0.04, 0.04, 0, -EY], [0.04, 2 * EY, -EX, 0], [0.04, 2 * EY, EX, 0]]) box(w, h, 0.04, frameMat, x, y, 0, board);
  for (const s of [-1, 1]) {
    const leg = box(0.07, 1.3, 0.07, mats.oak, at.x + s * 0.8, 1.55, at.z - 0.35);
    leg.rotation.x = 0.12;
  }
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.3), new THREE.MeshBasicMaterial({ map: mats.neonTexture(['MEMORY MATCH'], { w: 768, h: 136, size: 70 }), transparent: true, toneMapped: false }));
  label.position.set(at.x, 0.8, at.z + 0.56);
  root.add(label);

  // ---------- the game ----------
  const S = { grid: '4×4', cols: 4, rows: 4, pairs: 8, par: 13, moves: 0, found: 0, started: false, time: 0, done: false };
  let cards = [], open = [], lock = 0, hover = null, cursor = -1, celebrate = 0;
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  const backMat = new THREE.MeshBasicMaterial({ map: backTexture(), toneMapped: false });
  function clear() {
    for (const c of cards) { board.remove(c.group, c.edge); c.face.material.dispose(); c.edge.material.dispose(); }
    cards = []; open = []; lock = 0; hover = null; cursor = -1;
  }
  function setup(grid = S.grid) {
    clear();
    const [cols, rows] = GRIDS[grid];
    const pairs = (cols * rows) / 2;
    Object.assign(S, { grid, cols, rows, pairs, par: Math.round(pairs * 1.6), moves: 0, found: 0, started: false, time: 0, done: false });
    celebrate = 0;
    // deal: a random set of details, each twice, shuffled
    const pick = DETAILS.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, pairs);
    const deck = [...pick, ...pick];
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const cell = Math.min(BOARD_W / cols, BOARD_H / rows), size = cell * 0.88;
    deck.forEach((id, k) => {
      const r = Math.floor(k / cols), c = k % cols;
      const group = new THREE.Group();
      group.position.set((c - (cols - 1) / 2) * cell, ((rows - 1) / 2 - r) * cell, 0.02);
      const back = new THREE.Mesh(cardGeo, backMat);
      back.scale.setScalar(size);
      const face = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: faceTexture(id), toneMapped: false }));
      face.scale.setScalar(size);
      face.rotation.y = Math.PI; // on the other side of the card
      face.position.z = -0.002;
      // a gold outline that lights up for the keyboard cursor and for found pairs
      const edge = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, toneMapped: false }));
      edge.scale.setScalar(size * 1.08);
      edge.position.set(group.position.x, group.position.y, 0.004); // stays behind the card however it turns
      group.add(back, face);
      board.add(group, edge);
      cards.push({ k, id, group, back, face, edge, up: false, flip: 0, matched: false });
    });
  }

  function turn(card) {
    if (S.done || lock > 0 || card.up || card.matched || open.length >= 2) return;
    if (!S.started) { S.started = true; S.time = 0; }
    card.up = true;
    open.push(card);
    tone(520 + Math.random() * 60, 0.12, 0.05, 'triangle');
    if (open.length < 2) return;
    S.moves++;
    const [a, b] = open;
    if (a.id === b.id) {
      a.matched = b.matched = true;
      open = [];
      S.found++;
      [880, 1174.66].forEach((f, i) => setTimeout(() => tone(f, 0.5, 0.07), 180 + i * 90));
      if (S.found === S.pairs) { S.done = true; celebrate = 0.001; won(); }
    } else lock = 0.9; // a moment to look, then both turn back
  }

  // ---------- input ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    board.updateMatrixWorld(true);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(cards.flatMap((c) => [c.back, c.face]), false)[0];
    return h ? cards.find((c) => c.back === h.object || c.face === h.object) : null;
  }
  function pointer(type, e) {
    if (S.done) return;
    const c = hit(e);
    if (type === 'down') { if (c) turn(c); }
    else if (type === 'move') hover = c && !c.up && !c.matched ? c : null;
  }
  // arrows or WASD move a gold cursor; Space or Enter turns the card under it
  function key(e) {
    if (S.done) return false;
    const n = cards.length, cols = S.cols;
    const step = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -cols, KeyW: -cols, ArrowDown: cols, KeyS: cols }[e.code];
    if (step !== undefined) {
      e.preventDefault();
      cursor = cursor < 0 ? 0 : Math.min(n - 1, Math.max(0, cursor + step));
      return true;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (cursor < 0) cursor = 0;
      else turn(cards[cursor]);
      return true;
    }
    return false;
  }

  // ---------- each frame ----------
  function update(dt, t) {
    if (lock > 0 && (lock -= dt) <= 0) {
      for (const c of open) c.up = false;
      open = [];
    }
    for (const c of cards) {
      c.flip += ((c.up || c.matched ? 1 : 0) - c.flip) * Math.min(1, dt * 12);
      c.group.rotation.y = Math.PI * c.flip;
      c.group.position.z = 0.02 + Math.sin(Math.PI * c.flip) * 0.12; // lifts as it turns
      const s = c === hover && !S.done ? 1.05 : 1;
      c.group.scale.setScalar(c.group.scale.x + (s - c.group.scale.x) * Math.min(1, dt * 14));
      const want = c.matched ? (S.done ? 0.55 + 0.35 * Math.sin(t * 6 + c.k) : 0.85) : c.k === cursor ? 0.9 : 0;
      c.edge.material.opacity += (want - c.edge.material.opacity) * Math.min(1, dt * 10);
      c.edge.material.color.setHex(c.matched ? GOLD : AMBER);
    }
    frameMat.color.setHex(S.done && Math.sin(t * 8) > 0 ? AMBER : GOLD);
    if (celebrate > 0) celebrate += dt;
  }

  // square on to the board, close enough to fill the view without cutting it off
  function cameraPose(pos, look) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(2.8, 1.85 / tanV, 1.42 / (tanV * camera.aspect));
    toWorld(at.x, CENTRE_Y + 0.2, at.z - 0.1 + d, pos);
    toWorld(at.x, CENTRE_Y + 0.2, at.z - 0.1, look);
  }

  setup(); // so the board shows a fresh deal before anyone plays
  const stars = () => (S.moves <= S.par ? 3 : S.moves <= S.par * 1.5 ? 2 : 1);
  return {
    id: 'memory',
    name: 'Memory Match',
    prompt: 'Play Memory Match',
    hint: 'Find the pairs. Tap a card to turn it over, then find its <b>twin</b>: each face is a detail from a painting. The clock starts on your first card.',
    S,
    bestKey: 'paletterider-memory-best',
    bestId: () => S.grid,
    bestSub: () => `${S.grid} · ${S.pairs} pairs`,
    options: () => [{ label: 'GRID', value: S.grid, choices: Object.keys(GRIDS).map((g) => ({ v: g, label: g })), set: (g) => setup(g) }],
    hud: () => ({ moves: S.moves, max: S.par, label: 'TURNS · PAR' }),
    setup: () => setup(),
    pointer, key, update, cameraPose,
    turnCard: (k) => turn(cards[k]),
    cards: () => cards,
    card: () => {
      const st = stars(), acc = Math.round((S.pairs / Math.max(1, S.moves)) * 100);
      return {
        title: 'Memory Match',
        chip: `${S.grid} · ${S.pairs} PAIRS`,
        tiles: [
          ['TURNS', String(S.moves), `par ${S.par}`, 'mono'],
          ['ACCURACY', `${acc}%`, 'pairs per turn', 'mono'],
          ['RATING', '★'.repeat(st) + '☆'.repeat(3 - st), ['', 'SOLVED', 'GREAT', 'PERFECT'][st], 'stars'],
        ],
        focusY: 0.5,
        file: `memory-${S.cols}x${S.rows}`,
        share: (time) => `I matched all ${S.pairs} pairs of painting details (${S.grid}) in ${time} and ${S.moves} turns in PaletteRider.`,
      };
    },
  };
}
