// Chapter 2: a night in Arles, built in the colours of Vincent van Gogh's
// "Café Terrace at Night" (1888): cobbled streets, blue houses with lit windows,
// the glowing yellow café on the square, and big painted stars overhead.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const INFO = {
  id: 'ch2',
  title: 'PaletteRider',
  sub: 'Chapter 2 · Vincent van Gogh · Café Terrace at Night · 1888',
  how: 'The stars have fallen into the streets of Arles. Gather them on your bicycle and carry them to the <em>café</em> on the square before dawn, and watch them return to the sky. The more you bring in one trip, the bigger the bonus — but land a jump badly and you spill half of them.',
  brief: 'Collect the fallen stars and carry them to the café on the square before dawn.',
  painting: { file: 'cafe-terrace-at-night.jpg', alt: 'Café Terrace at Night, a painting by Vincent van Gogh, 1888', button: 'Ride into the painting' },
  goal: 'CAFÉ',
  item: 'star',
  icon: '★',
  colors: [0xfff6c8, 0xa8d4ff], // street stars, high stars
  glow: '#ffd24a',
  menuCam: { r: 62, h: 34 },
};

export const MON = { x: 0, z: -80 }; // the café
export const HILL_H = 0;
export const WORLD_R = 222;
export const LAMP_COUNT = 24;
export const MAP_SPAN = 470;

const PITCH = 34; // one block + one street
const HALF_BLOCK = 12.5;
const SQUARE = { x: 0, z: -68 }; // centre of the open square the café stands on

const smoothRand = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rnd = smoothRand(1888);
const any = (list) => list[Math.floor(rnd() * list.length)];

// ---------- town plan ----------
const cells = new Map(); // "i,j" -> houses standing in that block
const houses = [];
const blocks = [];
const ramps = [];

function planTown() {
  for (let i = -7; i <= 6; i++)
    for (let j = -7; j <= 6; j++) {
      const cx = (i + 0.5) * PITCH, cz = (j + 0.5) * PITCH;
      if (Math.hypot(cx, cz) > 204) continue;
      if (Math.hypot(cx - SQUARE.x, cz - SQUARE.z) < 30) continue; // the square
      const x0 = cx - HALF_BLOCK, x1 = cx + HALF_BLOCK, z0 = cz - HALF_BLOCK, z1 = cz + HALF_BLOCK;
      blocks.push({ x0, x1, z0, z1 });
      const sx = x0 + 9 + rnd() * 7, sz = z0 + 9 + rnd() * 7;
      const r = rnd();
      const lots =
        r < 0.15 ? [[x0, x1, z0, z1]]
        : r < 0.45 ? [[x0, sx, z0, z1], [sx, x1, z0, z1]]
        : r < 0.75 ? [[x0, x1, z0, sz], [x0, x1, sz, z1]]
        : [[x0, sx, z0, sz], [sx, x1, z0, sz], [x0, sx, sz, z1], [sx, x1, sz, z1]];
      const list = lots.map(([a, b, c, d]) => ({ x0: a, x1: b, z0: c, z1: d, top: 7 + rnd() * 7 }));
      cells.set(`${i},${j}`, list);
      houses.push(...list);
    }
  // plank ramps in the middle of some streets
  const tryRamp = (x, z, alongX) => {
    if (rnd() > 0.2) return;
    if (Math.hypot(x, z) > 190 || Math.hypot(x - SQUARE.x, z - SQUARE.z) < 52 || Math.hypot(x, z - 40) < 24) return;
    ramps.push({ x, z, alongX, peak: 2.1 + rnd() * 0.7 });
  };
  for (let k = -6; k <= 6; k++)
    for (let m = -7; m <= 6; m++) {
      tryRamp(k * PITCH, (m + 0.5) * PITCH, false);
      tryRamp((m + 0.5) * PITCH, k * PITCH, true);
    }
}
planTown();

const RAMP_LEN = 6, RAMP_W = 2.4;
export function heightAt(x, z) {
  let h = 0;
  for (const r of ramps) {
    const a = Math.abs(r.alongX ? x - r.x : z - r.z), c = Math.abs(r.alongX ? z - r.z : x - r.x);
    if (a < RAMP_LEN && c < RAMP_W) h += r.peak * (1 - a / RAMP_LEN) * Math.min(1, (RAMP_W - c) * 1.5);
  }
  return h;
}
const cellOf = (x, z) => cells.get(`${Math.floor(x / PITCH)},${Math.floor(z / PITCH)}`);

// Keep the rider out of walls: glancing hits slide along the wall, head-on hits bounce.
export function pushOut(P) {
  const list = cellOf(P.x, P.z);
  if (!list) return 0;
  const m = 0.5;
  for (const b of list) {
    if (P.y > b.top + 4) continue;
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
    const into = -(fx * nx + fz * nz);
    if (into <= 0) return 0;
    const hit = Math.abs(P.speed) * into;
    if (into > 0.85) P.speed *= -0.3;
    else {
      const tx = fx + nx * into, tz = fz + nz * into;
      let turn = Math.atan2(tx * dir, tz * dir) - P.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      P.yaw += turn * 0.3;
      P.speed *= 1 - 0.25 * into;
    }
    return hit;
  }
  return 0;
}

export function blocked(x, y, z) {
  const list = cellOf(x, z);
  if (list) for (const b of list) if (x > b.x0 - 0.6 && x < b.x1 + 0.6 && z > b.z0 - 0.6 && z < b.z1 + 0.6 && y < b.top + 3) return true;
  return false;
}

// Where the next star lands: on a street, floating above one, or over a ramp.
export function starSpot() {
  const r = Math.random();
  if (r < 0.2 && ramps.length) {
    const p = ramps[Math.floor(Math.random() * ramps.length)];
    return { x: p.x, z: p.z, y: p.peak + 2.6, high: true };
  }
  const k = Math.floor(Math.random() * 13) - 6;
  const along = (Math.random() * 2 - 1) * 195, across = (Math.random() * 2 - 1) * 3;
  const p = Math.random() < 0.5 ? { x: k * PITCH + across, z: along } : { x: along, z: k * PITCH + across };
  if (Math.hypot(p.x, p.z) > 200) return null;
  const high = r > 0.78; // needs a jump
  return { ...p, y: heightAt(p.x, p.z) + (high ? 4.2 : 1.2), high };
}

// ---------- paint ----------
// Everything is painted with the same tool: a short, thick, slightly curved dab with a pale
// ridge on one side and a shadow on the other, so each stroke reads as raised paint.
function dab(g, x, y, len, wid, ang, color, curve = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.lineCap = 'round';
  const line = (dy, w, style) => {
    g.lineWidth = w;
    g.strokeStyle = style;
    g.beginPath();
    g.moveTo(-len / 2, dy);
    g.quadraticCurveTo(0, dy - curve, len / 2, dy);
    g.stroke();
  };
  line(0, wid, color);
  line(-wid * 0.28, Math.max(1, wid * 0.2), 'rgba(255,255,255,0.2)');
  line(wid * 0.3, Math.max(1, wid * 0.2), 'rgba(0,0,30,0.28)');
  g.restore();
}
// Same dab, repeated across the texture's edges so the tiles join without a seam.
function wrapDab(g, S, x, y, len, wid, ang, color, curve) {
  const xs = [x], ys = [y], m = len;
  if (x < m) xs.push(x + S); else if (x > S - m) xs.push(x - S);
  if (y < m) ys.push(y + S); else if (y > S - m) ys.push(y - S);
  for (const px of xs) for (const py of ys) dab(g, px, py, len, wid, ang, color, curve);
}
function daubs(g, S, n, colors, { len = 30, wid = 7, ang = 0, spread = 0.35, curve = 6 } = {}) {
  for (let i = 0; i < n; i++)
    wrapDab(g, S, rnd() * S, rnd() * S, len * (0.7 + rnd() * 0.7), wid * (0.7 + rnd() * 0.6), ang + (rnd() - 0.5) * spread, any(colors), (rnd() - 0.5) * curve);
}
const asTexture = (canvas) => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};
const blank = (S, fill) => {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = fill;
  g.fillRect(0, 0, S, S);
  return [c, g];
};
// A plain surface covered in strokes, for roofs, leaves, the café walls and its awning.
function strokeTexture(base, colors, opts, n = 700) {
  const [c, g] = blank(256, base);
  daubs(g, 256, n, colors, opts);
  return asTexture(c);
}

// A house front, 8 m square: upright strokes of wall colour, two rows of three painted windows.
// Returns the colour map, a map of only the lit windows (so they glow), and the same paint as relief.
function wallTextures(base, tints) {
  const S = 512;
  const [c, g] = blank(S, base);
  const [e, ge] = blank(S, '#000');
  daubs(g, S, 2300, tints, { len: 34, wid: 7, ang: Math.PI / 2, spread: 0.4, curve: 7 });
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 3; col++) {
      const x = 44 + col * 171, y = 60 + row * 256, w = 78, h = 132;
      const lit = rnd() < 0.42;
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      g.fillStyle = lit ? '#f7b83a' : '#0c1330';
      g.fillRect(x, y, w, h);
      const glass = lit ? ['#ffe98a', '#ffd24a', '#f7a52c', '#fff6c8', '#f08a2a'] : ['#141d48', '#0a1030', '#23306a', '#1a2a5a'];
      for (let i = 0; i < 46; i++) dab(g, x + rnd() * w, y + rnd() * h, 18 + rnd() * 14, 6 + rnd() * 4, Math.PI / 2 + (rnd() - 0.5) * 0.5, any(glass), (rnd() - 0.5) * 5);
      g.restore();
      if (lit) ge.drawImage(c, x, y, w, h, x, y, w, h);
      // frame and glazing bars, drawn a little unevenly like a loaded brush
      for (const ctx of lit ? [g, ge] : [g]) {
        ctx.strokeStyle = ctx === g ? '#101a44' : '#000';
        ctx.lineWidth = 7;
        ctx.lineJoin = 'round';
        ctx.strokeRect(x - 2 + rnd() * 2, y - 2 + rnd() * 2, w + 3, h + 3);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2 + 2, y + h);
        ctx.moveTo(x, y + h * 0.45); ctx.lineTo(x + w, y + h * 0.45 + 2);
        ctx.stroke();
      }
      if (rnd() < 0.7) {
        const greens = ['#2f6b4f', '#2a5a48', '#3b7a52', '#1f4a3a', '#4a8a5a'];
        for (const sx of [x - 32, x + w + 8]) {
          g.fillStyle = '#1f4a3a';
          g.fillRect(sx, y - 4, 24, h + 8);
          for (let k = 0; k < 11; k++) dab(g, sx + 12, y + 2 + k * 12.5, 20, 6, (rnd() - 0.5) * 0.2, any(greens), 2);
        }
      }
    }
  const map = asTexture(c);
  return { map, emissiveMap: asTexture(e), bumpMap: map, bumpScale: 1.2 };
}

// Cobbles the way the painting has them: rows of arched dabs, warm where lamplight would
// fall and cool elsewhere, each sitting on a dark crescent.
function cobbleTexture() {
  const S = 1024;
  const [c, g] = blank(S, '#171b46');
  const warm = ['#e39a3c', '#f0c95a', '#d98a7a', '#f2b24a', '#c97a4a', '#ffe07a'];
  const cool = ['#9a8fc8', '#4f63b8', '#8fa6e0', '#2a3a8c', '#6a6a9a', '#3c50a8', '#b0a0d8'];
  let row = 0;
  for (let y = 0; y < S; y += 26, row++) {
    for (let x = (row % 2) * 21 + rnd() * 8; x < S; x += 36 + rnd() * 12) {
      // the mix of warm and cool drifts across the tile, and wraps cleanly at its edges
      const warmth = 0.42 + 0.3 * Math.sin((x / S) * Math.PI * 4) * Math.cos((y / S) * Math.PI * 2);
      wrapDab(g, S, x, y + 10, 34, 6, 0, '#0b0f30', -7);
      wrapDab(g, S, x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 5, 26 + rnd() * 10, 11 + rnd() * 5, (rnd() - 0.5) * 0.3, any(rnd() < warmth ? warm : cool), 6 + rnd() * 4);
    }
  }
  return asTexture(c);
}

function spotTexture(stops, S = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}
// One of the painting's stars: a white heart with rings of dabs spreading out around it.
function starTexture() {
  const S = 256;
  const c = spotTexture([[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(255,252,225,1)'], [0.2, 'rgba(255,230,140,0.9)'], [0.34, 'rgba(150,185,255,0.28)'], [1, 'rgba(150,185,255,0)']], S);
  const g = c.getContext('2d');
  for (const [radius, count, len, wid, color] of [
    [46, 13, 17, 8, 'rgba(255,250,215,0.95)'],
    [76, 19, 18, 7, 'rgba(200,218,255,0.62)'],
    [106, 25, 17, 6, 'rgba(150,180,255,0.34)'],
  ]) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.2;
      dab(g, S / 2 + Math.cos(a) * radius, S / 2 + Math.sin(a) * radius, len, wid, a + Math.PI / 2, color, 3);
    }
  }
  return new THREE.CanvasTexture(c);
}

// A box whose four walls repeat a house-front texture every 8 m, starting at the ground.
function houseBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const widths = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) {
    const off = Math.floor(rnd() * 3) / 3;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * widths[f]) / 8 + off, (uv.getY(i) * h) / 8);
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
function hipRoof(w, d, h, hex) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, h, 4);
  geo.rotateY(Math.PI / 4);
  geo.scale(w, 1, d);
  geo.translate(0, h / 2, 0);
  return tint(geo, hex);
}

function buildTown(scene) {
  const fronts = [
    wallTextures('#2c3f8f', ['#3d55b0', '#22306e', '#4a67c4', '#1b2658']),
    wallTextures('#3a3a86', ['#5050a8', '#2a2a66', '#6a5fb5', '#22204f']),
    wallTextures('#274d7a', ['#35689c', '#1c3a5e', '#3f7fae', '#152b47']),
    wallTextures('#4a3f78', ['#62549a', '#352c5a', '#7868ad', '#281f47']),
    wallTextures('#8a7a2c', ['#b09a38', '#6a5c20', '#c9b040', '#4d4418']), // a few houses caught in lamplight
    wallTextures('#1f2f66', ['#2c4288', '#17224c', '#36509e', '#101a3c']),
  ];
  const weights = [0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 0, 5];
  const byFront = fronts.map(() => []);
  const roofs = [];
  const ROOFS = [0x1a2148, 0x232a5c, 0x3a2f55, 0x4a3038, 0x152040];
  for (const b of houses) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    byFront[any(weights)].push(houseBox(w, b.top, d).translate(cx, b.top / 2, cz));
    roofs.push(hipRoof(w + 0.8, d + 0.8, 2.4 + rnd() * 1.8, any(ROOFS)).translate(cx, b.top, cz));
  }
  byFront.forEach((list, i) => {
    if (!list.length) return;
    scene.add(new THREE.Mesh(mergeGeometries(list), new THREE.MeshStandardMaterial({ ...fronts[i], emissive: 0xffffff, emissiveIntensity: 1.15, roughness: 0.95 })));
  });
  const roofPaint = strokeTexture('#b8bcd8', ['#e0e4ff', '#8088b8', '#a0a8d8', '#6068a0', '#c8a8c8'], { len: 44, wid: 9, ang: 0, spread: 0.3 });
  roofPaint.repeat.set(3, 2);
  scene.add(new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ map: roofPaint, vertexColors: true, flatShading: true, roughness: 0.9 })));

  // cobbles
  const cob = cobbleTexture();
  cob.repeat.set(46, 46);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshStandardMaterial({ map: cob, bumpMap: cob, bumpScale: 1.6, color: 0xc4c4d8, roughness: 0.8 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // plank ramps
  const rampGeos = ramps.map((r) => {
    const geo = new THREE.PlaneGeometry(RAMP_W * 2, RAMP_LEN * 2, 4, 12);
    geo.rotateX(-Math.PI / 2);
    if (r.alongX) geo.rotateY(Math.PI / 2);
    geo.translate(r.x, 0, r.z);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)) + 0.04);
    geo.computeVertexNormals();
    return geo;
  });
  if (rampGeos.length) scene.add(new THREE.Mesh(mergeGeometries(rampGeos), new THREE.MeshStandardMaterial({ color: 0xb07a3a, emissive: 0x2a1600, flatShading: true, roughness: 0.9 })));

  // lanterns on the house corners, each with a pool of warm light on the cobbles
  const spots = [];
  for (const b of blocks) spots.push([b.x0 - 0.3, b.z0 - 0.3], [b.x1 + 0.3, b.z1 + 0.3]);
  const dummy = new THREE.Object3D();
  const orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd98a }), spots.length);
  const poolTex = new THREE.CanvasTexture(spotTexture([[0, 'rgba(255,200,90,0.55)'], [0.5, 'rgba(255,170,60,0.2)'], [1, 'rgba(255,170,60,0)']]));
  const poolGeo = new THREE.CircleGeometry(6, 20);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), spots.length);
  spots.forEach(([x, z], i) => {
    dummy.position.set(x, 4.2, z);
    dummy.updateMatrix();
    orbs.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.05, z);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });
  scene.add(orbs, pools);

  // the town wall
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(228, 228, 16, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a2350, side: THREE.BackSide, roughness: 1 }));
  wall.position.y = 8;
  scene.add(wall);
  return fronts;
}

function buildCafe(scene, fronts) {
  const g = new THREE.Group();
  g.position.set(MON.x, 0, MON.z);
  const mesh = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  // the café wall is yellow shot through with green and orange, as in the painting
  const wallPaint = strokeTexture('#e8c832', ['#f4dc4a', '#d9b82a', '#c9d24a', '#f0a83a', '#fff08a', '#a8c040', '#f7e06a'], { len: 40, wid: 9, ang: Math.PI / 2, spread: 0.4 });
  wallPaint.repeat.set(3, 1.2);
  const awningPaint = strokeTexture('#f2b030', ['#f7b52c', '#ffd24a', '#e8902a', '#fff0a0', '#d98a20'], { len: 46, wid: 9, ang: 0, spread: 0.25 });
  awningPaint.repeat.set(4, 1.5);
  const floorPaint = strokeTexture('#e89448', ['#f0a04a', '#d97a3a', '#ffc070', '#c9683a', '#f7b25a'], { len: 40, wid: 9, ang: 0.1, spread: 0.3 });
  floorPaint.repeat.set(4, 2);
  const yellow = new THREE.MeshStandardMaterial({ map: wallPaint, bumpMap: wallPaint, bumpScale: 1.2, emissive: 0xb88a10, emissiveIntensity: 0.4, roughness: 0.8 });
  const awningMat = new THREE.MeshStandardMaterial({ map: awningPaint, emissive: 0xa86a08, emissiveIntensity: 0.35, roughness: 0.8, side: THREE.DoubleSide });
  const blue = new THREE.MeshStandardMaterial({ color: 0x24357e, roughness: 0.9 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xeef2f0, emissive: 0x555a4a, roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xc8842e, emissive: 0x3a2000, roughness: 0.8 });

  // the house: glowing yellow at street level, blue with shutters above
  mesh(new THREE.BoxGeometry(12, 4.2, 9), yellow, 0, 2.1, -0.5);
  mesh(houseBox(12, 5.4, 9), new THREE.MeshStandardMaterial({ ...fronts[0], emissive: 0xffffff, emissiveIntensity: 1.15, roughness: 0.95 }), 0, 6.9, -0.5);
  mesh(hipRoof(12.8, 9.8, 3, 0x1a2148), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }), 0, 9.6, -0.5);
  mesh(new THREE.BoxGeometry(12.3, 0.35, 9.3), blue, 0, 4.3, -0.5); // cornice
  mesh(new THREE.BoxGeometry(2.2, 3.2, 0.2), blue, -3.6, 1.6, 4.05); // door frame
  mesh(new THREE.BoxGeometry(1.7, 2.9, 0.1), new THREE.MeshBasicMaterial({ color: 0xd98a2a }), -3.6, 1.5, 4.12); // warm doorway
  mesh(new THREE.BoxGeometry(3.4, 2, 0.1), new THREE.MeshBasicMaterial({ color: 0xe0a83a }), 2.6, 2.1, 4.06); // window

  // the awning, sloping out over the terrace
  const awning = mesh(new THREE.BoxGeometry(12.6, 0.14, 5.9), awningMat, 0, 3.75, 6.8);
  awning.rotation.x = 0.17;
  for (let i = 0; i < 12; i++) mesh(new THREE.ConeGeometry(0.5, 0.5, 3), awningMat, -5.8 + i * 1.05, 3.05, 9.7).rotation.x = Math.PI; // scalloped edge

  // the terrace: a warm floor, round tables and bentwood chairs
  mesh(new THREE.BoxGeometry(13, 0.1, 6.2), new THREE.MeshStandardMaterial({ map: floorPaint, emissive: 0x3a1c04, roughness: 0.9 }), 0, 0.05, 7.1);
  const topGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.75, 6);
  const seatGeo = new THREE.BoxGeometry(0.42, 0.06, 0.42), backGeo = new THREE.BoxGeometry(0.42, 0.5, 0.05);
  for (const [x, z] of [[-4.6, 6.4], [-1.6, 6.2], [1.6, 6.5], [4.6, 6.3], [-3.1, 8.6], [0.1, 8.8], [3.3, 8.5]]) {
    mesh(topGeo, cream, x, 0.78, z);
    mesh(legGeo, wood, x, 0.4, z);
    for (const side of [-1, 1]) {
      mesh(seatGeo, wood, x + side * 0.85, 0.45, z);
      mesh(legGeo, wood, x + side * 0.85, 0.22, z).scale.y = 0.6;
      mesh(backGeo, wood, x + side * 1.05, 0.72, z).rotation.y = Math.PI / 2;
    }
  }
  // a waiter in a white apron
  const waiter = new THREE.Group();
  waiter.position.set(-0.6, 0, 7.4);
  const part = (geo, color, y) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 }));
    m.position.y = y;
    waiter.add(m);
  };
  part(new THREE.CapsuleGeometry(0.17, 0.75, 4, 10), 0xf2f2ec, 0.62);
  part(new THREE.CapsuleGeometry(0.19, 0.34, 4, 10), 0x1c1c22, 1.28);
  part(new THREE.SphereGeometry(0.12, 12, 10), 0xe0ac69, 1.68);
  g.add(waiter);

  // the big gas lantern on its bracket
  mesh(new THREE.BoxGeometry(0.08, 0.08, 1.8), blue, -1.2, 4.0, 4.9);
  mesh(new THREE.SphereGeometry(0.42, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), -1.2, 3.55, 5.7);
  const glow = new THREE.PointLight(0xffc24a, 60, 60, 1.5);
  glow.position.set(0, 3.2, 8);
  g.add(glow);

  // street lamps round the square: one lights for every star delivered
  const lamps = [];
  const postGeo = new THREE.CylinderGeometry(0.06, 0.09, 2.8, 6), orbGeo = new THREE.SphereGeometry(0.3, 10, 8);
  const iron = new THREE.MeshStandardMaterial({ color: 0x14183a });
  for (let i = 0; i < LAMP_COUNT; i++) {
    const a = (i / LAMP_COUNT) * Math.PI * 2;
    mesh(postGeo, iron, Math.cos(a) * 14.5, 1.4, Math.sin(a) * 14.5);
    lamps.push(mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0x1a2040 }), Math.cos(a) * 14.5, 3, Math.sin(a) * 14.5));
  }

  // trees at the edges of the square, like the branches reaching into the painting
  const leafPaint = strokeTexture('#1c5a3c', ['#2f8a52', '#1a4a34', '#6aa84a', '#0f3324', '#9ac85a', '#247048'], { len: 34, wid: 10, ang: 0, spread: 3.1, curve: 14 }, 900);
  leafPaint.repeat.set(3, 2);
  const leaf = new THREE.MeshStandardMaterial({ map: leafPaint, emissive: 0x082814, flatShading: true, roughness: 1 });
  const bark = new THREE.MeshStandardMaterial({ color: 0x2a2030 });
  const crown = new THREE.IcosahedronGeometry(1, 1);
  for (const [x, z] of [[-31, 30], [31, 30], [-31, -22], [31, -22], [-33, 6], [33, 6]]) {
    mesh(new THREE.CylinderGeometry(0.3, 0.42, 5, 7), bark, x, 2.5, z);
    for (const [dx, dy, dz, s] of [[0, 6.2, 0, 3.2], [1.6, 5.4, 0.8, 2.3], [-1.5, 5.6, -0.6, 2.4], [0.3, 7.6, -0.4, 2.2]]) mesh(crown, leaf, x + dx, dy, z + dz).scale.setScalar(s);
  }

  // a beam so the café can be found from any street
  const beam = mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 300, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    0, 162, 0
  );
  scene.add(g);
  return { lamps, beam };
}

// ---------- townsfolk ----------
function buildFolk(scene) {
  const N = 60;
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const geo = {
    torso: new THREE.CapsuleGeometry(0.15, 0.3, 4, 12).scale(1.3, 1, 0.85).translate(0, 1.2, 0),
    head: new THREE.SphereGeometry(0.115, 14, 12).scale(0.92, 1.12, 1).translate(0, 1.64, 0),
    hat: new THREE.CylinderGeometry(0.1, 0.19, 0.16, 12).translate(0, 1.79, 0),
    arm: new THREE.CapsuleGeometry(0.045, 0.5, 4, 8).translate(0, -0.29, 0),
    leg: new THREE.CapsuleGeometry(0.07, 0.72, 4, 8).translate(0, -0.43, 0),
  };
  const inst = (g, n) => {
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.85 }), n);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const torsos = inst(geo.torso, N), heads = inst(geo.head, N), hats = inst(geo.hat, N), arms = inst(geo.arm, N * 2), legs = inst(geo.leg, N * 2);
  const COAT = ['#22264a', '#3a2a22', '#5a2630', '#2f4a3a', '#d9c26a', '#e8e2d0', '#7a3b22', '#35407a'];
  const SKIN = ['#f1c9a5', '#e0ac69', '#c68642', '#d9a27a'];
  const folk = [];
  for (let i = 0; i < N; i++) {
    folk.push({
      alongX: rnd() < 0.5,
      line: (Math.floor(rnd() * 13) - 6) * PITCH + (rnd() < 0.5 ? -1 : 1) * (2.9 + rnd() * 0.8),
      s: (rnd() * 2 - 1) * 185,
      v: (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 0.9),
      h: 0.9 + rnd() * 0.18,
      walk: rnd() * 6.28,
      hop: 0,
    });
    const coat = any(COAT);
    torsos.setColorAt(i, col.set(coat));
    heads.setColorAt(i, col.set(any(SKIN)));
    hats.setColorAt(i, col.set(any(['#15151c', '#3a2a22', '#d9c26a'])));
    for (const k of [0, 1]) {
      arms.setColorAt(i * 2 + k, col.set(coat));
      legs.setColorAt(i * 2 + k, col.set(any(['#1c1c28', '#2a2230'])));
    }
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
      f.s += f.v * dt;
      let x = f.alongX ? f.s : f.line, z = f.alongX ? f.line : f.s;
      if (Math.hypot(x, z) > 198 || Math.hypot(x - MON.x, z - MON.z) < 20) {
        f.v = -f.v; // turn back at the town wall and at the café
        f.s += f.v * dt * 2;
        x = f.alongX ? f.s : f.line; z = f.alongX ? f.line : f.s;
      }
      if (f.hop > 0) f.hop -= dt;
      else if (P && Math.abs(P.speed) > 3 && P.y < 3 && Math.hypot(x - P.x, z - P.z) < 3.2) { f.hop = 0.55; hopped = true; }
      const hopping = f.hop > 0;
      f.walk += Math.abs(f.v) * dt * 3.4;
      const swing = Math.sin(f.walk) * 0.5;
      dummy.position.set(x, Math.abs(Math.sin(f.walk)) * 0.03 + (hopping ? Math.sin((f.hop / 0.55) * Math.PI) * 1.1 : 0), z);
      dummy.rotation.set(0, f.alongX ? (f.v > 0 ? Math.PI / 2 : -Math.PI / 2) : f.v > 0 ? 0 : Math.PI, 0);
      dummy.scale.setScalar(f.h);
      dummy.updateMatrix();
      base.copy(dummy.matrix);
      torsos.setMatrixAt(i, base);
      heads.setMatrixAt(i, base);
      hats.setMatrixAt(i, base);
      limb(legs, i * 2, -0.085, 0.9, hopping ? -0.5 : swing);
      limb(legs, i * 2 + 1, 0.085, 0.9, hopping ? 0.3 : -swing);
      limb(arms, i * 2, -0.245, 1.44, hopping ? -2.7 : -swing * 0.8);
      limb(arms, i * 2 + 1, 0.245, 1.44, hopping ? -2.7 : swing * 0.8);
    }
    for (const m of [torsos, heads, hats, arms, legs]) m.instanceMatrix.needsUpdate = true;
    return hopped;
  };
}

// ---------- sky ----------
const SKY_FRAG = /* glsl */ `
  uniform float uDawn;
  varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  // smooth noise that repeats after 'per' cells sideways, so it joins up all the way round the sky
  float pn(vec2 p, float per){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
    return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x), mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
  }
  void main(){
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    // No grid here: the sky is long, soft strokes of different lengths that rise and dip
    // as they cross it, the way a loaded brush is dragged, with no hard edges between them.
    float u = atan(d.z, d.x) / 6.28318 + 0.5;            // once round the horizon
    float v = asin(clamp(d.y, -1.0, 1.0)) / 1.5708;      // horizon to zenith
    float drift = pn(vec2(u * 10.0, v * 5.0), 10.0);
    float haze = pn(vec2(u * 22.0 + 5.0, v * 9.0 + 3.0), 22.0);
    float vy = v + (drift - 0.5) * 0.14 + (haze - 0.5) * 0.04;
    float broad = pn(vec2(u * 40.0, vy * 110.0), 40.0);
    float mid = pn(vec2(u * 96.0 + 17.0, vy * 300.0 + 4.0), 96.0);
    float fine = pn(vec2(u * 230.0 + 40.0, vy * 640.0 + 9.0), 230.0);
    float stroke = smoothstep(0.28, 0.72, broad * 0.4 + mid * 0.4 + fine * 0.2);
    vec3 deep = vec3(0.022, 0.055, 0.26), cobalt = vec3(0.075, 0.20, 0.60), teal = vec3(0.06, 0.29, 0.52);
    vec3 night = mix(deep, cobalt, stroke);
    night = mix(night, teal, smoothstep(0.6, 0.82, haze) * 0.4);
    night += vec3(0.04, 0.06, 0.11) * smoothstep(0.7, 0.95, fine) * stroke; // flecks of lighter paint
    night *= mix(1.3, 0.8, pow(h, 0.6));
    vec3 dawn = mix(vec3(1.0, 0.66, 0.36), vec3(0.34, 0.46, 0.78), pow(h, 0.5)) * (0.84 + 0.3 * stroke);
    gl_FragColor = vec4(mix(night, dawn, uDawn), 1.0);
  }
`;
const SKY_STARS = 96, START_STARS = 26;
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
  group.add(dome);
  const tex = starTexture();
  const stars = [];
  for (let i = 0; i < SKY_STARS; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    const y = 0.12 + rnd() * 0.85, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    s.position.set(Math.cos(a) * r * 780, y * 780, Math.sin(a) * r * 780);
    s.userData.size = 60 + rnd() * 70;
    s.scale.setScalar(s.userData.size);
    s.renderOrder = -1;
    group.add(s);
    stars.push(s);
  }
  scene.add(group);
  return { group, uniforms, stars };
}

// ---------- map ----------
export function drawMap(g, S) {
  const k = S / MAP_SPAN, c = S / 2;
  g.save();
  g.beginPath(); g.arc(c, c, 228 * k, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#141a40';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#3a4c9a';
  for (const b of houses) g.fillRect(c + b.x0 * k + 0.5, c + b.z0 * k + 0.5, (b.x1 - b.x0) * k - 1, (b.z1 - b.z0) * k - 1);
  g.fillStyle = '#d9a85e';
  for (const r of ramps) {
    const w = (r.alongX ? RAMP_LEN : RAMP_W) * k, h = (r.alongX ? RAMP_W : RAMP_LEN) * k;
    g.fillRect(c + r.x * k - w, c + r.z * k - h, w * 2, h * 2);
  }
  const mx = c + MON.x * k, mz = c + MON.z * k;
  g.fillStyle = 'rgba(255,210,74,0.28)';
  g.beginPath(); g.arc(mx, mz, 26 * k, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd24a';
  g.fillRect(mx - 8 * k, mz - 6 * k, 16 * k, 12 * k); // the café
  g.fillStyle = '#f7a52c';
  g.fillRect(mx - 9 * k, mz + 6 * k, 18 * k, 6 * k); // its awning
  g.restore();
  g.strokeStyle = '#c8d4ff';
  g.lineWidth = Math.max(2, S / 170);
  g.beginPath(); g.arc(c, c, 228 * k, 0, Math.PI * 2); g.stroke();
}

export function buildWorld(scene) {
  scene.fog = new THREE.FogExp2(0x0c1440, 0.0058);
  const hemi = new THREE.HemisphereLight(0x8fa8ff, 0x2a2440, 1.9);
  const moon = new THREE.DirectionalLight(0xa8b8ff, 0.9);
  moon.position.set(0.4, 0.8, 0.3);
  scene.add(hemi, moon);

  const fronts = buildTown(scene);
  const cafe = buildCafe(scene, fronts);
  const folk = buildFolk(scene);
  const sky = buildSky(scene);

  const fogNight = new THREE.Color(0x0c1440), fogDawn = new THREE.Color(0xd9a07a);
  let lit = 0, shown = START_STARS;
  return {
    // every delivered star lights a lamp on the square and goes back up into the sky
    setDelivered(count) {
      lit = Math.min(LAMP_COUNT, count);
      cafe.lamps.forEach((l, i) => l.material.color.set(i < lit ? 0xffd27a : 0x1a2040));
      shown = Math.min(SKY_STARS, START_STARS + count);
    },
    update(t, dt, camera, dawn, P) {
      sky.group.position.copy(camera.position);
      sky.uniforms.uDawn.value = dawn;
      sky.stars.forEach((s, i) => {
        const target = i < shown ? 1 - dawn * 0.85 : 0;
        s.material.opacity += (target - s.material.opacity) * Math.min(1, dt * 2);
        s.scale.setScalar(s.userData.size * (1 + 0.08 * Math.sin(t * 1.7 + i))); // a slow twinkle
      });
      scene.fog.color.copy(fogNight).lerp(fogDawn, dawn);
      hemi.intensity = 1.9 + dawn * 1.4;
      cafe.beam.material.opacity = 0.1 + 0.04 * Math.sin(t * 2);
      for (let i = 0; i < lit; i++) cafe.lamps[i].scale.setScalar(1 + Math.sin(t * 8 + i) * 0.12);
      return { hop: folk(dt, P) };
    },
  };
}
