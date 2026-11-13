// PaletteRider: ride a bicycle through cities built from famous paintings, gather what has
// fallen into the streets and deliver it before dawn.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as valley from './world.js';
import * as city from './city.js';
import * as arles from './arles.js';
import { TIP_URL, TIP_LABEL } from './support.js';

// The painted city is the default world; add ?world=valley to ride the Himalayan valley.
// Chapter 1 is the Klee city, chapter 2 is Van Gogh's Arles (?chapter=2).
const query = new URLSearchParams(location.search);
const CHAPTER = [1, 2].includes(Number(query.get('chapter'))) ? Number(query.get('chapter')) : 1;
const W = query.get('world') === 'valley' ? valley : CHAPTER === 2 ? arles : city;
const BEST_KEY = 'paletterider-best' + (W.INFO.id ? '-' + W.INFO.id : '');
const HELP_KEY = 'paletterider-help';
try {
  // carry over a best score and settings saved before the game was renamed
  for (const [now, before] of [[BEST_KEY, BEST_KEY.replace('paletterider', 'aurora-trail')], [HELP_KEY, 'aurora-trail-help']]) {
    if (localStorage.getItem(now) === null && localStorage.getItem(before) !== null) localStorage.setItem(now, localStorage.getItem(before));
  }
} catch { /* private mode */ }
const { buildWorld, heightAt, MON, HILL_H, WORLD_R, INFO } = W;

const TAU = Math.PI * 2;
const NIGHT_SECONDS = W.INFO.seconds ?? 180;
const STAR_COUNT = W.INFO.starCount ?? 42;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const $ = (id) => document.getElementById(id);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
const world = buildWorld(scene, renderer, camera);
if (INFO.exposure) renderer.toneMappingExposure = INFO.exposure;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), INFO.bloom ?? 0.65, 0.7, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- the rider ----------
function buildBike() {
  const root = new THREE.Group(); // position + heading
  const pitchG = new THREE.Group(); // flips turn around the middle of the bike
  pitchG.position.y = 0.6;
  const rollG = new THREE.Group(); // leaning into turns pivots at the tyres
  rollG.position.y = -0.6;
  root.add(pitchG);
  pitchG.add(rollG);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.6, roughness: 0.35 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9 });
  const robe = new THREE.MeshStandardMaterial({ color: 0x8a1c2b, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a27a, roughness: 0.8 });
  const wool = new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.9 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const up = V(0, 1, 0);
  const rod = (a, b, r, mat) => {
    const d = b.clone().sub(a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(up, d.normalize());
    rollG.add(m);
    return m;
  };

  const wheels = [];
  for (const z of [-0.58, 0.58]) {
    const w = new THREE.Group();
    w.position.set(0, 0.38, z);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 20), tyreMat);
    tyre.rotation.y = Math.PI / 2;
    w.add(tyre);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.66, 4), frameMat);
      spoke.rotation.x = (i / 4) * Math.PI;
      w.add(spoke);
    }
    rollG.add(w);
    wheels.push(w);
  }
  const seat = V(0, 0.95, -0.25), bb = V(0, 0.4, 0), head = V(0, 0.98, 0.42);
  const bar = V(0, 1.12, 0.4), rear = V(0, 0.38, -0.58), front = V(0, 0.38, 0.58);
  rod(bb, seat, 0.03, frameMat);
  rod(bb, head, 0.03, frameMat);
  rod(seat, head, 0.03, frameMat);
  rod(bb, rear, 0.025, frameMat);
  rod(seat, rear, 0.025, frameMat);
  rod(head, front, 0.03, frameMat);
  rod(head, bar, 0.025, frameMat);
  rod(V(-0.28, 1.12, 0.4), V(0.28, 1.12, 0.4), 0.025, tyreMat);

  // rider: a jointed cyclist whose legs really turn the pedals
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1f4e8c, roughness: 0.7 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.8 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.35 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x8a1c2b, roughness: 0.8 });
  const tmp = V(0, 0, 0);
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    rollG.add(m);
    return m;
  };
  // a limb segment that can be re-aimed every frame
  const bone = (r, mat) => add(new THREE.CylinderGeometry(r * 0.82, r, 1, 10), mat, 0, 0, 0);
  const setBone = (m, a, b) => {
    tmp.subVectors(b, a);
    const len = tmp.length();
    m.position.copy(a).addScaledVector(tmp, 0.5);
    m.quaternion.setFromUnitVectors(up, tmp.normalize());
    m.scale.set(1, len, 1);
  };

  const torso = add(new THREE.CapsuleGeometry(0.15, 0.34, 4, 12), jacket, 0, 1.27, -0.04);
  torso.scale.set(1.3, 1, 0.9);
  torso.rotation.x = 0.61; // leaning over the bars
  const pack = add(new THREE.BoxGeometry(0.27, 0.36, 0.13), packMat, 0, 1.33, -0.2);
  pack.rotation.x = 0.61;
  rod(V(0, 1.5, 0.12), V(0, 1.6, 0.17), 0.05, skin); // neck
  const face = add(new THREE.SphereGeometry(0.11, 16, 12), skin, 0, 1.68, 0.2);
  face.scale.set(0.92, 1.1, 1);
  const helmet = add(new THREE.SphereGeometry(0.135, 16, 10, 0, TAU, 0, Math.PI * 0.55), helmetMat, 0, 1.7, 0.19);
  helmet.scale.set(1, 0.95, 1.25);
  for (const sd of [-1, 1]) {
    const shoulder = V(sd * 0.21, 1.46, 0.1), elbow = V(sd * 0.27, 1.27, 0.27), hand = V(sd * 0.25, 1.15, 0.4);
    rod(shoulder, elbow, 0.052, jacket);
    rod(elbow, hand, 0.043, jacket);
    add(new THREE.SphereGeometry(0.05, 10, 8), skin, hand.x, hand.y, hand.z);
  }

  // cranks, pedals and legs: the knees are solved from hip and pedal each frame
  const THIGH = 0.46, SHIN = 0.46, CRANK = 0.17;
  const legs = [-1, 1].map((sd) => ({
    sd,
    thigh: bone(0.078, trousers),
    shin: bone(0.058, trousers),
    crank: bone(0.02, tyreMat),
    shoe: add(new THREE.BoxGeometry(0.1, 0.07, 0.26), shoeMat, 0, 0, 0),
  }));
  const hip = V(0, 0, 0), knee = V(0, 0, 0), foot = V(0, 0, 0), axle = V(0, 0, 0);
  let crankAngle = 0;
  const pedal = (turn) => {
    crankAngle += turn;
    for (const L of legs) {
      const a = crankAngle + (L.sd > 0 ? Math.PI : 0);
      foot.set(L.sd * 0.13, 0.4 + Math.sin(a) * CRANK, Math.cos(a) * CRANK);
      hip.set(L.sd * 0.1, 1.02, -0.2);
      const dy = foot.y - hip.y, dz = foot.z - hip.z;
      const d = Math.min(Math.hypot(dy, dz), THIGH + SHIN - 0.01), aim = Math.atan2(dy, dz);
      const bend = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
      knee.set(L.sd * 0.12, hip.y + THIGH * Math.sin(aim + bend), hip.z + THIGH * Math.cos(aim + bend));
      setBone(L.thigh, hip, knee);
      setBone(L.shin, knee, foot);
      L.shoe.position.set(foot.x, foot.y - 0.03, foot.z + 0.05);
      axle.set(L.sd * 0.06, 0.4, 0);
      setBone(L.crank, axle, foot);
    }
  };
  pedal(0);

  const lamp = new THREE.PointLight(0xffd9a0, 14, 26, 1.5);
  lamp.position.set(0, 1.3, 0.9);
  rollG.add(lamp);

  return { root, pitchG, rollG, wheels, pedal };
}
const bike = buildBike();
scene.add(bike.root);

// ---------- stars ----------
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowTex = glowTexture();
const glowSprite = (color, size) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
};

const starGeo = new THREE.OctahedronGeometry(0.42);
starGeo.scale(0.7, 1.25, 0.7);
const stars = [];
function placeStar(s) {
  for (let tries = 0; tries < 40; tries++) {
    const spot = W.starSpot();
    if (!spot) continue;
    if (Math.hypot(spot.x - MON.x, spot.z - MON.z) < 28) continue;
    if (Math.hypot(spot.x - P.x, spot.z - P.z) < 15) continue;
    Object.assign(s, spot);
    break;
  }
  const col = INFO.colors[s.high ? 1 : 0];
  s.core.material.color.set(col);
  s.glow.material.color.set(col);
  s.group.position.set(s.x, s.y, s.z);
}
function buildStars() {
  for (let i = 0; i < STAR_COUNT; i++) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial());
    const glow = glowSprite(0xffffff, 3.2);
    group.add(core, glow);
    scene.add(group);
    const s = { group, core, glow, x: 0, y: 0, z: 0, high: false, ph: Math.random() * TAU };
    stars.push(s);
  }
}

// carried stars trail behind the rider
const trail = [];
for (let i = 0; i < 14; i++) {
  const s = glowSprite(INFO.colors[0], 0.45);
  s.visible = false;
  scene.add(s);
  trail.push(s);
}

// ---------- sound ----------
// Everything goes through one master gain so M can mute it all.
let actx = null, master = null, muted = false;
const loops = {};
function audio() {
  if (actx) return actx;
  actx = new AudioContext();
  master = actx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(actx.destination);

  // wind in the ears: looping noise, louder and brighter with speed
  const buf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = actx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const windFilter = actx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.Q.value = 0.6;
  const windGain = actx.createGain();
  windGain.gain.value = 0;
  noise.connect(windFilter).connect(windGain).connect(master);
  noise.start();

  // engine of the nearest car
  const engOsc = actx.createOscillator();
  engOsc.type = 'sawtooth';
  engOsc.frequency.value = 55;
  const engFilter = actx.createBiquadFilter();
  engFilter.type = 'lowpass';
  engFilter.frequency.value = 240;
  const engGain = actx.createGain();
  engGain.gain.value = 0;
  engOsc.connect(engFilter).connect(engGain).connect(master);
  engOsc.start();

  Object.assign(loops, { windFilter, windGain, engOsc, engGain });
  startMusic(actx);
  return actx;
}
function tone(freq, dur = 0.7, vol = 0.12, type = 'sine') {
  if (muted) return;
  try {
    const ac = audio(), t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur);
  } catch { /* sound is optional */ }
}
function horn() {
  tone(415, 0.4, 0.045, 'square');
  tone(523, 0.4, 0.045, 'square');
}
function updateAudio(ev) {
  if (!actx) return;
  const t = actx.currentTime, playing = G.state === 'play';
  const sp = playing ? (P.grounded ? Math.abs(P.speed) : Math.hypot(P.vx, P.vy, P.vz)) : 0;
  loops.windGain.gain.setTargetAtTime(Math.min(sp / 40, 1) * 0.1, t, 0.15);
  loops.windFilter.frequency.setTargetAtTime(350 + sp * 35, t, 0.15);
  const near = playing ? ev.nearCar : null;
  loops.engGain.gain.setTargetAtTime(near ? (1 - near.dist / 32) ** 2 * 0.09 : 0, t, 0.12);
  if (near) loops.engOsc.frequency.setTargetAtTime(48 + near.speed * 5, t, 0.1);
}
// ---------- music ----------
// A constant, slow ambient piece: four soft chords that melt into each other, with a few
// bell notes over the top and a gentle echo. It starts with the first ride and keeps playing
// through the menus until muted.
const CHORDS = [
  [146.83, 220.0, 329.63, 369.99], // D
  [123.47, 185.0, 293.66, 440.0], // B minor
  [98.0, 146.83, 246.94, 369.99], // G
  [110.0, 164.81, 246.94, 277.18], // A
];
const BELLS = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66];
const CHORD_EVERY = 8, CHORD_LEN = 11; // seconds; the overlap is the cross-fade
const music = { bus: null, nextChord: 0, nextBell: 0, chord: 0 };
function startMusic(ac) {
  const bus = ac.createGain();
  bus.gain.value = 0.9;
  const tone = ac.createBiquadFilter(); // keep it mellow
  tone.type = 'lowpass';
  tone.frequency.value = 1400;
  const echo = ac.createDelay(1);
  echo.delayTime.value = 0.46;
  const feedback = ac.createGain();
  feedback.gain.value = 0.42;
  bus.connect(tone).connect(master);
  tone.connect(echo).connect(feedback).connect(echo);
  echo.connect(master);
  music.bus = bus;
  music.nextChord = ac.currentTime + 0.2;
  music.nextBell = ac.currentTime + 4;
  setInterval(() => scheduleMusic(ac), 500);
  scheduleMusic(ac);
}
function voice(ac, freq, type, start, attack, hold, release, vol, detune = 0) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + attack);
  g.gain.setValueAtTime(vol, start + attack + hold);
  g.gain.linearRampToValueAtTime(0, start + attack + hold + release);
  o.connect(g).connect(music.bus);
  o.start(start);
  o.stop(start + attack + hold + release + 0.1);
}
function scheduleMusic(ac) {
  const horizon = ac.currentTime + 4; // plan a few seconds ahead so a busy frame never causes a gap
  while (music.nextChord < horizon) {
    const notes = CHORDS[music.chord++ % CHORDS.length];
    notes.forEach((f, i) => {
      const vol = i === 0 ? 0.05 : 0.026;
      voice(ac, f, 'sine', music.nextChord, 3.5, CHORD_LEN - 7.5, 4, vol);
      voice(ac, f, 'triangle', music.nextChord, 3.5, CHORD_LEN - 7.5, 4, vol * 0.45, 7); // slight shimmer
    });
    music.nextChord += CHORD_EVERY;
  }
  while (music.nextBell < horizon) {
    if (Math.random() < 0.6) voice(ac, BELLS[Math.floor(Math.random() * BELLS.length)], 'sine', music.nextBell, 0.03, 0, 2.6, 0.035);
    music.nextBell += 2 + Math.random() * 1.5;
  }
}
const SCALE = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98]; // pick-up chimes, in the music's key

// ---------- game state ----------
const P = { x: 0, y: 0, z: 40, yaw: Math.PI, speed: 0, vx: 0, vy: 0, vz: 0, gvy: 0, grounded: true, pitch: 0, roll: 0, flip: 0, spin: 0, air: 0, crash: 0 };
if (INFO.spawn) Object.assign(P, INFO.spawn);
const G = { state: 'menu', score: 0, carried: 0, delivered: 0, tricks: 0, time: NIGHT_SECONDS, best: 0 };
try { G.best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* private mode */ }

// ax / ay: the thumb stick's analog position (-1..1, up is negative); keyboard leaves them at 0
const keys = { up: false, down: false, left: false, right: false, jump: false, jumpPressed: false, ax: 0, ay: 0, analog: false };
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'jump' };
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k) {
    e.preventDefault();
    if (k === 'jump' && !keys.jump) keys.jumpPressed = true;
    keys[k] = true;
  }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyH') toggleHelp();
  if (e.code === 'KeyP' || e.code === 'Escape') setPaused(G.state === 'play');
  if (e.code === 'Enter') {
    if (G.state === 'paused') setPaused(false);
    else if (G.state !== 'play') begin();
  }
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) keys[k] = false;
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- touch controls ----------
// A thumb stick (steer / pedal / brake, flips and spins in the air) and a jump button.
function setupTouch() {
  const enable = () => document.body.classList.add('touch');
  if (matchMedia('(pointer: coarse)').matches) enable();
  addEventListener('touchstart', enable, { once: true, passive: true });

  const stick = $('stick'), knob = $('knob'), R = 46;
  let stickId = null;
  const moveStick = (e) => {
    const b = stick.getBoundingClientRect();
    let dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Analog values with a dead zone in the middle. A push that is mostly sideways counts as
    // purely sideways (and mostly up as purely up), so a thumb that drifts a little off the
    // axis doesn't pedal and steer at once and send the bike off diagonally.
    let nx = dx / R, ny = dy / R;
    const mag = Math.hypot(nx, ny), DEAD = 0.18;
    if (mag < DEAD) { nx = ny = 0; } else {
      const k = (mag - DEAD) / (1 - DEAD) / mag;
      nx *= k; ny *= k;
      if (Math.abs(ny) < Math.abs(nx) * 0.45) ny = 0;
      else if (Math.abs(nx) < Math.abs(ny) * 0.45) nx = 0;
    }
    keys.ax = nx; keys.ay = ny;
    keys.analog = true;
    keys.left = nx < -0.3;
    keys.right = nx > 0.3;
    keys.up = ny < -0.3;
    keys.down = ny > 0.3;
  };
  const releaseStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = '';
    keys.left = keys.right = keys.up = keys.down = false;
    keys.ax = keys.ay = 0;
    keys.analog = false;
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stickId = e.pointerId;
    moveStick(e);
    try { stick.setPointerCapture?.(e.pointerId); } catch { /* keep working without capture */ }
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);

  const jump = $('jumpBtn');
  const jumpUp = () => { keys.jump = false; jump.classList.remove('down'); };
  jump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!keys.jump) keys.jumpPressed = true;
    keys.jump = true; // keep holding to glide
    jump.classList.add('down');
  });
  jump.addEventListener('pointerup', jumpUp);
  jump.addEventListener('pointercancel', jumpUp);
  jump.addEventListener('pointerleave', jumpUp);
  addEventListener('contextmenu', (e) => { if (document.body.classList.contains('touch')) e.preventDefault(); });
}
setupTouch();

let toastTimer = 0;
function toast(text, bad = false) {
  const el = $('toast');
  el.textContent = text;
  el.className = bad ? 'on bad' : 'on';
  toastTimer = 1.8;
}

function startGame() {
  Object.assign(P, { x: 0, z: 40, yaw: Math.PI, speed: 0, vx: 0, vy: 0, vz: 0, gvy: 0, grounded: true, pitch: 0, roll: 0, flip: 0, spin: 0, air: 0, crash: 0 });
  if (INFO.spawn) Object.assign(P, INFO.spawn);
  P.y = heightAt(P.x, P.z);
  hero?.reset();
  camYaw = P.yaw;
  Object.assign(G, { state: 'play', score: 0, carried: 0, delivered: 0, tricks: 0, time: NIGHT_SECONDS });
  stars.forEach(placeStar);
  world.setDelivered(0);
  if (!$('menu').classList.contains('entering')) $('menu').classList.remove('on');
  $('over').classList.remove('on');
  $('pause').classList.remove('on');
  $('btnPause').textContent = '❚❚';
  if (actx) actx.resume().catch(() => {});
  $('hud').classList.add('on');
  camPos.set(P.x, P.y + 5, P.z + 10);
  Object.assign(orbit, { yaw: 0, pitch: 0, zoom: 1 });
  showBrief();
  tone(392, 1.2, 0.08);
}

function endGame() {
  G.state = 'over';
  const isBest = G.score > G.best;
  if (isBest) {
    G.best = G.score;
    try { localStorage.setItem(BEST_KEY, String(G.best)); } catch { /* private mode */ }
  }
  $('final').textContent = G.score;
  $('summary').innerHTML = `${G.delivered} ${INFO.item}s carried home · ${G.tricks} tricks landed<br>${isBest ? 'A new best!' : `Best: ${G.best}`}`;
  $('hud').classList.remove('on');
  $('over').classList.add('on');
  [523.25, 659.25, 783.99].forEach((f, i) => setTimeout(() => tone(f, 1.6, 0.08), i * 180));
}
// Pause freezes the ride, the clock, the townsfolk and traffic, and the sound.
function setPaused(on) {
  if (on ? G.state !== 'play' : G.state !== 'paused') return;
  G.state = on ? 'paused' : 'play';
  $('pause').classList.toggle('on', on);
  $('btnPause').textContent = on ? '▶' : '❚❚';
  for (const k in keys) keys[k] = false;
  if (on) {
    const s = Math.max(0, Math.ceil(G.time));
    $('pauseInfo').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left · score ${G.score} · carrying ${G.carried} ${INFO.icon}`;
  }
  if (actx) (on ? actx.suspend() : actx.resume()).catch(() => {});
}
$('resume').onclick = () => setPaused(false);
if (TIP_URL) {
  document.body.classList.add('has-tip');
  for (const a of document.querySelectorAll('a.tip')) {
    a.href = TIP_URL;
    a.textContent = `♥ ${TIP_LABEL}`;
  }
}
$('restart').onclick = (e) => {
  e.preventDefault();
  startGame();
};
// stepping away from the tab pauses the ride instead of letting the night run out
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});

// From the title screen: if this world has a painting, zoom into it and open onto the ride.
function begin() {
  const menu = $('menu');
  if (G.state === 'play' || menu.classList.contains('entering')) return;
  if (!menu.classList.contains('gallery') || !menu.classList.contains('on')) return startGame();
  try { audio(); } catch { /* sound is optional */ } // must be created inside the click itself
  menu.classList.add('entering');
  setTimeout(() => {
    startGame();
    camPos.set(P.x, P.y + 95, P.z + 45); // the ride opens with the camera dropping in from above
  }, 700);
  setTimeout(() => menu.classList.remove('on', 'entering'), 1800);
}
if (INFO.painting) {
  $('painting').src = import.meta.env.BASE_URL + INFO.painting.file;
  $('painting').alt = INFO.painting.alt;
  $('start').textContent = INFO.painting.button;
  $('menu').classList.add('gallery');
}
$('start').onclick = begin;
// chapter picker on the title screen, and a way onward from the end screen
if (W !== valley) {
  $('chapters').classList.add('on');
  $('ch' + CHAPTER).classList.add('active');
  $('nextCh').classList.add('on');
  $('nextCh').href = `?chapter=${(CHAPTER % 2) + 1}`;
  $('nextCh').textContent = CHAPTER === 2 ? '‹ Back to chapter 1' : `Go to chapter ${CHAPTER + 1} ›`;
}
$('again').onclick = startGame;

// ---------- riding ----------
function launch(vy) {
  P.grounded = false;
  P.vy = vy;
  P.vx = Math.sin(P.yaw) * P.speed;
  P.vz = Math.cos(P.yaw) * P.speed;
  P.flip = 0;
  P.spin = 0;
  P.air = 0;
  // keys already held at take-off (usually pedalling) don't start a flip until pressed again
  P.lockUp = keys.up;
  P.lockDown = keys.down;
}

// A fall or a hard crash: the rider stops and half the carried load is lost.
function wipeout(label) {
  const lost = Math.ceil(G.carried / 2);
  G.carried -= lost;
  P.speed = 0;
  P.pitch = 0;
  P.crash = 1.1;
  toast(lost ? `${label} ${lost} ${INFO.item}${lost > 1 ? 's' : ''} slipped away` : label, true);
  tone(90, 0.5, 0.25, 'triangle');
}

function land(h) {
  P.y = h;
  P.grounded = true;
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  P.speed = P.vx * fx + P.vz * fz; // landing sideways costs speed
  P.gvy = 0;
  const flips = Math.round(P.flip / TAU);
  const halfSpins = Math.round(Math.abs(P.spin) / Math.PI);
  if (P.air < 0.3) {
    P.pitch = 0; // a tiny hop never counts as a fall
    return;
  }
  if (Math.abs(P.flip - flips * TAU) > 1.0) {
    // came down on the wrong side
    wipeout('Wipeout!');
    return;
  }
  P.pitch -= flips * TAU;
  if (P.air > 0.35 && (flips || halfSpins)) {
    const parts = [];
    if (flips) parts.push(`${flips > 0 ? 'Front flip' : 'Backflip'}${Math.abs(flips) > 1 ? ' ×' + Math.abs(flips) : ''}`);
    if (halfSpins) parts.push(`${halfSpins * 180}° spin`);
    const pts = Math.abs(flips) * 50 + halfSpins * 20;
    G.score += pts;
    G.tricks++;
    toast(`${parts.join(' + ')}  +${pts}`);
    tone(1318.5, 0.5, 0.08);
  }
}

function collide() {
  const r = Math.hypot(P.x, P.z);
  if (r > WORLD_R) {
    P.x *= WORLD_R / r; P.z *= WORLD_R / r;
    P.speed *= 0.5; P.vx *= 0.5; P.vz *= 0.5;
  }
  const dx = P.x - MON.x, dz = P.z - MON.z, d = Math.hypot(dx, dz);
  if (d < 10 && P.y < HILL_H + 12) {
    // the hall itself is solid
    P.x = MON.x + (dx / d) * 10; P.z = MON.z + (dz / d) * 10;
    P.speed *= 0.4; P.vx *= 0.4; P.vz *= 0.4;
  }
  if (W.pushOut(P) > 8) tone(140, 0.2, 0.12, 'triangle');
}

function updateRider(dt) {
  const ctl = P.crash <= 0;
  if (!ctl) P.crash -= dt;
  // The stick steers in proportion to how far it is pushed (gentle near the middle, full at
  // the edge); keys are all or nothing. Either way the turn eases in and out instead of snapping.
  // On the ground the stick points where to ride: push left and the bike turns to face left of
  // where it was heading, then rides straight that way (it does not keep circling). The heading it
  // turns from is fixed while the thumb is off the "up" direction, so the camera swinging round
  // behind the bike doesn't move the goal. Pulling the stick straight back brakes.
  let want = 0, gas = 0, brake = 0;
  const mag = Math.hypot(keys.ax, keys.ay);
  if (!ctl) {
    P.refYaw = null;
  } else if (keys.analog && P.grounded && mag > 0) {
    const ang = Math.atan2(-keys.ax, -keys.ay); // 0 = up, + = left
    if (Math.abs(ang) > 2.5) {
      brake = mag;
      P.refYaw = null;
    } else {
      if (P.refYaw == null || Math.abs(ang) < 0.3) P.refYaw = P.yaw; // follow while riding straight
      let d = P.refYaw + ang - P.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      want = clamp(d * 2.2, -1, 1);
      gas = mag;
    }
  } else {
    P.refYaw = null;
    want = keys.analog
      ? -Math.sign(keys.ax) * Math.abs(keys.ax) ** 1.5 // in the air: spin with the stick
      : (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    gas = !keys.analog && keys.up ? 1 : 0;
    brake = !keys.analog && keys.down ? 1 : 0;
  }
  P.steer = damp(P.steer || 0, want, keys.analog ? 8 : 14, dt);
  const steer = P.steer;
  const jumpNow = keys.jumpPressed;
  keys.jumpPressed = false;

  if (P.grounded) {
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const slope = (heightAt(P.x + fx, P.z + fz, P.y) - heightAt(P.x - fx, P.z - fz, P.y)) / 2;
    const ang = Math.atan(slope);
    if (ctl) {
      P.speed += 16 * gas * dt;
      P.speed -= (P.speed > 0 ? 32 : 8) * brake * dt;
    }
    P.speed -= 18 * Math.sin(ang) * dt; // hills push back, descents give speed
    P.speed -= P.speed * 0.5 * dt;
    P.speed = clamp(P.speed, -6, 44);
    // a bike turns with its speed; pushing the stick sideways from a standstill still swings it round slowly
    const turnable = gas > 0 ? Math.max(0.45, clamp(P.speed / 7, -1, 1)) : clamp(P.speed / 7, -1, 1);
    P.yaw += steer * 2.4 * turnable * dt;
    P.x += Math.sin(P.yaw) * P.speed * dt;
    P.z += Math.cos(P.yaw) * P.speed * dt;
    collide();
    const h = heightAt(P.x, P.z, P.y);
    const gvy = (h - P.y) / dt;
    if (ctl && jumpNow) {
      launch(Math.max(P.gvy, 0) + 11);
    } else if (gvy < P.gvy - 24 * dt - 2.5 && Math.abs(P.speed) > 6) {
      launch(P.gvy); // the ground fell away: flying off a crest
    } else {
      P.y = h;
      P.gvy = gvy;
    }
    P.pitch = damp(P.pitch, -ang, 10, dt);
    P.roll = damp(P.roll, -steer * 0.38 * clamp(P.speed / 14, -1, 1) + (ctl ? 0 : Math.sin(P.crash * 20) * 0.3), 8, dt);
  } else {
    const gliding = keys.jump && P.vy < 0;
    P.vy -= (gliding ? 8 : 24) * dt;
    if (gliding) P.vy = Math.max(P.vy, -6);
    P.x += P.vx * dt;
    P.z += P.vz * dt;
    P.y += P.vy * dt;
    P.air += dt;
    if (!keys.up) P.lockUp = false;
    if (!keys.down) P.lockDown = false;
    const flip = ctl ? ((keys.up && !P.lockUp ? 1 : 0) - (keys.down && !P.lockDown ? 1 : 0)) * 8 * dt : 0;
    P.flip += flip;
    P.pitch += flip;
    P.spin += steer * 5.5 * dt;
    P.yaw += steer * 5.5 * dt;
    P.roll = damp(P.roll, 0, 6, dt);
    collide();
    const h = heightAt(P.x, P.z, P.y);
    if (P.y <= h) land(h);
  }

  bike.root.position.set(P.x, P.y, P.z);
  bike.root.rotation.y = P.yaw;
  bike.pitchG.rotation.x = P.pitch;
  bike.rollG.rotation.z = P.roll;
  const spin = (P.grounded ? P.speed : Math.hypot(P.vx, P.vz)) * dt / 0.38;
  for (const w of bike.wheels) w.rotation.x += spin;
  if (P.grounded && gas > 0 && P.crash <= 0) bike.pedal(-spin * 0.4); // legs turn only while pedalling
}

function updateStars(t, dt) {
  for (const s of stars) {
    s.group.position.y = s.y + Math.sin(t * 2 + s.ph) * 0.25;
    s.core.rotation.y = t * 1.5 + s.ph;
    if (G.state !== 'play') continue;
    const dx = s.x - P.x, dy = s.group.position.y - (P.y + 1), dz = s.z - P.z;
    if (dx * dx + dy * dy + dz * dz < 2.6 * 2.6) {
      G.carried++;
      tone(SCALE[(G.carried - 1) % SCALE.length], 0.7, 0.11);
      placeStar(s);
    }
  }

  // hand them over on the monastery hilltop
  if (G.state === 'play' && G.carried > 0 && Math.hypot(P.x - MON.x, P.z - MON.z) < 17) {
    const n = G.carried;
    const pts = n * 100 + n * (n - 1) * 10; // bigger loads earn a bonus
    G.score += pts;
    G.delivered += n;
    G.carried = 0;
    world.setDelivered(G.delivered);
    toast(`${n} ${INFO.item}${n > 1 ? 's' : ''} delivered  +${pts}`);
    [392, 523.25, 659.25, 783.99].forEach((f, i) => setTimeout(() => tone(f, 1.4, 0.09), i * 90));
  }

  // the carried stars follow in a string
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  for (let i = 0; i < trail.length; i++) {
    const sp = trail[i];
    sp.visible = G.state === 'play' && i < G.carried;
    if (!sp.visible) continue;
    const tx = i === 0 ? P.x - fx * 1.6 : trail[i - 1].position.x;
    const ty = i === 0 ? P.y + 2.9 : trail[i - 1].position.y;
    const tz = i === 0 ? P.z - fz * 1.6 : trail[i - 1].position.z;
    sp.position.x = damp(sp.position.x, tx, 12, dt);
    sp.position.y = damp(sp.position.y, ty + Math.sin(t * 4 + i) * 0.08, 12, dt);
    sp.position.z = damp(sp.position.z, tz, 12, dt);
  }
}

// ---------- guide to the nearest sun / star ----------
// A pulsing beam stands over the closest one; the compass and the map point at it too.
const guide = { star: null, dist: 0 };
const guideBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.4, 0.4, 70, 10, 1, true),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
);
guideBeam.visible = false;
scene.add(guideBeam);
function updateGuide(t) {
  let best = null, bd = Infinity;
  for (const s of stars) {
    const d = Math.hypot(s.x - P.x, s.z - P.z);
    if (d < bd) { bd = d; best = s; }
  }
  guide.star = best;
  guide.dist = bd;
  guideBeam.visible = G.state === 'play' && !!best;
  if (!best) return;
  guideBeam.position.set(best.x, best.y + 36, best.z);
  guideBeam.material.color.set(INFO.colors[best.high ? 1 : 0]);
  guideBeam.material.opacity = 0.26 + 0.12 * Math.sin(t * 4);
}

// ---------- camera ----------
const camPos = new THREE.Vector3(0, 40, 0);
const lookAt = new THREE.Vector3();
let camYaw = Math.PI; // direction the camera follows
let viewYaw = Math.PI; // direction it actually looks, after the player's own rotation

// Drag with the mouse or a finger to look around; scroll or pinch to zoom.
// While riding, the view swings back behind the bike a moment after you let go.
const orbit = { yaw: 0, pitch: 0, zoom: 1, idle: 0, dragging: false };
function setupOrbit() {
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.style.cursor = 'grab';
  const pts = new Map();
  let pinch = 0;
  const spread = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  el.addEventListener('pointerdown', (e) => {
    if (G.state !== 'play') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture?.(e.pointerId);
    if (pts.size === 2) pinch = spread();
    orbit.dragging = true;
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 1) {
      orbit.yaw -= dx * 0.006;
      orbit.pitch = clamp(orbit.pitch + dy * 0.005, -0.12, 1.25);
    } else if (pts.size === 2) {
      const d = spread();
      if (pinch > 0 && d > 0) orbit.zoom = clamp((orbit.zoom * pinch) / d, 0.45, 2.6);
      pinch = d;
    }
  });
  const release = (e) => {
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      orbit.dragging = false;
      orbit.idle = 0;
      el.style.cursor = 'grab';
    }
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.zoom = clamp(orbit.zoom * Math.exp(e.deltaY * 0.0012), 0.45, 2.6);
  }, { passive: false });
}
setupOrbit();

function updateCamera(t, dt) {
  if (G.state === 'menu') {
    const a = t * 0.08;
    camera.position.set(MON.x + Math.sin(a) * INFO.menuCam.r, INFO.menuCam.h, MON.z + Math.cos(a) * INFO.menuCam.r);
    camera.lookAt(MON.x, HILL_H + 7, MON.z);
    return;
  }
  // follow the direction of travel, so spins in the air stay visible
  const target = P.grounded || Math.hypot(P.vx, P.vz) < 2 ? P.yaw : Math.atan2(P.vx, P.vz);
  let diff = target - camYaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  camYaw += diff * (1 - Math.exp(-5 * dt));
  // the player's rotation eases away once they let go and the bike is moving
  if (!orbit.dragging) {
    orbit.idle += dt;
    if (orbit.idle > 2 && Math.abs(P.speed) > 3) {
      orbit.yaw = Math.atan2(Math.sin(orbit.yaw), Math.cos(orbit.yaw)); // take the short way back
      orbit.yaw = damp(orbit.yaw, 0, 2.5, dt);
      orbit.pitch = damp(orbit.pitch, 0, 2.5, dt);
    }
  }
  viewYaw = camYaw + orbit.yaw;
  let back = (8.5 + Math.abs(P.speed) * 0.06) * orbit.zoom;
  const want = new THREE.Vector3();
  for (; back > 1.5; back -= 1) {
    // pull the camera in rather than let it sit inside a building
    const flat = back * Math.cos(orbit.pitch);
    want.set(P.x - Math.sin(viewYaw) * flat, P.y + 2.7 + back * Math.sin(orbit.pitch), P.z - Math.cos(viewYaw) * flat);
    if (!W.blocked?.(want.x, want.y, want.z)) break;
  }
  camPos.x = damp(camPos.x, want.x, 8, dt);
  camPos.y = damp(camPos.y, want.y, 5, dt);
  camPos.z = damp(camPos.z, want.z, 8, dt);
  camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 1.4);
  camera.position.copy(camPos);
  // look ahead of the bike when following; look at the rider when the view has been turned
  const ahead = 6 * Math.max(0, 1 - (Math.abs(orbit.yaw) + Math.abs(orbit.pitch)) / 0.8);
  lookAt.set(P.x + Math.sin(viewYaw) * ahead, P.y + 1.6 + ahead / 6, P.z + Math.cos(viewYaw) * ahead);
  camera.lookAt(lookAt);
}

function updateHud(dt) {
  $('score').textContent = G.score;
  $('carry').textContent = `${G.carried} ${INFO.icon}`;
  const s = Math.max(0, Math.ceil(G.time));
  $('time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const dx = MON.x - P.x, dz = MON.z - P.z;
  const rel = Math.atan2(dx, dz) - viewYaw; // positive = to the left
  $('arrow').style.transform = `rotate(${-rel}rad)`;
  $('dist').textContent = `${Math.round(Math.hypot(dx, dz))} m`;
  if (guide.star) {
    const relS = Math.atan2(guide.star.x - P.x, guide.star.z - P.z) - viewYaw;
    $('arrowS').style.transform = `rotate(${-relS}rad)`;
    $('distS').textContent = `${Math.round(guide.dist)} m`;
  }
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('on');
}

// ---------- map ----------
// A round mini-map in the corner; click it or press Tab to open it large.
const MAP_S = 512, MAP_SPAN = W.MAP_SPAN ?? 490;
const mapEl = $('map'), mapCtx = mapEl.getContext('2d');
mapEl.width = mapEl.height = MAP_S;
const mapBg = document.createElement('canvas');
mapBg.width = mapBg.height = MAP_S;
{
  const g = mapBg.getContext('2d');
  if (W.drawMap) W.drawMap(g, MAP_S);
  else {
    // a world without a street plan just gets its outline and its goal
    const k = MAP_S / MAP_SPAN, c = MAP_S / 2;
    g.fillStyle = '#0c2430';
    g.beginPath(); g.arc(c, c, WORLD_R * k, 0, TAU); g.fill();
    g.strokeStyle = '#9fc2c4'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#ffd27a';
    g.beginPath(); g.arc(c + MON.x * k, c + MON.z * k, 12, 0, TAU); g.fill();
  }
}
const toggleMap = () => mapEl.classList.toggle('big');
mapEl.addEventListener('click', toggleMap);
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); toggleMap(); }
});
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
let frameNo = 0;
function drawMapFrame() {
  const g = mapCtx, k = MAP_S / MAP_SPAN, c = MAP_S / 2;
  g.clearRect(0, 0, MAP_S, MAP_S);
  g.drawImage(mapBg, 0, 0);
  for (const s of stars) {
    g.fillStyle = hex(INFO.colors[s.high ? 1 : 0]);
    g.strokeStyle = '#1c120e';
    g.lineWidth = 2;
    g.beginPath(); g.arc(c + s.x * k, c + s.z * k, 7, 0, TAU); g.fill(); g.stroke();
  }
  if (guide.star) {
    // dashed line and a ring: this is the one to go for
    const sx = c + guide.star.x * k, sz = c + guide.star.z * k;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.setLineDash([10, 8]);
    g.beginPath(); g.moveTo(c + P.x * k, c + P.z * k); g.lineTo(sx, sz); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.arc(sx, sz, 13 + 3 * Math.sin(performance.now() / 200), 0, TAU); g.stroke();
  }
  g.fillStyle = '#bfe3ff';
  for (const car of W.traffic ?? []) g.fillRect(c + car.x * k - 4, c + car.z * k - 4, 8, 8);
  // the rider: an arrow pointing the way the bike faces
  g.save();
  g.translate(c + P.x * k, c + P.z * k);
  g.rotate(Math.PI - P.yaw);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1c120e';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, -20); g.lineTo(13, 14); g.lineTo(0, 7); g.lineTo(-13, 14); g.closePath();
  g.stroke(); g.fill();
  g.restore();
}

// ---------- controls display ----------
// The bar at the bottom swaps between riding keys and trick keys, lights each key while it is
// held, and can be hidden with H. The corner buttons do the same jobs as M, Tab and H.
const ctlEl = $('controls');
if (INFO.controls) {
  // a chapter with a different way of moving brings its own key labels
  ctlEl.querySelector('.ground').innerHTML = INFO.controls.ground;
  ctlEl.querySelector('.air').innerHTML = INFO.controls.air;
  $('briefKeys').innerHTML = INFO.controls.brief;
  $('briefTouch').textContent = INFO.controls.touch;
}
if (INFO.timeLabel) $('timeLabel').textContent = INFO.timeLabel;
const caps = [...ctlEl.querySelectorAll('kbd[data-k]')];
let helpHidden = false;
try { helpHidden = localStorage.getItem(HELP_KEY) === 'off'; } catch { /* private mode */ }
function applyHelp() {
  ctlEl.classList.toggle('hidden', helpHidden);
  $('btnHelp').classList.toggle('off', helpHidden);
}
function toggleHelp() {
  helpHidden = !helpHidden;
  try { localStorage.setItem(HELP_KEY, helpHidden ? 'off' : 'on'); } catch { /* private mode */ }
  applyHelp();
}
function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 1;
  $('btnSound').classList.toggle('off', muted);
}
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
for (const [id, fn] of [['btnPause', () => setPaused(true)], ['btnHelp', toggleHelp], ['btnSound', toggleMute], ['btnMap', toggleMap], ['btnFull', toggleFull]]) {
  $(id).addEventListener('click', (e) => {
    fn();
    e.currentTarget.blur(); // otherwise Space would press the button again instead of jumping
  });
}
applyHelp();

let briefTime = 0;
function showBrief() {
  $('brief').classList.add('on');
  briefTime = 9;
}
function updateControls(dt) {
  for (const cap of caps) cap.classList.toggle('on', !!keys[cap.dataset.k]);
  ctlEl.classList.toggle('air', !P.grounded && P.air > 0.12);
  if (briefTime > 0) {
    briefTime -= dt;
    const moved = keys.up || keys.left || keys.right || keys.jump;
    if (briefTime <= 0 || (briefTime < 8 && moved)) {
      briefTime = 0;
      $('brief').classList.remove('on');
    }
  }
}

// data and imagery credits, required by their licences
let shownCredit = INFO.credit ?? '';
$('credit').textContent = shownCredit;

// ---------- hero ----------
// Chapters 1 and 2 are ridden on the bicycle. A chapter may bring its own hero instead.
const hero = W.makeHero ? W.makeHero({ scene, P, keys, G, toast, tone }) : null;
if (hero) bike.root.visible = false;

// ---------- main loop ----------
document.title = INFO.title;
$('title').textContent = INFO.title;
$('subtitle').textContent = INFO.sub;
$('how').innerHTML = INFO.how;
$('goal').textContent = INFO.goal;
$('goalS').textContent = INFO.icon;
$('briefLead').textContent = INFO.brief;
$('carry').textContent = `0 ${INFO.icon}`;
document.documentElement.style.setProperty('--glow', INFO.glow);
buildStars();
stars.forEach(placeStar);
P.y = heightAt(P.x, P.z);
bike.root.position.set(P.x, P.y, P.z);
bike.root.rotation.y = P.yaw;

const clock = new THREE.Clock();
// One step of the game: everything except drawing the picture.
function tick(dt, t) {
  if (G.state === 'play') {
    if (hero) hero.update(dt);
    else updateRider(dt);
    G.time -= dt;
    if (G.time <= 0) endGame();
  }
  updateStars(t, dt);
  updateCamera(t, dt);
  updateGuide(t);
  if (G.state === 'play') {
    updateHud(dt);
    updateControls(dt);
  }
  const night = 1 - G.time / NIGHT_SECONDS;
  const dawn = G.state === 'menu' ? 0 : clamp((night - 0.72) / 0.28, 0, 1);
  const ev = world.update(t, dt, camera, dawn, G.state === 'play' ? P : null) || {};
  if (ev.credit !== undefined && ev.credit !== shownCredit) $('credit').textContent = shownCredit = ev.credit;
  if (ev.notice) toast(ev.notice, true);
  if (ev.hop) tone(988, 0.25, 0.05);
  if (ev.honk) horn();
  if (ev.carHit > 1) {
    tone(110, 0.25, 0.2, 'triangle');
    if (ev.carHit > 13 && P.crash <= 0) wipeout('Hit a car!');
  }
  updateAudio(ev);
  if (G.state === 'play' && frameNo++ % 2 === 0) drawMapFrame();
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.state !== 'paused') tick(dt, clock.elapsedTime); // paused: keep showing the frozen scene
  composer.render();
}
renderer.setAnimationLoop(frame);

// handy for testing from the console
window.__aurora = { begin, setPaused, hero, sim: (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt, clock.elapsedTime + i * dt); }, P, G, keys, stars, W, orbit, music, startGame, endGame, audioState: () => actx?.state };

