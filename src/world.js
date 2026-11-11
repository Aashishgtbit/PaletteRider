// The valley: terrain shape, sky, pines, lake and the monastery.
import * as THREE from 'three';

export const INFO = {
  title: 'AURORA TRAIL',
  sub: 'A night ride in the high Himalaya',
  how: 'Stars have fallen into the valley. Gather them on your bicycle and carry them up to the <em>monastery</em> before dawn. The more you bring in one trip, the bigger the bonus — but land a jump badly and you spill half of them.',
  brief: 'Collect the fallen stars and carry them up to the monastery before dawn.',
  goal: 'MONASTERY',
  item: 'star',
  icon: '★',
  colors: [0xfff0a8, 0x9fe8ff],
  glow: '#7dffc8',
  menuCam: { r: 62, h: 36 },
};

export const MON = { x: 0, z: -70 }; // monastery position
export const HILL_H = 16; // height of the monastery hilltop
export const LAKE_Y = -4.5; // frozen lake surface
export const WORLD_R = 235; // how far the rider may go
export const LAMP_COUNT = 24;

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(ix, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z) {
  let amp = 0.5, sum = 0, f = 1;
  for (let i = 0; i < 4; i++) {
    sum += amp * vnoise(x * f, z * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

// Ground height anywhere in the world. Physics and visuals both use this.
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.012 + 10, z * 0.012 + 10) - 0.5) * 36 + (fbm(x * 0.05, z * 0.05) - 0.5) * 5;
  const rim = smooth(150, 290, r);
  h += rim * rim * 140; // the ring of peaks
  h = Math.max(h, LAKE_Y);
  const d = Math.hypot(x - MON.x, z - MON.z);
  const t = 1 - smooth(18, 78, d); // monastery hill with a flat top
  return h + (HILL_H - h) * t;
}

// ---------- pines (kept in a grid so the rider can bump into them) ----------
const CELL = 8;
const treeGrid = new Map();
export function treesNear(x, z) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  const out = [];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const list = treeGrid.get(`${cx + i},${cz + j}`);
      if (list) out.push(...list);
    }
  return out;
}

// Bump off pine trunks. Returns how hard the bump was.
export function pushOut(P) {
  if (!P.grounded) return 0;
  let hit = 0;
  for (const t of treesNear(P.x, P.z)) {
    const tx = P.x - t.x, tz = P.z - t.z, td = Math.hypot(tx, tz), rad = 0.75 * t.s;
    if (td < rad && td > 0.001) {
      P.x = t.x + (tx / td) * rad; P.z = t.z + (tz / td) * rad;
      hit = Math.abs(P.speed);
      P.speed *= -0.25;
    }
  }
  return hit;
}

// Where the next star appears; high ones need a jump.
export function starSpot() {
  const a = Math.random() * Math.PI * 2, r = 22 + Math.sqrt(Math.random()) * 185;
  const x = Math.cos(a) * r, z = Math.sin(a) * r, high = Math.random() < 0.3;
  return { x, z, high, y: heightAt(x, z) + (high ? 4 + Math.random() * 2.5 : 1.2) };
}

function buildTerrain(scene) {
  const geo = new THREE.PlaneGeometry(720, 720, 230, 230);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const meadow = new THREE.Color(0x12332f), shore = new THREE.Color(0x1b3040);
  const rock = new THREE.Color(0x2b3a4d), snow = new THREE.Color(0xb9d4e6);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.08 + 3, z * 0.08 + 7);
    c.copy(shore).lerp(meadow, smooth(LAKE_Y, LAKE_Y + 3, h));
    c.lerp(rock, smooth(12, 24, h + n * 6));
    c.lerp(snow, smooth(20, 40, h + n * 10));
    c.multiplyScalar(0.8 + n * 0.4);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })
  );
  scene.add(mesh);

  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(300, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b2a3a, roughness: 0.15, metalness: 0.6, emissive: 0x06303a, emissiveIntensity: 0.5 })
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.y = LAKE_Y + 0.06;
  scene.add(lake);
}

function buildTrees(scene) {
  const spots = [];
  let seed = 1;
  const rnd = () => hash(seed++, 9173);
  for (let i = 0; i < 2600 && spots.length < 800; i++) {
    const a = rnd() * Math.PI * 2, r = 12 + Math.sqrt(rnd()) * 240;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < LAKE_Y + 0.6 || h > 26) continue;
    if (Math.hypot(x - MON.x, z - MON.z) < 30) continue;
    if (Math.hypot(x, z - 40) < 12) continue; // keep the start clear
    if (fbm(x * 0.02 + 50, z * 0.02 + 50) < 0.5) continue; // groves, not a carpet
    spots.push({ x, z, h, s: 0.7 + rnd() * 0.9, rot: rnd() * 6.28 });
  }

  const cone = new THREE.ConeGeometry(1.5, 5.2, 6);
  cone.translate(0, 3.6, 0);
  const cp = cone.attributes.position;
  const cc = new Float32Array(cp.count * 3);
  const green = new THREE.Color(0x0e3b30), frost = new THREE.Color(0xcfe8f2), tmp = new THREE.Color();
  for (let i = 0; i < cp.count; i++) {
    tmp.copy(green).lerp(frost, smooth(3.6, 6.4, cp.getY(i)));
    cc.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  cone.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.28, 1.4, 5);
  trunkGeo.translate(0, 0.7, 0);

  const foliage = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), spots.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 1 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rot);
    m.compose(new THREE.Vector3(t.x, t.h - 0.1, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
    foliage.setMatrixAt(i, m);
    trunks.setMatrixAt(i, m);
    const key = `${Math.floor(t.x / CELL)},${Math.floor(t.z / CELL)}`;
    if (!treeGrid.has(key)) treeGrid.set(key, []);
    treeGrid.get(key).push(t);
  });
  scene.add(foliage, trunks);
}

function buildMonastery(scene) {
  const g = new THREE.Group();
  g.position.set(MON.x, HILL_H, MON.z);
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.9 });
  const maroon = new THREE.MeshStandardMaterial({ color: 0x6a1420, roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.35, metalness: 0.7, emissive: 0x4a3000 });
  const glowWin = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  const box = (w, h, d, mat, y, x = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  box(14, 5, 10, white, 2.5);
  box(14.4, 1, 10.4, maroon, 5.3);
  box(9, 3.4, 7, white, 7.5);
  box(9.4, 0.8, 7.4, maroon, 9.5);
  box(10.6, 0.35, 8.6, gold, 10.05);
  box(4, 1.8, 4, maroon, 11.1);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2, 4), gold);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 13;
  g.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
  finial.position.y = 14.4;
  g.add(finial);
  // windows on all four sides, door on the front (+z, facing the valley)
  for (const side of [1, -1]) {
    for (let i = -2; i <= 2; i++) {
      if (side === 1 && i === 0) continue;
      box(1, 1.5, 0.12, glowWin, 3, i * 2.5, side * 5.02);
    }
    for (let i = -1; i <= 1; i++) box(0.9, 1.2, 0.12, glowWin, 7.6, i * 2.6, side * 3.52);
    for (let i = -1; i <= 1; i++) box(0.12, 1.5, 1, glowWin, 3, side * 7.02, i * 2.8);
  }
  box(2, 3, 0.2, maroon, 1.5, 0, 5.05);
  box(2.4, 0.3, 0.3, gold, 3.15, 0, 5.1);

  // a small chorten beside the hall
  const ch = new THREE.Group();
  ch.position.set(11.5, 0, 3);
  const cb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 2.4), white); cb.position.y = 0.5;
  const cd = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), white); cd.position.y = 1.7;
  const cs = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.8, 8), gold); cs.position.y = 3.4;
  ch.add(cb, cd, cs);
  g.add(ch);

  // prayer flags from the roof out to poles
  const flagCols = [0x2e6bd6, 0xf2f2f2, 0xd63a3a, 0x2fa35a, 0xe8c431];
  const flagGeo = new THREE.PlaneGeometry(0.55, 0.42);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c });
  const flags = [];
  for (let s = 0; s < 6; s++) {
    const a = (s / 6) * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(a) * 16.5, 3.2, Math.sin(a) * 16.5);
    const top = new THREE.Vector3(0, 13.4, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 5), poleMat);
    pole.position.set(end.x, 1.6, end.z);
    g.add(pole);
    for (let i = 1; i < 22; i++) {
      const t = i / 22;
      const p = top.clone().lerp(end, t);
      p.y -= Math.sin(t * Math.PI) * 1.6; // sag
      const f = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: flagCols[i % 5], side: THREE.DoubleSide }));
      f.position.copy(p);
      f.rotation.y = -a + Math.PI / 2;
      f.userData.ph = i * 0.7 + s;
      g.add(f);
      flags.push(f);
    }
  }

  // butter lamps around the courtyard: one lights for every star delivered
  const lamps = [];
  const bowl = new THREE.CylinderGeometry(0.22, 0.14, 0.5, 8);
  const flame = new THREE.SphereGeometry(0.2, 8, 6);
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i < LAMP_COUNT; i++) {
    const a = (i / LAMP_COUNT) * Math.PI * 2;
    const b = new THREE.Mesh(bowl, brass);
    b.position.set(Math.cos(a) * 13, 0.25, Math.sin(a) * 13);
    const fl = new THREE.Mesh(flame, new THREE.MeshBasicMaterial({ color: 0x1a1410 }));
    fl.position.set(b.position.x, 0.72, b.position.z);
    fl.scale.y = 1.5;
    g.add(b, fl);
    lamps.push(fl);
  }

  // a soft beam so the monastery can be found from anywhere
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 260, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8fffd8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
  );
  beam.position.y = 144;
  g.add(beam);

  const light = new THREE.PointLight(0xffb060, 22, 70, 1.6);
  light.position.set(0, 6, 9);
  g.add(light);

  scene.add(g);
  return { lamps, beam, flags };
}

const SKY_FRAG = /* glsl */ `
  uniform float uTime, uDawn, uPower;
  varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.02; a*=0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 night = mix(vec3(0.030,0.075,0.130), vec3(0.004,0.010,0.030), pow(h, 0.5));
    vec3 dawn = mix(vec3(0.98,0.52,0.30), vec3(0.16,0.27,0.52), pow(h, 0.42));
    vec3 col = mix(night, dawn, uDawn);
    if (d.y > 0.02) {
      vec2 p = d.xz / (d.y + 0.28);
      float a = 0.0, w = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        vec2 q = p * (0.7 + fi*0.4) + vec2(fi*3.1, uTime*0.015*(fi+1.0));
        w = fbm(q*0.8 + vec2(uTime*0.02, 0.0));
        float ribbon = sin(q.x*1.5 + w*6.5 + fi*2.0);
        float band = smoothstep(0.55, 1.0, ribbon);
        float rays = 0.55 + 0.45*noise(vec2(q.x*14.0 + w*8.0, uTime*0.3));
        a += band * rays * (1.0 - fi*0.25);
      }
      float fade = smoothstep(0.02, 0.22, d.y) * (1.0 - smoothstep(0.8, 1.0, d.y));
      vec3 ac = mix(vec3(0.10,1.00,0.55), vec3(0.60,0.28,1.00), smoothstep(0.25, 0.85, d.y + w*0.25));
      col += ac * a * fade * uPower * (1.0 - uDawn*0.9);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

function buildSky(scene) {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uDawn: { value: 0 }, uPower: { value: 0.95 } };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  dome.renderOrder = -2;
  group.add(dome);

  const n = 2200, sp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = Math.random() * 0.95 + 0.03, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    sp.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xdfeeff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
  const points = new THREE.Points(sg, starMat);
  points.renderOrder = -1;
  group.add(points);

  const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf3f0dc, fog: false }));
  moon.position.set(-420, 420, -560);
  group.add(moon);

  scene.add(group);
  return { group, uniforms, starMat };
}

function buildSnow(scene) {
  const n = 1400, R = 40, arr = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) arr[i] = (Math.random() - 0.5) * 2 * R;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }));
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, arr, R, n };
}

export function buildWorld(scene) {
  scene.fog = new THREE.FogExp2(0x0a2030, 0.0036);
  const hemi = new THREE.HemisphereLight(0x7fe6cf, 0x142a3a, 2.2);
  const moonLight = new THREE.DirectionalLight(0xbfd4ff, 2.2);
  moonLight.position.set(-0.5, 0.7, -0.6);
  scene.add(hemi, moonLight);

  buildTerrain(scene);
  buildTrees(scene);
  const mon = buildMonastery(scene);
  const sky = buildSky(scene);
  const snow = buildSnow(scene);

  const fogNight = new THREE.Color(0x0a2030), fogDawn = new THREE.Color(0xc98a78);
  const hemiNight = new THREE.Color(0x6fd8c0), hemiDawn = new THREE.Color(0xffd0b0);
  let lit = 0;

  return {
    // one lamp per delivered star; the aurora grows with every delivery
    setDelivered(count) {
      lit = Math.min(LAMP_COUNT, count);
      mon.lamps.forEach((l, i) => l.material.color.set(i < lit ? 0xffb347 : 0x1a1410));
      sky.uniforms.uPower.value = 0.95 + Math.min(count, 60) * 0.02;
    },
    update(t, dt, camera, dawn) {
      sky.group.position.copy(camera.position);
      sky.uniforms.uTime.value = t;
      sky.uniforms.uDawn.value = dawn;
      sky.starMat.opacity = 1 - dawn;
      scene.fog.color.copy(fogNight).lerp(fogDawn, dawn);
      hemi.color.copy(hemiNight).lerp(hemiDawn, dawn);
      hemi.intensity = 2.2 + dawn * 1.2;
      mon.beam.material.opacity = 0.08 + 0.04 * Math.sin(t * 2);
      for (const f of mon.flags) f.rotation.x = Math.sin(t * 5 + f.userData.ph) * 0.35;
      for (let i = 0; i < lit; i++) mon.lamps[i].scale.y = 1.4 + Math.sin(t * 9 + i) * 0.25;
      // snow drifts down in a box that follows the camera
      const { arr, R, n, pts } = snow;
      for (let i = 0; i < n; i++) {
        let y = arr[i * 3 + 1] - dt * 2.2;
        if (y < -R) y += 2 * R;
        arr[i * 3 + 1] = y;
        arr[i * 3] += Math.sin(t + i) * dt * 0.4;
      }
      pts.geometry.attributes.position.needsUpdate = true;
      pts.position.copy(camera.position);
    },
  };
}
