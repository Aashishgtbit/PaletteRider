// Mind Games: a timber garden pavilion in walnut, oak and brass, warmly lit, with game tables inside. Leave
// the bike outside, walk up to a table and play. The first game is the Tower of Hanoi, against
// the clock; when it is solved the game draws a score card that can be shared or saved.
//
// The pavilion is built facing the way given by `at.face` (+x by default), with its closed back
// wall behind the tables, so a game is always seen against a calm deep-green felt backdrop rather
// than the busy painting outside.
import * as THREE from 'three';
import { createSlide } from './slide.js';
import { createMemory } from './memory.js';

// rich and far apart in hue, so neighbouring sizes never look alike against the green felt
const DISC_COLORS = ['#e0344a', '#f08a2c', '#f4c534', '#3fbf86', '#2f8ee0', '#8a5ad0', '#f4ead6']; // ruby to ivory, like lacquered wood
const UI = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const GOLD = 0xffc86a, AMBER = 0xff9b4a; // warm lamp-light glows: brass gold and amber
const DISC_H = 0.15; // metres
const PEG_X = [-1.45, 0, 1.45]; // along the table
const PEG_H = 1.32;
const BOARD_Y = 1.12; // top of the board the pegs stand in
const TABLE_Z = -2.6; // the Hanoi table, in front of the back wall
const LIFT_Y = BOARD_Y + PEG_H + 0.38; // a lifted disc floats here, clear of the pegs
const SITE = 'aashishgtbit.github.io/PaletteRider';
const BEST_KEY = 'paletterider-hanoi-best';
const SLIDE_AT = { x: -5, z: TABLE_Z }; // the painting slide puzzle, on an easel at the left table
const MEMORY_AT = { x: 5, z: TABLE_Z }; // memory match, on a board at the right table
const SOON = []; // tables for games still to come (none at the moment)

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

// gold letters with a soft warm glow on a transparent background, for signs and plaques
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
      const grad = g.createLinearGradient(0, y - s / 2, 0, y + s / 2);
      grad.addColorStop(0, '#fff1c4'); grad.addColorStop(0.5, '#f6c562'); grad.addColorStop(1, '#d9952f');
      g.fillStyle = grad;
      g.shadowColor = 'rgba(255, 190, 90, 0.75)'; g.shadowBlur = 18;
    } else { g.fillStyle = '#f7e6c2'; g.shadowColor = 'rgba(255, 190, 90, 0.5)'; g.shadowBlur = 8; }
    if (!big) { g.save(); g.letterSpacing = '6px'; }
    g.fillText(t, w / 2, y, w * 0.92);
    if (!big) g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const wrap = (tex, rx, ry) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 8;
  return tex;
};
// planks of wood: each plank a slightly different tone, long wavy grain, a dark seam between
function woodTexture(base, { planks = 5, rx = 1, ry = 1, seam = 0.55 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const col = new THREE.Color(base);
  const pw = 512 / planks;
  let seed = base & 0xffff;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let p = 0; p < planks; p++) {
    const tone = col.clone().offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08);
    g.fillStyle = `#${tone.getHexString()}`;
    g.fillRect(p * pw, 0, pw, 512);
    for (let k = 0; k < 26; k++) { // the grain
      const x0 = p * pw + rnd() * pw, dark = rnd() < 0.6;
      g.strokeStyle = dark ? `rgba(40, 20, 8, ${0.06 + rnd() * 0.12})` : `rgba(255, 230, 190, ${0.04 + rnd() * 0.08})`;
      g.lineWidth = 0.6 + rnd() * 1.8;
      g.beginPath();
      for (let y = 0; y <= 512; y += 16) g.lineTo(x0 + Math.sin(y / (40 + rnd() * 30) + k) * 2.2, y);
      g.stroke();
    }
    if (rnd() < 0.5) { // a knot
      const kx = p * pw + pw * (0.3 + rnd() * 0.4), ky = rnd() * 512;
      g.fillStyle = 'rgba(50, 25, 10, 0.25)';
      g.beginPath(); g.ellipse(kx, ky, 4 + rnd() * 3, 9 + rnd() * 6, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = `rgba(30, 14, 4, ${seam})`;
    g.fillRect(p * pw, 0, 2, 512);
  }
  return wrap(new THREE.CanvasTexture(c), rx, ry);
}
// cedar shingles for the roof
function shingleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 8; row++) {
    for (let i = -1; i < 9; i++) {
      const x = i * 32 + (row % 2) * 16, y = row * 32;
      g.fillStyle = `hsl(${20 + rnd() * 10}, ${42 + rnd() * 14}%, ${30 + rnd() * 12}%)`;
      g.fillRect(x, y, 31, 32);
      g.fillStyle = 'rgba(20, 8, 2, 0.45)';
      g.fillRect(x, y + 29, 32, 3);
    }
  }
  return wrap(new THREE.CanvasTexture(c), 6, 4);
}
// the backdrop behind the Hanoi table: deep green felt, a little lighter in the middle
function backdropTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 140, 20, 256, 130, 300);
  grad.addColorStop(0, '#2f6e4f'); grad.addColorStop(0.6, '#1f5039'); grad.addColorStop(1, '#143826');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9000; i++) { // the nap of the felt
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
    g.fillRect(Math.random() * 512, Math.random() * 256, 1.5, 1.5);
  }
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
  // A timber garden pavilion: teak walls, walnut posts, a cedar-shingle roof, a honey-oak floor
  // and light oak panelling inside, with brass trim, warm lanterns and potted plants.
  const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false }); // lamp-lit strips
  const walnut = mat(0xffffff, { map: woodTexture(0x5b3a24, { planks: 4, rx: 1, ry: 1 }), roughness: 0.45 });
  const teak = mat(0xffffff, { map: woodTexture(0x9a6538, { planks: 6, rx: 3, ry: 1 }), roughness: 0.6 });
  const oak = mat(0xffffff, { map: woodTexture(0xc89660, { planks: 6, rx: 4, ry: 1, seam: 0.4 }), roughness: 0.55, emissive: 0x3a2412, emissiveIntensity: 0.35 });
  const brass = mat(0xd9a441, { roughness: 0.28, metalness: 0.85 });
  const ivory = mat(0xf6ecd6, { roughness: 0.4 });
  const felt = mat(0x1f5a40, { roughness: 0.95 });
  const floorTex = woodTexture(0xb98450, { planks: 8, rx: 3, ry: 2.5, seam: 0.5 });
  floorTex.rotation = Math.PI / 2;
  box(14.4, 0.12, 12.4, mat(0xffffff, { map: floorTex, roughness: 0.5 }), 0, 0.06, 0); // floor
  box(14.4, 5.2, 0.3, teak, 0, 2.6, -6.05); // back wall
  box(14.0, 5.0, 0.04, oak, 0, 2.55, -5.88); // its panelled inside face
  for (const s of [-1, 1]) {
    box(0.3, 5.2, 5.4, teak, s * 7.05, 2.6, -3.5); // side walls round the back half
    box(0.04, 5.0, 5.2, oak, s * 6.88, 2.55, -3.5);
    for (const z of [1.6, 6.0]) { // walnut posts on stone feet
      box(0.42, 5.0, 0.42, walnut, s * 7.05, 2.6, z);
      box(0.6, 0.3, 0.6, mat(0xcfc3ad, { roughness: 1 }), s * 7.05, 0.15, z);
    }
  }
  box(15.4, 0.3, 13.4, walnut, 0, 5.3, 0); // the beam frame under the roof
  box(15.0, 0.04, 13.0, oak, 0, 5.14, 0); // an oak ceiling
  const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 2.6, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(16.6, 1, 14.6);
  const roofMesh = new THREE.Mesh(roofGeo, mat(0xffffff, { map: shingleTexture(), roughness: 0.85 }));
  roofMesh.position.y = 6.75;
  root.add(roofMesh);
  // brass trim, and warm light hidden along the edges
  box(15.44, 0.06, 0.06, brass, 0, 5.47, 6.72);
  box(15.2, 0.04, 0.04, glow(GOLD), 0, 5.13, 6.6);
  for (const s of [-1, 1]) { box(0.06, 0.06, 13.44, brass, s * 7.72, 5.47, 0); box(0.04, 0.04, 13, glow(GOLD), s * 7.6, 5.13, 0); }
  box(13.9, 0.04, 0.04, glow(AMBER), 0, 0.16, -5.84);
  box(13.9, 0.08, 0.06, brass, 0, 4.55, -5.83);
  // the felt backdrop behind the Hanoi table, in a brass frame
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2.9), new THREE.MeshBasicMaterial({ map: backdropTexture() }));
  back.position.set(0, 2.2, -5.85);
  root.add(back);
  for (const [w, h, x, y] of [[6.8, 0.07, 0, 3.68], [6.8, 0.07, 0, 0.72], [0.07, 3.03, -3.37, 2.2], [0.07, 3.03, 3.37, 2.2]]) box(w, h, 0.05, brass, x, y, -5.82);
  // a spotlight over the table, and a soft warm fill from the front
  const spot = new THREE.SpotLight(0xfff0d8, 18, 14, 0.62, 0.55, 1.4);
  spot.position.set(0, 4.9, TABLE_Z + 1.4);
  spot.target.position.set(0, BOARD_Y, TABLE_Z);
  root.add(spot, spot.target);
  const fill = new THREE.PointLight(0xffd9a8, 7, 12, 1.5);
  fill.position.set(0, 3.2, 1.5);
  root.add(fill);
  // brass lanterns hanging over each table
  for (const x of [-5, 0, 5]) {
    box(0.02, 1.1, 0.02, brass, x, 4.6, TABLE_Z + 0.6);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.36, 0.34, 20, 1, true), mat(0xd9a441, { roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide }));
    shade.position.set(x, 3.95, TABLE_Z + 0.6);
    root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), glow(0xfff0c8));
    bulb.position.set(x, 3.84, TABLE_Z + 0.6);
    root.add(bulb);
  }
  // potted plants in the corners: terracotta pots, ferns and a little olive tree
  const terracotta = mat(0xc4673f, { roughness: 0.9 });
  const leaf = (hex) => mat(hex, { roughness: 0.8, flatShading: true });
  for (const [x, z, tree] of [[-6.2, -5.2, false], [6.2, -5.2, false], [-6.4, 5.4, true], [6.4, 5.4, true]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.7, 18), terracotta);
    pot.position.set(x, 0.47, z);
    root.add(pot);
    box(0.86, 0.05, 0.86, mat(0x3a2a1a), x, 0.84, z).scale.set(0.95, 1, 0.95);
    if (tree) {
      box(0.07, 1.4, 0.07, walnut, x, 1.5, z);
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), leaf([0x5a8a3a, 0x6f9a48, 0x4f7a34][i % 3]));
        b.position.set(x + Math.cos(i * 1.1) * 0.35, 2.2 + Math.sin(i * 2.3) * 0.25, z + Math.sin(i * 1.1) * 0.35);
        root.add(b);
      }
    } else {
      for (let i = 0; i < 9; i++) { // fern fronds
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 5), leaf([0x3f8a3c, 0x5aa648, 0x2f7038][i % 3]));
        const a = (i / 9) * Math.PI * 2;
        f.position.set(x + Math.cos(a) * 0.22, 1.25, z + Math.sin(a) * 0.22);
        f.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
        root.add(f);
      }
    }
  }

  // the carved sign over the front: a walnut board with gold letters, readable from the avenue
  box(6.6, 1.5, 0.14, walnut, 0, 4.42, 6.72);
  for (const y of [5.15, 3.69]) box(6.66, 0.05, 0.16, brass, 0, y, 6.72);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 1.4), new THREE.MeshBasicMaterial({ map: neonTexture(['MIND GAMES', 'TOWER OF HANOI · PAINTING SLIDE · MEMORY MATCH']), transparent: true, toneMapped: false }));
  sign.position.set(0, 4.42, 6.8);
  root.add(sign);
  // a tall pole with a green pennant beside it, seen over the flower beds
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 10, 8), walnut);
  pole.position.set(8.6, 5, 6.4);
  root.add(pole);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), brass);
  finial.position.set(8.6, 10.05, 6.4);
  root.add(finial);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.3, 8, 1);
  flagGeo.translate(1.2, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: textTexture(['🧩'], { w: 256, h: 140, bg: '#1f5a40', fg: '#ffffff', size: 96, border: '#d9a441' }), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(8.6, 9.2, 6.4);
  root.add(flag);
  const flagBase = flagGeo.attributes.position.array.slice();

  // the Hanoi table: walnut with a brass edge, a green felt board, brass pegs with ivory tips
  box(5.2, 0.1, 1.8, walnut, 0, 0.97, TABLE_Z);
  box(5.24, 0.035, 0.035, brass, 0, 0.93, TABLE_Z + 0.91);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.1, 0.92, 0.1, walnut, sx * 2.4, 0.46, TABLE_Z + sz * 0.75);
  box(4.6, 0.1, 1.3, felt, 0, BOARD_Y - 0.05, TABLE_Z); // the board
  const pegs = PEG_X.map((x) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, PEG_H, 16), brass);
    m.position.set(x, BOARD_Y + PEG_H / 2, TABLE_Z);
    root.add(m);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 10), ivory);
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
  // the name, in gold, on the table edge
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.3), new THREE.MeshBasicMaterial({ map: neonTexture(['TOWER OF HANOI'], { w: 768, h: 136, size: 78 }), transparent: true, toneMapped: false }));
  plaque.position.set(0, 0.8, TABLE_Z + 0.92);
  root.add(plaque);

  // tables for the games still to come: a wooden puzzle box turning slowly over each
  const holos = [];
  for (const s of SOON) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 40), walnut);
    top.position.set(s.x, 0.95, s.z);
    root.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.022, 8, 48).rotateX(Math.PI / 2), brass);
    rim.position.set(s.x, 0.95, s.z);
    root.add(rim);
    box(0.12, 0.9, 0.12, walnut, s.x, 0.45, s.z);
    const cubeGeo = new THREE.BoxGeometry(0.56, 0.56, 0.56);
    const cube = new THREE.Mesh(cubeGeo, mat(0xffffff, { map: woodTexture(0xb98450, { planks: 3 }), roughness: 0.5 }));
    cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(cubeGeo), new THREE.LineBasicMaterial({ color: 0xffc86a })));
    cube.position.set(s.x, 1.55, s.z);
    root.add(cube);
    holos.push(cube);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: neonTexture(['COMING SOON', s.name.toUpperCase()], { w: 768, h: 192, size: 70 }), transparent: true, toneMapped: false }));
    card.position.set(s.x, 2.25, s.z + 0.2);
    root.add(card);
  }

  // ---------- the painting slide puzzle ----------
  const slide = createSlide({ root, at: SLIDE_AT, toWorld, camera, renderer, tone, won, mats: { glow, walnut, oak, brass, GOLD, AMBER, neonTexture, woodTexture } });
  // ---------- memory match ----------
  const memory = createMemory({ root, at: MEMORY_AT, toWorld, camera, renderer, tone, won, mats: { glow, walnut, oak, brass, felt, GOLD, AMBER, neonTexture } });

  // ---------- the Tower of Hanoi ----------
  const H = { n: 4, pegs: [[], [], []], discs: [], held: null, from: 0, hover: -1, moves: 0, started: false, time: 0, done: false };
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
  function setupHanoi(n = H.n) {
    clearDiscs();
    Object.assign(H, { n, pegs: [[], [], []], held: null, hover: -1, moves: 0, started: false, time: 0, done: false });
    for (let i = n - 1; i >= 0; i--) {
      const r = radius(i, n), color = DISC_COLORS[Math.round((i / Math.max(1, n - 1)) * 6)];
      const geo = new THREE.CylinderGeometry(r, r, DISC_H, 48);
      const pale = color === '#f4ead6'; // the white disc would glare if it glowed like the others
      const side = new THREE.MeshStandardMaterial({ color: pale ? '#e6dac2' : color, roughness: 0.62, metalness: 0, emissive: color, emissiveIntensity: pale ? 0 : 0.12 }); // satin lacquer: full colour, no glare
      const top = new THREE.MeshStandardMaterial({ map: discTopTexture(color, i + 1, r), roughness: 0.62, emissive: 0xffffff, emissiveIntensity: 0 });
      const bottom = new THREE.MeshStandardMaterial({ color: 0x14172a });
      const mesh = new THREE.Mesh(geo, [side, top, bottom]);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0x14101a })));
      mesh.position.set(PEG_X[0], restY(H.pegs[0].length), TABLE_Z);
      root.add(mesh);
      H.discs[i] = { i, mesh, path: [], shake: 0, glow: 0, base: pale ? 0 : 0.15 };
      H.pegs[0].push(i);
    }
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
    if (H.pegs[1].length === H.n || H.pegs[2].length === H.n) { H.done = true; won(); }
  }
  function tapPeg(p) {
    if (H.done || p < 0) return;
    if (H.held === null) pick(p);
    else drop(p);
  }
  function hoverTo(p) {
    if (H.held === null || p < 0 || p === H.hover) return;
    H.hover = p;
    go(H.discs[H.held], [PEG_X[p], LIFT_Y]);
  }
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
  const hanoiStars = () => (H.moves <= 2 ** H.n - 1 ? 3 : H.moves <= (2 ** H.n - 1) * 1.5 ? 2 : 1);
  const hanoi = {
    id: 'hanoi',
    name: 'Tower of Hanoi',
    prompt: 'Play Tower of Hanoi',
    hint: 'Move the whole tower to <b>another peg</b>. Tap a peg to lift its top disc, then tap where it goes. A disc never sits on a smaller one. The clock starts on your first move.',
    S: H,
    bestKey: BEST_KEY,
    bestId: () => H.n,
    bestSub: () => `${H.n} discs`,
    options: () => [{ label: 'DISCS', value: H.n, choices: [3, 4, 5, 6, 7].map((n) => ({ v: n, label: String(n) })), set: (n) => setupHanoi(n) }],
    hud: () => ({ moves: H.moves, max: 2 ** H.n - 1, label: 'MOVES' }),
    setup: () => setupHanoi(),
    pointer(type, e) {
      if (H.done) return;
      if (type === 'down') {
        const p = pegAt(e.clientX);
        if (H.held === null) { tapPeg(p); dragFrom = H.held === null ? -1 : p; } else tapPeg(p);
      } else if (type === 'move') hoverTo(pegAt(e.clientX));
      else if (type === 'up' && dragFrom >= 0) {
        const p = pegAt(e.clientX);
        if (H.held !== null && p !== dragFrom) tapPeg(p); // dragged across to another peg
        dragFrom = -1;
      }
    },
    key(e) {
      if (H.done) return false;
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n !== undefined) tapPeg(n);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { if (H.held !== null) hoverTo(clamp(H.hover - 1, 0, 2)); }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { if (H.held !== null) hoverTo(clamp(H.hover + 1, 0, 2)); }
      else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown' || e.code === 'KeyS') { if (H.held !== null) tapPeg(H.hover); }
      else return false;
      return true;
    },
    leave() {
      if (H.held === null) return;
      const d = H.discs[H.held]; // put a lifted disc back where it came from
      H.pegs[H.from].push(H.held);
      go(d, [PEG_X[H.from], restY(H.pegs[H.from].length - 1)]);
      H.held = null;
    },
    update(dt, t) {
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
    },
    // square on to the table, a little above it, far enough back that all three pegs fit
    // across the screen, whatever its shape
    cameraPose(pos, look) {
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), aspect = camera.aspect;
      const d = Math.max(5.2, 2.45 / (tanV * aspect), 1.6 / tanV);
      // kept below the roof and the sign, which a phone held upright has to look out from under
      toWorld(0, BOARD_Y + 0.75 + Math.min(d * 0.3, d > 7 ? 1.25 : 2.9), TABLE_Z + d, pos);
      toWorld(0, BOARD_Y + 0.75, TABLE_Z, look);
    },
    card: () => {
      const min = 2 ** H.n - 1, st = hanoiStars(), eff = Math.round((min / H.moves) * 100);
      return {
        title: 'Tower of Hanoi',
        chip: `${H.n} DISCS`,
        tiles: [
          ['MOVES', String(H.moves), `fewest ${min}`, 'mono'],
          ['EFFICIENCY', `${eff}%`, eff === 100 ? 'flawless' : 'of a perfect run', 'mono'],
          ['RATING', '★'.repeat(st) + '☆'.repeat(3 - st), ['', 'SOLVED', 'GREAT', 'PERFECT'][st], 'stars'],
        ],
        focusY: 0.56,
        file: `hanoi-${H.n}-discs`,
        share: (time) => `I solved the Tower of Hanoi (${H.n} discs) in ${time} with ${H.moves} moves in PaletteRider.`,
      };
    },
  };
  setupHanoi(4);

  // ---------- shared by every game: the panel, the clock, best times, the score card ----------
  const GAMES = { hanoi, slide, memory };
  let game = hanoi, active = false, cardShown = false, doneAt = 0, newBest = false;
  function readBest(g = game) {
    try { return JSON.parse(localStorage.getItem(g.bestKey)) || {}; } catch { return {}; }
  }
  function showBest() {
    const b = readBest()[game.bestId()];
    $('mindBest').textContent = b ? fmtTime(b.t) : '—';
    $('mindBestMoves').textContent = b ? `${b.m} moves` : game.bestSub();
  }
  // the bar of options under the game: disc count, or grid size and painting
  function renderOptions() {
    const box = $('mindOpts');
    box.textContent = '';
    for (const o of game.options()) {
      const lab = document.createElement('span');
      lab.className = 'mb-label';
      lab.textContent = o.label;
      const seg = document.createElement('div');
      seg.className = 'mg-seg';
      for (const ch of o.choices) {
        const b = document.createElement('button');
        b.classList.toggle('on', ch.v === o.value);
        if (ch.img) {
          b.className += ' with-img';
          const im = document.createElement('img');
          im.src = ch.img; im.alt = '';
          b.append(im);
        }
        b.append(ch.label);
        b.onclick = (e) => { o.set(ch.v); restart(); e.currentTarget.blur(); };
        seg.append(b);
      }
      box.append(lab, seg);
    }
  }
  function restart() {
    newBest = false; cardShown = false; doneAt = 0;
    $('mindDone').classList.remove('on');
    $('mindLive').dataset.s = '';
    renderOptions();
    showBest();
    const ref = game.refImage?.();
    $('mindRefBox').style.display = ref ? '' : 'none';
    $('mindGoalBtn').style.display = ref ? '' : 'none';
    if (ref) { $('mindRef').src = ref; $('mindPeekImg').src = ref; $('mindPeekName').textContent = game.refName?.() || ''; }
    peek(false);
  }
  function won() {
    doneAt = 1.1;
    const all = readBest(), old = all[game.bestId()];
    newBest = !old || game.S.time < old.t;
    if (newBest) {
      all[game.bestId()] = { t: Math.round(game.S.time * 10) / 10, m: game.S.moves };
      try { localStorage.setItem(game.bestKey, JSON.stringify(all)); } catch { /* private mode */ }
    }
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => tone(f, 1.2, 0.08), i * 120));
    showBest();
  }

  // ---------- the score card ----------
  // A portrait card (1080 × 1350, the shape Instagram and WhatsApp show best): dark and glowing,
  // the finished puzzle as it stands, a big timer and the stats in tiles.
  function makeCard(info) {
    const W = 1080, Hh = 1350, S = game.S;
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
    bg.addColorStop(0, '#13291f'); bg.addColorStop(1, '#2b1a0f');
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    for (const [x, y, r, col] of [[160, 180, 520, 'rgba(90, 170, 110, 0.22)'], [960, 1120, 620, 'rgba(244, 170, 80, 0.24)']]) {
      const gl = g.createRadialGradient(x, y, 0, x, y, r);
      gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl; g.fillRect(0, 0, W, Hh);
    }
    g.strokeStyle = 'rgba(255, 220, 170, 0.05)'; g.lineWidth = 1;
    for (let x = 0; x <= W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); }
    for (let y = 0; y <= Hh; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const accent = g.createLinearGradient(60, 0, W - 60, 0);
    accent.addColorStop(0, '#f6d27e'); accent.addColorStop(1, '#e38a4a');

    // header
    text('PALETTERIDER  ·  MIND GAMES', 64, 92, `600 26px ${MONO}`, '#f4c562', 'left', 3);
    text(info.title, 64, 160, `700 64px ${UI}`, '#ffffff', 'left');
    round(W - 64 - 196, 104, 196, 58, 29);
    g.fillStyle = 'rgba(111, 220, 154, 0.14)'; g.fill();
    g.strokeStyle = '#6fdc9a'; g.lineWidth = 2; g.stroke();
    text('✓ SOLVED', W - 64 - 98, 143, `700 24px ${MONO}`, '#6fdc9a', 'center', 2);

    // the game itself, as it looks right now, in a glowing frame
    composer.render();
    const src = renderer.domElement, sw = src.width, sh = src.height;
    const bx = 64, by = 200, bw = W - 128, bh = 500;
    const zoom = sw > sh * 1.2 ? 1.45 : 1; // on a wide screen, closer in than the game view
    const k = Math.max(bw / sw, bh / sh) * zoom, cw = bw / k, ch = bh / k;
    g.save();
    g.shadowColor = 'rgba(244, 197, 98, 0.4)'; g.shadowBlur = 40;
    round(bx, by, bw, bh, 30); g.fillStyle = '#000'; g.fill();
    g.restore();
    g.save(); round(bx, by, bw, bh, 30); g.clip();
    g.drawImage(src, (sw - cw) / 2, Math.min(sh - ch, Math.max(0, sh * info.focusY - ch / 2)), cw, ch, bx, by, bw, bh);
    const fade = g.createLinearGradient(0, by + bh * 0.6, 0, by + bh);
    fade.addColorStop(0, 'rgba(30,20,10,0)'); fade.addColorStop(1, 'rgba(30,20,10,0.55)');
    g.fillStyle = fade; g.fillRect(bx, by, bw, bh);
    g.restore();
    round(bx, by, bw, bh, 30); g.strokeStyle = accent; g.lineWidth = 4; g.stroke();
    g.font = `700 22px ${MONO}`; g.letterSpacing = '2px';
    const chipW = g.measureText(info.chip).width + 48;
    g.letterSpacing = '0px';
    round(bx + 24, by + bh - 70, chipW, 46, 23); g.fillStyle = 'rgba(30, 20, 10, 0.8)'; g.fill();
    text(info.chip, bx + 24 + chipW / 2, by + bh - 38, `700 22px ${MONO}`, '#ffffff', 'center', 2);

    // the time, big
    text('TIME', W / 2, 790, `600 24px ${MONO}`, 'rgba(250, 232, 205, 0.62)', 'center', 8);
    g.save();
    g.shadowColor = 'rgba(244, 197, 98, 0.6)'; g.shadowBlur = 36;
    text(fmtTime(S.time), W / 2, 930, `700 156px ${MONO}`, '#fff6e6', 'center');
    g.restore();
    if (newBest) {
      round(W / 2 - 200, 960, 400, 54, 27); g.fillStyle = accent; g.fill();
      text('★  NEW PERSONAL BEST', W / 2, 996, `700 24px ${MONO}`, '#2a1708', 'center', 2);
    }

    // three stat tiles
    const ty = 1046, tw = (W - 128 - 2 * 20) / 3, th = 150;
    info.tiles.forEach(([label, value, sub, style], i) => {
      const tx = 64 + i * (tw + 20);
      round(tx, ty, tw, th, 22);
      g.fillStyle = 'rgba(255, 236, 205, 0.07)'; g.fill();
      g.strokeStyle = 'rgba(255, 226, 180, 0.2)'; g.lineWidth = 2; g.stroke();
      text(label, tx + 26, ty + 42, `600 20px ${MONO}`, 'rgba(250, 232, 205, 0.62)', 'left', 3);
      const font = style === 'mono' ? `700 54px ${MONO}` : style === 'stars' ? `700 46px ${UI}` : `700 44px ${UI}`;
      g.save(); g.beginPath(); g.rect(tx, ty, tw - 10, th); g.clip();
      text(value, tx + 26, ty + 100, font, style === 'stars' ? '#ffd21f' : '#ffffff', 'left');
      text(sub, tx + 26, ty + 132, `500 20px ${UI}`, 'rgba(250, 232, 205, 0.55)', 'left');
      g.restore();
    });

    // who played, and where to play
    const ay = 1262;
    const av = g.createLinearGradient(64, ay - 30, 124, ay + 30);
    av.addColorStop(0, `hsl(${me.bike}, 80%, 60%)`); av.addColorStop(1, `hsl(${me.dress}, 75%, 50%)`);
    g.fillStyle = av; g.beginPath(); g.arc(94, ay, 30, 0, Math.PI * 2); g.fill();
    const initials = me.name.replace(/^Guest\s+/, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    text(initials, 94, ay + 9, `700 24px ${UI}`, '#ffffff');
    text(me.name, 140, ay - 4, `700 28px ${UI}`, '#ffffff', 'left');
    text(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), 140, ay + 30, `500 22px ${UI}`, 'rgba(250, 232, 205, 0.55)', 'left');
    text('Can you beat it?', W - 64, ay - 4, `700 28px ${UI}`, '#ffffff', 'right');
    text(SITE, W - 64, ay + 30, `600 22px ${MONO}`, '#f4c562', 'right');
    g.fillStyle = accent; g.fillRect(0, Hh - 10, W, 10);
    return c;
  }
  let cardCanvas = null, cardInfo = null;
  async function showCard() {
    cardShown = true;
    // the card's lettering needs its fonts in place before it is drawn
    try { await Promise.race([Promise.all([document.fonts.load(`700 64px ${UI}`), document.fonts.load(`700 64px ${MONO}`), document.fonts.load(`500 20px ${UI}`), document.fonts.load(`600 20px ${MONO}`)]), new Promise((r) => setTimeout(r, 1500))]); } catch { /* system fonts will do */ }
    if (!active) return;
    cardInfo = game.card();
    cardCanvas = makeCard(cardInfo);
    $('mindCard').src = cardCanvas.toDataURL('image/png');
    $('mindDone').classList.add('on');
    $('mindShare').style.display = navigator.share ? '' : 'none';
    $('mindSave').classList.toggle('main', !navigator.share); // the lead button when there is no sharing
  }
  const cardBlob = () => new Promise((res) => cardCanvas.toBlob(res, 'image/png'));
  const fileName = () => `paletterider-${cardInfo.file}-${fmtTime(game.S.time).replace(/[:.]/g, '-')}.png`;
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
    const text = `${cardInfo.share(fmtTime(game.S.time))} Can you beat it? https://${SITE}/`;
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share) await navigator.share({ text, url: `https://${SITE}/` });
      else await saveCard();
    } catch (e) {
      if (e?.name !== 'AbortError') saveCard();
    }
  }

  // ---------- input ----------
  const el = renderer.domElement;
  for (const [ev, type] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up']]) {
    el.addEventListener(ev, (e) => { if (active && !game.S.done) game.pointer(type, e); });
  }
  addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Escape') {
      e.stopImmediatePropagation();
      if ($('mindPeek').classList.contains('on')) peek(false); else leave();
      return;
    }
    if (e.code === 'KeyG') { peek(); return; }
    if (game.S.done) { if (e.code === 'Enter' && cardShown) { game.setup(); restart(); } return; }
    if (e.code === 'KeyR') { game.setup(); restart(); return; }
    game.key(e);
  }, true);
  // the finished picture, large, for as long as the player wants to look
  const peek = (on = !$('mindPeek').classList.contains('on')) => $('mindPeek').classList.toggle('on', on && !!game.refImage);
  $('mindGoalBtn').onclick = (e) => { peek(); e.currentTarget.blur(); };
  $('mindRefBox').onclick = () => peek(true);
  $('mindPeek').onclick = () => peek(false);
  $('mindRestart').onclick = (e) => { game.setup(); restart(); e.currentTarget.blur(); };
  $('mindLeave').onclick = () => leave();
  $('mindDoneLeave').onclick = () => leave();
  $('mindAgain').onclick = () => { game.setup(); restart(); };
  $('mindSave').onclick = saveCard;
  $('mindShare').onclick = shareCard;

  function open(kind = 'hanoi') {
    if (active) return;
    active = true;
    game = GAMES[kind] || hanoi;
    $('mindGameName').textContent = game.name;
    $('mindHint').innerHTML = game.hint;
    game.setup();
    restart();
    $('mind').classList.add('on');
  }
  function leave() {
    if (!active) return;
    active = false;
    game.leave?.();
    peek(false);
    $('mind').classList.remove('on', 'playing');
    $('mindDone').classList.remove('on');
    onLeave?.();
  }

  // ---------- each frame ----------
  function update(dt, t) {
    // the pennant ripples, the holograms turn
    const pos = flagGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = flagBase[i * 3];
      pos.setZ(i, Math.sin(t * 3 - x * 2.2) * 0.12 * (x / 2.4));
    }
    pos.needsUpdate = true;
    holos.forEach((h, i) => { h.rotation.set(t * 0.4 + i, t * 0.6 + i, 0); h.position.y = 1.55 + Math.sin(t * 1.6 + i * 2) * 0.06; });
    hanoi.update(dt, t);
    slide.update(dt, t);
    memory.update(dt, t);
    if (!active) return;
    const S = game.S;
    if (S.started && !S.done) S.time += dt; // game time: stops whenever the game does
    if (S.done && !cardShown && doneAt > 0 && (doneAt -= dt) <= 0) showCard();
    const h = game.hud();
    $('mindTime').textContent = fmtTime(S.time);
    $('mindMoves').textContent = h.moves;
    $('mindMinN').textContent = h.max;
    $('mindMovesLabel').textContent = h.label;
    $('mindBarFill').style.width = `${Math.min(1, h.moves / h.max) * 100}%`;
    $('mindBarFill').classList.toggle('over', h.moves > h.max);
    const st = S.done ? 'solved' : S.started ? 'live' : 'ready';
    if ($('mindLive').dataset.s !== st) {
      $('mindLive').dataset.s = st;
      $('mindLive').textContent = st === 'solved' ? 'SOLVED' : st === 'live' ? 'LIVE' : 'READY';
      $('mind').classList.toggle('playing', st !== 'ready');
    }
  }
  const cameraPose = (pos, look) => game.cameraPose(pos, look);

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
    hit = pushBox(L, SLIDE_AT.x - 1.2, SLIDE_AT.x + 1.2, SLIDE_AT.z - 0.55, SLIDE_AT.z + 0.55) || hit;
    hit = pushBox(L, MEMORY_AT.x - 1.3, MEMORY_AT.x + 1.3, MEMORY_AT.z - 0.55, MEMORY_AT.z + 0.55) || hit;
    for (const s of SOON) hit = pushBox(L, s.x - 0.95, s.x + 0.95, s.z - 0.95, s.z + 0.95) || hit;
    if (hit) Object.assign(P, fromLocalXZ(L.x, L.z));
    return hit;
  }
  // what the player is standing next to, if anything
  function near(P) {
    if (Math.abs(P.x - at.x) > 12 || Math.abs(P.z - at.z) > 12) return null;
    const L = toLocal(P.x, P.z);
    if (Math.abs(L.x) < 2.8 && L.z > TABLE_Z && L.z < TABLE_Z + 4.2) return { kind: 'hanoi', label: hanoi.prompt };
    if (Math.abs(L.x - SLIDE_AT.x) < 1.7 && L.z > SLIDE_AT.z && L.z < SLIDE_AT.z + 4) return { kind: 'slide', label: slide.prompt };
    if (Math.abs(L.x - MEMORY_AT.x) < 1.7 && L.z > MEMORY_AT.z && L.z < MEMORY_AT.z + 4) return { kind: 'memory', label: memory.prompt };
    for (const s of SOON) if (Math.hypot(L.x - s.x, L.z - (s.z + 1.2)) < 1.6) return { kind: 'soon', label: `${s.name}: coming soon` };
    if (Math.abs(L.x) < 7.5 && L.z > -6 && L.z < 9) return { kind: 'pavilion' };
    return null;
  }
  // a good place to stand when arriving by the title screen's Mind Games button
  const doorway = () => ({ ...fromLocalXZ(0, 9.5), yaw: face + Math.PI });

  return { open, leave, update, cameraPose, pushOut, near, doorway, active: () => active, games: GAMES, game: () => game };
}
