// Archery: a roped-off range on the east lawn of Monet's garden. Walk up to the shooting line,
// draw the bow and loose 5 or 10 arrows at a straw target that rides a rail from side to side.
// Every arrow flies a real arc: it drops if the bow is not fully drawn, the wind carries it
// sideways, and it lands where the target *will be*, not where it was. Rings score 10 to 1.
//
// The range is built in its own frame: the archer stands at the origin and shoots along -z.
import * as THREE from 'three';

const R = 0.8; // radius of the target face, metres: ten rings of 8 cm
const TY = 1.4; // height of its centre
const BACK_Z = -30; // the wall of straw bales behind everything
const HALF_W = 5.5; // half the width of the range
const GRAV = 9, V_FULL = 48; // m/s² and m/s at full draw
const WIND_PUSH = 0.85; // sideways m/s² per m/s of wind
const SLOW = 0.3; // the arrow's flight is watched in slow motion, from just behind it
const EYE = new THREE.Vector3(0.3, 1.62, 0.4);
const START = new THREE.Vector3(0.12, 1.5, -0.5); // where the arrow leaves the bow
const LEVELS = {
  Easy: { d: 18, amp: 0, period: 1, wind: [0, 1.5], gust: 0 },
  Medium: { d: 22, amp: 1.7, period: 6.5, wind: [1, 4], gust: 0.1 },
  Hard: { d: 26, amp: 2.4, period: 5.2, wind: [2.5, 6], gust: 0.22 },
};
const RING_COLORS = ['#8d8478', '#f4f1e8', '#f4f1e8', '#2b2b30', '#2b2b30', '#3b8fd8', '#3b8fd8', '#e0453c', '#e0453c', '#f6c634', '#f6c634'];
const RING_NAMES = ['MISS', 'WHITE', 'WHITE', 'BLACK', 'BLACK', 'BLUE', 'BLUE', 'RED', 'RED', 'GOLD', 'BULLSEYE'];
const lightRing = (score) => score >= 9 || score === 1 || score === 2; // gold and white want dark lettering
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
// the ten-ring face: white, black, blue, red and gold, two rings of each
const targetTexture = () => canvasTexture(512, 512, (g, w) => {
  const c = w / 2;
  for (let ring = 1; ring <= 10; ring++) {
    g.fillStyle = RING_COLORS[ring];
    g.beginPath(); g.arc(c, c, c * (1 - (ring - 1) / 10), 0, Math.PI * 2); g.fill();
    g.strokeStyle = ring === 3 || ring === 4 ? 'rgba(255,255,255,0.75)' : 'rgba(20,20,20,0.6)';
    g.lineWidth = 2; g.stroke();
  }
  g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(c, c, c / 20, 0, Math.PI * 2); g.stroke(); // the inner ten
  g.beginPath(); g.moveTo(c - 5, c); g.lineTo(c + 5, c); g.moveTo(c, c - 5); g.lineTo(c, c + 5); g.stroke();
});
const strawTexture = () => canvasTexture(256, 128, (g, w, h) => {
  g.fillStyle = '#d8b25e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = ['rgba(120,84,30,0.35)', 'rgba(255,236,170,0.5)', 'rgba(170,124,50,0.4)'][i % 3];
    g.lineWidth = 1 + Math.random();
    const x = Math.random() * w, y = Math.random() * h, l = 8 + Math.random() * 22;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - 0.5) * 4); g.stroke();
  }
  g.fillStyle = 'rgba(90,60,20,0.55)'; // the twine round a bale
  g.fillRect(0, h * 0.3, w, 3); g.fillRect(0, h * 0.7, w, 3);
});
const lawnTexture = () => canvasTexture(256, 256, (g, w, h) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#7cbc58' : '#6eae4e'; g.fillRect(0, (i * h) / 8, w, h / 8); }
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,200,0.07)' : 'rgba(20,70,20,0.08)';
    g.fillRect(Math.random() * w, Math.random() * h, 2, 5);
  }
});
const sockTexture = () => canvasTexture(64, 64, (g, w, h) => {
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#fff6e6' : '#f0642c'; g.fillRect(0, (i * h) / 4, w, h / 4); }
});

const CSS = `
#archUI { position: absolute; inset: 0; pointer-events: none; display: none; }
#mind.arch #archUI { display: block; }
#archAim { position: absolute; left: 0; top: 0; --r: 26px; --p: 0; width: calc(var(--r) * 2 + 10px); height: calc(var(--r) * 2 + 10px); margin: calc(var(--r) * -1 - 5px) 0 0 calc(var(--r) * -1 - 5px); border-radius: 50%;
  background: conic-gradient(var(--mg-a) calc(var(--p) * 360deg), rgba(255,255,255,0.22) 0);
  -webkit-mask: radial-gradient(circle, transparent var(--r), #000 calc(var(--r) + 1px)); mask: radial-gradient(circle, transparent var(--r), #000 calc(var(--r) + 1px));
  filter: drop-shadow(0 0 3px rgba(0,0,0,0.7)); opacity: 0; transition: opacity 0.2s; }
#archUI.aim #archAim { opacity: 1; }
#mind.arch #mindTop b { white-space: nowrap; }
#archUI.over #archShots, #archUI.over #archWind { display: none; }
#archUI.full #archAim { filter: drop-shadow(0 0 8px var(--mg-a)); }
#archWind { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); padding: 10px 14px; border-radius: 16px; text-align: center; min-width: 84px; }
#archWind small, #archDist small { display: block; font: 600 10px var(--mg-mono); letter-spacing: 0.22em; color: var(--mg-dim); }
#archWindArrow { display: block; font-size: 30px; line-height: 1.1; color: var(--mg-a); transition: transform 0.4s; text-shadow: 0 0 12px rgba(244,197,98,0.5); }
#archWind b { font: 700 22px var(--mg-mono); }
#archWind i { font: 500 11px var(--mg-ui); font-style: normal; color: var(--mg-dim); margin-left: 3px; }
#archWind .aw-bars { display: flex; gap: 3px; justify-content: center; margin-top: 6px; }
#archWind .aw-bars span { width: 8px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.14); }
#archWind .aw-bars span.on { background: linear-gradient(90deg, var(--mg-green), var(--mg-a)); }
#archDist { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--mg-line); }
#archDist b { font-size: 16px !important; }
#archShots { position: absolute; left: 50%; bottom: calc(86px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: flex; gap: 6px; padding: 8px 10px; border-radius: 14px; max-width: calc(100vw - 20px); }
#archShots span { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font: 700 13px var(--mg-mono); color: var(--mg-dim); border: 1.5px dashed rgba(255,255,255,0.25); }
#archShots span.next { border: 1.5px solid var(--mg-a); color: var(--mg-a); box-shadow: 0 0 10px rgba(244,197,98,0.45); }
#archShots span.shot { border: 1.5px solid rgba(0,0,0,0.35); }
#archPop { position: absolute; left: 27%; top: 46%; transform: translate(-50%, -50%); text-align: center; opacity: 0; }
#archPop b { display: block; font: 700 96px var(--mg-mono); line-height: 1; text-shadow: 0 4px 30px rgba(0,0,0,0.6); }
#archPop span { display: inline-block; margin-top: 6px; padding: 5px 14px; border-radius: 20px; font: 700 14px var(--mg-mono); letter-spacing: 0.22em; background: rgba(30,20,10,0.75); }
#archPop.on { animation: archPop 1.5s ease-out both; }
@keyframes archPop { 0% { opacity: 0; transform: translate(-50%, -30%) scale(0.5); } 14% { opacity: 1; transform: translate(-50%, -50%) scale(1.12); } 24% { transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -62%) scale(1); } }
@media (max-width: 600px) {
  #archWind { right: 8px; top: 196px; transform: none; padding: 7px 10px; min-width: 66px; }
  #archWindArrow { font-size: 22px; } #archWind b { font-size: 17px; }
  #archShots { gap: 4px; padding: 6px 8px; bottom: calc(192px + env(safe-area-inset-bottom)); }
  #archShots span { width: 24px; height: 24px; font-size: 11px; }
  #archPop { left: 50%; top: 25%; }
  #archPop b { font-size: 72px; }
}`;

export function createArchery({ scene, at, camera, tone, won, mats }) {
  const { glow, walnut, oak, brass, GOLD, neonTexture } = mats;
  const face = at.face ?? 0, cosF = Math.cos(face), sinF = Math.sin(face);
  const toWorld = (v, out) => out.set(at.x + v.x * cosF + v.z * sinF, v.y, at.z - v.x * sinF + v.z * cosF);
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
  const box = (w, h, d, m, x, y, z, parent = root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const straw = mat(0xffffff, { map: strawTexture(), roughness: 1 });
  const rope = mat(0xe8dcc0, { roughness: 0.9 });
  const steel = mat(0x8a9098, { roughness: 0.4, metalness: 0.7 });

  // ---------- the range ----------
  const lawnTex = lawnTexture();
  lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
  lawnTex.repeat.set(1, 4);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 31), mat(0xffffff, { map: lawnTex, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0.035, -15.5);
  root.add(lawn);
  box(6.4, 0.1, 4.6, oak, 0, 0.05, 1.3); // the shooting deck
  box(6.4, 0.012, 0.12, mat(0xfff8ea), 0, 0.107, -0.72); // the line
  // a rail to shoot over, and rope fences down both sides
  box(HALF_W * 2, 0.07, 0.09, walnut, 0, 0.92, -1);
  for (let x = -HALF_W; x <= HALF_W + 0.01; x += 2.75) box(0.11, 0.95, 0.11, walnut, x, 0.475, -1);
  for (const s of [-1, 1]) {
    for (let z = -5; z >= BACK_Z; z -= 5) box(0.1, 1.05, 0.1, walnut, s * HALF_W, 0.525, z);
    for (const y of [0.55, 0.95]) box(0.035, 0.035, -BACK_Z - 1, rope, s * HALF_W, y, (BACK_Z - 1) / 2);
  }
  // the wall of bales that catches a miss
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 8; i++) {
      const b = box(1.58, 0.79, 0.9, straw, (i - 3.5) * 1.6 + (row % 2 ? 0.4 : -0.4), 0.4 + row * 0.8, BACK_Z - 0.45);
      b.rotation.y = (Math.sin(i * 12.9 + row * 7.3) * 0.04);
    }
  // the gateway, with the sign over it
  for (const s of [-1, 1]) {
    box(0.24, 3.7, 0.24, walnut, s * 2.7, 1.85, 3.5);
    box(0.34, 0.08, 0.34, brass, s * 2.7, 3.74, 3.5);
  }
  box(6.2, 0.2, 0.26, walnut, 0, 3.5, 3.5);
  const signTex = neonTexture(['ARCHERY', 'WIND · MOVING TARGET · 5 OR 10 ARROWS']);
  box(5, 1.2, 0.1, walnut, 0, 2.78, 3.5);
  for (const dz of [0.06, -0.06]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.07), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
    sign.position.set(0, 2.78, 3.5 + dz);
    if (dz < 0) sign.rotation.y = Math.PI;
    root.add(sign);
  }
  box(5.04, 0.03, 0.12, glow(GOLD), 0, 2.16, 3.5);
  // bunting from the gate to the first fence posts
  const flagColors = [0xe0453c, 0xf6c634, 0x3b8fd8, 0xfff6e6, 0x3f9a68];
  for (const s of [-1, 1])
    for (let i = 1; i < 9; i++) {
      const k = i / 9, sag = Math.sin(k * Math.PI) * 0.5;
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 3), mat(flagColors[i % 5], { side: THREE.DoubleSide, roughness: 0.7 }));
      tri.rotation.x = Math.PI;
      tri.scale.z = 0.08;
      tri.position.set(s * (2.7 + k * (HALF_W - 2.7)), 3.4 - k * 2.3 - sag, 3.5 - k * 4.5);
      tri.rotation.y = s * 0.55;
      root.add(tri);
    }
  // a rack of spare bows and a barrel of arrows beside the deck
  const rack = new THREE.Group();
  rack.position.set(2.5, 0.1, 2.3);
  root.add(rack);
  box(1.3, 0.08, 0.4, walnut, 0, 0.04, 0, rack);
  for (const s of [-1, 1]) box(0.07, 1.5, 0.07, walnut, s * 0.6, 0.75, 0, rack);
  box(1.3, 0.06, 0.07, walnut, 0, 1.3, 0, rack);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.21, 0.6, 14, 1, true), mat(0x7a4a26, { side: THREE.DoubleSide }));
  barrel.position.set(-2.5, 0.4, 2.3);
  root.add(barrel);

  // ---------- arrows and bows ----------
  const shaftMat = mat(0xd9c49a, { roughness: 0.5 }), vaneMat = mat(0xfff6e6, { side: THREE.DoubleSide, roughness: 0.7 }), cockMat = mat(0xe0453c, { side: THREE.DoubleSide, roughness: 0.7 });
  const shaftGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.8, 8).rotateX(Math.PI / 2).translate(0, 0, 0.44);
  const pointGeo = new THREE.ConeGeometry(0.016, 0.07, 8).rotateX(-Math.PI / 2).translate(0, 0, 0.035);
  const nockGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.035, 8).rotateX(Math.PI / 2).translate(0, 0, 0.845);
  const vaneShape = new THREE.Shape();
  vaneShape.moveTo(0, 0); vaneShape.quadraticCurveTo(0.03, 0.062, 0.13, 0.058); vaneShape.lineTo(0.16, 0); vaneShape.closePath();
  const vaneGeo = new THREE.ShapeGeometry(vaneShape).rotateY(-Math.PI / 2).translate(0, 0.011, 0.66); // stands up along the shaft
  // an arrow with its point at the origin, lying back along +z; it flies towards -z
  function makeArrow() {
    const g = new THREE.Group(), spin = new THREE.Group();
    spin.add(new THREE.Mesh(shaftGeo, shaftMat), new THREE.Mesh(pointGeo, brass), new THREE.Mesh(nockGeo, cockMat));
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(vaneGeo, i ? vaneMat : cockMat);
      v.rotation.z = (i * Math.PI * 2) / 3;
      spin.add(v);
    }
    g.add(spin);
    g.userData.spin = spin;
    return g;
  }
  for (let i = 0; i < 7; i++) { // the barrel of arrows
    const a = makeArrow();
    a.rotation.set(Math.PI / 2 + (Math.sin(i * 5) * 0.14), 0, Math.cos(i * 3) * 0.14);
    a.position.set(-2.5 + Math.sin(i * 2.4) * 0.12, 0.2, 2.3 + Math.cos(i * 2.4) * 0.12);
    root.add(a);
  }
  const limbCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.2, 0.035), new THREE.Vector3(0, 0.38, 0.1), new THREE.Vector3(0, 0.48, 0.13), new THREE.Vector3(0, 0.54, 0.1)]);
  const limbGeo = new THREE.TubeGeometry(limbCurve, 20, 0.014, 6).scale(1.6, 1, 1);
  const limbMat = mat(0xe9dcc0, { roughness: 0.35, side: THREE.DoubleSide });
  const stringMat = mat(0xf6f0e0, { roughness: 0.6 });
  const stringGeo = new THREE.CylinderGeometry(0.003, 0.003, 1, 5);
  const TIP = new THREE.Vector3(0, 0.5, 0.115), up = new THREE.Vector3(0, 1, 0), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  function makeBow() {
    const g = new THREE.Group();
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.36, 0.056), walnut);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.11, 10), mat(0x2a2420, { roughness: 0.9 }));
    wrap.position.y = -0.03;
    const rest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.02), brass);
    rest.position.set(0.028, 0.035, 0);
    g.add(riser, wrap, rest);
    const limbs = [1, -1].map((s) => {
      const p = new THREE.Group();
      p.position.y = s * 0.17;
      p.scale.y = s;
      p.add(new THREE.Mesh(limbGeo, limbMat));
      g.add(p);
      return p;
    });
    const strings = [0, 1].map(() => { const m = new THREE.Mesh(stringGeo, stringMat); g.add(m); return m; });
    // bend the limbs and run the string through the nocking point
    g.userData.draw = (d) => {
      const th = d * 0.24, nockZ = 0.135 + d * 0.44;
      limbs[0].rotation.x = th; limbs[1].rotation.x = -th;
      [1, -1].forEach((s, i) => {
        tmpA.set(0, s * (TIP.y * Math.cos(th) - TIP.z * Math.sin(th)) + s * 0.17, TIP.y * Math.sin(th) + TIP.z * Math.cos(th));
        tmpB.set(0, 0.035, nockZ);
        tmpC.subVectors(tmpB, tmpA);
        const len = tmpC.length();
        strings[i].position.copy(tmpA).addScaledVector(tmpC, 0.5);
        strings[i].quaternion.setFromUnitVectors(up, tmpC.divideScalar(len));
        strings[i].scale.y = len;
      });
      return nockZ;
    };
    g.userData.draw(0);
    return g;
  }
  for (const [x, tilt] of [[-0.3, 0.12], [0.3, -0.1]]) { // spare bows on the rack
    const b = makeBow();
    b.position.set(x, 0.78, 0.06);
    b.rotation.set(0, Math.PI / 2, tilt);
    rack.add(b);
  }
  // the bow in the archer's hand: it hangs in front of the camera and points where you aim
  if (!camera.parent) scene.add(camera);
  // It is held the way target-archery games show it: upright, just left of the line of sight, the
  // arrow running up the middle of the view from under the eye, and a ring sight on the riser
  // that sits exactly on the point being aimed at. `pivot` turns the whole thing to the aim;
  // `holder` undoes the zoom so the bow stays the same size on the screen.
  const pivot = new THREE.Group(), holder = new THREE.Group();
  pivot.visible = false;
  camera.add(pivot);
  pivot.add(holder);
  const bow = makeBow();
  const BOW_AT = new THREE.Vector3(-0.05, -0.145, -1.02); // the riser, from the eye
  const skin = mat(0xe8b890, { roughness: 0.7 }), sleeve = mat(0x3f7a5a, { roughness: 0.9 });
  const limb = (m, r, from, to) => { // a forearm from one point to another
    const d = new THREE.Vector3().subVectors(to, from), mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.25, d.length(), 10), m);
    mesh.position.copy(from).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return mesh;
  };
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), skin);
  hand.scale.set(0.95, 1.3, 1.15);
  hand.position.set(0, -0.035, 0.03);
  bow.add(hand, limb(sleeve, 0.03, new THREE.Vector3(-0.012, -0.075, 0.05), new THREE.Vector3(-0.34, -0.42, 0.6)));
  // the sight: a bracket off the riser, a ring, and a bead in the middle of it
  const sightMat = mat(0x1c1a18, { roughness: 0.4, metalness: 0.6 });
  const SIGHT_R = 0.028;
  const sight = new THREE.Group();
  sight.position.set(-BOW_AT.x, -BOW_AT.y, -0.02); // on the line of sight
  sight.add(new THREE.Mesh(new THREE.TorusGeometry(SIGHT_R, 0.0028, 8, 40), sightMat));
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.0016, SIGHT_R, 0.0016), sightMat);
  post.position.y = -SIGHT_R / 2;
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 10, 8), glow(0xff4a3a));
  const arm = new THREE.Mesh(new THREE.BoxGeometry(-BOW_AT.x - SIGHT_R + 0.017, 0.007, 0.007), sightMat);
  arm.position.x = -(-BOW_AT.x - SIGHT_R + 0.017) / 2 - SIGHT_R;
  sight.add(post, bead, arm);
  bow.add(sight);
  const nocked = makeArrow();
  // the hand on the string
  const drawHand = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), skin);
  fist.scale.set(1.3, 0.8, 1.2);
  drawHand.add(fist);
  bow.add(nocked, drawHand);
  holder.add(bow);

  // ---------- the target ----------
  const targetG = new THREE.Group(); // rides the rail
  root.add(targetG);
  const cart = new THREE.Group();
  targetG.add(cart);
  box(1.5, 0.1, 0.7, walnut, 0, -TY + 0.3, -0.25, cart);
  for (const s of [-1, 1]) {
    const leg = box(0.09, 1.9, 0.09, oak, s * 0.55, -0.55, -0.32, cart);
    leg.rotation.x = 0.16;
    for (const z of [-0.5, 0]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), steel);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(s * 0.6, -TY + 0.17, z);
      cart.add(wheel);
    }
  }
  const boss = new THREE.Group(); // the straw boss and its face; arrows stick in it
  targetG.add(boss);
  const bossMesh = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.1, R + 0.1, 0.24, 48), straw);
  bossMesh.rotation.x = Math.PI / 2;
  bossMesh.position.z = -0.12;
  const faceTex = targetTexture();
  const faceMesh = new THREE.Mesh(new THREE.CircleGeometry(R, 64), mat(0xffffff, { map: faceTex, roughness: 0.9, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.22 }));
  faceMesh.position.z = 0.004;
  boss.add(bossMesh, faceMesh);
  const flash = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 32), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  flash.position.z = 0.02;
  boss.add(flash);
  const rail = new THREE.Group();
  root.add(rail);
  box(8, 0.08, 0.1, steel, 0, 0.06, 0, rail);
  box(8, 0.08, 0.1, steel, 0, 0.06, -0.5, rail);
  for (let x = -3.6; x <= 3.61; x += 0.9) box(0.16, 0.05, 0.8, walnut, x, 0.03, -0.25, rail);

  // a windsock half-way down the range, and petals on the wind
  const sockPole = box(0.08, 4.4, 0.08, walnut, 3.4, 2.2, -24);
  const sock = new THREE.Group();
  sock.position.set(sockPole.position.x, 4.3, -11);
  root.add(sock);
  const sockTex = sockTexture();
  const sockMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.1, 1.7, 12, 6, true).translate(0, -0.85, 0), mat(0xffffff, { map: sockTex, side: THREE.DoubleSide, roughness: 0.8 }));
  const sockBase = sockMesh.geometry.attributes.position.array.slice();
  sock.add(sockMesh);
  const PETALS = 46, petalPos = new Float32Array(PETALS * 3), petalSeed = [];
  for (let i = 0; i < PETALS; i++) {
    petalPos.set([(Math.random() * 2 - 1) * HALF_W, 0.3 + Math.random() * 3.4, -1 - Math.random() * 28], i * 3);
    petalSeed.push(Math.random() * 6.28);
  }
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
  const petals = new THREE.Points(petalGeo, new THREE.PointsMaterial({ color: 0xffd6e4, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false, map: canvasTexture(32, 32, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(16, 16, 14, 9, 0.6, 0, Math.PI * 2); g.fill(); }) }));
  petals.frustumCulled = false;
  root.add(petals);

  // ---------- the panel ----------
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const ui = document.createElement('div');
  ui.id = 'archUI';
  ui.innerHTML = '<div id="archAim"></div>'
    + '<div id="archWind" class="mg-glass"><small>WIND</small><span id="archWindArrow">➜</span><b id="archWindN">0.0</b><i>m/s</i><div class="aw-bars"><span></span><span></span><span></span><span></span><span></span><span></span></div><div id="archDist"><small>TARGET</small><b id="archDistN">22 m</b></div></div>'
    + '<div id="archShots" class="mg-glass"></div><div id="archPop"><b></b><span></span></div>';
  $('mind').append(ui);

  // ---------- the game ----------
  const S = { arrows: 10, level: 'Medium', moves: 0, score: 0, bulls: 0, shots: [], started: false, time: 0, done: false };
  let L = LEVELS.Medium;
  let on = false, state = 'aim'; // aim, draw, fly, result, back
  let stateT = 0, power = 0, hold = 0, phase = 0, wind = 0, windNow = 0, gustPhase = 0, zoom = 1, bowUp = 0, recoil = 0, flashT = 9;
  const aim = new THREE.Vector2(0, 0.08), aimPoint = new THREE.Vector3(), focus = new THREE.Vector3();
  const held = {}; // keys
  let stuck = [], flying = null, lastTouch = null;
  const aimCam = new THREE.PerspectiveCamera();
  const targetX = () => (L.amp ? (L.amp * (Math.sin(phase) + 0.3 * Math.sin(phase * 2.3 + 1))) / 1.3 : 0);
  const stars = () => { const p = S.score / (S.arrows * 10); return p >= 0.85 ? 3 : p >= 0.6 ? 2 : 1; };
  function newWind() {
    const [a, b] = L.wind;
    wind = (a + Math.random() * (b - a)) * (Math.random() < 0.5 ? -1 : 1);
    if (Math.abs(wind) < 0.25) wind = 0;
    gustPhase = Math.random() * 6.28;
  }
  function renderShots() {
    const el = $('archShots');
    el.textContent = '';
    for (let i = 0; i < S.arrows; i++) {
      const s = document.createElement('span'), v = S.shots[i];
      if (v !== undefined) {
        s.className = 'shot';
        s.textContent = v.x ? 'X' : v.score ? String(v.score) : 'M';
        s.style.background = RING_COLORS[v.score];
        s.style.color = lightRing(v.score) ? '#2a1708' : '#fff';
      } else {
        s.textContent = String(i + 1);
        if (i === S.shots.length) s.className = 'next';
      }
      el.append(s);
    }
  }
  function setup(arrows = S.arrows, level = S.level) {
    for (const a of stuck) a.parent.remove(a);
    if (flying) root.remove(flying.mesh, flying.trail);
    stuck = []; flying = null;
    L = LEVELS[level];
    Object.assign(S, { arrows, level, moves: 0, score: 0, bulls: 0, shots: [], started: false, time: 0, done: false });
    state = 'aim'; stateT = 0; power = 0; hold = 0; phase = 0; recoil = 0; flashT = 9;
    aim.set(0, 0.08);
    targetG.position.set(0, TY, -L.d);
    rail.position.z = -L.d;
    rail.visible = L.amp > 0;
    sockPole.position.z = sock.position.z = -L.d - 2;
    newWind();
    $('archDistN').textContent = `${L.d} m`;
    $('archPop').classList.remove('on');
    renderShots();
  }

  // the view from the line: the same picture the player sees, so a point on the screen can be
  // turned into a point on the target's plane and back
  function homeCam() {
    aimCam.fov = camera.fov; aimCam.aspect = camera.aspect; aimCam.zoom = zoom;
    aimCam.position.copy(EYE);
    aimCam.lookAt(0, TY + 0.25, -L.d);
    aimCam.updateProjectionMatrix();
    aimCam.updateMatrixWorld();
  }
  const sway = () => {
    const a = 0.025 + clamp((hold - 2.4) / 2.2, 0, 1) * 0.3; // a bow held at full draw starts to shake
    return [Math.sin(S.time * 1.7 + hold * 5) * a, Math.sin(S.time * 2.3 + 1 + hold * 6.3) * a * 0.8];
  };
  function findAim() {
    homeCam();
    tmpA.set(aim.x, aim.y, 0.5).unproject(aimCam).sub(EYE).normalize();
    const k = (-L.d - EYE.z) / tmpA.z;
    const [sx, sy] = state === 'draw' ? sway() : [0, 0];
    aimPoint.copy(EYE).addScaledVector(tmpA, k);
    aimPoint.x += sx; aimPoint.y += sy;
  }
  function startDraw() {
    if (!on || S.done || state !== 'aim') return;
    state = 'draw'; hold = 0; power = 0;
    if (!S.started) { S.started = true; S.time = 0; }
    tone(196, 0.25, 0.03, 'triangle');
  }
  function release() {
    if (state !== 'draw') return;
    if (power < 0.3) { state = 'aim'; power = 0; return; } // let down: not enough to shoot
    findAim();
    // from the point of the arrow on the string, so the one that flies is the one that was nocked
    camera.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    loose(aimPoint, power, root.worldToLocal(nocked.getWorldPosition(new THREE.Vector3())));
  }
  // loose an arrow at a point on the target's plane. At full draw with no wind it lands exactly
  // there; a weaker draw is slower and so drops short of it.
  function loose(to, pw, from = START) {
    const T = to.distanceTo(from) / V_FULL, k = 0.6 + 0.4 * pw;
    const vel = new THREE.Vector3().subVectors(to, from).divideScalar(T);
    vel.y += 0.5 * GRAV * T;
    vel.multiplyScalar(k);
    const mesh = makeArrow();
    mesh.position.copy(from);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    trail.frustumCulled = false;
    root.add(mesh, trail);
    flying = { mesh, trail, n: 0, pos: from.clone(), vel, t: 0, roll: 0, wob: 0.07 * (0.5 + pw) };
    state = 'fly'; stateT = 0; power = 0;
    S.moves++;
    tone(150, 0.16, 0.1, 'triangle'); // the string
    tone(620, 0.22, 0.025, 'sawtooth'); // and the arrow leaving
    orient(flying);
  }
  const fwd = new THREE.Vector3(0, 0, -1), qA = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
  function orient(f) {
    tmpA.copy(f.vel).normalize();
    f.mesh.quaternion.setFromUnitVectors(fwd, tmpA);
    // the shaft flexes from side to side as it leaves the string, and settles as it flies
    f.mesh.quaternion.multiply(qA.setFromAxisAngle(yAxis, Math.sin(f.t * 60) * f.wob * Math.exp(-f.t * 5)));
    f.mesh.userData.spin.rotation.z = f.roll;
  }
  function land(where, score, x = false) {
    const f = flying;
    flying = null;
    root.remove(f.trail);
    f.trail.geometry.dispose();
    stuck.push(f.mesh);
    f.mesh.userData.quiver = 0.001;
    f.mesh.userData.rest = f.mesh.quaternion.clone();
    S.shots.push({ score, x });
    S.score += score;
    if (score === 10) S.bulls++;
    state = 'result'; stateT = 0;
    const pop = $('archPop');
    pop.querySelector('b').textContent = score ? (x ? 'X' : String(score)) : '0';
    pop.querySelector('b').style.color = score >= 9 ? '#ffd84a' : score ? '#fff' : '#ffb0a0';
    pop.querySelector('span').textContent = x ? 'DEAD CENTRE' : where === 'target' ? RING_NAMES[score] : where === 'bales' ? 'INTO THE BALES' : where === 'grass' ? 'IN THE GRASS' : 'OVER THE TOP';
    pop.classList.remove('on'); void pop.offsetWidth; pop.classList.add('on');
    renderShots();
    tone(score ? 95 : 130, 0.2, score ? 0.16 : 0.07); // the thud
    if (score === 10) [1318.5, 1760, 2093].forEach((fq, i) => setTimeout(() => tone(fq, 0.5, 0.06), 90 + i * 90));
    else if (score >= 7) setTimeout(() => tone(880, 0.4, 0.06), 90);
    else if (score) setTimeout(() => tone(587, 0.3, 0.05), 90);
  }
  function fly(dt) {
    const f = flying, p = f.pos, v = f.vel;
    const prev = tmpB.copy(p);
    v.x += windNow * WIND_PUSH * dt;
    v.y -= GRAV * dt;
    p.addScaledVector(v, dt);
    f.t += dt;
    f.roll += dt * 16;
    f.mesh.position.copy(p);
    orient(f);
    if (f.n < 60) {
      f.trail.geometry.attributes.position.setXYZ(f.n++, p.x, p.y, p.z);
      f.trail.geometry.attributes.position.needsUpdate = true;
      f.trail.geometry.setDrawRange(0, f.n);
    }
    const cross = (z) => (prev.z > z && p.z <= z ? (prev.z - z) / (prev.z - p.z) : -1);
    // the face of the target
    let k = cross(-L.d);
    if (k >= 0) {
      tmpC.lerpVectors(prev, p, k);
      const r = Math.hypot(tmpC.x - targetG.position.x, tmpC.y - TY);
      if (r < R) {
        const score = Math.min(10, 10 - Math.floor(r / (R / 10)));
        f.mesh.position.copy(tmpC).addScaledVector(tmpA.copy(v).normalize(), 0.09).sub(targetG.position);
        root.remove(f.mesh);
        boss.add(f.mesh);
        recoil = 1; flashT = 0;
        flash.position.set(tmpC.x - targetG.position.x, tmpC.y - TY, 0.02);
        flash.material.color.set(RING_COLORS[score]);
        focus.set(targetG.position.x, TY, -L.d);
        return land('target', score, r < R / 20);
      }
    }
    k = cross(BACK_Z + 0.02);
    if (k >= 0) {
      tmpC.lerpVectors(prev, p, k);
      if (Math.abs(tmpC.x) < 5.7 && tmpC.y < 3.2 && tmpC.y > 0) {
        f.mesh.position.copy(tmpC).addScaledVector(tmpA.copy(v).normalize(), 0.12);
        focus.copy(tmpC);
        return land('bales', 0);
      }
    }
    if (p.y <= 0.03) {
      f.mesh.position.set(p.x, 0.06, p.z);
      focus.copy(f.mesh.position);
      return land('grass', 0);
    }
    if (p.z < BACK_Z - 22 || f.t > 3) {
      root.remove(f.mesh);
      focus.set(0, 2.2, BACK_Z);
      land('over', 0);
      stuck.pop();
    }
  }

  // ---------- input ----------
  const setAim = (x, y) => aim.set(clamp(x, -0.92, 0.92), clamp(y, -0.7, 0.85));
  function pointer(type, e) {
    if (!on || S.done) return;
    const touch = e.pointerType && e.pointerType !== 'mouse';
    if (type === 'down') {
      if (touch) lastTouch = { x: e.clientX, y: e.clientY }; // a finger drags the aim from wherever it lands
      else setAim((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      startDraw();
    } else if (type === 'move') {
      if (state !== 'aim' && state !== 'draw') return;
      if (!touch) setAim((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      else if (lastTouch) {
        setAim(aim.x + ((e.clientX - lastTouch.x) / innerWidth) * 1.7, aim.y - ((e.clientY - lastTouch.y) / innerHeight) * 1.7);
        lastTouch = { x: e.clientX, y: e.clientY };
      }
    } else if (type === 'up') { lastTouch = null; release(); }
  }
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { lastTouch = null; if (on) release(); });
  const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  function key(e) {
    if (KEYS[e.code]) { held[KEYS[e.code]] = true; e.preventDefault(); return true; }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) startDraw(); return true; }
    return false;
  }
  addEventListener('keyup', (e) => {
    if (KEYS[e.code]) held[KEYS[e.code]] = false;
    if (on && (e.code === 'Space' || e.code === 'Enter')) release();
  });

  // ---------- each frame ----------
  const sockPos = sockMesh.geometry.attributes.position;
  function update(dt, t) {
    // the wind blows whether anyone is shooting or not
    windNow = wind * (1 + L.gust * Math.sin(t * 0.9 + gustPhase) + L.gust * 0.5 * Math.sin(t * 2.3 + gustPhase * 2));
    const w = Math.abs(windNow), dir = windNow >= 0 ? 1 : -1;
    sock.rotation.y = damp(sock.rotation.y, dir > 0 ? 0 : Math.PI, 3, dt);
    sock.rotation.z = damp(sock.rotation.z, 0.25 + clamp(w / 5, 0, 1) * 1.25, 3, dt); // limp in a calm, straight out in a blow
    for (let i = 0; i < sockPos.count; i++) {
      const y = sockBase[i * 3 + 1];
      sockPos.setZ(i, sockBase[i * 3 + 2] + Math.sin(t * (5 + w) + y * 5) * 0.05 * -y * (0.4 + w * 0.2));
    }
    sockPos.needsUpdate = true;
    for (let i = 0; i < PETALS; i++) {
      let x = petalPos[i * 3] + (windNow * 0.75 + Math.sin(t * 1.3 + petalSeed[i]) * 0.25) * dt;
      let y = petalPos[i * 3 + 1] + (Math.sin(t * 0.9 + petalSeed[i] * 3) * 0.3 - 0.12) * dt;
      if (x > HALF_W) x -= HALF_W * 2; else if (x < -HALF_W) x += HALF_W * 2;
      if (y < 0.15) y = 3.6;
      petalPos[i * 3] = x; petalPos[i * 3 + 1] = y;
    }
    petalGeo.attributes.position.needsUpdate = true;
    // the target rides its rail, and rocks back when it is hit
    const sdt = flying ? dt * SLOW : dt; // the world slows while an arrow is in the air
    if (state !== 'result' && !S.done) phase += (sdt * Math.PI * 2) / L.period;
    targetG.position.x = targetX();
    recoil = Math.max(0, recoil - dt * 1.6);
    boss.rotation.x = -Math.sin(recoil * 18) * 0.05 * recoil;
    flashT += dt;
    flash.material.opacity = Math.max(0, 1 - flashT * 2.2);
    flash.scale.setScalar(1 + flashT * 7);
    for (const a of stuck) { // a landed arrow quivers, then is still
      const q = a.userData.quiver;
      if (!q || q > 1.2) continue;
      a.userData.quiver = q + dt;
      a.quaternion.copy(a.userData.rest).multiply(qA.setFromAxisAngle(yAxis, Math.sin(q * 55) * 0.1 * Math.exp(-q * 6)));
    }
    if (flying) fly(sdt);
    if (!on) return;

    stateT += dt;
    if (state === 'aim' || state === 'draw') {
      const sp = (state === 'draw' ? 0.32 : 0.6) * dt;
      if (held.l || held.r || held.u || held.d) setAim(aim.x + ((held.r ? 1 : 0) - (held.l ? 1 : 0)) * sp, aim.y + ((held.u ? 1 : 0) - (held.d ? 1 : 0)) * sp);
    }
    if (state === 'draw') {
      hold += dt;
      const was = power;
      power = clamp(hold / 0.85, 0, 1);
      if (was < 1 && power === 1) tone(392, 0.12, 0.035, 'triangle');
    } else if (state === 'result' && stateT > (S.shots[S.shots.length - 1].score ? 1.55 : 1.15)) {
      if (S.shots.length >= S.arrows) { S.done = true; state = 'done'; won(); } else { state = 'back'; stateT = 0; newWind(); }
    } else if (state === 'back' && stateT > 0.95) { state = 'aim'; stateT = 0; }

    // the eye narrows on the target as the bow is drawn
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fit = (tanV * camera.aspect * (L.d + EYE.z)) / (L.amp + R + 0.5);
    const home = state === 'aim' || state === 'draw' || state === 'back';
    zoom = damp(zoom, home ? Math.max(1, Math.min(2 + power, fit)) : 1, home ? 5 : 3, dt);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();

    // the bow
    const aimOn = (state === 'aim' || state === 'draw') && !S.done;
    const showBow = aimOn || (state === 'fly' && stateT < 0.2); // it stays up a moment after the arrow has gone
    bowUp = damp(bowUp, showBow ? 1 : 0, showBow ? 7 : 14, dt);
    pivot.visible = bowUp > 0.02;
    findAim();
    if (pivot.visible) {
      tmpA.subVectors(aimPoint, EYE).transformDirection(aimCam.matrixWorldInverse);
      pivot.quaternion.setFromUnitVectors(fwd, tmpA);
      holder.scale.set(1 / zoom, 1 / zoom, 1);
      bow.position.copy(BOW_AT);
      bow.position.y -= (1 - bowUp) * 0.7;
      const shake = power === 1 ? Math.sin(t * 50) * 0.0015 * clamp(hold - 1.6, 0, 2) : 0;
      // after the release the string snaps forward and hums
      const twang = state === 'fly' ? Math.sin(stateT * 110) * 0.05 * Math.exp(-stateT * 16) : 0;
      const nockZ = bow.userData.draw(Math.max(0, power + twang));
      nocked.position.set(0.03 + shake, 0.035, nockZ - 0.85);
      nocked.visible = state !== 'fly';
      drawHand.position.set(0.045 + shake, 0.012, nockZ + 0.02);
      drawHand.visible = state === 'draw';
    }
    // the sight, the wind and the score
    ui.classList.toggle('aim', aimOn);
    ui.classList.toggle('full', power === 1);
    ui.classList.toggle('over', state === 'done' && stateT > 1); // out of the way of the score card
    if (aimOn) {
      tmpA.copy(aimPoint).project(aimCam);
      const tr = `translate(${((tmpA.x + 1) / 2) * innerWidth}px, ${((1 - tmpA.y) / 2) * innerHeight}px)`;
      // the ring that fills as the bow is drawn sits just outside the bow's own sight ring
      const ringPx = (SIGHT_R / -(BOW_AT.z + sight.position.z) / tanV) * (innerHeight / 2) + 5;
      const aimEl = $('archAim');
      aimEl.style.transform = tr;
      aimEl.style.setProperty('--r', `${ringPx.toFixed(1)}px`);
      aimEl.style.setProperty('--p', power.toFixed(3));
    }
    $('archWindN').textContent = w.toFixed(1);
    $('archWindArrow').style.transform = `scaleX(${dir})`; // +x is to the right of the archer
    $('archWindArrow').textContent = w < 0.2 ? '·' : '➜';
    $('archWind').querySelectorAll('.aw-bars span').forEach((b, i) => b.classList.toggle('on', w > i + 0.2));
  }
  // from behind the bow while aiming; then the view runs down the range after the arrow and
  // stops beside the target to see where it struck
  const camL = new THREE.Vector3(), lookL = new THREE.Vector3();
  function cameraPose(pos, look) {
    if (state === 'fly' && flying) {
      // riding just behind the arrow. The game's camera eases towards whatever it is given, so
      // it is given a point a little ahead to keep up.
      const f = flying, lead = SLOW / 4;
      camL.copy(f.pos).addScaledVector(f.vel, lead);
      camL.x += 0.16; camL.y += 0.24; camL.z += 1.35;
      lookL.copy(f.pos).addScaledVector(f.vel, SLOW / 5 + 0.05);
      focus.set(targetG.position.x, TY, -L.d);
    } else if (state === 'fly' || state === 'result' || state === 'done') {
      const close = state === 'done' ? 3.3 : 4.3, narrow = camera.aspect < 0.8;
      camL.set(focus.x * 0.75 + (narrow ? 0.3 : 0.9), Math.max(1.25, focus.y + 0.35), focus.z + (narrow ? close * 1.45 : close));
      lookL.copy(focus);
    } else {
      camL.copy(EYE);
      lookL.set(0, TY + 0.25, -L.d);
    }
    toWorld(camL, pos);
    toWorld(lookL, look);
  }

  // ---------- around the range ----------
  const RAD = 0.4;
  function pushBox(P, x0, x1, z0, z1) {
    if (P.x < x0 - RAD || P.x > x1 + RAD || P.z < z0 - RAD || P.z > z1 + RAD) return false;
    const pen = [[P.x - (x0 - RAD), -1, 0], [(x1 + RAD) - P.x, 1, 0], [P.z - (z0 - RAD), 0, -1], [(z1 + RAD) - P.z, 0, 1]];
    pen.sort((a, b) => a[0] - b[0]);
    const [d, sx, sz] = pen[0];
    P.x += sx * d; P.z += sz * d;
    return true;
  }
  function pushOut(P) {
    if (Math.abs(P.x - at.x) > 40 || Math.abs(P.z - at.z) > 40 || P.y > 4) return false;
    const p = toLocal(P.x, P.z);
    let hit = pushBox(p, -HALF_W, HALF_W, BACK_Z - 0.9, -0.95); // the whole range, fence to fence
    for (const s of [-1, 1]) hit = pushBox(p, s * 2.7 - 0.12, s * 2.7 + 0.12, 3.38, 3.62) || hit;
    hit = pushBox(p, 1.85, 3.15, 2.1, 2.5) || hit;
    hit = pushBox(p, -2.76, -2.24, 2.04, 2.56) || hit;
    if (hit) Object.assign(P, fromLocalXZ(p.x, p.z));
    return hit;
  }
  function near(P) {
    if (Math.abs(P.x - at.x) > 14 || Math.abs(P.z - at.z) > 14) return null;
    const p = toLocal(P.x, P.z);
    if (Math.abs(p.x) < 3.4 && p.z > -1 && p.z < 3.2) return { kind: 'archery', label: 'Play Archery' };
    if (Math.abs(p.x) < 7 && p.z > -1.5 && p.z < 8) return { kind: 'range' };
    return null;
  }
  const doorway = () => ({ ...fromLocalXZ(0, 1.6), yaw: face + Math.PI }); // on the deck, at the line

  setup();
  return {
    id: 'archery',
    name: 'Archery',
    section: 'THE RANGE',
    doneWord: 'FINISHED',
    prompt: 'Play Archery',
    hint: '<b>Hold</b> to draw the bow, move to aim, <b>let go</b> to shoot. A full draw flies true; the <b>wind</b> pushes the arrow sideways, and a moving target has to be led.',
    S,
    bestKey: 'paletterider-archery-best',
    bestId: () => `${S.arrows}-${S.level}`,
    bestSub: () => `${S.arrows} arrows · ${S.level}`,
    bestText: (b) => [`${b.s} pts`, `${b.m} bullseye${b.m === 1 ? '' : 's'}`],
    record: () => ({ s: S.score, t: Math.round(S.time * 10) / 10, m: S.bulls }),
    beats: (a, b) => a.s > b.s || (a.s === b.s && a.t < b.t),
    options: () => [
      { label: 'ARROWS', value: S.arrows, choices: [5, 10].map((n) => ({ v: n, label: String(n) })), set: (n) => setup(n, S.level) },
      { label: 'LEVEL', value: S.level, choices: Object.keys(LEVELS).map((l) => ({ v: l, label: l })), set: (l) => setup(S.arrows, l) },
    ],
    hud: () => ({ moves: S.moves, max: S.arrows, label: 'ARROWS', clock: `${S.score} pts` }),
    setup: () => setup(),
    enter() { on = true; $('mind').classList.add('arch'); zoom = 1; bowUp = 0; },
    leave() {
      on = false;
      if (state === 'draw') { state = 'aim'; power = 0; }
      for (const k in held) held[k] = false;
      $('mind').classList.remove('arch');
      pivot.visible = false;
      camera.zoom = 1;
      camera.updateProjectionMatrix();
    },
    pointer, key, update, cameraPose, pushOut, near, doorway,
    // for tests: aim at a point on the screen (-1..1) or at an offset from the bull, and shoot
    shootAt: (dx = 0, dy = 0, pw = 1) => { if (state !== 'aim') return false; loose(new THREE.Vector3(targetG.position.x + dx, TY + dy, -L.d), pw); return true; },
    info: () => ({ state, wind: windNow, power, zoom, tx: targetG.position.x, d: L.d, aim: aim.toArray() }),
    card: () => {
      const max = S.arrows * 10, st = stars(), avg = (S.score / S.arrows).toFixed(1);
      return {
        header: 'PALETTERIDER  ·  ARCHERY RANGE',
        title: 'Archery',
        badge: '◎ FINAL SCORE',
        chip: `${S.arrows} ARROWS · ${S.level.toUpperCase()}`,
        marks: S.shots.map((v) => ({ text: v.x ? 'X' : v.score ? String(v.score) : 'M', bg: RING_COLORS[v.score], fg: lightRing(v.score) ? '#2a1708' : '#ffffff' })),
        big: { label: 'SCORE', value: String(S.score), suffix: `/${max}` },
        tiles: [
          ['BULLSEYES', String(S.bulls), S.bulls ? 'tens in the gold' : 'none this round', 'mono'],
          ['AVERAGE', avg, 'points an arrow', 'mono'],
          ['RATING', '★'.repeat(st) + '☆'.repeat(3 - st), ['', 'ON THE BOARD', 'SHARP', 'MARKSMAN'][st], 'stars'],
        ],
        focusY: 0.5,
        file: `archery-${S.arrows}-arrows-${S.level.toLowerCase()}`,
        fileTag: `${S.score}-points`,
        share: () => `I scored ${S.score}/${max} with ${S.arrows} arrows (${S.level}: wind${L.amp ? ' and a moving target' : ''}) at the archery range in PaletteRider.`,
      };
    },
  };
}
