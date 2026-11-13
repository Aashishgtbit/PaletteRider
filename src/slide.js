// Painting Slide: a sliding-tile puzzle made from the three paintings the chapters are built on.
// The painting stands on an easel at the left-hand table of the Mind Games pavilion, cut into
// tiles with the bottom-right one missing. Slide the tiles back into place; when the picture is
// whole again the last tile drops in.
import * as THREE from 'three';

export const ARTS = [
  { id: 'monet', file: 'water-lily-pond.jpg', name: 'The Water Lily Pond', short: 'Monet' },
  { id: 'vangogh', file: 'cafe-terrace-at-night.jpg', name: 'Café Terrace at Night', short: 'Van Gogh' },
  { id: 'klee', file: 'castle-and-sun.jpg', name: 'Castle and Sun', short: 'Klee' },
];
const SCRAMBLE = { 3: 40, 4: 90, 5: 160 }; // random moves from the finished picture; also the par
const BOARD = 1.9; // metres across
const CENTRE_Y = 2.08, TILT = -0.1;

// one square texture per painting, cropped from the middle of the picture
const textures = {};
function artTexture(art) {
  if (textures[art.id]) return textures[art.id];
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1f36';
  g.fillRect(0, 0, 1024, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    const s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 1024, 1024);
    tex.needsUpdate = true;
  };
  img.src = import.meta.env.BASE_URL + art.file;
  textures[art.id] = tex;
  return tex;
}

export function createSlide({ root, at, toWorld, camera, renderer, tone, won, mats }) {
  const { glow, walnut, oak, brass, GOLD, AMBER } = mats;
  const box = (w, h, d, m, x, y, z, parent = root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // ---------- the easel ----------
  box(2.4, 0.95, 1.1, walnut, at.x, 0.475, at.z); // a walnut cabinet
  box(2.44, 0.035, 0.035, brass, at.x, 0.96, at.z + 0.56);
  const board = new THREE.Group();
  board.position.set(at.x, CENTRE_Y, at.z - 0.1);
  board.rotation.x = TILT;
  root.add(board);
  box(BOARD + 0.3, BOARD + 0.3, 0.1, walnut, 0, 0, -0.05, board); // a walnut picture frame
  const frameMat = glow(GOLD); // its gilded inner edge, which flashes when the picture is whole
  const E = BOARD / 2 + 0.13;
  for (const [w, h, x, y] of [[2 * E + 0.04, 0.04, 0, E], [2 * E + 0.04, 0.04, 0, -E], [0.04, 2 * E, -E, 0], [0.04, 2 * E, E, 0]]) box(w, h, 0.04, frameMat, x, y, 0.0, board);
  for (const s of [-1, 1]) {
    const leg = box(0.07, 1.3, 0.07, oak, at.x + s * 0.7, 1.55, at.z - 0.35); // the easel's oak legs
    leg.rotation.x = 0.12;
  }
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.3), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
  label.position.set(at.x, 0.8, at.z + 0.56);
  root.add(label);

  // ---------- the puzzle ----------
  const S = { size: 4, art: ARTS[0], cells: [], empty: 0, moves: 0, started: false, time: 0, done: false, par: SCRAMBLE[4] };
  let tiles = [], last = null, hover = null, celebrate = 0;
  const cellSize = () => BOARD / S.size;
  const cellPos = (i, out) => {
    const N = S.size, cs = cellSize(), r = Math.floor(i / N), c = i % N;
    return out.set(-BOARD / 2 + c * cs + cs / 2, BOARD / 2 - r * cs - cs / 2, 0.012);
  };
  function tileGeo(id) {
    const N = S.size, cs = cellSize(), r = Math.floor(id / N), c = id % N;
    const geo = new THREE.PlaneGeometry(cs - 0.022, cs - 0.022);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + uv.getX(k)) / N, 1 - (r + 1 - uv.getY(k)) / N);
    return geo;
  }
  function clear() {
    for (const t of tiles) { board.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); }
    if (last) { board.remove(last); last.geometry.dispose(); last.material.dispose(); }
    tiles = []; last = null; hover = null;
  }
  const adjacent = (a, b) => {
    const N = S.size, ra = Math.floor(a / N), ca = a % N, rb = Math.floor(b / N), cb = b % N;
    return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
  };
  const neighbours = (i) => {
    const N = S.size, r = Math.floor(i / N), c = i % N, out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  };
  const solved = () => S.cells.every((id, i) => id === i || (id === -1 && i === S.cells.length - 1));

  function setup(size = S.size, art = S.art) {
    clear();
    const N = size;
    Object.assign(S, { size: N, art, moves: 0, started: false, time: 0, done: false, par: SCRAMBLE[N] });
    celebrate = 0;
    const tex = artTexture(art);
    // mix it up with random slides from the finished picture, so it can always be solved
    S.cells = Array.from({ length: N * N }, (_, i) => (i === N * N - 1 ? -1 : i));
    S.empty = N * N - 1;
    let prev = -1;
    S.trail = []; // where the gap was before each shuffling slide (lets a test replay it backwards)
    for (let k = 0; k < SCRAMBLE[N] || solved(); k++) {
      const opts = neighbours(S.empty).filter((j) => j !== prev);
      const j = opts[Math.floor(Math.random() * opts.length)];
      S.cells[S.empty] = S.cells[j]; S.cells[j] = -1;
      S.trail.push(S.empty);
      prev = S.empty; S.empty = j;
    }
    const v = new THREE.Vector3();
    S.cells.forEach((id, i) => {
      if (id < 0) return;
      const mesh = new THREE.Mesh(tileGeo(id), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      cellPos(i, mesh.position);
      board.add(mesh);
      tiles[id] = { id, mesh, at: i, to: cellPos(i, new THREE.Vector3()) };
    });
    tiles = tiles.filter(Boolean);
    last = new THREE.Mesh(tileGeo(N * N - 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, opacity: 0 }));
    cellPos(N * N - 1, last.position);
    last.scale.setScalar(0.001);
    board.add(last);
    label.material.map?.dispose();
    label.material.map = mats.neonTexture([art.name.toUpperCase()], { w: 768, h: 136, size: 66 });
    label.material.needsUpdate = true;
    v.set(0, 0, 0);
  }
  const tileAt = (i) => tiles.find((t) => t.at === i);

  // slide the tile in cell i into the gap next to it
  function step(i) {
    const t = tileAt(i);
    S.cells[S.empty] = t.id; S.cells[i] = -1;
    t.at = S.empty;
    cellPos(S.empty, t.to);
    S.empty = i;
    S.moves++;
  }
  // a tap on a tile in line with the gap slides it and everything between towards the gap
  function tapCell(i) {
    if (S.done || i === S.empty) return;
    const N = S.size, ri = Math.floor(i / N), ci = i % N, re = Math.floor(S.empty / N), ce = S.empty % N;
    if (ri !== re && ci !== ce) { tone(150, 0.12, 0.05, 'triangle'); return; }
    if (!S.started) { S.started = true; S.time = 0; }
    const dir = ri === re ? Math.sign(ci - ce) : Math.sign(ri - re) * N;
    while (S.empty !== i) step(S.empty + dir);
    tone(700 + Math.random() * 120, 0.12, 0.05);
    if (solved()) { S.done = true; celebrate = 0.001; won(); }
  }

  // ---------- input ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld(); // the view and the tiles may have moved since the last frame was drawn
    board.updateMatrixWorld(true);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(tiles.map((t) => t.mesh), false)[0];
    return h ? tiles.find((t) => t.mesh === h.object) : null;
  }
  function pointer(type, e) {
    if (S.done) return;
    const t = hit(e);
    if (type === 'down') { if (t) tapCell(t.at); }
    else if (type === 'move') {
      const N = S.size;
      hover = t && (Math.floor(t.at / N) === Math.floor(S.empty / N) || t.at % N === S.empty % N) ? t : null;
    }
  }
  // arrows and WASD push a tile into the gap from the opposite side
  function key(e) {
    if (S.done) return false;
    const N = S.size, r = Math.floor(S.empty / N), c = S.empty % N;
    const from = {
      ArrowLeft: c < N - 1 ? S.empty + 1 : -1, KeyA: c < N - 1 ? S.empty + 1 : -1,
      ArrowRight: c > 0 ? S.empty - 1 : -1, KeyD: c > 0 ? S.empty - 1 : -1,
      ArrowUp: r < N - 1 ? S.empty + N : -1, KeyW: r < N - 1 ? S.empty + N : -1,
      ArrowDown: r > 0 ? S.empty - N : -1, KeyS: r > 0 ? S.empty - N : -1,
    }[e.code];
    if (from === undefined) return false;
    e.preventDefault();
    if (from >= 0) tapCell(from);
    return true;
  }

  // ---------- each frame ----------
  function update(dt, t) {
    for (const tl of tiles) {
      tl.mesh.position.lerp(tl.to, 1 - Math.exp(-18 * dt));
      const s = tl === hover && !S.done ? 1.04 : 1;
      tl.mesh.scale.setScalar(tl.mesh.scale.x + (s - tl.mesh.scale.x) * Math.min(1, dt * 14));
      tl.mesh.position.z = 0.012 + (tl === hover ? 0.03 : 0);
    }
    if (celebrate > 0 && last) {
      celebrate += dt;
      const k = Math.min(1, celebrate / 0.5);
      last.material.opacity = k;
      last.scale.setScalar(Math.max(0.001, 1.25 - 0.25 * k));
    }
    frameMat.color.setHex(S.done && Math.sin(t * 8) > 0 ? AMBER : GOLD);
  }

  // square on to the painting, close enough to fill the view without cutting it off
  function cameraPose(pos, look) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(2.8, 1.8 / tanV, 1.3 / (tanV * camera.aspect));
    // looking a little above the middle, so the painting sits clear of the panel at the top
    toWorld(at.x, CENTRE_Y + 0.2, at.z - 0.1 + d, pos);
    toWorld(at.x, CENTRE_Y + 0.2, at.z - 0.1, look);
  }

  setup(); // so the easel shows a shuffled painting before anyone plays

  const stars = () => (S.moves <= S.par ? 3 : S.moves <= S.par * 2 ? 2 : 1);
  return {
    id: 'slide',
    name: 'Painting Slide',
    prompt: 'Play Painting Slide',
    hint: 'Put the painting back together. Tap a tile <b>in line with the gap</b> to slide it across. Tap <b>👁 Goal</b> to see the finished painting. The clock starts on your first move.',
    S,
    bestKey: 'paletterider-slide-best',
    bestId: () => `${S.art.id}-${S.size}`,
    bestSub: () => `${S.size}×${S.size} · ${S.art.short}`,
    options: () => [
      { label: 'GRID', value: S.size, choices: [3, 4, 5].map((n) => ({ v: n, label: `${n}×${n}` })), set: (n) => setup(n, S.art) },
      { label: 'PAINTING', value: S.art.id, choices: ARTS.map((a) => ({ v: a.id, label: a.short, img: import.meta.env.BASE_URL + a.file })), set: (id) => setup(S.size, ARTS.find((a) => a.id === id)) },
    ],
    refImage: () => import.meta.env.BASE_URL + S.art.file,
    refName: () => `${S.art.name} · ${S.art.short}`,
    hud: () => ({ moves: S.moves, max: S.par, label: 'MOVES · PAR' }),
    setup: () => setup(),
    pointer, key, update, cameraPose, tapCell,
    card: () => ({
      title: 'Painting Slide',
      chip: `${S.size}×${S.size} · ${S.art.short.toUpperCase()}`,
      tiles: [
        ['MOVES', String(S.moves), `par ${S.par}`, 'mono'],
        ['PAINTING', S.art.short, S.art.name, 'ui'],
        ['RATING', '★'.repeat(stars()) + '☆'.repeat(3 - stars()), ['', 'SOLVED', 'GREAT', 'PERFECT'][stars()], 'stars'],
      ],
      focusY: 0.6,
      file: `slide-${S.art.id}-${S.size}x${S.size}`,
      share: (time) => `I put ${S.art.name} back together (${S.size}×${S.size}) in ${time} with ${S.moves} moves in PaletteRider.`,
    }),
  };
}
