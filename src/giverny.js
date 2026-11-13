// Chapter 3: Claude Monet's garden at Giverny, in the colours of "The Water Lily Pond" (1899):
// the lily pond with its green Japanese footbridge, weeping willows, long beds of flowers either
// side of an avenue of rose arches, and the pink house with green shutters at the top of it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { strokeTexture, spotTexture, tint } from './arles.js';

export const INFO = {
  id: 'ch3',
  title: 'PaletteRider',
  sub: 'Chapter 3 · Claude Monet · The Water Lily Pond · 1899',
  how: 'Monet\'s garden is in full bloom. Gather the loose flowers on your bicycle and carry them up to the <em>pink house</em> before dusk, and watch the water lilies open on the pond. Ride over the green bridges, under the rose arches and round the willows. The more you bring in one trip, the bigger the bonus — but land a jump badly and you spill half of them.',
  brief: 'Collect the flowers and carry them to the pink house before dusk. Left of the avenue is the 🧩 Mind Games pavilion: get off your bike and walk in to play.',
  painting: { file: 'water-lily-pond.jpg', alt: 'The Water Lily Pond (Bridge over a Pond of Water Lilies), a painting by Claude Monet, 1899', button: 'Ride into the painting' },
  goal: 'HOUSE',
  item: 'flower',
  icon: '✿',
  colors: [0xff6fa8, 0xffe066], // flowers by the paths, flowers up high
  glow: '#ffb3cf',
  timeLabel: 'Until dusk',
  menuCam: { r: 70, h: 30 },
  spawn: { x: 0, z: -70, yaw: 0 },
  bloom: 0.28,
  exposure: 0.92,
};

export const MON = { x: 0, z: -112 }; // the pink house
export const HILL_H = 0;
export const WORLD_R = 150;
export const SOFT_EDGE = true; // no wall: the garden melts into meadow and you are turned back
export const LAMP_COUNT = 24; // water lilies that open as flowers are delivered
export const MAP_SPAN = 340;
// the Mind Games pavilion (see mind.js), on the lawn west of the flower beds, its open front facing the avenue
export const MIND = { x: -68, z: -67, face: Math.PI / 2 };

const smoothRand = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rnd = smoothRand(1899);
const any = (list) => list[Math.floor(rnd() * list.length)];

// ---------- the plan of the garden ----------
const POND = { x: 0, z: 64, a: 52, b: 24 }; // an ellipse of water
const BRIDGES = [
  { x: -18, half: 26, peak: 3.4, wisteria: true }, // the Japanese footbridge
  { x: 26, half: 24, peak: 2.6, wisteria: false },
];
const BRIDGE_W = 2.3;
const MOUNDS = [{ x: -78, z: -38, r: 10, h: 2.6 }, { x: 80, z: 28, r: 9, h: 2.3 }, { x: 62, z: -70, r: 8, h: 2.1 }];
const ARCH_Z = [-96, -82, -68, -54, -40, -26, -12]; // rose arches over the avenue
// flower beds: long strips either side of the avenue, broken by cross paths
const BEDS = [];
for (const side of [-1, 1])
  for (let i = 0; i < 5; i++)
    for (const [z0, z1] of [[-98, -70], [-64, -36], [-30, -2]]) BEDS.push({ x0: side * (8 + 9 * i) - 3, x1: side * (8 + 9 * i) + 3, z0, z1 });

const inPond = (x, z) => ((x - POND.x) / POND.a) ** 2 + ((z - POND.z) / POND.b) ** 2;
const onBridge = (x, z, slack = 0) => BRIDGES.find((b) => Math.abs(x - b.x) < BRIDGE_W + slack && Math.abs(z - POND.z) < b.half);

export function heightAt(x, z) {
  const b = onBridge(x, z);
  if (b) return b.peak * 0.5 * (1 + Math.cos((Math.PI * (z - POND.z)) / b.half));
  let h = 0;
  for (const m of MOUNDS) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d < m.r) h += m.h * 0.5 * (1 + Math.cos((Math.PI * d) / m.r));
  }
  return h;
}

// Keep the rider out of the water (unless they are on a bridge) and between the bridge rails.
export function pushOut(P) {
  const b = onBridge(P.x, P.z, 0.5);
  if (b) {
    if (P.y > 0.25) P.x = Math.min(b.x + BRIDGE_W - 0.45, Math.max(b.x - BRIDGE_W + 0.45, P.x));
    return 0;
  }
  // the house is solid
  const hx = P.x - MON.x, hz = P.z - (MON.z - 0.2);
  if (Math.abs(hx) < 13.6 && Math.abs(hz) < 5.8 && P.y < 9) {
    if (13.6 - Math.abs(hx) < 5.8 - Math.abs(hz)) P.x = MON.x + Math.sign(hx) * 13.6;
    else P.z = MON.z - 0.2 + Math.sign(hz) * 5.8;
    if (P.grounded) P.speed *= 0.5;
    return 0;
  }
  const e = inPond(P.x, P.z);
  if (e < 1 && P.y < 1.2) {
    const k = 1.012 / Math.sqrt(Math.max(e, 0.0004)); // back to the nearest bit of bank
    P.x = POND.x + (P.x - POND.x) * k;
    P.z = POND.z + (P.z - POND.z) * k;
    if (P.grounded) P.speed *= 0.86;
    else { P.vx *= 0.5; P.vz *= 0.5; }
  }
  return 0;
}

export function blocked(x, y, z) {
  return Math.abs(x - MON.x) < 13 && Math.abs(z - MON.z) < 5.5 && y < 12;
}

// Where the next flower appears: along the garden paths, round the pond, on the bridges, or up
// under a rose arch where it takes a jump to reach.
export function starSpot() {
  const r = Math.random();
  let p;
  if (r < 0.14) {
    const b = BRIDGES[Math.floor(Math.random() * BRIDGES.length)];
    p = { x: b.x, z: POND.z + (Math.random() * 2 - 1) * b.half * 0.8 };
    return { ...p, y: heightAt(p.x, p.z) + 1.3, high: false };
  }
  if (r < 0.3) return { x: (Math.random() * 2 - 1) * 1.5, z: ARCH_Z[Math.floor(Math.random() * ARCH_Z.length)], y: 4.3, high: true };
  if (r < 0.38) {
    const m = MOUNDS[Math.floor(Math.random() * MOUNDS.length)];
    return { x: m.x, z: m.z, y: m.h + 3.6, high: true };
  }
  if (r < 0.62) {
    const a = Math.random() * Math.PI * 2; // the path round the pond
    p = { x: POND.x + Math.cos(a) * POND.a * 1.1, z: POND.z + Math.sin(a) * POND.b * 1.13 };
  } else if (r < 0.85) {
    const i = Math.floor(Math.random() * 6), side = Math.random() < 0.5 ? -1 : 1; // between the flower beds
    p = { x: i === 0 ? (Math.random() * 2 - 1) * 2 : side * (3.5 + 9 * i), z: -100 + Math.random() * 100 };
  } else {
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 105;
    p = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    if (inPond(p.x, p.z) < 1.25 || Math.hypot(p.x - MIND.x, p.z - MIND.z) < 13) return null;
  }
  if (onBridge(p.x, p.z, 1)) return null;
  return { ...p, y: heightAt(p.x, p.z) + 1.2, high: false };
}

// ---------- pieces ----------
const dummy = new THREE.Object3D(), col = new THREE.Color();
const flat = (geo) => geo.rotateX(-Math.PI / 2);
// paint a flat piece with a texture that repeats every `size` metres, wherever it lies
function planar(geo, size) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / size, p.getZ(i) / size);
  return geo;
}
const FLOWERS = [
  [0xff7fb0, 0xffb3d0, 0xe8508a, 0xfff0f5], // pinks
  [0xb070e0, 0x8a5fd0, 0xd0a8f0, 0xf0e0ff], // violets and irises
  [0xffd84a, 0xffb030, 0xfff0a0, 0xff8a3a], // yellows and oranges
  [0xe83a3a, 0xff6a50, 0xc82a48, 0xffa090], // poppy reds
  [0xffffff, 0xfff4d8, 0xf0e8ff, 0xffd8e8], // whites
  [0x5a8ae8, 0x86b0f0, 0xb8c8ff, 0x7a6ae0], // blues
];

function buildGround(scene) {
  const grass = strokeTexture('#6aa84a', ['#7fbf55', '#4f8f3c', '#93cc62', '#3f7a3a', '#a8d870', '#5a9a60', '#86b84a'], { len: 30, wid: 7, ang: Math.PI / 2, spread: 0.6, curve: 8 }, 1100);
  grass.repeat.set(250, 250);
  const lawn = new THREE.Mesh(flat(new THREE.PlaneGeometry(1600, 1600)), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  scene.add(lawn);

  // gravel paths: the avenue, the paths between the beds, the cross paths, the walk round the pond
  const gravel = strokeTexture('#d9c2a0', ['#e8d4b4', '#c8ae8a', '#f0e0c4', '#b89a78', '#e0b8a8', '#d0c4b0'], { len: 16, wid: 6, ang: 0, spread: 3.1, curve: 3 }, 900);
  const strips = [];
  const strip = (x0, x1, z0, z1) => strips.push(flat(new THREE.PlaneGeometry(x1 - x0, z1 - z0)).translate((x0 + x1) / 2, 0.03, (z0 + z1) / 2));
  strip(-3, 3, -104, 36); // the avenue, running on down to the pond
  for (const side of [-1, 1]) for (let i = 1; i <= 5; i++) strip(side * (3.5 + 9 * i) - 1.5, side * (3.5 + 9 * i) + 1.5, -100, 0);
  for (const z of [-67, -33, 3]) strip(-50, 50, z - 3, z + 3);
  strip(-58, -50, -70, -64); // on to the Mind Games pavilion
  strip(-120, 120, 12, 17); // the lane between the two gardens
  for (const b of BRIDGES) { strip(b.x - 2, b.x + 2, 17, POND.z - b.half + 1); strip(b.x - 2, b.x + 2, POND.z + b.half - 1, 104); }
  strip(-70, 70, 102, 106);
  const ring = flat(new THREE.RingGeometry(1.03, 1.2, 72, 1)).scale(POND.a, 1, POND.b).translate(POND.x, 0.03, POND.z);
  strips.push(ring);
  scene.add(new THREE.Mesh(planar(mergeGeometries(strips), 4.5), new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 })));

  // gentle grassy mounds to jump from
  for (const m of MOUNDS) {
    const geo = flat(new THREE.CircleGeometry(m.r, 28, 0, Math.PI * 2));
    const seg = new THREE.PlaneGeometry(m.r * 2, m.r * 2, 20, 20);
    flat(seg).translate(m.x, 0, m.z);
    const p = seg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)) + 0.02);
    seg.computeVertexNormals();
    geo.dispose();
    scene.add(new THREE.Mesh(planar(seg, 1600 / 250), lawn.material));
  }
}

function buildBeds(scene) {
  const soil = [];
  let count = 0;
  for (const b of BEDS) {
    soil.push(new THREE.BoxGeometry(b.x1 - b.x0, 0.3, b.z1 - b.z0).translate((b.x0 + b.x1) / 2, 0.15, (b.z0 + b.z1) / 2));
    b.n = Math.round((b.z1 - b.z0) * 9);
    count += b.n;
  }
  scene.add(new THREE.Mesh(mergeGeometries(soil), new THREE.MeshStandardMaterial({ color: 0x4a6a34, roughness: 1 })));
  // every blossom is one little faceted ball; a second, greener set is the leaves under them
  const bloomGeo = new THREE.IcosahedronGeometry(0.2, 1), leafGeo = new THREE.IcosahedronGeometry(0.36, 0);
  const blooms = new THREE.InstancedMesh(bloomGeo, new THREE.MeshStandardMaterial({ roughness: 0.75, flatShading: true }), count);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), count);
  const GREENS = [0x3f8a3c, 0x5aa648, 0x2f7038, 0x78b850];
  let k = 0;
  for (const b of BEDS) {
    const palette = any(FLOWERS), second = any(FLOWERS);
    for (let i = 0; i < b.n; i++, k++) {
      const x = b.x0 + 0.35 + rnd() * (b.x1 - b.x0 - 0.7), z = b.z0 + 0.35 + rnd() * (b.z1 - b.z0 - 0.7);
      const tall = 0.55 + rnd() * rnd() * 1.1;
      dummy.position.set(x, tall, z);
      dummy.rotation.set(rnd() * 3, rnd() * 3, 0);
      dummy.scale.setScalar(0.55 + rnd() * 0.6);
      dummy.updateMatrix();
      blooms.setMatrixAt(k, dummy.matrix);
      blooms.setColorAt(k, col.set(any(rnd() < 0.75 ? palette : second)));
      dummy.position.set(x + (rnd() - 0.5) * 0.5, tall * 0.45, z + (rnd() - 0.5) * 0.5);
      dummy.scale.set(1, 0.9 + tall * 0.5, 1);
      dummy.updateMatrix();
      leaves.setMatrixAt(k, dummy.matrix);
      leaves.setColorAt(k, col.set(any(GREENS)));
    }
  }
  scene.add(blooms, leaves);

  // rose arches over the avenue, thick with roses
  const metal = new THREE.MeshStandardMaterial({ color: 0x2f7a52, roughness: 0.6 });
  const hoops = ARCH_Z.map((z) => new THREE.TorusGeometry(3.5, 0.09, 6, 20, Math.PI).translate(0, 0.4, z));
  for (const z of ARCH_Z) for (const x of [-3.5, 3.5]) hoops.push(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 6).translate(x, 0.2, z));
  scene.add(new THREE.Mesh(mergeGeometries(hoops.map((g) => g.toNonIndexed())), metal));
  const PER = 110;
  const roses = new THREE.InstancedMesh(bloomGeo, blooms.material, ARCH_Z.length * PER);
  const ROSE = [0xff6f9a, 0xe83a5a, 0xffa8c0, 0xfff0f0, 0xd82a48, 0x5aa648, 0x3f8a3c, 0x4f9a48, 0xff8ab0];
  ARCH_Z.forEach((z, a) => {
    for (let i = 0; i < PER; i++) {
      const t = rnd() * Math.PI, r = 3.5 + (rnd() - 0.5) * 0.45;
      dummy.position.set(Math.cos(t) * r, 0.4 + Math.sin(t) * r, z + (rnd() - 0.5) * 0.6);
      dummy.rotation.set(rnd() * 3, rnd() * 3, 0);
      dummy.scale.setScalar(0.7 + rnd() * 0.8);
      dummy.updateMatrix();
      roses.setMatrixAt(a * PER + i, dummy.matrix);
      roses.setColorAt(a * PER + i, col.set(any(ROSE)));
    }
  });
  scene.add(roses);
}

function buildHouse(scene) {
  const g = new THREE.Group();
  g.position.set(MON.x, 0, MON.z);
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const stucco = strokeTexture('#eeb0a8', ['#f6c4b8', '#e89c98', '#fad4c8', '#e0908c', '#f8e0d0', '#eaa8b4'], { len: 34, wid: 8, ang: Math.PI / 2, spread: 0.5, curve: 6 }, 900);
  stucco.repeat.set(4, 1.5);
  const pink = new THREE.MeshStandardMaterial({ map: stucco, roughness: 0.9 });
  const green = new THREE.MeshStandardMaterial({ color: 0x2f8a55, roughness: 0.7 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x7a86a0, roughness: 0.8, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0xf4ecd0, emissive: 0x6a5a30, roughness: 0.4 });
  add(new THREE.BoxGeometry(26, 7.4, 8), pink, 0, 3.7, -1);
  const roof = new THREE.ConeGeometry(Math.SQRT1_2, 3.4, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(27.2, 1, 9.4);
  add(roof, slate, 0, 9.1, -1);
  for (const cx of [-8, 8]) add(new THREE.BoxGeometry(1, 2.2, 1), pink, cx, 10, -1); // chimneys
  // two rows of windows with green shutters, and the green front door
  for (const y of [1.9, 5.3])
    for (let i = -4; i <= 4; i++) {
      if (y < 3 && i === 0) continue;
      const x = i * 2.75;
      add(new THREE.BoxGeometry(1.1, 1.8, 0.1), glass, x, y, 3.03);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 1.9, 0.08), green, x + s * 0.85, y, 3.06);
    }
  add(new THREE.BoxGeometry(1.5, 2.9, 0.12), green, 0, 1.45, 3.05);
  // the green veranda along the front, with steps down to the avenue
  add(new THREE.BoxGeometry(26, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0xd8c8b0, roughness: 1 }), 0, 0.15, 4.3);
  add(new THREE.BoxGeometry(26, 0.12, 0.12), green, 0, 1.25, 5.5);
  for (let i = -6; i <= 6; i++) if (Math.abs(i) > 0) add(new THREE.BoxGeometry(0.1, 1.1, 0.1), green, i * 2.1, 0.75, 5.5);
  // climbing roses up the front
  const climb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.24, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), 320);
  for (let i = 0; i < 320; i++) {
    const cx = any([-12.4, -6.9, 6.9, 12.4, -1.4, 1.4]);
    dummy.position.set(cx + (rnd() - 0.5) * 1.3, 0.4 + rnd() * 6.6, 3.2 + rnd() * 0.3);
    dummy.rotation.set(rnd() * 3, rnd() * 3, 0);
    dummy.scale.setScalar(0.6 + rnd() * 0.7);
    dummy.updateMatrix();
    climb.setMatrixAt(i, dummy.matrix);
    climb.setColorAt(i, col.set(any([0xff6f9a, 0xffa8c0, 0xe83a5a, 0x4f9a48, 0x3f8a3c, 0x5aa648, 0xfff0f0])));
  }
  g.add(climb);
  // a beam so the house can be found from anywhere in the garden
  const beam = add(
    new THREE.CylinderGeometry(1.2, 1.2, 300, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd0e0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    0, 160, -1
  );
  scene.add(g);
  return { beam };
}

function buildPond(scene) {
  const waterPaint = strokeTexture('#4f8f9a', ['#6fb0b8', '#3f7a8a', '#8ac8c0', '#5a9a7a', '#a8d8d0', '#7a8ac8', '#4a8a6a', '#c8e8e0', '#9a8ad0'], { len: 44, wid: 7, ang: 0, spread: 0.18, curve: 4 }, 1200);
  waterPaint.repeat.set(9, 5);
  const water = new THREE.Mesh(
    flat(new THREE.CircleGeometry(1, 72)).scale(POND.a * 1.02, 1, POND.b * 1.02),
    new THREE.MeshStandardMaterial({ map: waterPaint, roughness: 0.25, metalness: 0.15, emissive: 0x123a40, emissiveIntensity: 0.5 })
  );
  water.position.set(POND.x, 0.05, POND.z);
  scene.add(water);

  // lily pads everywhere, and the blossoms: some always open, the rest open as flowers come home
  const where = () => {
    for (;;) {
      const x = POND.x + (rnd() * 2 - 1) * POND.a, z = POND.z + (rnd() * 2 - 1) * POND.b;
      if (inPond(x, z) < 0.86) return [x, z];
    }
  };
  const PADS = 230;
  const pads = new THREE.InstancedMesh(flat(new THREE.CircleGeometry(0.8, 9, 0.4, Math.PI * 2 - 0.8)), new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), PADS);
  for (let i = 0; i < PADS; i++) {
    const [x, z] = where();
    dummy.position.set(x, 0.09 + (i % 5) * 0.004, z);
    dummy.rotation.set(0, rnd() * 6.28, 0);
    dummy.scale.setScalar(0.6 + rnd() * 0.9);
    dummy.updateMatrix();
    pads.setMatrixAt(i, dummy.matrix);
    pads.setColorAt(i, col.set(any([0x4f9a50, 0x6ab45a, 0x3f8448, 0x86c06a, 0x5aa070])));
  }
  scene.add(pads);
  const petal = new THREE.ConeGeometry(0.34, 0.5, 6, 1, true).translate(0, 0.25, 0);
  const lilyMat = (hex) => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.25, roughness: 0.6, flatShading: true, side: THREE.DoubleSide });
  const LILY = [0xffffff, 0xffc8dc, 0xff9ac0, 0xfff0b8];
  const lily = () => {
    const m = new THREE.Mesh(petal, lilyMat(any(LILY)));
    const [x, z] = where();
    m.position.set(x, 0.12, z);
    m.rotation.x = Math.PI; // an open cup
    m.position.y = 0.6;
    scene.add(m);
    return m;
  };
  for (let i = 0; i < 26; i++) lily();
  const lilies = [];
  for (let i = 0; i < LAMP_COUNT; i++) {
    const m = lily();
    m.userData.open = 0;
    m.scale.setScalar(0.001);
    lilies.push(m);
  }

  // the bridges: an arched green deck with rails, and wisteria hanging over the Japanese one
  const green = new THREE.MeshStandardMaterial({ color: 0x3f9a68, roughness: 0.65 });
  const parts = [];
  const SEG = 16;
  for (const b of BRIDGES) {
    const h = (z) => heightAt(b.x, z);
    for (let i = 0; i < SEG; i++) {
      const z0 = POND.z - b.half + (i / SEG) * b.half * 2, z1 = z0 + (b.half * 2) / SEG;
      const h0 = h(z0 + 0.001), h1 = h(z1 - 0.001), len = Math.hypot(z1 - z0, h1 - h0), tilt = -Math.atan2(h1 - h0, z1 - z0);
      const at = (geo, x, lift) => parts.push(geo.rotateX(tilt).translate(b.x + x, (h0 + h1) / 2 + lift, (z0 + z1) / 2));
      at(new THREE.BoxGeometry(BRIDGE_W * 2, 0.16, len + 0.05), 0, -0.1); // deck
      for (const s of [-1, 1]) {
        at(new THREE.BoxGeometry(0.1, 0.1, len + 0.05), s * (BRIDGE_W - 0.1), 1.05); // top rail
        at(new THREE.BoxGeometry(0.07, 0.07, len + 0.05), s * (BRIDGE_W - 0.1), 0.55);
        parts.push(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(b.x + s * (BRIDGE_W - 0.1), h0 + 0.5, z0)); // post
      }
      if (b.wisteria && i % 2 === 0) {
        // the trellis overhead
        for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.09, 2.6, 0.09).translate(b.x + s * (BRIDGE_W - 0.1), h0 + 2.3, z0));
        parts.push(new THREE.BoxGeometry(BRIDGE_W * 2, 0.09, 0.09).translate(b.x, h0 + 3.6, z0));
      }
    }
    for (const s of [-1, 1]) for (const e of [-1, 1]) parts.push(new THREE.BoxGeometry(0.16, 1.4, 0.16).translate(b.x + s * (BRIDGE_W - 0.1), 0.7, POND.z + e * b.half));
  }
  scene.add(new THREE.Mesh(mergeGeometries(parts), green));
  const jb = BRIDGES[0];
  const WIST = 700;
  const wist = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), WIST);
  for (let i = 0; i < WIST; i++) {
    const z = POND.z + (rnd() * 2 - 1) * jb.half * 0.95, edge = rnd() < 0.6;
    const x = jb.x + (edge ? (rnd() < 0.5 ? -1 : 1) * (BRIDGE_W - 0.1 + (rnd() - 0.5) * 0.5) : (rnd() * 2 - 1) * BRIDGE_W);
    dummy.position.set(x, heightAt(jb.x, z) + 3.65 - (edge ? rnd() * rnd() * 1.3 : rnd() * 0.25), z);
    dummy.rotation.set(rnd() * 3, rnd() * 3, 0);
    dummy.scale.set(0.8 + rnd() * 0.5, 1 + rnd() * 1.4, 0.8 + rnd() * 0.5);
    dummy.updateMatrix();
    wist.setMatrixAt(i, dummy.matrix);
    wist.setColorAt(i, col.set(any([0xb48ae8, 0x9a70d8, 0xd0b0f4, 0x7a5ac8, 0x5aa648, 0x4a9040, 0xe8d8ff])));
  }
  scene.add(wist);

  // irises and reeds along the bank
  const BANK = 900;
  const bank = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 1, 4).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), BANK);
  for (let i = 0; i < BANK; i++) {
    const a = rnd() * 6.28, out = 0.97 + rnd() * 0.05;
    const x = POND.x + Math.cos(a) * POND.a * out, z = POND.z + Math.sin(a) * POND.b * out;
    if (onBridge(x, z, 1.2)) { dummy.scale.setScalar(0.001); } else dummy.scale.set(1, 0.7 + rnd() * 1.3, 1);
    dummy.position.set(x, 0, z);
    dummy.rotation.set((rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3);
    dummy.updateMatrix();
    bank.setMatrixAt(i, dummy.matrix);
    bank.setColorAt(i, col.set(any([0x3f8a3c, 0x5aa648, 0x2f7038, 0x78b850, 0x4f9a48, 0x6ab45a, 0x8a5fd0, 0xb070e0, 0xffd84a])));
  }
  scene.add(bank);
  return { waterPaint, lilies };
}

function buildTrees(scene) {
  const leafPaint = strokeTexture('#b8d0a0', ['#d8ecc0', '#8ab078', '#c8e0a0', '#6a9860', '#e8f0c8', '#a0c890'], { len: 32, wid: 9, ang: Math.PI / 2, spread: 0.6, curve: 12 }, 700);
  leafPaint.repeat.set(3, 3);
  const leafMat = new THREE.MeshStandardMaterial({ map: leafPaint, vertexColors: true, flatShading: true, roughness: 1 });
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1 });
  const crowns = [], trunks = [];
  const ball = (x, y, z, sx, sy, sz, hex) => crowns.push(tint(new THREE.SphereGeometry(1, 8, 6).scale(sx, sy, sz).translate(x, y, z), hex));
  // weeping willows round the pond: a dome of leaves with long curtains hanging to the water
  const WILLOW = [0x8ab858, 0x9ac868, 0x78a850, 0xa8d070];
  for (const [x, z] of [[-60, 44], [-52, 92], [0, 100], [58, 88], [62, 42], [4, 30]]) {
    trunks.push(new THREE.CylinderGeometry(0.45, 0.7, 6, 7).translate(x, 3, z));
    ball(x, 8.4, z, 5.4, 3.2, 5.4, any(WILLOW));
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * 6.28 + rnd() * 0.2, r = 4.2 + rnd() * 1.4, drop = 4.5 + rnd() * 3;
      crowns.push(tint(new THREE.ConeGeometry(0.75, drop, 5).rotateX(Math.PI).translate(x + Math.cos(a) * r, 8.2 - drop / 2, z + Math.sin(a) * r), any(WILLOW)));
    }
  }
  // round trees and poplars at the edges of the garden and out in the meadow
  const GREENS = [0x4f9a48, 0x5aa850, 0x3f8440, 0x78b860, 0x6aa040, 0x8ab848];
  for (let i = 0; i < 170; i++) {
    const a = rnd() * 6.28, r = 122 + rnd() * rnd() * 210;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - MON.x, z - MON.z) < 22) continue;
    if (rnd() < 0.4) {
      const h = 12 + rnd() * 9; // a poplar
      crowns.push(tint(new THREE.ConeGeometry(1.6 + rnd(), h, 7).translate(x, h / 2 + 1.5, z), any(GREENS)));
      trunks.push(new THREE.CylinderGeometry(0.25, 0.3, 2, 6).translate(x, 1, z));
    } else {
      const s = 3 + rnd() * 2.6;
      trunks.push(new THREE.CylinderGeometry(0.3, 0.42, 4, 6).translate(x, 2, z));
      ball(x, 4 + s * 0.8, z, s, s * 0.85, s, any(GREENS));
      ball(x + s * 0.5, 4 + s * 0.5, z + s * 0.3, s * 0.7, s * 0.6, s * 0.7, any(GREENS));
    }
  }
  // blossom trees among the flower beds
  for (const [x, z] of [[-56, -86], [56, -86], [-58, -50], [58, -50], [-56, -14], [56, -14], [-30, 24], [34, 24]]) {
    trunks.push(new THREE.CylinderGeometry(0.22, 0.3, 3, 6).translate(x, 1.5, z));
    const hex = any([0xffc0d8, 0xffe0ec, 0xf8a8c8, 0xfff4f8]);
    ball(x, 4.6, z, 2.8, 2.2, 2.8, hex);
    ball(x + 1.2, 4, z + 0.8, 1.8, 1.5, 1.8, hex);
  }
  scene.add(new THREE.Mesh(mergeGeometries(crowns.map((g) => (g.index ? g.toNonIndexed() : g))), leafMat));
  scene.add(new THREE.Mesh(mergeGeometries(trunks), bark));
}

// The painter at his easel by the pond, looking at the bridge.
function buildPainter(scene) {
  const g = new THREE.Group();
  g.position.set(-44, 0, 36);
  g.rotation.y = Math.atan2(BRIDGES[0].x + 44, POND.z - 36);
  const part = (geo, hex, x, y, z) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85 }));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  part(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), 0xe8e4d8, 0, 1.2, 0); // pale jacket
  part(new THREE.CapsuleGeometry(0.11, 0.72, 4, 8), 0x8a8a90, -0.1, 0.47, 0);
  part(new THREE.CapsuleGeometry(0.11, 0.72, 4, 8), 0x8a8a90, 0.1, 0.47, 0);
  part(new THREE.SphereGeometry(0.14, 12, 10), 0xe8c0a0, 0, 1.72, 0);
  part(new THREE.SphereGeometry(0.15, 10, 8), 0xf0f0f0, 0, 1.6, 0.08).scale.set(1, 1.2, 0.7); // the big white beard
  part(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 16), 0xe8d8a0, 0, 1.84, 0); // straw hat
  part(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 12), 0xe8d8a0, 0, 1.9, 0);
  const arm = part(new THREE.CapsuleGeometry(0.06, 0.55, 4, 8), 0xe8e4d8, 0.3, 1.35, 0.25);
  arm.rotation.x = -1.2;
  // easel and canvas
  for (const [x, z, lean] of [[-0.35, 0.95, 0.12], [0.35, 0.95, 0.12], [0, 1.45, -0.28]]) part(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 5), 0x7a5a3a, x, 0.95, z).rotation.x = lean;
  const canvas = part(new THREE.BoxGeometry(0.9, 0.7, 0.04), 0xf4f0e4, 0, 1.35, 0.98);
  canvas.rotation.x = -0.12;
  const picture = part(new THREE.PlaneGeometry(0.8, 0.6), 0xffffff, 0, 1.35, 0.955);
  picture.rotation.set(-0.12 + Math.PI, 0, Math.PI);
  picture.material = new THREE.MeshBasicMaterial({ map: strokeTexture('#5a9a8a', ['#7ab8a8', '#4f8a6a', '#a8d8c0', '#3f9a68', '#ffc8dc', '#8a8ad0'], { len: 30, wid: 9, ang: 0, spread: 0.4 }, 300) });
  scene.add(g);
}

// ---------- visitors ----------
// People strolling the paths in summer whites and straw hats, some under a parasol.
function buildVisitors(scene) {
  const N = 46;
  const geo = {
    torso: new THREE.CapsuleGeometry(0.15, 0.3, 4, 12).scale(1.3, 1, 0.85).translate(0, 1.2, 0),
    skirt: new THREE.ConeGeometry(0.34, 0.95, 10, 1, true).translate(0, 0.52, 0),
    head: new THREE.SphereGeometry(0.115, 14, 12).scale(0.92, 1.12, 1).translate(0, 1.64, 0),
    hat: new THREE.CylinderGeometry(0.26, 0.28, 0.04, 14).translate(0, 1.76, 0),
    arm: new THREE.CapsuleGeometry(0.045, 0.5, 4, 8).translate(0, -0.29, 0),
    leg: new THREE.CapsuleGeometry(0.07, 0.72, 4, 8).translate(0, -0.43, 0),
    parasol: new THREE.ConeGeometry(0.75, 0.3, 10, 1, true).translate(0, 2.25, 0.1),
    stick: new THREE.CylinderGeometry(0.015, 0.015, 1, 4).translate(0, 1.75, 0.1),
  };
  const inst = (g, n, side) => {
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.85, side: side ? THREE.DoubleSide : THREE.FrontSide }), n);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const torsos = inst(geo.torso, N), skirts = inst(geo.skirt, N, true), heads = inst(geo.head, N), hats = inst(geo.hat, N);
  const arms = inst(geo.arm, N * 2), legs = inst(geo.leg, N * 2), parasols = inst(geo.parasol, N, true), sticks = inst(geo.stick, N);
  const DRESS = ['#ffffff', '#f4ecd8', '#dce8f8', '#f8d8e0', '#e8e0f4', '#f0e8c0', '#c8dcf0', '#3a4a6a', '#5a4a40'];
  const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#d9a27a'];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const folk = [];
  for (let i = 0; i < N; i++) {
    const kind = i < 18 ? 'ring' : i < 30 ? 'avenue' : i < 38 ? 'lane' : 'bed';
    const f = {
      kind, s: rnd(), v: (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.7), h: 0.9 + rnd() * 0.18, walk: rnd() * 6.28, hop: 0,
      off: (rnd() - 0.5) * 2.2, row: (rnd() < 0.5 ? -1 : 1) * (3.5 + 9 * (1 + Math.floor(rnd() * 5))),
      dress: rnd() < 0.5, shade: rnd() < 0.4,
    };
    folk.push(f);
    const coat = any(DRESS);
    torsos.setColorAt(i, col.set(coat));
    skirts.setColorAt(i, col.set(coat));
    heads.setColorAt(i, col.set(any(SKIN)));
    hats.setColorAt(i, col.set(any(['#e8d8a0', '#f4ecd0', '#d8c080', '#ffffff'])));
    parasols.setColorAt(i, col.set(any(['#ffffff', '#fff0c8', '#ffd8e4', '#d8ecff', '#f0d8ff'])));
    sticks.setColorAt(i, col.set('#6a5a4a'));
    for (const k of [0, 1]) {
      arms.setColorAt(i * 2 + k, col.set(coat));
      legs.setColorAt(i * 2 + k, col.set(any(['#e8e4d8', '#8a8a90', '#5a5a66'])));
    }
    if (!f.dress) skirts.setMatrixAt(i, zero);
    if (!f.shade) { parasols.setMatrixAt(i, zero); sticks.setMatrixAt(i, zero); }
  }
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), world = new THREE.Matrix4();
  const limb = (mesh, idx, px, py, rx) => {
    local.makeRotationX(rx).setPosition(px, py, 0);
    mesh.setMatrixAt(idx, world.multiplyMatrices(base, local));
  };
  return (dt, P) => {
    let hopped = false;
    for (let i = 0; i < N; i++) {
      const f = folk[i];
      let x, z, yaw;
      if (f.kind === 'ring') {
        // round and round the pond
        f.s += (f.v * dt) / 250;
        const a = f.s * 6.283, rx = POND.a * 1.115 + f.off * 0.6, rz = POND.b * 1.115 + f.off * 0.6 + 1.2;
        x = POND.x + Math.cos(a) * rx; z = POND.z + Math.sin(a) * rz;
        yaw = Math.atan2(-Math.sin(a) * rx, Math.cos(a) * rz) + (f.v < 0 ? Math.PI : 0);
        if (BRIDGES.some((b) => Math.abs(x - b.x) < 3.4 && Math.abs(Math.abs(z - POND.z) - b.half) < 5)) z += Math.sign(z - POND.z) * 2.2; // step round the bridge ends
      } else {
        // up and down a straight path
        const [a0, a1] = f.kind === 'avenue' ? [-100, 10] : f.kind === 'lane' ? [-110, 110] : [-98, -2];
        f.s += (f.v * dt) / (a1 - a0);
        if (f.s < 0 || f.s > 1) { f.v = -f.v; f.s = Math.min(1, Math.max(0, f.s)); }
        const along = a0 + f.s * (a1 - a0);
        if (f.kind === 'lane') { x = along; z = 14.5 + f.off; yaw = f.v > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { x = f.kind === 'avenue' ? f.off : f.row + f.off * 0.4; z = along; yaw = f.v > 0 ? 0 : Math.PI; }
      }
      if (f.hop > 0) f.hop -= dt;
      else if (P && Math.abs(P.speed) > 3 && P.y < 3 && Math.hypot(x - P.x, z - P.z) < 3.2) { f.hop = 0.55; hopped = true; }
      const hopping = f.hop > 0;
      f.walk += Math.abs(f.v) * dt * 3.4;
      const swing = Math.sin(f.walk) * 0.45;
      dummy.position.set(x, Math.abs(Math.sin(f.walk)) * 0.03 + (hopping ? Math.sin((f.hop / 0.55) * Math.PI) * 1.1 : 0), z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(f.h);
      dummy.updateMatrix();
      base.copy(dummy.matrix);
      torsos.setMatrixAt(i, base);
      heads.setMatrixAt(i, base);
      hats.setMatrixAt(i, base);
      if (f.dress) skirts.setMatrixAt(i, base);
      if (f.shade) { parasols.setMatrixAt(i, base); sticks.setMatrixAt(i, base); }
      limb(legs, i * 2, -0.085, 0.9, hopping ? -0.5 : swing);
      limb(legs, i * 2 + 1, 0.085, 0.9, hopping ? 0.3 : -swing);
      limb(arms, i * 2, -0.245, 1.44, hopping ? -2.7 : -swing * 0.8);
      limb(arms, i * 2 + 1, 0.245, 1.44, hopping ? -2.7 : f.shade ? -1.5 : swing * 0.8); // one hand holds the parasol
    }
    for (const m of [torsos, skirts, heads, hats, arms, legs, parasols, sticks]) m.instanceMatrix.needsUpdate = true;
    return hopped;
  };
}

// ---------- sky ----------
function buildSky(scene) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#4f8fe0'); grad.addColorStop(0.3, '#7fb4ee'); grad.addColorStop(0.44, '#b4d6f4'); grad.addColorStop(0.5, '#e6eee0'); grad.addColorStop(1, '#e6eee0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  // soft clouds made of short strokes of white, cream and a little pink
  const r = smoothRand(77);
  for (let i = 0; i < 26; i++) {
    const cx = r() * 1024, cy = 90 + r() * 140, w = 40 + r() * 90;
    for (let k = 0; k < 60; k++) {
      g.fillStyle = ['rgba(255,255,255,0.55)', 'rgba(255,246,232,0.5)', 'rgba(255,230,236,0.35)', 'rgba(236,244,255,0.45)'][Math.floor(r() * 4)];
      const x = cx + (r() - 0.5) * w * 2, y = cy + (r() - 0.5) * w * 0.45;
      g.beginPath(); g.ellipse(x, y, 10 + r() * 16, 3 + r() * 4, (r() - 0.5) * 0.4, 0, Math.PI * 2); g.fill();
      if (x > 1000) { g.beginPath(); g.ellipse(x - 1024, y, 14, 4, 0, 0, Math.PI * 2); g.fill(); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 40, 20), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -2;
  scene.add(dome);
  return dome;
}

// ---------- map ----------
export function drawMap(g, S) {
  const k = S / MAP_SPAN, c = S / 2;
  g.fillStyle = '#3f7a44';
  g.fillRect(0, 0, S, S);
  const rim = g.createRadialGradient(c, c, 140 * k, c, c, 168 * k);
  rim.addColorStop(0, '#74b458'); rim.addColorStop(1, 'rgba(116,180,88,0)');
  g.fillStyle = rim;
  g.beginPath(); g.arc(c, c, 168 * k, 0, Math.PI * 2); g.fill();
  const box = (x0, x1, z0, z1) => g.fillRect(c + x0 * k, c + z0 * k, (x1 - x0) * k, (z1 - z0) * k);
  g.fillStyle = '#e6d2b0'; // paths
  box(-3, 3, -104, 36);
  for (const z of [-67, -33, 3]) box(-50, 50, z - 2.5, z + 2.5);
  box(-58, -50, -69.5, -64.5);
  box(-120, 120, 12, 17);
  box(-70, 70, 102, 106);
  g.strokeStyle = '#e6d2b0'; g.lineWidth = 5 * k;
  g.beginPath(); g.ellipse(c + POND.x * k, c + POND.z * k, POND.a * 1.11 * k, POND.b * 1.13 * k, 0, 0, Math.PI * 2); g.stroke();
  const BED = ['#ff8ab8', '#b080e0', '#ffd24a', '#f05a50', '#ffffff', '#7aa0f0'];
  BEDS.forEach((b, i) => { g.fillStyle = BED[i % BED.length]; box(b.x0, b.x1, b.z0, b.z1); });
  g.fillStyle = '#5aa6b4'; // the pond
  g.beginPath(); g.ellipse(c + POND.x * k, c + POND.z * k, POND.a * k, POND.b * k, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2f8a5a'; // bridges
  for (const b of BRIDGES) box(b.x - 2.6, b.x + 2.6, POND.z - b.half, POND.z + b.half);
  g.fillStyle = '#f0a8a8'; // the house
  box(MON.x - 13, MON.x + 13, MON.z - 5, MON.z + 3);
  g.fillStyle = '#7a86a0';
  box(MON.x - 13, MON.x + 13, MON.z - 5, MON.z - 3);
  // the Mind Games pavilion: a white square with a violet puzzle badge
  g.fillStyle = '#fbf8f2';
  box(MIND.x - 6, MIND.x + 6, MIND.z - 7, MIND.z + 7);
  g.fillStyle = '#7a4fc8';
  g.beginPath(); g.arc(c + MIND.x * k, c + MIND.z * k, 17, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
  g.font = '20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🧩', c + MIND.x * k, c + MIND.z * k + 1);
}

export function buildWorld(scene) {
  const fogDay = new THREE.Color(0xcfe4ee), fogDusk = new THREE.Color(0xf0b890);
  scene.fog = new THREE.FogExp2(fogDay.getHex(), 0.0026);
  const hemi = new THREE.HemisphereLight(0xe8f2ff, 0x7a9a58, 1.5);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.7);
  sun.position.set(-0.5, 0.9, 0.35);
  scene.add(hemi, sun);
  const skyDay = new THREE.Color(0xe8f2ff), skyDusk = new THREE.Color(0xffc8a0), sunDay = new THREE.Color(0xfff0d0), sunDusk = new THREE.Color(0xff9a5a);

  buildGround(scene);
  buildBeds(scene);
  const house = buildHouse(scene);
  const pond = buildPond(scene);
  buildTrees(scene);
  buildPainter(scene);
  const visitors = buildVisitors(scene);
  const dome = buildSky(scene);

  let lit = 0;
  return {
    // every delivered flower opens another water lily on the pond
    setDelivered(count) {
      lit = Math.min(LAMP_COUNT, count);
    },
    update(t, dt, camera, dawn, P) {
      dome.position.copy(camera.position);
      dome.rotation.y = t * 0.004; // the clouds drift
      dome.material.color.setRGB(1, 1 - dawn * 0.22, 1 - dawn * 0.42);
      scene.fog.color.copy(fogDay).lerp(fogDusk, dawn);
      hemi.color.copy(skyDay).lerp(skyDusk, dawn);
      sun.color.copy(sunDay).lerp(sunDusk, dawn);
      sun.intensity = 1.7 - dawn * 0.6;
      pond.waterPaint.offset.x = t * 0.004; // the water slides by very slowly
      pond.waterPaint.offset.y = Math.sin(t * 0.3) * 0.01;
      pond.lilies.forEach((m, i) => {
        const want = i < lit ? 1 : 0;
        m.userData.open += (want - m.userData.open) * Math.min(1, dt * 2.5);
        m.scale.setScalar(Math.max(0.001, m.userData.open * (1.5 + 0.08 * Math.sin(t * 2 + i))));
      });
      house.beam.material.opacity = 0.13 + 0.04 * Math.sin(t * 2);
      return { hop: visitors(dt, P) };
    },
  };
}
