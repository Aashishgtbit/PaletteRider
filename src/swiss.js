// Chapter 4: the Lauterbrunnen valley in Switzerland, in the colours of Ferdinand Hodler's
// "The Jungfrau seen from Isenfluh" (1902). The place is real: the valley floor, the cliffs, the
// river, the roads and paths, every chalet, the railway, the cable car to Mürren and the
// waterfalls come from OpenStreetMap and real elevation data (see tools/lauterbrunnen). It is
// scaled down so it fits a ride: one game unit is five metres, and heights use the same scale,
// so the cliffs and the Jungfrau keep their true proportions. Chalets and roads are drawn a
// little larger than life so they read at bicycle size.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DATA = await (await fetch(import.meta.env.BASE_URL + 'lauterbrunnen.json')).json();

const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function unpack(g) {
  const raw = new Int16Array(bytes(g.h).buffer);
  const h = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) h[i] = raw[i] / 20;
  return { ...g, h };
}
const NEAR = unpack(DATA.near), FAR = unpack(DATA.far);
const RIDE = bytes(DATA.ride);
function sample(g, x, z) {
  const i = (x - g.x0) / g.step, j = (z - g.z0) / g.step;
  if (i < 0 || j < 0 || i > g.nx - 1 || j > g.nz - 1) return null;
  const i0 = Math.min(Math.floor(i), g.nx - 2), j0 = Math.min(Math.floor(j), g.nz - 2), a = i - i0, b = j - j0, n = g.nx;
  return (g.h[j0 * n + i0] * (1 - a) + g.h[j0 * n + i0 + 1] * a) * (1 - b) + (g.h[(j0 + 1) * n + i0] * (1 - a) + g.h[(j0 + 1) * n + i0 + 1] * a) * b;
}
let notice = null; // a message for the rider, passed on by update()
export const rideAt = (x, z) => {
  const i = Math.round((x - NEAR.x0) / NEAR.step), j = Math.round((z - NEAR.z0) / NEAR.step);
  return i >= 0 && j >= 0 && i < NEAR.nx && j < NEAR.nz && RIDE[j * NEAR.nx + i] === 1;
};

// the church (the goal) and a start by the station at the north end of the village, facing up
// the valley towards the Jungfrau
const CH = DATA.church;


export const MON = { x: CH.x, z: CH.z }; // the church
export const MON_R = 0; // the church has its own walls (see pushOut), no round wall
export const HILL_H = sample(NEAR, CH.x, CH.z) ?? 0;
export const WORLD_R = 5000; // the edges are the cliffs: see pushOut
export const LAMP_COUNT = 30; // flowers that bloom round the church as edelweiss come in
export const MAP_SPAN = 640;

// The far mountains are drawn taller than life, more so the further away they are, so the
// Jungfrau looms over the valley as it does in Hodler's painting. The valley keeps its true shape.
const LOOM = (x, z) => {
  const d = Math.hypot(x - 20, (z + 20) * 0.8);
  const t = Math.min(1, Math.max(0, (d - 380) / 900));
  return 1 + 0.5 * t * t * (3 - 2 * t);
};
export function heightAt(x, z) {
  const n = sample(NEAR, x, z);
  if (n !== null) return n;
  const f = sample(FAR, x, z);
  return f === null ? 0 : f * LOOM(x, z);
}

// ---------- buildings, for walls and the camera ----------
const B = DATA.buildings; // [cx, cz, length, width, angle, base, height, kind]
const bucket = new Map();
const key = (x, z) => `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
B.forEach((b, i) => {
  const r = Math.hypot(b[2], b[3]) / 2;
  for (let gx = Math.floor((b[0] - r) / 20); gx <= Math.floor((b[0] + r) / 20); gx++)
    for (let gz = Math.floor((b[1] - r) / 20); gz <= Math.floor((b[1] + r) / 20); gz++) {
      const k = `${gx},${gz}`;
      if (!bucket.has(k)) bucket.set(k, []);
      bucket.get(k).push(i);
    }
});
function inBuilding(x, z, pad = 0) {
  for (const i of bucket.get(key(x, z)) || []) {
    const b = B[i], c = Math.cos(b[4]), s = Math.sin(b[4]);
    const u = (x - b[0]) * c + (z - b[1]) * s, v = -(x - b[0]) * s + (z - b[1]) * c;
    if (Math.abs(u) < b[2] / 2 + pad && Math.abs(v) < b[3] / 2 + pad) return { b, u, v, c, s };
  }
  return null;
}

// the start: the point on a village road nearest the station that is clear of buildings
const START = (() => {
  let best = { x: 0, z: 0 }, bd = Infinity;
  for (const r of DATA.roads) {
    if (r.k !== 'road' || r.t || r.b) continue;
    for (let k = 0; k < r.p.length; k += 2) {
      const x = r.p[k], z = r.p[k + 1], d = Math.hypot(x + 4, z + 75) + (x > CH.x + 8 ? 500 : 0); // on the church side of the river
      const open = [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, -3], [3, -3], [-3, 3]].every(([a, b]) => rideAt(x + a, z + b));
      if (d < bd && open && !inBuilding(x, z, 3)) { bd = d; best = { x, z }; }
    }
  }
  return best;
})();

export const INFO = {
  id: 'ch4',
  title: 'PaletteRider',
  sub: 'Chapter 4 · Ferdinand Hodler · The Jungfrau from Isenfluh · 1902',
  how: 'Ride the real Lauterbrunnen valley in Switzerland, between cliffs streaked with waterfalls and under the Jungfrau. Gather the <em>edelweiss</em> on your bicycle and carry them to the village <em>church</em> before sunset. The more you bring in one trip, the bigger the bonus — but land a jump badly and you spill half of them.',
  brief: 'Collect the edelweiss and carry them to the church before sunset. Climb the zigzag paths to Wengen for the view of the Jungfrau.',
  painting: { file: 'jungfrau-isenfluh.jpg', alt: 'The Jungfrau seen from Isenfluh, a painting by Ferdinand Hodler, 1902', button: 'Ride into the painting' },
  goal: 'CHURCH',
  item: 'edelweiss',
  icon: '❀',
  colors: [0xffffff, 0xfff0a8],
  glow: '#c8e4ff',
  timeLabel: 'Until sunset',
  seconds: 210,
  starCount: 40,
  menuCam: { r: 120, h: 60 },
  spawn: { x: START.x, z: START.z, yaw: 0 },
  bloom: 0.3,
  exposure: 0.95,
  credit: 'Map © OpenStreetMap contributors · Terrain: Mapzen/AWS (SRTM)',
};

// Keep the bicycle on the valley floor and the paths: if it rolls onto a cliff or into the river
// it is put back where it last was, and chalets are solid.
let lastOk = { x: START.x, z: START.z }, toldRiver = 0;
// Losing speed against a wall: only the part of the speed that goes into it, so a glancing touch
// slides along and a head-on hit stops. (nx, nz) is the way the bike was pushed back out.
function scrape(P, nx, nz) {
  const L = Math.hypot(nx, nz);
  if (!L || !P.grounded) return;
  const into = Math.max(0, -(Math.sin(P.yaw) * nx + Math.cos(P.yaw) * nz) / L);
  P.speed *= 1 - 0.85 * into;
}
export function pushOut(P) {
  if (P.grounded) {
    if (rideAt(P.x, P.z)) lastOk = { x: P.x, z: P.z };
    else {
      const bx = P.x, bz = P.z; // where it would have gone
      // slide along the edge (a cliff foot, the river bank) rather than stopping dead
      if (rideAt(P.x, lastOk.z)) P.z = lastOk.z;
      else if (rideAt(lastOk.x, P.z)) P.x = lastOk.x;
      else { P.x = lastOk.x; P.z = lastOk.z; }
      scrape(P, P.x - bx, P.z - bz);
      const flatThere = Math.hypot(heightAt(bx + 1.5, bz) - heightAt(bx - 1.5, bz), heightAt(bx, bz + 1.5) - heightAt(bx, bz - 1.5)) < 0.9; // flat but closed: the river
      if (flatThere && performance.now() - toldRiver > 15000) {
        toldRiver = performance.now();
        notice = 'The Lütschine runs too fast to ride through. Find a bridge.';
      }
      lastOk = { x: P.x, z: P.z };
      return 0;
    }
  }
  const hit = inBuilding(P.x, P.z, 0.4);
  if (hit && P.y < hit.b[5] + hit.b[6]) {
    const { b, u, v, c, s } = hit;
    const du = b[2] / 2 + 0.4 - Math.abs(u), dv = b[3] / 2 + 0.4 - Math.abs(v);
    const nu = du < dv ? Math.sign(u) * (b[2] / 2 + 0.4) : u, nv = du < dv ? v : Math.sign(v) * (b[3] / 2 + 0.4);
    const ox = P.x, oz = P.z;
    P.x = b[0] + nu * c - nv * s;
    P.z = b[1] + nu * s + nv * c;
    if (P.grounded) scrape(P, P.x - ox, P.z - oz);
    else { P.vx *= 0.5; P.vz *= 0.5; }
  }
  return 0;
}
export function blocked(x, y, z) {
  if (y < heightAt(x, z) + 0.8) return true;
  const hit = inBuilding(x, z);
  return !!hit && y < hit.b[5] + hit.b[6] * 1.5;
}

// Where the next edelweiss appears: anywhere you can ride within reach of the village, now
// and then up on a terrace or a slope.
export function starSpot() {
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * 6.283, d = 20 + Math.random() * 230;
    const x = CH.x + Math.cos(a) * d * 0.55, z = CH.z + Math.sin(a) * d;
    if (!rideAt(x, z) || inBuilding(x, z, 1.5)) continue;
    const high = Math.random() < 0.18;
    return { x, z, y: heightAt(x, z) + (high ? 4.2 : 1.2), high };
  }
  return null;
}

// ---------- painting helpers ----------
const rand = (() => { let s = 1902; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const any = (a) => a[Math.floor(rand() * a.length)];
const col = new THREE.Color();
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
// Hodler's brushwork: short parallel strokes, light over the colour and dark blue-violet lines
// between, so the vertex colours show through as broad patches.
const brushTex = canvasTex(512, (g, S) => {
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * S, y = rand() * S, len = 10 + rand() * 26, ang = (rand() - 0.5) * 0.5;
    g.strokeStyle = rand() < 0.22 ? `rgba(40, 46, 120, ${0.25 + rand() * 0.25})` : `rgba(255, 255, 255, ${0.25 + rand() * 0.45})`;
    g.lineWidth = 2 + rand() * 4;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
  }
});

// ---------- terrain ----------
const MEADOW = [0x62c24a, 0x55b046, 0x7fd25a, 0x4aa64a, 0x8fdc62];
const WOOD = [0x2f6a5a, 0x2a5a62, 0x356e52, 0x24506a];
const CLIFF = [0xe0a8b4, 0xd8b0a0, 0xc8a0c8, 0xe8c0b8, 0xb898b0, 0xd0b8a8, 0xa890b8]; // Hodler's cliffs: rose, ochre-grey, mauve
const ROCK = [0x9a90c0, 0x8a86b0, 0xa89cc4];
const SNOW = [0xfaf6e6, 0xfff4cc, 0xeef0fa];
const HAZE = new THREE.Color(0xa8b4e8);
function terrainColour(y, slope, n) {
  const ele = y / DATA.scale + DATA.base; // back to metres
  if (ele > 2900 - n * 300 && slope < 1.6) return SNOW[Math.floor(n * 3) % 3];
  if (slope > 1.05) return ele > 2400 ? ROCK[Math.floor(n * 3) % 3] : CLIFF[Math.floor(n * 7) % 7];
  if (ele > 2350) return ROCK[Math.floor(n * 3) % 3];
  if (slope > 0.55) return WOOD[Math.floor(n * 4) % 4];
  return MEADOW[Math.floor(n * 5) % 5];
}
function gridMesh(g, { skirt = 0, sink = null, far = false } = {}) {
  const { nx, nz, step, x0, z0, h } = g;
  const pos = new Float32Array(nx * nz * 3), colors = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = x0 + i * step, z = z0 + j * step;
      let y = h[k];
      const gx = (h[j * nx + Math.min(i + 1, nx - 1)] - h[j * nx + Math.max(i - 1, 0)]) / (2 * step);
      const gz = (h[Math.min(j + 1, nz - 1) * nx + i] - h[Math.max(j - 1, 0) * nx + i]) / (2 * step);
      const slope = Math.hypot(gx, gz);
      if (far) y *= LOOM(x, z);
      if (sink && sink(x, z)) y -= 6; // the detailed valley covers this part
      if (skirt && (i === 0 || j === 0 || i === nx - 1 || j === nz - 1)) y -= skirt;
      pos.set([x, y, z], k * 3);
      const n = (Math.sin(x * 0.11 + z * 0.07) * 0.5 + 0.5) * 0.6 + rand() * 0.4;
      col.setHex(terrainColour(h[k], slope, n));
      // a little light from the south-east, so slopes read like Hodler's flat patches of colour;
      // snow in shade turns blue-violet, as on his Jungfrau
      const lit = Math.max(-1, Math.min(1, (-gx * 0.6 + gz * 0.8) * -1.2));
      const snow = h[k] / DATA.scale + DATA.base > 2700;
      if (snow && lit < 0.2) {
        const t = Math.min(1, (0.2 - lit) * 1.4);
        col.lerp(new THREE.Color(0x8a96d8), t * 0.75);
      }
      const shade = snow ? 0.9 + 0.1 * lit : 0.82 + 0.18 * lit;
      col.multiplyScalar(shade);
      if (far) col.lerp(HAZE, Math.min(0.45, Math.hypot(x, z) / 5200)); // distance, painted in
      colors.set([col.r, col.g, col.b], k * 3);
      uv.set([x / 9, (z + y * 0.8) / 9], k * 2);
    }
  const idx = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
function buildTerrain(scene) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: brushTex, roughness: 1 });
  scene.add(new THREE.Mesh(gridMesh(NEAR, { skirt: 4 }), mat));
  const inner = (x, z) => x > NEAR.x0 + NEAR.step && z > NEAR.z0 + NEAR.step && x < NEAR.x0 + (NEAR.nx - 2) * NEAR.step && z < NEAR.z0 + (NEAR.nz - 2) * NEAR.step;
  // the mountains round about: crisp, without fog, so the snow stays white as in the painting
  const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: brushTex, roughness: 1, fog: false });
  scene.add(new THREE.Mesh(gridMesh(FAR, { sink: inner, far: true }), farMat));
}

// ---------- ribbons laid on the ground: roads, paths, the river ----------
function ribbon(flat, width, lift, hex, out, opts = {}) {
  const pts = [];
  for (let k = 0; k < flat.length; k += 2) pts.push([flat[k], flat[k + 1]]);
  const dense = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
    for (let q = 0; q < n; q++) dense.push([ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n]);
  }
  dense.push(pts[pts.length - 1]);
  if (dense.length < 2) return;
  const ys = dense.map(([x, z]) => heightAt(x, z));
  if (opts.bridge) { // a bridge runs straight between its two ends
    const y0 = ys[0], y1 = ys[ys.length - 1];
    ys.forEach((_, i) => { ys[i] = Math.max(ys[i], y0 + ((y1 - y0) * i) / (ys.length - 1)); });
  }
  const pos = [], colors = [], idx = [];
  col.setHex(hex);
  for (let i = 0; i < dense.length; i++) {
    const [x, z] = dense[i], [px, pz] = dense[Math.max(0, i - 1)], [nx2, nz2] = dense[Math.min(dense.length - 1, i + 1)];
    let dx = nx2 - px, dz = nz2 - pz;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const ox = -dz * width / 2, oz = dx * width / 2, y = ys[i] + lift;
    pos.push(x + ox, y, z + oz, x - ox, y, z - oz);
    colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // it lies on the ground, so it faces straight up (and must have a normal: without one the
  // lighting turns to NaN and the bloom pass spreads it over the whole screen)
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  out.push(geo);
}
function buildRoads(scene) {
  const parts = [];
  const PAINT = { road: 0xb9b0c8, path: 0xeadbb0, track: 0xd8c08a };
  for (const r of DATA.roads) if (!r.t) ribbon(r.p, r.w, r.k === 'road' ? 0.09 : 0.07, PAINT[r.k], parts, { bridge: r.b });
  for (const p of DATA.rails) ribbon(p, 2.2, 0.11, 0x8a7f8a, parts);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: brushTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const g of parts) { const uv = new Float32Array(g.attributes.position.count * 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) uv.set([p.getX(i) / 6, p.getZ(i) / 6], i * 2); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  scene.add(new THREE.Mesh(mergeGeometries(parts), mat));
  // the rails themselves: two dark lines
  const railPts = [];
  for (const p of DATA.rails)
    for (let k = 0; k < p.length - 2; k += 2) {
      const ax = p[k], az = p[k + 1], bx = p[k + 2], bz = p[k + 3], L = Math.hypot(bx - ax, bz - az) || 1, ox = (-(bz - az) / L) * 0.5, oz = ((bx - ax) / L) * 0.5;
      for (const s of [-1, 1]) railPts.push(ax + ox * s, heightAt(ax, az) + 0.2, az + oz * s, bx + ox * s, heightAt(bx, bz) + 0.2, bz + oz * s);
    }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(railPts, 3));
  scene.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x3a3448 })));
}
function waterTex() {
  return canvasTex(256, (g, S) => {
    g.fillStyle = '#7fd2dc';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) {
      g.strokeStyle = any(['rgba(255,255,255,0.55)', 'rgba(170,235,240,0.7)', 'rgba(80,170,200,0.6)', 'rgba(230,250,255,0.5)']);
      g.lineWidth = 2 + rand() * 3;
      const x = rand() * S, y = rand() * S;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 6, y + 12 + rand() * 18); g.stroke();
    }
  });
}
function buildRiver(scene) {
  const parts = [];
  for (const p of DATA.river) ribbon(p, 6, 0.04, 0xffffff, parts);
  for (const p of DATA.streams) ribbon(p, 1.0, 0.05, 0xffffff, parts);
  for (const g of parts) { // texture runs along the water so it can flow
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    let along = 0;
    for (let i = 0; i < p.count; i += 2) {
      if (i) along += Math.hypot(p.getX(i) - p.getX(i - 2), p.getZ(i) - p.getZ(i - 2));
      uv.set([0, along / 8, 1, along / 8], i * 2);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const tex = waterTex();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.1, emissive: 0x2a6a78, emissiveIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -3 });
  scene.add(new THREE.Mesh(mergeGeometries(parts), mat));
  return tex;
}

// ---------- waterfalls: white ribbons down the cliffs, with spray where they land ----------
function buildFalls(scene) {
  const tex = canvasTex(128, (g, S) => {
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = rand() * S;
      g.strokeStyle = `rgba(255,255,255,${0.25 + rand() * 0.65})`;
      g.lineWidth = 1 + rand() * 4;
      const y = rand() * S;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 3, y + 20 + rand() * 50); g.stroke();
    }
  });
  tex.repeat.set(1, 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, opacity: 0.9 });
  const mistTex = canvasTex(128, (g, S) => {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.5, 'rgba(240,248,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  });
  const mists = [];
  const parts = [];
  for (const f of DATA.falls) {
    const [tx, tz, ty] = f.top, [bx, bz, by] = f.bottom;
    const drop = ty - by, w = Math.min(2.2, 0.8 + drop / 150);
    // a narrow thread of water down the rock face, spreading a little as it falls, held just
    // clear of the cliff so it never sinks into it
    const hx = bx - tx, hz = bz - tz, hl = Math.hypot(hx, hz) || 1;
    const ax = -hz / hl, az = hx / hl; // across the fall
    const geo = new THREE.PlaneGeometry(1, 1, 1, 16);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const t = 0.5 - p.getY(i); // 0 at the top, 1 at the bottom
      const lx = p.getX(i) * w * (1 + t * 0.6);
      const x = tx + hx * t + ax * lx, z = tz + hz * t + az * lx;
      p.setXYZ(i, x, Math.max(ty - drop * t, heightAt(x, z)) + 0.9, z);
      uv.setXY(i, uv.getX(i), (1 - uv.getY(i)) * drop / 18);
    }
    parts.push(geo);
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.75 }));
    m.position.set(bx, by + 3, bz);
    m.scale.setScalar(6 + drop / 25);
    scene.add(m);
    mists.push(m);
  }
  scene.add(new THREE.Mesh(mergeGeometries(parts), mat));
  return { tex, mists };
}

// ---------- chalets ----------
// A Bernese chalet face: a white stone ground floor, dark wooden storeys above, rows of
// windows with red geraniums in their boxes. Barns are all wood.
const chaletTex = canvasTex(512, (g, S) => {
  g.fillStyle = '#8a5634';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 8) { g.fillStyle = y % 16 ? '#7a4a2c' : '#94603a'; g.fillRect(0, y, S, 6); }
  g.fillStyle = '#f2ebdc'; g.fillRect(0, S * 0.72, S, S * 0.28); // stone base
  g.fillStyle = 'rgba(160,150,180,0.35)'; for (let i = 0; i < 40; i++) g.fillRect(rand() * S, S * 0.72 + rand() * S * 0.28, 20, 3);
  for (const row of [0.14, 0.44]) {
    for (let k = 0; k < 4; k++) {
      const x = 34 + k * 122, y = S * row;
      g.fillStyle = '#f4ead0'; g.fillRect(x - 6, y - 6, 74, 86); // window frame
      g.fillStyle = '#2a3460'; g.fillRect(x, y, 62, 72);
      g.fillStyle = '#5a7ab8'; g.fillRect(x + 4, y + 4, 24, 30);
      g.fillStyle = '#6a3a22'; g.fillRect(x - 22, y - 4, 16, 80); g.fillRect(x + 68, y - 4, 16, 80); // shutters
      g.fillStyle = '#5a3a24'; g.fillRect(x - 10, y + 76, 86, 14); // flower box
      for (let q = 0; q < 14; q++) { g.fillStyle = any(['#e8303a', '#ff4a5a', '#d82040', '#3f8a3c', '#ff6a7a']); g.beginPath(); g.arc(x - 6 + rand() * 80, y + 74 + rand() * 6, 5 + rand() * 4, 0, 7); g.fill(); }
    }
  }
  g.fillStyle = '#5a3420'; g.fillRect(0, S * 0.66, S, 10); // balcony rail
  for (let x = 0; x < S; x += 14) g.fillRect(x, S * 0.6, 4, S * 0.07);
}, 1);
const barnTex = canvasTex(256, (g, S) => {
  g.fillStyle = '#7a4c2e'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 10) { g.fillStyle = x % 20 ? '#6a4026' : '#865436'; g.fillRect(x, 0, 8, S); }
  g.fillStyle = '#4a2e1c'; g.fillRect(S * 0.35, S * 0.5, S * 0.3, S * 0.5);
}, 1);
function gableRoof(L, W, rise, over) {
  const l = L / 2 + over, w = W / 2 + over;
  const v = [-l, 0, -w, l, 0, -w, -l, rise, 0, l, rise, 0, -l, 0, w, l, 0, w];
  const pos = [], push = (...ids) => ids.forEach((i) => pos.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]));
  push(0, 2, 1, 1, 2, 3, 4, 5, 2, 5, 3, 2); // the two slopes
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, i) => (i % 3 === 1 ? [] : [v / 3])), 2));
  g.computeVertexNormals();
  return g;
}
function gableEnds(L, W, rise) {
  const l = L / 2, w = W / 2;
  const pos = [-l, 0, -w, -l, 0, w, -l, rise, 0, l, 0, w, l, 0, -w, l, rise, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 1, 0.5, 0.5, 0.75, 0, 0.5, 1, 0.5, 0.5, 0.75], 2));
  g.computeVertexNormals();
  return g;
}
function buildChalets(scene) {
  const bodies = [], barns = [], roofs = [], ends = [];
  const ROOFS = [0x5a4650, 0x6a4a42, 0x4e4458, 0x7a4a3a, 0x5e5060];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const b of B) {
    const [cx, cz, L, W, ang, base, h, kind] = b;
    if (kind === 3) continue; // the church is built on its own
    q.setFromAxisAngle(up, -ang);
    const body = new THREE.BoxGeometry(L, h, W);
    body.deleteAttribute('normal'); body.computeVertexNormals();
    m.compose(new THREE.Vector3(cx, base + h / 2, cz), q, new THREE.Vector3(1, 1, 1));
    body.applyMatrix4(m);
    (kind === 1 ? barns : bodies).push(body);
    const rise = Math.min(W * 0.32, 4), over = Math.min(1.2, W * 0.18);
    const roof = gableRoof(L, W, rise, over);
    m.compose(new THREE.Vector3(cx, base + h, cz), q, new THREE.Vector3(1, 1, 1));
    roof.applyMatrix4(m);
    const rc = new THREE.Color(any(ROOFS)), arr = new Float32Array(roof.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) arr.set([rc.r, rc.g, rc.b], i);
    roof.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    roofs.push(roof);
    const end = gableEnds(L, W, rise);
    end.applyMatrix4(m);
    ends.push(end);
  }
  const keep = (gs) => gs.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; });
  scene.add(new THREE.Mesh(mergeGeometries(keep(bodies)), new THREE.MeshStandardMaterial({ map: chaletTex, roughness: 0.85 })));
  if (barns.length) scene.add(new THREE.Mesh(mergeGeometries(keep(barns)), new THREE.MeshStandardMaterial({ map: barnTex, roughness: 0.9 })));
  scene.add(new THREE.Mesh(mergeGeometries(keep(ends)), new THREE.MeshStandardMaterial({ map: barnTex, roughness: 0.9, side: THREE.DoubleSide })));
  scene.add(new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ vertexColors: true, map: brushTex, roughness: 0.8, side: THREE.DoubleSide })));
}

// The village church: white walls, a slate roof and the tall white tower with its spire,
// with the Staubbach falling behind it as in every postcard of Lauterbrunnen.
function buildChurch(scene) {
  const g = new THREE.Group();
  const y = heightAt(CH.x, CH.z);
  g.position.set(CH.x, y, CH.z);
  g.rotation.y = -CH.ang;
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f0e4, roughness: 0.8 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x4a4e6a, roughness: 0.6, flatShading: true });
  const add = (geo, mat, x, yy, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(12, 6.5, 6.5), white, 0, 3.25, 0);
  const roof = add(new THREE.CylinderGeometry(0.01, 4.7, 3.4, 4, 1), slate, 0, 8.2, 0);
  roof.rotation.y = Math.PI / 4; roof.scale.set(1.9, 1, 1);
  add(new THREE.BoxGeometry(3.4, 13, 3.4), white, -7.2, 6.5, 0); // tower
  add(new THREE.ConeGeometry(2.5, 8, 4), slate, -7.2, 17, 0).rotation.y = Math.PI / 4; // spire
  add(new THREE.BoxGeometry(0.2, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a3460 }), -9, 10.5, 0); // clock face side
  const clock = add(new THREE.CircleGeometry(0.8, 20), new THREE.MeshStandardMaterial({ color: 0xf8e8b0, emissive: 0x403010 }), -8.92, 10.5, 0);
  clock.rotation.y = -Math.PI / 2;
  for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) add(new THREE.BoxGeometry(0.9, 2.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a4a7a, emissive: 0x101830 }), k * 3.2, 3.6, s * 3.27);
  scene.add(g);
  // a beam so the church can be found from anywhere in the valley
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 300, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  beam.position.set(CH.x, y + 150, CH.z);
  scene.add(beam);
  // flowers that bloom round the church as edelweiss are brought in
  const flowers = [];
  const fgeo = new THREE.IcosahedronGeometry(0.35, 1);
  for (let i = 0; i < LAMP_COUNT; i++) {
    const a = (i / LAMP_COUNT) * 6.283, r = 9 + (i % 3) * 1.4;
    const x = CH.x + Math.cos(a) * r * 1.4, z = CH.z + Math.sin(a) * r;
    const f = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ color: any([0xffffff, 0xfff4c8, 0xe8303a, 0xffd24a, 0xb070e0]), emissive: 0x222222, roughness: 0.6 }));
    f.position.set(x, heightAt(x, z) + 0.4, z);
    f.scale.setScalar(0.001);
    f.userData.open = 0;
    scene.add(f);
    flowers.push(f);
  }
  return { beam, flowers };
}

// ---------- trees: firs on the steep wooded slopes and in the woods ----------
function inPoly(x, z, p) {
  let ins = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function buildTrees(scene) {
  const spots = [];
  const tryAt = (g, x, z, scale) => {
    const y = heightAt(x, z);
    const ele = y / DATA.scale + DATA.base;
    if (ele > 1950) return;
    const s = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
    const wood = DATA.woods.some((p) => inPoly(x, z, p));
    if ((s > 0.5 && s < 1.15 && rand() < 0.75) || (wood && rand() < 0.9)) {
      if (rideAt(x, z) && !wood) return;
      if (inBuilding(x, z, 2)) return;
      spots.push([x, y, z, scale * (0.7 + rand() * 0.6)]);
    }
  };
  for (let k = 0; k < 9000; k++) tryAt(NEAR, NEAR.x0 + rand() * NEAR.nx * NEAR.step, NEAR.z0 + rand() * NEAR.nz * NEAR.step, 1);
  for (let k = 0; k < 6000; k++) {
    const x = FAR.x0 + rand() * FAR.nx * FAR.step, z = FAR.z0 + rand() * FAR.nz * FAR.step;
    if (sample(NEAR, x, z) !== null) continue;
    tryAt(FAR, x, z, 2.2);
  }
  const cone = new THREE.ConeGeometry(1.5, 6.5, 6).translate(0, 4.6, 0);
  const trunk = new THREE.CylinderGeometry(0.25, 0.3, 1.6, 5).translate(0, 0.8, 0);
  const fir = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), spots.length);
  const wood = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 1 }), spots.length);
  const d = new THREE.Object3D();
  spots.forEach(([x, y, z, s], i) => {
    d.position.set(x, y - 0.2, z); d.rotation.set(0, rand() * 6, 0); d.scale.set(s, s * (0.9 + rand() * 0.4), s); d.updateMatrix();
    fir.setMatrixAt(i, d.matrix); wood.setMatrixAt(i, d.matrix);
    fir.setColorAt(i, col.setHex(any([0x1f5a4e, 0x2a6a50, 0x23485e, 0x2f7a58, 0x1a4a52])));
  });
  scene.add(fir, wood);
}

// ---------- the cable car up to Mürren (Grütschalp) ----------
function buildCable(scene) {
  if (!DATA.cable) return () => {};
  const p = DATA.cable.p, pts = [];
  for (let k = 0; k < p.length; k += 2) pts.push(new THREE.Vector3(p[k], heightAt(p[k], p[k + 1]) + 8, p[k + 1]));
  pts[0].y -= 4;
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a38 })));
  for (let k = 1; k < pts.length - 1; k++) { // pylons
    const g = heightAt(pts[k].x, pts[k].z);
    const py = new THREE.Mesh(new THREE.BoxGeometry(0.6, pts[k].y - g, 0.6), new THREE.MeshStandardMaterial({ color: 0x6a6a7a }));
    py.position.set(pts[k].x, (pts[k].y + g) / 2, pts[k].z);
    scene.add(py);
  }
  const cabin = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 3.2), new THREE.MeshStandardMaterial({ color: 0xd8303a, roughness: 0.5 }));
  box.position.y = -2.4;
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.8, 3.0), new THREE.MeshStandardMaterial({ color: 0x2a3a6a, emissive: 0x0a1020 }));
  win.position.y = -2.0;
  const hang = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.15), new THREE.MeshStandardMaterial({ color: 0x3a3a48 }));
  hang.position.y = -0.7;
  cabin.add(box, win, hang);
  scene.add(cabin);
  const lens = [0];
  for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + pts[k].distanceTo(pts[k - 1]));
  const total = lens[lens.length - 1];
  return (t) => {
    const u = (Math.sin(t * 0.07) * 0.5 + 0.5) * total; // up and down, slowly
    let k = 1;
    while (k < lens.length - 1 && lens[k] < u) k++;
    const a = (u - lens[k - 1]) / (lens[k] - lens[k - 1] || 1);
    cabin.position.lerpVectors(pts[k - 1], pts[k], a);
    cabin.rotation.y = Math.atan2(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
  };
}

// ---------- cows grazing on the meadows, and hikers on the paths ----------
function buildLife(scene) {
  const cows = [];
  const cowMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.9 });
  const patchMat = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2018 });
  const bellMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.8, roughness: 0.3 });
  for (let n = 0, tries = 0; n < 26 && tries < 4000; tries++) {
    const x = (rand() - 0.5) * 260, z = (rand() - 0.5) * 520;
    if (!rideAt(x, z) || inBuilding(x, z, 4)) continue;
    const s = Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
    if (s > 0.3) continue;
    if (DATA.roads.some((r) => { for (let k = 0; k < r.p.length; k += 2) if (Math.hypot(r.p[k] - x, r.p[k + 1] - z) < 6) return true; return false; })) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 2.0), rand() < 0.5 ? cowMat : patchMat);
    body.position.y = 1.15;
    const patch = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.5, 0.8), body.material === cowMat ? patchMat : cowMat);
    patch.position.set(0, 1.25, 0.2);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.7), body.material);
    head.position.set(0, 1.25, 1.25);
    const horns = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), patchMat);
    horns.position.set(0, 0.35, -0.1);
    head.add(horns);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.28, 8), bellMat);
    bell.position.set(0, -0.45, 0.05);
    head.add(bell);
    g.add(body, patch, head);
    for (const [lx, lz] of [[-0.35, -0.75], [0.35, -0.75], [-0.35, 0.75], [0.35, 0.75]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), darkMat);
      leg.position.set(lx, 0.37, lz);
      g.add(leg);
    }
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = rand() * 6.28;
    g.scale.setScalar(1.25);
    scene.add(g);
    cows.push({ g, head, ph: rand() * 6, x, z });
    n++;
  }
  // hikers walk the paths and tracks round the village, and hop aside for the bicycle
  const routes = DATA.roads.filter((r) => r.k !== 'road' && r.p.length >= 4 && Math.abs(r.p[1]) < 260 && Math.abs(r.p[0]) < 150);
  const hikers = [];
  const SHIRT = [0xe8303a, 0x2f6ab8, 0xf2b030, 0x3f9a68, 0xb070e0, 0xff7a4a];
  for (let i = 0; i < Math.min(18, routes.length); i++) {
    const r = routes[Math.floor(rand() * routes.length)];
    const pts = [];
    for (let k = 0; k < r.p.length; k += 2) pts.push([r.p[k], r.p[k + 1]]);
    const lens = [0];
    for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    if (lens[lens.length - 1] < 15) continue;
    const g = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: any(SHIRT), roughness: 0.8 });
    const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 8), shirt); t.position.y = 1.25; g.add(t);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: any([0xf1c9a5, 0xd9a27a, 0xc68642]) })); head.position.y = 1.72; g.add(head);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), new THREE.MeshStandardMaterial({ color: any([0x2a3a5a, 0xe8d8a0, 0x8a2a2a]) })); hat.position.y = 1.86; g.add(hat);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), new THREE.MeshStandardMaterial({ color: any([0x3a5a3a, 0x6a3a2a, 0x2a2a4a]) })); pack.position.set(0, 1.3, -0.24); g.add(pack);
    const legs = [-0.1, 0.1].map((lx) => { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.6, 4, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a48 })); l.geometry.translate(0, -0.38, 0); l.position.set(lx, 0.92, 0); g.add(l); return l; });
    g.scale.setScalar(1.1);
    scene.add(g);
    hikers.push({ g, legs, pts, lens, s: rand() * lens[lens.length - 1], v: (rand() < 0.5 ? -1 : 1) * (0.9 + rand() * 0.5), hop: 0, walk: rand() * 6 });
  }
  return (t, dt, P) => {
    let hopped = false, near = 0;
    for (const c of cows) {
      c.head.rotation.x = 0.5 + Math.sin(t * 0.8 + c.ph) * 0.35; // grazing
      if (P) near = Math.max(near, 1 - Math.hypot(P.x - c.x, P.z - c.z) / 30);
    }
    for (const h of hikers) {
      const total = h.lens[h.lens.length - 1];
      h.s += h.v * dt;
      if (h.s < 0 || h.s > total) { h.v = -h.v; h.s = Math.min(total, Math.max(0, h.s)); }
      let k = 1;
      while (k < h.lens.length - 1 && h.lens[k] < h.s) k++;
      const a = (h.s - h.lens[k - 1]) / (h.lens[k] - h.lens[k - 1] || 1);
      const x = h.pts[k - 1][0] + (h.pts[k][0] - h.pts[k - 1][0]) * a, z = h.pts[k - 1][1] + (h.pts[k][1] - h.pts[k - 1][1]) * a;
      if (h.hop > 0) h.hop -= dt;
      else if (P && Math.abs(P.speed) > 3 && Math.hypot(x - P.x, z - P.z) < 3) { h.hop = 0.55; hopped = true; }
      h.walk += dt * 5;
      const sw = Math.sin(h.walk) * 0.5;
      h.legs[0].rotation.x = sw; h.legs[1].rotation.x = -sw;
      h.g.position.set(x, heightAt(x, z) + (h.hop > 0 ? Math.sin((h.hop / 0.55) * Math.PI) * 1 : 0), z);
      h.g.rotation.y = Math.atan2(h.pts[k][0] - h.pts[k - 1][0], h.pts[k][1] - h.pts[k - 1][1]) + (h.v < 0 ? Math.PI : 0);
    }
    return { hopped, bells: Math.max(0, near) };
  };
}

// ---------- the sky, Hodler's clouds round the Jungfrau, and the peaks' names ----------
function buildSky(scene) {
  const tex = canvasTex(1024, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 1024);
    gr.addColorStop(0, '#2a52c0'); gr.addColorStop(0.32, '#4a7ad8'); gr.addColorStop(0.47, '#8aaae8'); gr.addColorStop(0.5, '#c8d0ee'); gr.addColorStop(1, '#c8d0ee');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 40; i++) { // Hodler's clouds: long rows of lilac-white strokes
      const cx = rand() * 1024, cy = 140 + rand() * 300, w = 60 + rand() * 120;
      for (let k = 0; k < 50; k++) {
        g.fillStyle = any(['rgba(255,255,255,0.55)', 'rgba(240,230,255,0.5)', 'rgba(220,214,250,0.45)', 'rgba(255,240,245,0.4)']);
        g.beginPath(); g.ellipse(cx + (rand() - 0.5) * w * 2, cy + (rand() - 0.5) * w * 0.3, 14 + rand() * 20, 4 + rand() * 5, 0, 0, 7); g.fill();
      }
    }
  });
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4200, 40, 20), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -2;
  scene.add(dome);
  // the band of cloud across the mountains' middles, as in the painting
  const cloudTex = canvasTex(256, (g, S) => {
    for (let i = 0; i < 90; i++) {
      const x = S / 2 + (rand() - 0.5) * S * 0.7, y = S / 2 + (rand() - 0.5) * S * 0.3, r = 20 + rand() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = any(['255,255,255', '240,234,255', '230,226,250', '255,244,248']);
      gr.addColorStop(0, `rgba(${c},0.5)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
  });
  cloudTex.wrapS = cloudTex.wrapT = THREE.ClampToEdgeWrapping;
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const a = -0.2 + (i / 14) * 1.6 + (rand() - 0.5) * 0.1; // mostly to the south, round the Jungfrau
    const d = 900 + rand() * 900;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.7, fog: false }));
    s.position.set(Math.sin(a) * d * 0.6, 170 + rand() * 90, Math.cos(a) * d);
    s.scale.set(600 + rand() * 400, 140 + rand() * 80, 1);
    scene.add(s);
    clouds.push(s);
  }
  // names of the great peaks, small and white, floating over them
  const NAMES = ['Jungfrau', 'Mönch', 'Eiger', 'Silberhorn', 'Schwarzmönch', 'Schilthorn', 'Männlichen'];
  for (const p of DATA.peaks.filter((q) => NAMES.includes(q.name))) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.font = '600 46px "Space Grotesk", ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(30, 40, 90, 0.55)';
    g.beginPath(); g.roundRect(256 - g.measureText(p.name).width / 2 - 26, 24, g.measureText(p.name).width + 52, 64, 32); g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(p.name, 256, 48);
    g.font = '500 24px ui-sans-serif, system-ui, sans-serif';
    g.fillStyle = '#e8ecff';
    g.fillText(`${p.ele} m`, 256, 104);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
    s.position.set(p.x, p.y * LOOM(p.x, p.z) + 34, p.z);
    s.scale.set(160, 40, 1);
    scene.add(s);
  }
  return { dome, clouds };
}

// ---------- map ----------
export function drawMap(g, S) {
  const k = S / MAP_SPAN, c = S / 2;
  g.fillStyle = '#c89ab0';
  g.fillRect(0, 0, S, S);
  const n = NEAR, cell = n.step * k;
  for (let j = 0; j < n.nz; j += 2)
    for (let i = 0; i < n.nx; i += 2) {
      const x = c + (n.x0 + i * n.step) * k, z = c + (n.z0 + j * n.step) * k;
      if (x < -cell || z < -cell || x > S || z > S) continue;
      g.fillStyle = RIDE[j * n.nx + i] ? '#6cc24e' : (n.h[j * n.nx + i] > 60 ? '#5aa04a' : '#c89ab0');
      g.fillRect(x, z, cell * 2 + 0.5, cell * 2 + 0.5);
    }
  g.lineCap = 'round';
  const line = (p, w, colr) => { g.strokeStyle = colr; g.lineWidth = w; g.beginPath(); for (let q = 0; q < p.length; q += 2) g.lineTo(c + p[q] * k, c + p[q + 1] * k); g.stroke(); };
  for (const p of DATA.river) line(p, 5, '#6ab8e8');
  for (const r of DATA.roads) if (!r.t) line(r.p, r.k === 'road' ? 4 : 2, r.k === 'road' ? '#f4ecd8' : '#e8d8b0');
  g.fillStyle = '#7a4a2c';
  for (const b of B) g.fillRect(c + b[0] * k - 2, c + b[1] * k - 2, 4, 4);
  g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  for (const f of DATA.falls) { g.beginPath(); g.moveTo(c + f.top[0] * k, c + f.top[1] * k); g.lineTo(c + f.bottom[0] * k, c + f.bottom[1] * k); g.stroke(); }
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(c + CH.x * k, c + CH.z * k, 11, 0, 7); g.fill();
  g.fillStyle = '#d83040';
  g.fillRect(c + CH.x * k - 2, c + CH.z * k - 7, 4, 14); g.fillRect(c + CH.x * k - 7, c + CH.z * k - 2, 14, 4);
}

export function buildWorld(scene, renderer, camera) {
  camera.far = 6000;
  camera.updateProjectionMatrix();
  const fogDay = new THREE.Color(0xb8c4ea), fogDusk = new THREE.Color(0xf2c0a8);
  scene.fog = new THREE.FogExp2(fogDay.getHex(), 0.00032);
  const hemi = new THREE.HemisphereLight(0xeaf2ff, 0x6a8a58, 1.45);
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.8);
  sun.position.set(0.5, 0.85, -0.3);
  scene.add(hemi, sun);
  const skyDay = new THREE.Color(0xeaf2ff), skyDusk = new THREE.Color(0xffc8b0), sunDay = new THREE.Color(0xfff2dc), sunDusk = new THREE.Color(0xff9a6a);

  buildTerrain(scene);
  buildRoads(scene);
  const water = buildRiver(scene);
  const falls = buildFalls(scene);
  buildChalets(scene);
  const church = buildChurch(scene);
  buildTrees(scene);
  const cable = buildCable(scene);
  const life = buildLife(scene);
  const sky = buildSky(scene);

  let lit = 0;
  return {
    setDelivered(count) { lit = Math.min(LAMP_COUNT, count); },
    update(t, dt, cam, dusk, P) {
      sky.dome.position.copy(cam.position);
      sky.dome.material.color.setRGB(1, 1 - dusk * 0.2, 1 - dusk * 0.35);
      scene.fog.color.copy(fogDay).lerp(fogDusk, dusk);
      hemi.color.copy(skyDay).lerp(skyDusk, dusk);
      sun.color.copy(sunDay).lerp(sunDusk, dusk);
      sun.intensity = 1.8 - dusk * 0.6;
      water.offset.y = -t * 0.35; // the Weisse Lütschine runs fast and milky
      falls.tex.offset.y = -t * 0.9; // the streaks run down the rock (v grows from the top of each fall)
      falls.mists.forEach((m, i) => { m.material.opacity = 0.55 + 0.2 * Math.sin(t * 2 + i); });
      sky.clouds.forEach((c, i) => { c.position.x += Math.sin(t * 0.05 + i) * dt * 2; });
      church.beam.material.opacity = 0.13 + 0.04 * Math.sin(t * 2);
      church.flowers.forEach((f, i) => {
        const want = i < lit ? 1 : 0;
        f.userData.open += (want - f.userData.open) * Math.min(1, dt * 2.5);
        f.scale.setScalar(Math.max(0.001, f.userData.open * 1.4));
      });
      cable(t);
      const l = life(t, dt, P);
      const say = notice; notice = null;
      return { hop: l.hopped, murmur: l.bells * 0.5, notice: say };
    },
  };
}

// for testing from the console: what is at a spot
export const probe = (x, z) => ({ ride: rideAt(x, z), building: inBuilding(x, z, 0.4)?.b ?? null, h: heightAt(x, z) });
