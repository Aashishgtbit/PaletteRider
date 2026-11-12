// The painted city: streets, patchwork buildings, ramps and a castle,
// built in the colours and shapes of Paul Klee's "Castle and Sun" (1928).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const INFO = {
  title: 'PaletteRider',
  sub: 'Chapter 1 · Paul Klee · Castle and Sun · 1928',
  how: 'Little suns are scattered through the streets and over the rooftops. Gather them on your bicycle and carry them to the <em>castle</em> before dawn. Mind the traffic on the busy roads. The more you bring in one trip, the bigger the bonus — but land a jump badly and you spill half of them.',
  brief: 'Collect the little suns and carry them to the castle before dawn.',
  painting: { file: 'castle-and-sun.jpg', alt: 'Castle and Sun, a painting by Paul Klee, 1928', button: 'Ride into the painting' },
  goal: 'CASTLE',
  item: 'sun',
  icon: '☀',
  colors: [0xffd060, 0xff7a3c], // street suns, rooftop suns
  glow: '#ffc46b',
  menuCam: { r: 80, h: 46 },
};

export const MON = { x: 0, z: -72 }; // the castle
export const HILL_H = 4; // height of the castle mound
export const WORLD_R = 232;
export const LAMP_COUNT = 24;

const PITCH = 36; // one block + one street
const HALF_BLOCK = 12;
// streets that carry traffic: north-south ones at x = k*PITCH, east-west ones at z = k*PITCH
const CAR_Z = new Set([-4, -2, 2, 4]);
const CAR_X = new Set([-4, 0, 2, 4]);
export const traffic = []; // live cars, read by the map
const PALETTE = [
  '#c8372d', '#c8372d', '#e2582b', '#e2582b', '#ee8a2f', '#ee8a2f', '#f3c13a', '#f3c13a',
  '#f1dc8c', '#e79a8f', '#b8456b', '#7a3b22', '#8a8a3a', '#3f7d5a', '#2f6f8f', '#2a3f7a', '#6a4a8a', '#efe2c0',
];
const ROOF_COLS = [0xc8372d, 0xe2582b, 0xee8a2f, 0xf3c13a, 0xb8456b, 0x2f6f8f, 0xe79a8f];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry(1928);

// ---------- city plan ----------
const cells = new Map(); // "i,j" -> buildings standing in that block
const buildings = [];
const lowRoofs = [];
const ramps = [];

function planCity() {
  const height = () => {
    const r = rnd();
    if (r < 0.28) return 2.6 + rnd() * 1.6; // low: its roof can be ridden
    if (r < 0.88) return 7 + rnd() * 9;
    return 18 + rnd() * 12;
  };
  for (let i = -7; i <= 6; i++)
    for (let j = -7; j <= 6; j++) {
      const cx = (i + 0.5) * PITCH, cz = (j + 0.5) * PITCH;
      if (Math.hypot(cx, cz) > 214) continue;
      if (Math.hypot(cx - MON.x, cz - MON.z) < 40) continue; // the castle square
      const x0 = cx - HALF_BLOCK, x1 = cx + HALF_BLOCK, z0 = cz - HALF_BLOCK, z1 = cz + HALF_BLOCK;
      const sx = x0 + 9 + rnd() * 6, sz = z0 + 9 + rnd() * 6;
      const r = rnd();
      const lots =
        r < 0.2 ? [[x0, x1, z0, z1]]
        : r < 0.5 ? [[x0, sx, z0, z1], [sx, x1, z0, z1]]
        : r < 0.8 ? [[x0, x1, z0, sz], [x0, x1, sz, z1]]
        : [[x0, sx, z0, sz], [sx, x1, z0, sz], [x0, sx, sz, z1], [sx, x1, sz, z1]];
      const list = lots.map(([a, b, c, d]) => ({ x0: a, x1: b, z0: c, z1: d, top: height() }));
      cells.set(`${i},${j}`, list);
      buildings.push(...list);
    }
  for (const b of buildings) if (b.top < 5) lowRoofs.push(b);

  // jump ramps in the middle of some streets
  const tryRamp = (x, z, alongX) => {
    if (rnd() > 0.24) return;
    if ((alongX ? CAR_X : CAR_Z).has(Math.round((alongX ? z : x) / PITCH))) return; // no ramps on roads with traffic
    if (Math.hypot(x, z) > 200 || Math.hypot(x - MON.x, z - MON.z) < 50 || Math.hypot(x, z - 40) < 26) return;
    ramps.push({ x, z, alongX, peak: 2.6 + rnd() * 0.8 });
  };
  for (let k = -6; k <= 6; k++)
    for (let m = -7; m <= 6; m++) {
      tryRamp(k * PITCH, (m + 0.5) * PITCH, false);
      tryRamp((m + 0.5) * PITCH, k * PITCH, true);
    }
}
planCity();

const RAMP_LEN = 7, RAMP_W = 3;
function mound(x, z) {
  return HILL_H * (1 - smooth(16, 40, Math.hypot(x - MON.x, z - MON.z)));
}
function ground(x, z) {
  let h = mound(x, z);
  for (const r of ramps) {
    const a = Math.abs(r.alongX ? x - r.x : z - r.z), c = Math.abs(r.alongX ? z - r.z : x - r.x);
    if (a < RAMP_LEN && c < RAMP_W) h += r.peak * (1 - a / RAMP_LEN) * Math.min(1, RAMP_W - c);
  }
  return h;
}
function buildingAt(x, z) {
  const list = cells.get(`${Math.floor(x / PITCH)},${Math.floor(z / PITCH)}`);
  if (list) for (const b of list) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b;
  return null;
}

// Ground height. Pass the rider's own height as y to make rooftops count:
// a roof is solid ground only for someone already level with it.
export function heightAt(x, z, y) {
  let h = ground(x, z);
  if (y !== undefined) {
    const b = buildingAt(x, z);
    if (b && y >= b.top - 0.6) h = Math.max(h, b.top);
  }
  return h;
}

// Keep the rider out of walls. Glancing hits slide along the wall, head-on hits bounce.
// Returns how hard the bump was.
export function pushOut(P) {
  const list = cells.get(`${Math.floor(P.x / PITCH)},${Math.floor(P.z / PITCH)}`);
  if (!list) return 0;
  const m = 0.5;
  for (const b of list) {
    if (P.y >= b.top - 0.6) continue;
    if (!(P.x > b.x0 - m && P.x < b.x1 + m && P.z > b.z0 - m && P.z < b.z1 + m)) continue;
    const dl = P.x - (b.x0 - m), dr = b.x1 + m - P.x, dn = P.z - (b.z0 - m), df = b.z1 + m - P.z;
    const mn = Math.min(dl, dr, dn, df);
    let nx = 0, nz = 0;
    if (mn === dl) { P.x = b.x0 - m; nx = -1; }
    else if (mn === dr) { P.x = b.x1 + m; nx = 1; }
    else if (mn === dn) { P.z = b.z0 - m; nz = -1; }
    else { P.z = b.z1 + m; nz = 1; }
    if (!P.grounded) {
      if (nx && P.vx * nx < 0) P.vx = 0;
      if (nz && P.vz * nz < 0) P.vz = 0;
      return 0;
    }
    const dir = Math.sign(P.speed) || 1;
    const fx = Math.sin(P.yaw) * dir, fz = Math.cos(P.yaw) * dir;
    const into = -(fx * nx + fz * nz); // 1 = straight into the wall
    if (into <= 0) return 0;
    const hit = Math.abs(P.speed) * into;
    if (into > 0.85) {
      P.speed *= -0.3;
    } else {
      const tx = fx + nx * into, tz = fz + nz * into; // direction along the wall
      let turn = Math.atan2(tx * dir, tz * dir) - P.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      P.yaw += turn * 0.3;
      P.speed *= 1 - 0.25 * into;
    }
    return hit;
  }
  return 0;
}

// Is this point inside a building? (used to keep the camera out of walls)
export function blocked(x, y, z) {
  const list = cells.get(`${Math.floor(x / PITCH)},${Math.floor(z / PITCH)}`);
  if (list) for (const b of list) if (x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6 && y < b.top + 0.4) return true;
  return false;
}

// Where the next sun appears: a street, a low rooftop, or the top of a ramp.
export function starSpot() {
  const r = Math.random();
  if (r < 0.22 && lowRoofs.length) {
    const b = lowRoofs[Math.floor(Math.random() * lowRoofs.length)];
    return { x: b.x0 + 2 + Math.random() * (b.x1 - b.x0 - 4), z: b.z0 + 2 + Math.random() * (b.z1 - b.z0 - 4), y: b.top + 1.3, high: true };
  }
  if (r < 0.4 && ramps.length) {
    const p = ramps[Math.floor(Math.random() * ramps.length)];
    return { x: p.x, z: p.z, y: p.peak + 2.6, high: true };
  }
  const k = Math.floor(Math.random() * 13) - 6;
  const along = (Math.random() * 2 - 1) * 205, across = (Math.random() * 2 - 1) * 4;
  const p = Math.random() < 0.5 ? { x: k * PITCH + across, z: along } : { x: along, z: k * PITCH + across };
  if (Math.hypot(p.x, p.z) > 208) return null;
  return { ...p, y: ground(p.x, p.z) + 1.2, high: false };
}

// ---------- painting the surfaces ----------
function patchTexture(seed) {
  const r = mulberry(seed);
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#1c120e';
  g.fillRect(0, 0, S, S);
  const pick = () => PALETTE[Math.floor(r() * PALETTE.length)];
  const leaf = (x, y, w, h) => {
    g.fillStyle = pick();
    g.fillRect(x + 2, y + 2, w - 4, h - 4);
    const k = r();
    if (k < 0.18) {
      g.fillStyle = pick(); // a roof-shaped triangle
      g.beginPath();
      g.moveTo(x + 4, y + h - 4); g.lineTo(x + w / 2, y + 4); g.lineTo(x + w - 4, y + h - 4);
      g.fill();
    } else if (k < 0.28 && h > 50) {
      const aw = w * 0.42, ah = h * 0.6, ax = x + (w - aw) / 2; // an arched doorway
      g.fillStyle = '#22140f';
      g.fillRect(ax, y + h - 4 - ah + aw / 2, aw, ah - aw / 2);
      g.beginPath(); g.arc(ax + aw / 2, y + h - 4 - ah + aw / 2, aw / 2, Math.PI, 0); g.fill();
    } else if (k < 0.4) {
      g.fillStyle = r() < 0.5 ? '#22140f' : pick(); // a little window
      const s = Math.min(w, h) * 0.34;
      g.fillRect(x + (w - s) / 2, y + (h - s) / 2, s, s);
    }
  };
  const split = (x, y, w, h, depth) => {
    const big = Math.max(w, h);
    if (depth > 0 && (big > 150 || (big > 64 && r() < 0.75))) {
      if (w > h) { const k = w * (0.35 + r() * 0.3); split(x, y, k, h, depth - 1); split(x + k, y, w - k, h, depth - 1); }
      else { const k = h * (0.35 + r() * 0.3); split(x, y, w, k, depth - 1); split(x, y + k, w, h - k, depth - 1); }
      return;
    }
    leaf(x, y, w, h);
  };
  split(0, 0, S, S, 6);
  for (let i = 0; i < 3500; i++) {
    const v = r() < 0.5 ? 0 : 255; // brush grain
    g.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.05})`;
    g.fillRect(r() * S, r() * S, 3 + r() * 14, 1 + r() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A box whose faces repeat the patchwork every `tile` metres.
function paintedBox(w, h, d, tile) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const ou = rnd(), ov = rnd();
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile + ou, (uv.getY(i) * dims[f][1]) / tile + ov);
    }
  }
  return geo;
}

function tint(geo, hex) {
  const col = new THREE.Color(hex);
  const arr = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([col.r, col.g, col.b], i);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function pyramid(w, d, h, hex) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, h, 4);
  geo.rotateY(Math.PI / 4);
  geo.scale(w, 1, d);
  geo.translate(0, h / 2, 0);
  return tint(geo, hex);
}

function buildCity(scene, textures) {
  const byTex = textures.map(() => []);
  const roofs = [];
  for (const b of buildings) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const geo = paintedBox(w, b.top + 2, d, 10);
    geo.translate(cx, (b.top - 2) / 2, cz);
    byTex[Math.floor(rnd() * textures.length)].push(geo);
    if (b.top < 6.5) continue;
    const k = rnd(), col = ROOF_COLS[Math.floor(rnd() * ROOF_COLS.length)];
    if (k < 0.5) {
      roofs.push(pyramid(w * 0.92, d * 0.92, 2.5 + rnd() * 4, col).translate(cx, b.top, cz));
    } else if (k < 0.78) {
      const tw = Math.min(w, d) * 0.4, th = 2.5 + rnd() * 3;
      const turret = tint(new THREE.BoxGeometry(tw, th, tw), ROOF_COLS[Math.floor(rnd() * ROOF_COLS.length)]);
      roofs.push(turret.translate(cx, b.top + th / 2, cz), pyramid(tw * 1.25, tw * 1.25, tw * 0.9, col).translate(cx, b.top + th, cz));
    }
  }
  byTex.forEach((list, i) => {
    if (!list.length) return;
    scene.add(new THREE.Mesh(mergeGeometries(list), new THREE.MeshStandardMaterial({ map: textures[i], roughness: 0.95 })));
  });
  scene.add(new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })));

  // paved ground, a patchwork in darker tones
  const gtex = textures[0].clone();
  gtex.repeat.set(20, 20);
  const gg = new THREE.PlaneGeometry(560, 560, 140, 140);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, mound(gp.getX(i), gp.getZ(i)));
  gg.computeVertexNormals();
  scene.add(new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: gtex, color: 0x8c8480, roughness: 1 })));

  // ramps
  const rampGeos = ramps.map((r) => {
    const geo = new THREE.PlaneGeometry(RAMP_W * 2, RAMP_LEN * 2, 6, 14);
    geo.rotateX(-Math.PI / 2);
    if (r.alongX) geo.rotateY(Math.PI / 2);
    geo.translate(r.x, 0, r.z);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)) + 0.04);
    geo.computeVertexNormals();
    return geo;
  });
  if (rampGeos.length) scene.add(new THREE.Mesh(mergeGeometries(rampGeos), new THREE.MeshStandardMaterial({ color: 0xf3c13a, emissive: 0x4a2c00, flatShading: true, roughness: 0.8 })));

  // the city wall
  const wtex = textures[1].clone();
  wtex.repeat.set(120, 1.5);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(238, 238, 18, 72, 1, true), new THREE.MeshStandardMaterial({ map: wtex, side: THREE.BackSide, roughness: 1 }));
  wall.position.y = 7;
  scene.add(wall);
}

function buildCastle(scene, textures) {
  const g = new THREE.Group();
  g.position.set(MON.x, HILL_H, MON.z);
  const mats = textures.slice(2, 5).map((map) => new THREE.MeshStandardMaterial({ map, roughness: 0.9 }));
  const box = (w, h, d, x, y, z, mi) => {
    const m = new THREE.Mesh(paintedBox(w, h, d, 6), mats[mi % mats.length]);
    m.position.set(x, y + h / 2, z);
    g.add(m);
  };
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
  const roof = (w, h, x, y, z, col) => {
    const m = new THREE.Mesh(pyramid(w, w, h, col), roofMat);
    m.position.set(x, y, z);
    g.add(m);
  };
  box(11, 9, 11, 0, 0, 0, 0);
  box(7, 6, 7, 0, 9, 0, 1);
  roof(8.4, 5, 0, 15, 0, 0xc8372d);
  const cols = [0xee8a2f, 0xf3c13a, 0xb8456b, 0xe2582b];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    box(3.4, 14 + i, 3.4, sx * 5.2, 0, sz * 5.2, i + 2);
    roof(4.4, 4, sx * 5.2, 14 + i, sz * 5.2, cols[i]);
  });
  // the gate, glowing from inside
  const arch = (w, h) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
    s.lineTo(w / 2, 0);
    return new THREE.ShapeGeometry(s, 16);
  };
  const frame = new THREE.Mesh(arch(3.6, 5), new THREE.MeshBasicMaterial({ color: 0x1a0d0a }));
  frame.position.set(0, 0, 5.53);
  const door = new THREE.Mesh(arch(2.6, 4.2), new THREE.MeshBasicMaterial({ color: 0xffc860 }));
  door.position.set(0, 0, 5.56);
  g.add(frame, door);

  // lanterns around the square: one lights for every sun delivered
  const lamps = [];
  const postGeo = new THREE.CylinderGeometry(0.07, 0.1, 1.4, 6), orbGeo = new THREE.SphereGeometry(0.3, 10, 8);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3d2418 });
  for (let i = 0; i < LAMP_COUNT; i++) {
    const a = (i / LAMP_COUNT) * Math.PI * 2;
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(Math.cos(a) * 13, 0.7, Math.sin(a) * 13);
    const orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0x2a1a14 }));
    orb.position.set(post.position.x, 1.6, post.position.z);
    g.add(post, orb);
    lamps.push(orb);
  }

  // a beam so the castle can be found from any street
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 300, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
  );
  beam.position.y = 170;
  g.add(beam);
  const light = new THREE.PointLight(0xffb060, 30, 60, 1.6);
  light.position.set(0, 4, 10);
  g.add(light);
  scene.add(g);
  return { lamps, beam };
}

// ---------- city life ----------
function buildLife(scene) {
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const pal = () => PALETTE[Math.floor(rnd() * PALETTE.length)];

  // townsfolk: jointed figures (torso, head, hair, swinging arms and legs) with a walking gait
  const N = 80;
  const torsoGeo = new THREE.CapsuleGeometry(0.15, 0.3, 4, 12);
  torsoGeo.scale(1.3, 1, 0.85);
  torsoGeo.translate(0, 1.2, 0);
  const headGeo = new THREE.SphereGeometry(0.115, 14, 12);
  headGeo.scale(0.92, 1.12, 1);
  headGeo.translate(0, 1.64, 0);
  const hairGeo = new THREE.SphereGeometry(0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hairGeo.scale(0.95, 1.1, 1.05);
  hairGeo.translate(0, 1.655, -0.012);
  const armGeo = new THREE.CapsuleGeometry(0.045, 0.5, 4, 8);
  armGeo.translate(0, -0.29, 0); // hangs from the shoulder
  const legGeo = new THREE.CapsuleGeometry(0.07, 0.72, 4, 8);
  legGeo.translate(0, -0.43, 0); // hangs from the hip
  const cloth = () => new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const torsos = new THREE.InstancedMesh(torsoGeo, cloth(), N);
  const heads = new THREE.InstancedMesh(headGeo, cloth(), N);
  const hairs = new THREE.InstancedMesh(hairGeo, cloth(), N);
  const arms = new THREE.InstancedMesh(armGeo, cloth(), N * 2);
  const legs = new THREE.InstancedMesh(legGeo, cloth(), N * 2);
  const people = [torsos, heads, hairs, arms, legs];
  for (const m of people) m.frustumCulled = false;
  const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#a56a43'];
  const HAIR = ['#1b1310', '#2c1b10', '#4a2f1a', '#111111', '#6b6b6b'];
  const SHIRT = ['#e8e4da', '#3a5a8a', '#7a2e2e', '#2f6f5a', '#c9a23a', '#444444', '#c8372d', '#ee8a2f', '#b8456b'];
  const TROUSER = ['#22283a', '#3b3026', '#4a4a4a', '#1e3a5f', '#5a4632'];
  const any = (list) => list[Math.floor(rnd() * list.length)];
  const folk = [];
  for (let i = 0; i < N; i++) {
    folk.push({
      alongX: rnd() < 0.5,
      line: (Math.floor(rnd() * 13) - 6) * PITCH + (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 1.2),
      s: (rnd() * 2 - 1) * 195,
      v: (rnd() < 0.5 ? -1 : 1) * (0.9 + rnd() * 1.1),
      h: 0.88 + rnd() * 0.2,
      walk: rnd() * 6.28,
      hop: 0,
    });
    const skin = any(SKIN);
    torsos.setColorAt(i, col.set(any(SHIRT)));
    heads.setColorAt(i, col.set(skin));
    hairs.setColorAt(i, col.set(any(HAIR)));
    const trouser = any(TROUSER);
    for (const k of [0, 1]) {
      arms.setColorAt(i * 2 + k, col.set(skin));
      legs.setColorAt(i * 2 + k, col.set(trouser));
    }
  }
  scene.add(...people);
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), world = new THREE.Matrix4();
  const limb = (mesh, idx, px, py, rx) => {
    local.makeRotationX(rx).setPosition(px, py, 0);
    mesh.setMatrixAt(idx, world.multiplyMatrices(base, local));
  };

  // bunting and paper lanterns strung across the streets
  const tri = [], triCol = [], lanternSpots = [];
  const string = (ax, az, bx, bz, y) => {
    const n = 11, len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, py = y - Math.sin(t * Math.PI) * 0.8;
      if (i === 5 || i === 6) { if (i === 5) lanternSpots.push([x + ux * 0.55, py - 0.5, z + uz * 0.55]); continue; }
      tri.push(x - ux * 0.38, py, z - uz * 0.38, x + ux * 0.38, py, z + uz * 0.38, x, py - 0.8, z);
      col.set(pal());
      for (let k = 0; k < 3; k++) triCol.push(col.r, col.g, col.b);
    }
  };
  for (let k = -6; k <= 6; k++)
    for (let m = -7; m <= 6; m++)
      for (const off of [-7, 7]) {
        if (rnd() > 0.5) continue;
        const a = k * PITCH, b = (m + 0.5) * PITCH + off;
        // only where both sides of the street have something tall enough to tie to
        const tall = (x, z) => { const bd = buildingAt(x, z); return bd && bd.top >= 6.5; };
        if (tall(a - 7, b) && tall(a + 7, b)) string(a - 6, b, a + 6, b, 6);
        if (tall(b, a - 7) && tall(b, a + 7)) string(b, a - 6, b, a + 6, 6);
      }
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  flagGeo.setAttribute('color', new THREE.Float32BufferAttribute(triCol, 3));
  scene.add(new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const lanterns = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 }), lanternSpots.length);
  lanternSpots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1.25, 1); dummy.updateMatrix();
    lanterns.setMatrixAt(i, dummy.matrix);
  });
  scene.add(lanterns);

  // birds wheeling over the rooftops
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.45, -1, 0, -0.3, 0, 0, -0.1, 0, 0, 0.45, 1, 0, -0.3, 0, 0, -0.1], 3));
  const flocks = [[-90, 60, 34], [70, -20, 40], [10, 130, 30], [-40, -150, 44]];
  const B = flocks.length * 12;
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0xefe2c0, side: THREE.DoubleSide }), B);
  birds.frustumCulled = false;
  const birdData = [];
  flocks.forEach(([x, z, y]) => {
    for (let i = 0; i < 12; i++) birdData.push({ x, z, y: y + rnd() * 6, r: 14 + rnd() * 22, a: rnd() * 6.28, w: 0.25 + rnd() * 0.2, ph: rnd() * 6.28 });
  });
  scene.add(birds);

  // hot-air balloons drifting high above
  const balloons = [];
  const envGeo = new THREE.SphereGeometry(5, 12, 10), basketGeo = new THREE.BoxGeometry(1.6, 1.4, 1.6);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const env = new THREE.Mesh(envGeo, new THREE.MeshStandardMaterial({ color: ROOF_COLS[i % ROOF_COLS.length], flatShading: true, roughness: 0.8 }));
    env.scale.y = 1.25;
    const top = new THREE.Mesh(new THREE.ConeGeometry(4.6, 4.5, 12), new THREE.MeshStandardMaterial({ color: ROOF_COLS[(i + 3) % ROOF_COLS.length], flatShading: true }));
    top.rotation.x = Math.PI;
    top.position.y = -6.6;
    const basket = new THREE.Mesh(basketGeo, new THREE.MeshStandardMaterial({ color: 0x7a3b22 }));
    basket.position.y = -9.6;
    g.add(env, top, basket);
    scene.add(g);
    balloons.push({ g, r: 90 + rnd() * 120, a: rnd() * 6.28, w: (rnd() < 0.5 ? -1 : 1) * (0.012 + rnd() * 0.012), y: 50 + rnd() * 28, ph: rnd() * 6.28 });
  }

  // traffic: boxy little cars that keep to their lane, queue, give way and honk
  const part = (w, h, d, x, y, z, hex) => tint(new THREE.BoxGeometry(w, h, d), hex).translate(x, y, z);
  const carGeo = mergeGeometries([
    part(2, 0.8, 4, 0, 0.75, 0, 0xffffff),
    part(1.7, 0.7, 2, 0, 1.5, -0.2, 0xf2e6c4),
    ...[[-1, 1.3], [1, 1.3], [-1, -1.3], [1, -1.3]].map(([x, z]) => part(0.3, 0.7, 0.7, x, 0.35, z, 0x1a1a1a)),
  ]);
  const lightGeo = mergeGeometries([
    part(0.45, 0.25, 0.1, -0.6, 0.8, 2.02, 0xfff0b0), part(0.45, 0.25, 0.1, 0.6, 0.8, 2.02, 0xfff0b0),
    part(0.45, 0.2, 0.1, -0.6, 0.8, -2.02, 0xff3020), part(0.45, 0.2, 0.1, 0.6, 0.8, -2.02, 0xff3020),
  ]);
  const CARS = 34;
  const carBodies = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }), CARS);
  const carLights = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), CARS);
  carBodies.frustumCulled = carLights.frustumCulled = false;
  const lanes = [...[...CAR_Z].map((k) => ({ alongX: false, line: k * PITCH })), ...[...CAR_X].map((k) => ({ alongX: true, line: k * PITCH }))];
  const carYaw = (c) => (c.alongX ? (c.dir * Math.PI) / 2 : c.dir > 0 ? 0 : Math.PI);
  const cars = traffic;
  cars.length = 0;
  for (let i = 0; i < CARS; i++) {
    const dir = rnd() < 0.5 ? -1 : 1;
    const c = { ...lanes[i % lanes.length], dir, s: (rnd() * 2 - 1) * 140, v: 0, vmax: 7 + rnd() * 5, stuck: 0, ghost: 0, honk: 0 };
    c.lat = c.line + dir * 2.2; // each direction keeps to its own side
    c.yaw = carYaw(c);
    c.x = c.alongX ? c.s : c.lat;
    c.z = c.alongX ? c.lat : c.s;
    cars.push(c);
    carBodies.setColorAt(i, col.set(ROOF_COLS[Math.floor(rnd() * ROOF_COLS.length)]));
  }
  scene.add(carBodies, carLights);

  function driveCars(dt, P, ev) {
    const ease = (rate) => 1 - Math.exp(-rate * dt);
    for (let i = 0; i < CARS; i++) {
      const c = cars[i];
      const fx = c.alongX ? c.dir : 0, fz = c.alongX ? 0 : c.dir;
      let gap = Infinity;
      for (let j = 0; j < CARS; j++) {
        if (j === i) continue;
        const o = cars[j], dx = o.x - c.x, dz = o.z - c.z, f = dx * fx + dz * fz;
        if (f <= 0.5 || f > 11 || Math.abs(dx * fz - dz * fx) > 2.3) continue;
        const sameLane = o.alongX === c.alongX && o.line === c.line && o.dir === c.dir;
        // queue behind the car ahead; at crossings the lower-numbered car has right of way
        if (sameLane || (j < i && c.ghost <= 0)) gap = Math.min(gap, f);
      }
      if (P) {
        const dx = P.x - c.x, dz = P.z - c.z, f = dx * fx + dz * fz, dist = Math.hypot(dx, dz);
        if (f > 0.5 && f < 12 && Math.abs(dx * fz - dz * fx) < 2.1 && P.y < mound(P.x, P.z) + 2.2) {
          gap = Math.min(gap, f); // brake for the cyclist, and say so
          if (c.honk <= 0 && c.v > 2) { ev.honk = true; c.honk = 3; }
        }
        if (dist < 32 && (!ev.nearCar || dist < ev.nearCar.dist)) ev.nearCar = { dist, speed: c.v };
      }
      const target = gap === Infinity ? c.vmax : Math.min(1, Math.max(0, (gap - 5.5) / 5)) * c.vmax;
      c.v += (target - c.v) * ease(3);
      c.stuck = c.v < 0.4 ? c.stuck + dt : 0;
      if (c.stuck > 6) { c.ghost = 2.5; c.stuck = 0; } // never sit in a jam forever
      if (c.ghost > 0) c.ghost -= dt;
      if (c.honk > 0) c.honk -= dt;
      c.s += c.dir * c.v * dt;
      if (c.s * c.dir > 0 && Math.hypot(c.x, c.z) > 204) { c.dir = -c.dir; c.v = 0; } // U-turn at the city wall
      c.lat += (c.line + c.dir * 2.2 - c.lat) * ease(2.5);
      let dy = carYaw(c) - c.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += dy * ease(4);
      c.x = c.alongX ? c.s : c.lat;
      c.z = c.alongX ? c.lat : c.s;

      // the rider bounces off a car; a hard hit is reported so the game can spill the suns
      if (P && P.y < mound(c.x, c.z) + 1.9) {
        const hx = c.alongX ? 2.6 : 1.6, hz = c.alongX ? 1.6 : 2.6;
        const px = P.x - c.x, pz = P.z - c.z;
        if (Math.abs(px) < hx && Math.abs(pz) < hz) {
          const viaX = hx - Math.abs(px) < hz - Math.abs(pz);
          const nx = viaX ? Math.sign(px) || 1 : 0, nz = viaX ? 0 : Math.sign(pz) || 1;
          if (viaX) P.x = c.x + nx * hx; else P.z = c.z + nz * hz;
          const rvx = (P.grounded ? Math.sin(P.yaw) * P.speed : P.vx) - fx * c.v;
          const rvz = (P.grounded ? Math.cos(P.yaw) * P.speed : P.vz) - fz * c.v;
          const closing = -(rvx * nx + rvz * nz);
          if (closing > 0) {
            ev.carHit = Math.max(ev.carHit || 0, closing);
            if (P.grounded) P.speed *= -0.3;
            else { if (nx) P.vx = 0; else P.vz = 0; }
            c.v = 0;
          }
        }
      }

      dummy.position.set(c.x, mound(c.x, c.z), c.z);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      carBodies.setMatrixAt(i, dummy.matrix);
      carLights.setMatrixAt(i, dummy.matrix);
    }
    carBodies.instanceMatrix.needsUpdate = carLights.instanceMatrix.needsUpdate = true;
  }

  // Returns what happened this frame: { hop, honk, carHit, nearCar }.
  return (t, dt, P) => {
    const ev = {};
    driveCars(dt, P, ev);
    let hopped = false;
    for (let i = 0; i < N; i++) {
      const f = folk[i];
      f.s += f.v * dt;
      let x = f.alongX ? f.s : f.line, z = f.alongX ? f.line : f.s;
      if (Math.abs(f.s) > 198 || Math.hypot(x, z) > 215 || Math.hypot(x - MON.x, z - MON.z) < 44) {
        f.v = -f.v; // turn back at the wall and at the castle square
        f.s += f.v * dt * 2;
        x = f.alongX ? f.s : f.line; z = f.alongX ? f.line : f.s;
      }
      if (f.hop > 0) f.hop -= dt;
      else if (P && Math.abs(P.speed) > 3 && Math.hypot(x - P.x, z - P.z) < 3.4 && Math.abs(P.y - mound(x, z)) < 3) { f.hop = 0.55; hopped = true; }
      const hopping = f.hop > 0;
      const jump = hopping ? Math.sin((f.hop / 0.55) * Math.PI) * 1.1 : 0;
      f.walk += Math.abs(f.v) * dt * 3.4;
      const swing = Math.sin(f.walk) * 0.55;
      const facing = f.alongX ? (f.v > 0 ? Math.PI / 2 : -Math.PI / 2) : f.v > 0 ? 0 : Math.PI;
      dummy.position.set(x, mound(x, z) + Math.abs(Math.sin(f.walk)) * 0.03 + jump, z);
      dummy.rotation.set(0, facing, 0);
      dummy.scale.setScalar(f.h);
      dummy.updateMatrix();
      base.copy(dummy.matrix);
      torsos.setMatrixAt(i, base);
      heads.setMatrixAt(i, base);
      hairs.setMatrixAt(i, base);
      limb(legs, i * 2, -0.085, 0.9, hopping ? -0.5 : swing);
      limb(legs, i * 2 + 1, 0.085, 0.9, hopping ? 0.3 : -swing);
      limb(arms, i * 2, -0.245, 1.44, hopping ? -2.7 : -swing * 0.8); // arms go up when startled
      limb(arms, i * 2 + 1, 0.245, 1.44, hopping ? -2.7 : swing * 0.8);
    }
    for (const m of people) m.instanceMatrix.needsUpdate = true;

    birdData.forEach((b, i) => {
      b.a += b.w * dt;
      dummy.position.set(b.x + Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.7 + b.ph) * 1.5, b.z + Math.sin(b.a) * b.r);
      dummy.rotation.set(0, -b.a, 0.3);
      dummy.scale.set(0.55 + 0.45 * Math.abs(Math.sin(t * 6 + b.ph)), 1, 1); // wingbeat
      dummy.updateMatrix();
      birds.setMatrixAt(i, dummy.matrix);
    });
    birds.instanceMatrix.needsUpdate = true;

    for (const b of balloons) {
      b.a += b.w * dt;
      b.g.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.3 + b.ph) * 3, Math.sin(b.a) * b.r);
    }
    ev.hop = hopped;
    return ev;
  };
}

// ---------- map ----------
// Paints the city plan onto a square canvas of side S, north (the castle side) up.
export const MAP_SPAN = 490; // metres across the map
export function drawMap(g, S) {
  const k = S / MAP_SPAN, c = S / 2, k0 = k;
  g.save();
  g.beginPath(); g.arc(c, c, 238 * k, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#2a1a1c';
  g.fillRect(0, 0, S, S);
  for (const b of buildings) {
    g.fillStyle = b.top < 5 ? '#f3c13a' : b.top < 17 ? '#b8452f' : '#6a2a4a'; // yellow roofs can be ridden
    g.fillRect(c + b.x0 * k + 0.5, c + b.z0 * k + 0.5, (b.x1 - b.x0) * k - 1, (b.z1 - b.z0) * k - 1);
  }
  g.fillStyle = 'rgba(255,255,255,0.09)'; // roads with traffic
  for (const k of CAR_Z) g.fillRect(c + (k * PITCH - 5) * k0, 0, 10 * k0, S);
  for (const k of CAR_X) g.fillRect(0, c + (k * PITCH - 5) * k0, S, 10 * k0);
  g.fillStyle = '#fff2b0';
  for (const r of ramps) {
    const w = (r.alongX ? RAMP_LEN : RAMP_W) * k, h = (r.alongX ? RAMP_W : RAMP_LEN) * k;
    g.fillRect(c + r.x * k - w, c + r.z * k - h, w * 2, h * 2);
  }
  const mx = c + MON.x * k, mz = c + MON.z * k;
  g.fillStyle = 'rgba(255,196,107,0.25)';
  g.beginPath(); g.arc(mx, mz, 30 * k, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffc46b';
  g.fillRect(mx - 9 * k, mz - 9 * k, 18 * k, 18 * k);
  g.beginPath(); g.moveTo(mx - 11 * k, mz - 9 * k); g.lineTo(mx, mz - 22 * k); g.lineTo(mx + 11 * k, mz - 9 * k); g.fill();
  g.restore();
  g.strokeStyle = '#efe2c0';
  g.lineWidth = Math.max(2, S / 170);
  g.beginPath(); g.arc(c, c, 238 * k, 0, Math.PI * 2); g.stroke();
}

const SKY_FRAG = /* glsl */ `
  uniform float uDawn;
  varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    // the sky is a patchwork too
    vec2 cell = floor(vec2(atan(d.z, d.x) * 7.0, asin(clamp(d.y, -1.0, 1.0)) * 9.0));
    float n = hash(cell);
    vec3 night = mix(vec3(0.17, 0.065, 0.07), vec3(0.03, 0.03, 0.09), pow(h, 0.6)) * (0.7 + 0.6 * n);
    night += vec3(0.10, 0.03, 0.0) * step(0.86, n);
    vec3 dawn = mix(vec3(1.0, 0.62, 0.35), vec3(0.35, 0.40, 0.62), pow(h, 0.5)) * (0.9 + 0.2 * n);
    gl_FragColor = vec4(mix(night, dawn, uDawn), 1.0);
  }
`;

function buildSky(scene) {
  const group = new THREE.Group();
  const uniforms = { uDawn: { value: 0 } };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    })
  );
  dome.renderOrder = -2;
  const sun = new THREE.Mesh(new THREE.SphereGeometry(62, 32, 20), new THREE.MeshBasicMaterial({ color: 0xff9a2e, fog: false }));
  sun.position.set(0.5, 0.42, -0.76).normalize().multiplyScalar(800);
  group.add(dome, sun);
  scene.add(group);
  return { group, uniforms, sun };
}

export function buildWorld(scene) {
  scene.fog = new THREE.FogExp2(0x1c0f12, 0.0055);
  const hemi = new THREE.HemisphereLight(0xffe6c8, 0x4a2c2c, 2.3);
  const sunLight = new THREE.DirectionalLight(0xffc890, 1.8);
  sunLight.position.set(0.5, 0.6, -0.5);
  scene.add(hemi, sunLight);

  const textures = [11, 23, 37, 41, 59, 67, 73, 89].map(patchTexture);
  buildCity(scene, textures);
  const castle = buildCastle(scene, textures);
  const sky = buildSky(scene);
  const life = buildLife(scene);

  const fogNight = new THREE.Color(0x1c0f12), fogDawn = new THREE.Color(0xd9a07a);
  let lit = 0, sunSize = 1;
  return {
    setDelivered(count) {
      lit = Math.min(LAMP_COUNT, count);
      castle.lamps.forEach((l, i) => l.material.color.set(i < lit ? 0xffb347 : 0x2a1a14));
      sunSize = 1 + Math.min(count, 60) * 0.012; // the sun swells with every delivery
    },
    update(t, dt, camera, dawn, P) {
      sky.group.position.copy(camera.position);
      sky.uniforms.uDawn.value = dawn;
      sky.sun.scale.setScalar(sunSize * (1 + Math.sin(t * 1.3) * 0.015));
      scene.fog.color.copy(fogNight).lerp(fogDawn, dawn);
      hemi.intensity = 2.3 + dawn * 1.2;
      castle.beam.material.opacity = 0.1 + 0.04 * Math.sin(t * 2);
      for (let i = 0; i < lit; i++) castle.lamps[i].scale.setScalar(1 + Math.sin(t * 8 + i) * 0.12);
      return life(t, dt, P);
    },
  };
}
