/* ============================================================
   MARISA II — THE ADVENTURE OF GREG
   A Zelda II-style side-scrolling action RPG set in San Antonio.
   Vanilla JS + canvas. No dependencies, no asset files.
   Sprites are pixel-string arrays on the NES 2C02 palette.
   ============================================================ */
'use strict';

// ---------------- canvas / scaling ----------------
const VW = 384, VH = 216, TILE = 16, HUD_H = 24, ROWS = 12;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
function fit() {
  const f = Math.min(innerWidth / VW, innerHeight / VH);
  const s = f >= 2 ? Math.floor(f) : Math.max(0.5, f);   // whole-pixel scaling when there's room; a phone gets all of its screen
  cv.style.width = (VW * s) + 'px';
  cv.style.height = (VH * s) + 'px';
}
addEventListener('resize', fit); fit();

// ---------------- utils ----------------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
function overlap(a, b) { return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h; }

// ---------------- input ----------------
// Zelda II layout: jump + stab are separate buttons.
const keys = {}, pressed = {};
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyJ: 'atk', KeyZ: 'atk',
  Space: 'jump', KeyK: 'jump', KeyX: 'jump',
  KeyL: 'cast', KeyC: 'cast', KeyQ: 'cycle',
  KeyE: 'use', Enter: 'use',
  Escape: 'pause', KeyP: 'pause', KeyM: 'mute', KeyN: 'new'
};
const KEYMAP2 = {
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
  j: 'atk', z: 'atk', ' ': 'jump', k: 'jump', x: 'jump',
  l: 'cast', c: 'cast', q: 'cycle', e: 'use', enter: 'use',
  escape: 'pause', p: 'pause', m: 'mute', n: 'new'
};
const keyOf = e => KEYMAP[e.code] || KEYMAP2[(e.key || '').toLowerCase()];
// keys = keyboard OR gamepad, so neither can release a button the other is holding
const kb = {};
let padHeld = {};
// On-screen controls for touch screens: a d-pad you can slide across, A (jump), B (stab), and the menu keys.
// A tap sets `pressed` the moment it lands, like a keydown, so a tap shorter than a frame still counts.
const touch = {};
(function touchControls() {
  const ui = typeof document !== 'undefined' && document.querySelectorAll && document.getElementById('touch');
  if (!ui || !('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;
  ui.hidden = false;
  const down = k => { if (!touch[k]) pressed[k] = true; touch[k] = true; audioInit(); };
  const grab = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (_) { /* no live pointer: still take the press */ } };
  for (const b of ui.querySelectorAll('button[data-k]')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); grab(b, e); down(k); b.classList.add('on'); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { touch[k] = false; b.classList.remove('on'); });
  }
  const pad = document.getElementById('pad');
  const aim = e => {
    const r = pad.getBoundingClientRect(), dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
    const want = { left: dx < -0.15, right: dx > 0.15, up: dy < -0.15, down: dy > 0.15 };
    for (const k in want) { if (want[k]) down(k); else touch[k] = false; }
  };
  const release = () => { held = false; touch.left = touch.right = touch.up = touch.down = false; };
  let held = false;
  pad.addEventListener('pointerdown', e => { e.preventDefault(); grab(pad, e); held = true; aim(e); });
  pad.addEventListener('pointermove', e => { if (held) aim(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, release);
})();
addEventListener('keydown', e => {
  const k = keyOf(e); if (!k) return;
  e.preventDefault();
  audioInit();
  if (!keys[k]) pressed[k] = true;
  kb[k] = keys[k] = true;
});
addEventListener('keyup', e => { const k = keyOf(e); if (k) { kb[k] = false; keys[k] = !!padHeld[k]; } });

// Standard-mapping gamepad, NES layout: bottom face button jumps, left/right face buttons stab.
const PAD_BUTTONS = { 0: 'jump', 1: 'atk', 2: 'atk', 3: 'use', 4: 'cycle', 5: 'cast', 8: 'cycle', 9: 'pause',
  12: 'up', 13: 'down', 14: 'left', 15: 'right' };
function pollPad() {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  const now = {};
  for (const p of pads) {
    if (!p) continue;
    p.buttons.forEach((b, i) => { const k = PAD_BUTTONS[i]; if (k && (b.pressed || b.value > 0.5)) now[k] = true; });
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (ax < -0.5) now.left = true;
    if (ax > 0.5) now.right = true;
    if (ay < -0.5) now.up = true;
    if (ay > 0.5) now.down = true;
  }
  for (const k in touch) if (touch[k]) now[k] = true;   // the on-screen controls count as a pad
  for (const k of new Set([...Object.keys(now), ...Object.keys(padHeld)])) {
    if (now[k] && !padHeld[k] && !keys[k]) { pressed[k] = true; audioInit(); }
    keys[k] = !!(kb[k] || now[k]);
  }
  padHeld = now;
}

// ---------------- audio (all synthesized) ----------------
let AC = null, muted = false, masterGain = null, noiseBuf = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;                  // no WebAudio: play silent rather than crash
  AC = new Ctx();
  masterGain = AC.createGain(); masterGain.gain.value = 0.16; masterGain.connect(AC.destination);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function beep(type, f0, f1, dur, vol, delay, detune) {
  if (!AC || muted) return;
  const t = AC.currentTime + (delay || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur + 0.02);
}
// ponytail: "accordion" = two detuned reed oscillators. Two beeps, not a wavetable.
function reed(f, dur, vol, delay) {
  beep('sawtooth', f, 0, dur, vol * 0.6, delay, -7);
  beep('square', f, 0, dur, vol * 0.5, delay, +7);
}
function noise(dur, vol, delay) {
  if (!AC || muted) return;
  const t = AC.currentTime + (delay || 0);
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(g); g.connect(masterGain); s.start(t); s.stop(t + dur);
}
const SFX = {
  stab() { beep('square', 620, 200, 0.08, 0.5); noise(0.04, 0.2); },
  hit() { beep('square', 220, 90, 0.08, 0.6); noise(0.06, 0.4); },
  clang() { beep('square', 1100, 700, 0.07, 0.4); beep('square', 550, 0, 0.1, 0.3, 0.02); },
  hurt() { beep('sawtooth', 170, 60, 0.3, 0.6); noise(0.15, 0.35); },
  jump() { beep('square', 260, 520, 0.11, 0.35); },
  // downthrust landing: a rimshot, because Greg is a drummer
  pogo() { noise(0.05, 0.5); beep('square', 900, 380, 0.07, 0.45); beep('triangle', 240, 120, 0.12, 0.4, 0.03); },
  xp() { beep('triangle', 520, 880, 0.12, 0.45); },
  blip() { beep('square', 900, 0, 0.025, 0.15); },
  deny() { beep('square', 180, 0, 0.09, 0.4); beep('square', 150, 0, 0.14, 0.4, 0.1); },
  buy() { beep('square', 784, 0, 0.07, 0.4); beep('square', 1047, 0, 0.14, 0.4, 0.07); },
  heart() { beep('triangle', 660, 0, 0.09, 0.5); beep('triangle', 880, 0, 0.18, 0.5, 0.09); },
  unlock() { beep('square', 520, 0, 0.08, 0.4); beep('square', 700, 0, 0.08, 0.4, 0.09); beep('square', 1040, 0, 0.2, 0.4, 0.18); },
  // grito: the fanfare is an accordion flourish
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => reed(f, i === 3 ? 0.4 : 0.13, 0.5, i * 0.13)); },
  levelup() { [523, 587, 659, 784, 880, 1047].forEach((f, i) => reed(f, 0.11, 0.5, i * 0.09)); },
  cast() { beep('triangle', 700, 1400, 0.18, 0.5); beep('triangle', 900, 1800, 0.14, 0.3, 0.05); },
  boom() { beep('sawtooth', 100, 35, 0.35, 0.8); noise(0.3, 0.6); },
  roar() { beep('sawtooth', 80, 45, 0.6, 0.8); beep('sawtooth', 55, 38, 0.7, 0.6, 0.1); },
  // grackle: a rusty gate with opinions
  screech() { beep('sawtooth', 1800, 900, 0.09, 0.4); beep('square', 2400, 1100, 0.07, 0.3, 0.05); noise(0.08, 0.3, 0.02); },
  trumpet() { beep('sawtooth', 466, 466, 0.22, 0.55); beep('square', 932, 932, 0.2, 0.25, 0.01); },
  splash() { noise(0.25, 0.5); beep('triangle', 300, 120, 0.2, 0.3); },
  rustle() { noise(0.4, 0.35); beep('triangle', 140, 90, 0.4, 0.25); },
  door() { [400, 330, 262].forEach((f, i) => beep('triangle', f, 0, 0.09, 0.4, i * 0.08)); },
  save() { beep('triangle', 520, 0, 0.06, 0.3); beep('triangle', 780, 0, 0.1, 0.3, 0.07); },
  poof() { noise(0.12, 0.4); beep('triangle', 300, 80, 0.15, 0.3); },
  sneeze() { noise(0.06, 0.3); beep('sawtooth', 900, 240, 0.22, 0.45, 0.05); },
  zap() { beep('square', 1400, 200, 0.12, 0.45); },
  // the click track: what Greg counts to
  tick(accent) { beep('square', accent ? 1600 : 1100, 0, 0.02, accent ? 0.22 : 0.12); }
};

// -- music: 2-channel conjunto. Accordion lead, bajo-sexto oom-pah bass. --
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const TRACKS = {
  over: { // the loop, windows down
    bpm: 152, reed: true,
    lead: [76, 0, 76, 74, 72, 74, 76, 79, 77, 0, 76, 74, 72, 0, 0, 0, 74, 0, 74, 72, 71, 72, 74, 77, 76, 0, 74, 72, 71, 69, 67, 0],
    bass: [48, 0, 55, 0, 48, 0, 55, 0, 41, 0, 48, 0, 41, 0, 48, 0, 43, 0, 50, 0, 43, 0, 50, 0, 48, 0, 55, 0, 48, 55, 60, 0],
    hat: true
  },
  town: { // shade, a fan, someone's radio
    bpm: 100, reed: true,
    lead: [72, 0, 0, 76, 0, 0, 79, 0, 77, 0, 0, 76, 0, 0, 0, 0, 74, 0, 0, 77, 0, 0, 76, 0, 72, 0, 0, 69, 0, 0, 0, 0],
    bass: [48, 0, 55, 0, 48, 0, 55, 0, 43, 0, 50, 0, 43, 0, 50, 0, 45, 0, 52, 0, 45, 0, 52, 0, 41, 0, 48, 0, 41, 0, 0, 0],
    hat: false
  },
  battle: { // access-road polka
    bpm: 148, reed: true,
    lead: [72, 0, 76, 79, 0, 76, 72, 0, 74, 0, 77, 0, 74, 0, 71, 0, 72, 0, 76, 79, 0, 81, 79, 76, 74, 76, 74, 72, 71, 0, 67, 0],
    bass: [48, 55, 48, 55, 48, 55, 48, 55, 41, 48, 41, 48, 41, 48, 41, 48, 43, 50, 43, 50, 43, 50, 43, 50, 48, 55, 48, 55, 47, 0, 43, 0],
    hat: true
  },
  palace: { // concrete, fluorescent, going down
    bpm: 116, reed: false,
    lead: [69, 0, 0, 0, 72, 0, 69, 0, 68, 0, 0, 0, 71, 0, 68, 0, 69, 0, 0, 0, 72, 0, 76, 0, 75, 0, 72, 0, 68, 0, 64, 0],
    bass: [45, 0, 45, 0, 45, 0, 45, 0, 44, 0, 44, 0, 44, 0, 44, 0, 41, 0, 41, 0, 41, 0, 41, 0, 44, 0, 44, 0, 45, 0, 45, 0],
    hat: false
  },
  cumbia: { // the Mariachi of the Deep. Blasts land on 1 and 3; the bass tells you where 1 is.
    bpm: 130.4, reed: false,
    lead: [70, 0, 0, 0, 74, 0, 72, 0, 70, 0, 0, 0, 69, 0, 67, 0, 70, 0, 0, 0, 74, 0, 77, 0, 75, 0, 74, 0, 72, 0, 70, 0],
    bass: [46, 0, 53, 53, 46, 0, 53, 53, 43, 0, 50, 50, 43, 0, 50, 50, 39, 0, 46, 46, 39, 0, 46, 46, 41, 0, 48, 48, 41, 0, 45, 0],
    hat: true
  },
  // --- the new places. These use the extended voices: any loop length, legato, drums, a harmony line, echo. ---
  missions: { // Mission Espada. 7/8, E Phrygian dominant: a fuzz riff over clave and congas, then the wail
    bpm: 172, voice: 'fuzz', legato: true, bassVoice: 'fuzz',
    lead: [76, 0, 76, 77, 80, 0, 76, 76, 0, 76, 77, 80, 81, 83, 84, 0, 83, 81, 80, 0, 77, 76, 0, 77, 76, 74, 0, 0, 76, 0, 76, 77, 80, 0, 76, 76, 0, 76, 77, 80, 81, 83, 84, 0, 83, 81, 80, 0, 77, 76, 0, 77, 76, 74, 0, 0, 88, 0, 0, 89, 0, 88, 0, 86, 0, 0, 0, 84, 0, 0, 83, 0, 84, 83, 0, 80, 0, 81, 0, 0, 0, 80, 0, 0, 76, 0, 76, 77, 80, 0, 76, 76, 0, 76, 77, 80, 81, 83, 84, 0, 83, 81, 80, 0, 77, 76, 0, 77, 76, 74, 0, 0],
    bass: [40, 0, 40, 41, 44, 0, 40, 40, 0, 40, 41, 44, 45, 47, 48, 0, 47, 45, 44, 0, 41, 40, 0, 41, 40, 38, 0, 40, 40, 0, 40, 41, 44, 0, 40, 40, 0, 40, 41, 44, 45, 47, 48, 0, 47, 45, 44, 0, 41, 40, 0, 41, 40, 38, 0, 40, 40, 40, 0, 40, 40, 0, 40, 38, 38, 0, 38, 38, 0, 38, 36, 36, 0, 36, 36, 0, 36, 35, 35, 0, 35, 35, 0, 47, 40, 0, 40, 41, 44, 0, 40, 40, 0, 40, 41, 44, 45, 47, 48, 0, 47, 45, 44, 0, 41, 40, 0, 41, 40, 38, 0, 40],
    drums: ['k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'kt', 'g', 't', 'g', 'kt', 't', 'st', 'kt', 'g', 't', 'g', 'kt', 't', 'st', 'kt', 'g', 't', 'g', 'kt', 't', 'st', 'kt', 'g', 't', 'g', 'kt', 't', 'st', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g', 'k', 'c', 's', 'c', 'k', 'g', 'g']
  },
  caverns: { // Natural Bridge Caverns: a slow drone, a tritone, and water somewhere you can't see
    bpm: 66, voice: 'tri', legato: true, bassLegato: true, echo: true,
    lead: [71, 0, 0, 0, 0, 0, 0, 0, 74, 0, 0, 0, 72, 0, 0, 0, 71, 0, 0, 0, 0, 0, 0, 0, 65, 0, 0, 0, 0, 0, 0, 0],
    bass: [35, 0, 0, 0, 0, 0, 0, 0, 35, 0, 0, 0, 0, 0, 0, 0, 34, 0, 0, 0, 0, 0, 0, 0, 29, 0, 0, 0, 0, 0, 0, 0],
    drums: ['d', '', '', '', '', '', 'd', '', '', '', '', 'd', '', '', '', '', '', '', 'd', '', '', '', '', '', 'd', '', '', 'd', '', '', '', '']
  },
  kingwilliam: { // King William: a conjunto vals. The accordion came to Texas with the Germans on this street
    bpm: 132, reed: true,
    lead: [71, 0, 0, 0, 74, 0, 79, 0, 78, 0, 76, 0, 76, 0, 0, 0, 72, 0, 74, 0, 0, 0, 0, 0, 72, 0, 74, 0, 76, 0, 78, 0, 76, 0, 74, 0, 71, 0, 74, 0, 72, 0, 67, 0, 0, 0, 0, 0],
    lead2: [67, 0, 0, 0, 71, 0, 76, 0, 74, 0, 72, 0, 72, 0, 0, 0, 69, 0, 71, 0, 0, 0, 0, 0, 69, 0, 71, 0, 72, 0, 74, 0, 72, 0, 71, 0, 67, 0, 71, 0, 69, 0, 64, 0, 0, 0, 0, 0],
    bass: [43, 0, 50, 0, 50, 0, 43, 0, 50, 0, 50, 0, 48, 0, 55, 0, 55, 0, 43, 0, 50, 0, 50, 0, 38, 0, 45, 0, 45, 0, 38, 0, 45, 0, 45, 0, 43, 0, 50, 0, 50, 0, 43, 0, 50, 0, 50, 0],
    drums: ['', '', 'h', '', 'h', '']
  },
  westside: { // the West Side Sound: a Vox organ riff, cumbia underneath
    bpm: 104, voice: 'organ',
    lead: [76, 0, 72, 76, 0, 72, 74, 0, 76, 0, 72, 76, 0, 77, 76, 74, 77, 0, 74, 77, 0, 74, 76, 0, 71, 0, 68, 71, 0, 74, 71, 68],
    bass: [45, 0, 0, 52, 45, 0, 0, 52, 45, 0, 0, 52, 45, 0, 0, 52, 50, 0, 0, 57, 50, 0, 0, 57, 40, 0, 0, 47, 40, 0, 44, 47],
    drums: ['kh', 'h', 'gh', 'h', 'kh', 'h', 'gh', 'h', 'kh', 'h', 'gh', 'h', 'kh', 'h', 'gh', 'h', 'kh', 'h', 'gh', 'h', 'kh', 'h', 'gh', 'h', 'kh', 'h', 'gh', 'h', 'kh', 'h', 'gh', 'h']
  },
  // --- boss themes (BOSS.theme / theme2) ---
  silverfish: { // the bottom shelf: a chromatic crawl, staccato, hi-hats like legs
    bpm: 156, lead: [64, 65, 64, 0, 67, 66, 64, 0, 64, 65, 64, 0, 70, 69, 67, 0, 64, 65, 64, 0, 67, 66, 64, 0, 71, 72, 71, 70, 69, 68, 67, 66],
    bass: [40, 0, 40, 0, 40, 0, 40, 0, 40, 0, 40, 0, 46, 0, 46, 0, 40, 0, 40, 0, 40, 0, 40, 0, 47, 0, 47, 0, 45, 0, 44, 0],
    drums: ['k', 'h', 'h', 'h', 's', 'h', 'h', 'h']
  },
  brackenbat: { // 6/8, arpeggios echoing off the ceiling, toms under them
    bpm: 132, voice: 'tri', echo: true,
    lead: [62, 65, 69, 74, 69, 65, 58, 62, 65, 70, 65, 62, 60, 64, 67, 72, 67, 64, 57, 61, 64, 69, 64, 61, 62, 65, 69, 86, 69, 65, 58, 62, 65, 82, 65, 62, 60, 64, 67, 84, 67, 64, 57, 61, 64, 81, 64, 61],
    bass: [38, 0, 0, 38, 0, 0, 34, 0, 0, 34, 0, 0, 36, 0, 0, 36, 0, 0, 33, 0, 0, 33, 0, 0, 38, 0, 0, 38, 0, 0, 34, 0, 0, 34, 0, 0, 36, 0, 0, 36, 0, 0, 33, 0, 0, 33, 0, 0],
    drums: ['g', '', 'g', 'g', '', 'g']
  },
  llorona: { // a lament in 3/4 on the accordion, A minor
    bpm: 84, reed: true, legato: true,
    lead: [69, 0, 0, 0, 72, 0, 71, 0, 69, 0, 68, 0, 69, 0, 0, 0, 0, 0, 64, 0, 65, 0, 68, 0, 69, 0, 0, 0, 72, 0, 76, 0, 74, 0, 72, 0, 71, 0, 0, 0, 68, 0, 69, 0, 0, 0, 0, 0],
    bass: [45, 0, 52, 0, 52, 0, 40, 0, 47, 0, 47, 0, 45, 0, 52, 0, 52, 0, 40, 0, 47, 0, 47, 0, 45, 0, 52, 0, 52, 0, 45, 0, 52, 0, 52, 0, 40, 0, 47, 0, 47, 0, 45, 0, 52, 0, 52, 0],
    drums: ['', '', 'h', '', 'h', '']
  },
  llorona2: { // phase 2: the same lament on fuzz, twice as fast, the Missions' timbales under it
    bpm: 150, voice: 'fuzz', legato: true, bassVoice: 'fuzz',
    lead: [69, 0, 0, 0, 72, 0, 71, 0, 69, 0, 68, 0, 69, 0, 0, 0, 0, 0, 64, 0, 65, 0, 68, 0, 69, 0, 0, 0, 72, 0, 76, 0, 74, 0, 72, 0, 71, 0, 0, 0, 68, 0, 69, 0, 0, 0, 0, 0],
    bass: [45, 0, 52, 0, 52, 0, 40, 0, 47, 0, 47, 0, 45, 0, 52, 0, 52, 0, 40, 0, 47, 0, 47, 0, 45, 0, 52, 0, 52, 0, 45, 0, 52, 0, 52, 0, 40, 0, 47, 0, 47, 0, 45, 0, 52, 0, 52, 0],
    drums: ['kt', 'h', 't', 'h', 'kt', 't']
  },
  credits: { // the loop theme again, slower, in thirds: the drive home
    bpm: 120, reed: true,
    lead: [76, 0, 76, 74, 72, 74, 76, 79, 77, 0, 76, 74, 72, 0, 0, 0, 74, 0, 74, 72, 71, 72, 74, 77, 76, 0, 74, 72, 71, 69, 67, 0],
    lead2: [72, 0, 72, 71, 69, 71, 72, 76, 74, 0, 72, 71, 69, 0, 0, 0, 71, 0, 71, 69, 67, 69, 71, 74, 72, 0, 71, 69, 67, 65, 64, 0],
    bass: [48, 0, 55, 0, 48, 0, 55, 0, 41, 0, 48, 0, 41, 0, 48, 0, 43, 0, 50, 0, 43, 0, 50, 0, 48, 0, 55, 0, 48, 55, 60, 0],
    drums: ['k', '', 'h', '', 's', '', 'h', '']
  },
  home: { // Redwoods Crest, 6am, nobody up
    bpm: 84, reed: true,
    lead: [64, 0, 0, 0, 67, 0, 0, 0, 69, 0, 0, 72, 0, 0, 0, 0, 71, 0, 0, 0, 67, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0],
    bass: [40, 0, 0, 0, 47, 0, 0, 0, 45, 0, 0, 0, 52, 0, 0, 0, 43, 0, 0, 0, 50, 0, 0, 0, 40, 0, 0, 0, 47, 0, 0, 0],
    hat: false
  }
};
// fuzz: a sawtooth through a clipped waveshaper, scooping up into the note and wailing into vibrato
let fuzzCurve = null;
function fuzz(f, dur, vol, delay) {
  if (!AC || muted) return;
  if (!fuzzCurve) { fuzzCurve = new Float32Array(257); for (let i = 0; i < 257; i++) fuzzCurve[i] = Math.tanh((i / 128 - 1) * 6); }   // odd length: silence maps to exactly 0
  const t = AC.currentTime + delay, o = AC.createOscillator(), sh = AC.createWaveShaper(), g = AC.createGain();
  o.type = 'sawtooth'; sh.curve = fuzzCurve; g.gain.value = 0;   // silent until its note: a gain of 1 leaks the shaper's offset
  o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
  if (dur > 0.3) {                                   // held notes wail
    const l = AC.createOscillator(), la = AC.createGain();
    l.frequency.value = 5.8; la.gain.setValueAtTime(0, t); la.gain.linearRampToValueAtTime(f * 0.03, t + 0.25);
    l.connect(la); la.connect(o.frequency); l.start(t); l.stop(t + dur);
  }
  const v = vol * 0.1;                               // the shaper clips to full scale, so the level is set after it
  g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(sh); sh.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur + 0.02);
}
// combo organ: two squares an octave apart, cut short
function organ(f, dur, vol, delay) { beep('square', f, 0, dur * 0.7, vol * 0.7, delay); beep('square', f * 2, 0, dur * 0.7, vol * 0.35, delay, 4); }
const DRUMS = {
  k: t => { beep('triangle', 150, 45, 0.1, 0.25, t); noise(0.02, 0.06, t); },
  s: t => { noise(0.09, 0.14, t); beep('square', 300, 180, 0.04, 0.05, t); },
  h: t => noise(0.02, 0.04, t),
  c: t => { beep('square', 800, 0, 0.05, 0.05, t); beep('square', 540, 0, 0.05, 0.04, t); },     // cowbell
  g: t => beep('triangle', 230, 170, 0.11, 0.18, t),                                             // conga
  t: t => { beep('triangle', 340, 300, 0.12, 0.15, t); noise(0.04, 0.06, t); },                 // timbale
  d: t => { const f = 1400 + Math.random() * 900; beep('sine', f, f * 1.5, 0.05, 0.1, t); beep('sine', f, f * 1.5, 0.05, 0.04, t + 0.3); }   // a drip, and its echo
};
function voice(tr, f, dur, vol, t) {
  if (tr.voice === 'fuzz') fuzz(f, dur, vol * 0.8, t);
  else if (tr.voice === 'organ') organ(f, dur, vol, t);
  else if (tr.voice === 'tri') beep('triangle', f, 0, dur, vol * 1.6, t);
  else if (tr.reed) reed(f, dur, vol, t);
  else beep('square', f, 0, dur, vol * 0.9, t);
}
// legato: a note holds until the next one
const heldFor = (seq, i) => { let n = 1; while (n < seq.length && !seq[(i + n) % seq.length]) n++; return n; };
const music = { track: null, step: 0, nextT: 0, timer: null, speed: 1 };
function playMusic(name) {
  if (music.track === name) return;
  music.track = name; music.step = 0;
  if (AC) music.nextT = AC.currentTime + 0.1;
  if (!music.timer) music.timer = setInterval(musicTick, 40);
}
function stopMusic() { music.track = null; }
function musicTick() {
  if (!AC || muted || !music.track) return;
  const tr = TRACKS[music.track];
  const stepDur = (60 / (tr.bpm * music.speed)) / 2;
  while (music.nextT < AC.currentTime + 0.12) {
    const i = music.step % tr.lead.length;
    const L = tr.lead[i], B = tr.bass[i], L2 = tr.lead2 && tr.lead2[i];
    const t = music.nextT - AC.currentTime;
    const ld = stepDur * (tr.legato ? heldFor(tr.lead, i) * 0.95 : 0.9);
    if (L) { voice(tr, midi(L), ld, 0.10, t); if (tr.echo) voice(tr, midi(L), ld, 0.035, t + 0.36); }
    if (L2) voice(tr, midi(L2), ld, 0.06, t);
    if (B) {
      const bd = stepDur * (tr.bassLegato ? heldFor(tr.bass, i) * 0.95 : 1.4);
      if (tr.bassVoice === 'fuzz') fuzz(midi(B), bd, 0.07, t); else beep('triangle', midi(B), 0, bd, 0.15, t);
    }
    if (tr.drums) for (const d of tr.drums[i % tr.drums.length]) DRUMS[d](t);
    if (tr.hat && i % 4 === 2) noise(0.03, 0.05, t);
    music.nextT += stepDur;
    music.step++;
  }
}

// ---------------- tiny pixel font (3x5) ----------------
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101010001', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001001010010',
  '8': '111101111101111', '9': '111101111001110',
  '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010',
  ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', "'": '010010000000000',
  '/': '001001010100100', '(': '010100100100010', ')': '010001001001010', '>': '100110111110100',
  '*': '101010111010101'
};
// The 16-bit font (art/font.png): 8x8 cells, 6 px glyphs, 7 px advance, 7 px tall. The 3x5 one above is the fallback.
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?:-+'/()>*";
const bigFont = () => hasArt('font');
const plain = s => String(s).toUpperCase().replace(/"/g, "''").replace(/—/g, '-');
const advance = (ch, scale) => (ch !== ' ' && bigFont() ? 7 : 4) * (scale || 1);
const LINE_H = () => bigFont() ? 10 : 7;   // one line of text plus its gap
function text(s, x, y, color, scale) {
  scale = scale || 1;
  s = plain(s);
  const big = bigFont();
  let cx = x;
  for (const ch of s) {
    const gi = GLYPHS.indexOf(ch);
    if (ch !== ' ' && gi >= 0) {
      if (big) drawArt('font', gi, cx, y, false, color, scale);
      else {
        const f = FONT[ch];
        ctx.fillStyle = color;
        for (let i = 0; i < 15; i++) if (f[i] === '1') ctx.fillRect(cx + (i % 3) * scale, y + ((i / 3) | 0) * scale, scale, scale);
      }
    }
    cx += advance(ch, scale);
  }
  return cx - x;
}
const textW = (s, scale) => { let w = 0; for (const ch of plain(s)) w += advance(ch, scale); return w; };
function textC(s, y, color, scale) { text(s, Math.round((VW - textW(s, scale)) / 2), y, color, scale); }
// break s into lines no wider than w, at spaces
function wrap(s, w, scale) {
  const out = [];
  let cur = '';
  for (const word of String(s).split(' ')) {
    const t = cur ? cur + ' ' + word : word;
    if (cur && textW(t, scale) > w) { out.push(cur); cur = word; } else cur = t;
  }
  out.push(cur);
  return out;
}
// centred and wrapped; returns the y under the last line
function textWrapC(s, y, color, w) {
  for (const l of wrap(s, w)) { textC(l, y, color); y += LINE_H(); }
  return y;
}

// ---------------- sprites ----------------
// Every colour below is an NES 2C02 master-palette entry. Nothing else is legal here.
const PAL = {
  k: '#000000',   // outline / black
  e: '#005800',   // deep cedar shade
  w: '#F8F8F8',   // white
  a: '#FCE0A8',   // cream / khaki / paper
  m: '#BCBCBC',   // light grey, chrome
  g: '#7C7C7C',   // grey
  G: '#787878',   // grey (legacy dupe)
  D: '#503000',   // dark brown — hair, bark shadow
  B: '#503000',   // alias
  s: '#F0D0B0',   // skin
  o: '#E45C10',   // orange — cones, terracotta
  y: '#F8B800',   // gold — medals, pollen, pins
  Y: '#FCE0A8',   // pale gold
  b: '#AC7C00',   // hickory, wood, bark
  r: '#F83800',   // red
  R: '#A80020',   // deep red
  q: '#881400',   // burgundy — Marisa's dress
  t: '#008888',   // teal — Greg's shirt
  d: '#006800',   // dark green
  n: '#00A800',   // green — cedar
  j: '#4428BC',   // indigo — jeans, grackle sheen
  c: '#0078F8',   // blue
  p: '#F8A4C0'    // pink
};

// ponytail: NPCs are one silhouette in different colours. One template beats six copies.
function npc(hair, torso, legs) {
  return [[
    '...kkkkkk...',
    '..k' + hair.repeat(6) + 'k..',
    '..kssssssk..',
    '..kskssksk..',
    '..kssssssk..',
    '..kskkkksk..',
    '...kssssk...',
    '..k' + torso.repeat(6) + 'k..',
    '.ks' + torso.repeat(6) + 'sk.',
    '.ks' + torso + torso + 'kk' + torso + torso + 'sk.',
    '.k' + torso.repeat(8) + 'k.',
    '.k' + torso.repeat(8) + 'k.',
    '..k' + torso.repeat(6) + 'k..',
    '..k' + legs.repeat(6) + 'k..',
    '..k' + legs + legs + '..' + legs + legs + 'k..',
    '.kkkk..kkkk.'
  ]];
}

const SPR = {
  // ---- Greg, side view (facing right). Drumstick is drawn in code, never here. ----
  g_idle: [[
    '....kkkk....', '...kDDDDk...', '..kDDDDDkk..', '..kkkkkkkk..', '..kssssk....',
    '..ksskssk...', '...kssss....', '..kttttk....', '.kttttttk...', '.ktsttttk...',
    '.kttttttk...', '..kjjjjk....', '..kjjjjk....', '..kjj.jk....', '..kjj.jk....', '..kww.kww...'
  ]],
  g_walk: [[
    '....kkkk....', '...kDDDDk...', '..kDDDDDkk..', '..kkkkkkkk..', '..kssssk....',
    '..ksskssk...', '...kssss....', '..kttttk....', '.kttttttk...', '.ktsttttk...',
    '.kttttttk...', '..kjjjjk....', '..kjjjjk....', '..kjjkjjk...', '.kjj...jjk..', '.kww...kww..'
  ], [
    '....kkkk....', '...kDDDDk...', '..kDDDDDkk..', '..kkkkkkkk..', '..kssssk....',
    '..ksskssk...', '...kssss....', '..kttttk....', '.kttttttk...', '.ktsttttk...',
    '.kttttttk...', '..kjjjjk....', '..kjjjjk....', '..kkjjkk....', '...kjjk.....', '...kwwk.....'
  ]],
  g_jump: [[
    '....kkkk....', '...kDDDDk...', '..kDDDDDkk..', '..kkkkkkkk..', '..kssssk....',
    '..ksskssk...', '...kssss....', '..kttttk....', '.kttttttk...', '.ktsttttk...',
    '.kttttttk...', '..kjjjjk....', '.kjjkjjjk...', '.kjj..kjjk..', '.kww...ww...', '............'
  ]],
  // top 4 rows deliberately empty — that drop is the crouch read
  g_crouch: [[
    '............', '............', '............', '............', '....kkkk....',
    '...kDDDDk...', '..kDDDDDkk..', '..kkkkkkkk..', '..kssssk....', '..ksskssk...',
    '..kttttttk..', '.kttttttttk.', '.kjjjjkjjjk.', '.kjjjjkjjjk.', '.kwwk..kwwk.', '............'
  ]],
  g_stab: [[
    '....kkkk....', '...kDDDDk...', '..kDDDDDkk..', '..kkkkkkkk..', '..kssssk....',
    '..ksskssk...', '...kssss....', '..kttttk....', '.ktttttttk..', '.kttttttssk.',
    '.kttttttk...', '..kjjjjk....', '..kjjjjk....', '..kjjkjjk...', '.kjj...jjk..', '.kww...kww..'
  ]],
  g_thrust: [[
    '....kkkk....', '...kDDDDk...', '..kDDDDDkk..', '..kkkkkkkk..', '..kssssk....',
    '..ksskssk...', '..kttttttk..', '.kttttttttk.', '.ktttttttsk.', '..kttttttk..',
    '..kjjjjjjk..', '..kjjkkjjk..', '..kjj..jjk..', '..kww..wwk..', '.....bb.....', '.....bb.....'
  ]],

  // ---- Marisa ----
  marisa: [[
    '...kkkkkk...', '..kDDDDDDk..', '.ykssssssky.', '..kskssksk..', '..kssssssk..',
    '..kskwwksk..', '...kssssk...', '..kqqyqqqk..', '.ksqqqqqqsk.', '.ksqqqqqqsk.',
    '.kqqqqqqqqk.', '.kqqqqqqqqk.', '..kqqqqqqk..', '..kqqqqqqk..', '..kss..ssk..', '.kkww..wwkk.'
  ]],
  // asleep on the couch, head to the right. Zzz is drawn in code.
  marisa_sleep: [[
    '................', '.....kkkkkkkk...', '..kkkqqqqqDDDkk.', '.kqqqqqqqqsssDk.',
    '.kqqqqqqqkskskk.', '.kqqqqqqqksssssk', '..kkqqqqqkkDDDk.', '....kkkkkk.kkk..'
  ]],

  // ---- NPCs ----
  hoa: npc('w', 'c', 'a'),        // visor, polo, khakis, clipboard drawn in code
  golfpro: npc('y', 'w', 'm'),    // visor, polo, slacks
  abuela: npc('m', 'w', 'o'),     // grey hair, apron, dress
  bagu: npc('G', 'c', 'j'),       // a guy by the river. Payroll typo.
  director: npc('k', 'R', 'k'),
  sash: npc('m', 'm', 'm'),
  glassman: npc('w', 'j', 'a'),    // white crew cut, navy work shirt, khakis
  curandera: npc('m', 'k', 'q'),   // grey braid, black rebozo, flowered dress
  captain: npc('w', 'c', 'j'),   // white cap, blue windbreaker      // a stone Fiesta figure; the sash itself is drawn in code   // Keystone band director. Red coat, black slacks.
  tourist: npc('r', 'w', 'a'),    // sunburn, fresh tee, cargo shorts. Do not stab.
  // townsfolk
  colonel: npc('m', 'd', 'a'), jogger: npc('y', 'p', 'k'), mom: npc('b', 'c', 'j'), pitmaster: npc('D', 'w', 'j'),
  cousin: npc('D', 'r', 'j'), musician: npc('k', 'w', 'k'), shopper: npc('y', 'o', 'a'), valet: npc('D', 'R', 'k'),
  concierge: npc('k', 'j', 'k'), dogwalker: npc('b', 'n', 'a'), tennis: npc('y', 'w', 'w'), tia: npc('k', 'q', 'q'),
  lifeguard: npc('w', 'r', 's'), wife: npc('y', 'q', 'a'), gardener: npc('m', 'n', 'a'), artist: npc('o', 'j', 'k'),
  abuelo: npc('w', 'a', 'D'), fireworks: npc('D', 'y', 'j'), oldman: npc('m', 'c', 'D'), fiddler: npc('b', 'R', 'j'),
  rancher: npc('a', 'c', 'j'), storekeeper: npc('D', 'a', 'j'), beekeeper: npc('w', 'w', 'w'), bartender: npc('D', 'w', 'k'),
  grackleman: npc('m', 'j', 'D'), papel: npc('k', 'p', 'j'), silversmith: npc('m', 'b', 'j'), elder: npc('w', 'a', 'b'),
  candlemaker: npc('m', 'q', 'k'), devout: npc('k', 'k', 'q'),
  kid: [[
    '..kkkkkk..', '.kDDDDDDk.', '.kssssssk.', '.kskssksk.', '.kssssssk.', '..kssssk..',
    '.kcccccck.', 'ksccccccsk', '.kcccccck.', '.kjjjjjjk.', '.kss..ssk.', '.kkk..kkk.'
  ]],
  acequia: [['mmmmmmmmmmmmmmmm', 'mttttttttttttttm', 'mtcttttcttttcttm', 'mttttttttttttttm', 'gggggggggggggggg']],

  // ---- enemies ----
  ant: [[
    '............', '..kk...kk...', '.kRRkkkRRk..', 'kRRRRRRRRRk.',
    'kRrrRRRrrRk.', '.kRRRRRRRk..', '..k.k.k.k...', '.k...k...k..'
  ], [
    '............', '..kk...kk...', '.kRRkkkRRk..', 'kRRRRRRRRRk.',
    'kRrrRRRrrRk.', '.kRRRRRRRk..', '.k.k.k.k....', 'k...k...k...'
  ]],
  grackle: [[
    '.....kkkk...', '..kkjjjjjk..', '.kjjjjjjjk..', 'kjjjjjjjjkky',
    '.kjjwjjjjk..', '..kkjjjkk...', 'kkk.k.k.....'
  ], [
    '.....kkkk...', 'kkkkjjjjjk..', '.kjjjjjjjk..', '.kjjjjjjjkky',
    '..kjjwjjjk..', '...kkjjkk...', '..k.k.k.....'
  ]],
  wisp: [[
    '...yy...', '..yYYy..', '.yYYYYy.', 'yYYwwYYy', 'yYYwwYYy', '.yYYYYy.', '..yYYy..', '...yy...'
  ], [
    '........', '...yy...', '..yYYy..', '.yYwwYy.', '.yYwwYy.', '..yYYy..', '...yy...', '........'
  ]],
  cone: [[
    '..........', '..........', '....kk....', '...koak...', '...koak...', '..kooook..',
    '..kwwwwk..', '.kooooook.', '.kooooook.', 'kwwwwwwwwk', 'kooooooook', 'kkkkkkkkkk'
  ], [
    '....kk....', '...koak...', '...koak...', '..kooook..', '..kwwwwk..', '.kokkokok.',
    '.kooooook.', 'kwwwwwwwwk', 'kooooooook', 'kkkkkkkkkk', '.kk....kk.', '.kk....kk.'
  ]],
  // Cart Knight. The cart itself is drawn in code at high or low guard.
  cartknight: [[
    '...kkkk.....', '..kmmmmk....', '..kmmkmk....', '...kssk.....', '..kyyyyk....',
    '.kyyyyyyyk..', '.kyyyk.yk...', '.kyyyk......', '..kjjk......', '..kjjjk.....',
    '..kjjjk.....', '..kjk.jk....', '..kjk.jk....', '.kwwk.kwwk..', '............', '............'
  ], [
    '...kkkk.....', '..kmmmmk....', '..kmmkmk....', '...kssk.....', '..kyyyyk....',
    '.kyyyyyyyk..', '.kyyyk.yk...', '.kyyyk......', '..kjjk......', '..kjjjk.....',
    '..kjjjk.....', '..kjjk......', '..kjkjk.....', '..kwwkww....', '............', '............'
  ]],

  // ---- bosses ----
  // drawn at 3x, so everything here is a 3px block. Go bold or go home.
  // the Silverfish (2x): segmented, silver, three tails behind and feelers in front. Frame 2 is the rear-up.
  silverfish: [[
    '.....kkkkkkk..k.', 'k.kkmmgmmgmmkk.k', '.kmmwmmwmmwmmmkk', 'k.kkgmmgmmgmmkk.', '.....k.k.k.k....'
  ], [
    '............kk.k', '.....kkkkkkmmk..', 'k.kkmmgmmgmmmk..', '.kmmwmmwmmwkk...', '..k.k.k.k.k.....'
  ]],
  // the Bracken Bat (3x): a Mexican free-tailed bat the size of a car. Wings up, wings down.
  brackenbat: [[
    'k..........k', 'kk.k....k.kk', 'kDkkk..kkkDk', 'kDDkDDDDkDDk', '.kDDDrrDDDk.', '..kDDDDDDk..', '...kDDDDk...', '....k..k....'
  ], [
    '...k....k...', '...kkDDkk...', '..kDDrrDDk..', '.kDDDDDDDDk.', 'kDDkDDDDkDDk', 'kDk.kDDk.kDk', 'kk...kk...kk', 'k..........k'
  ]],
  // La Llorona (2x): white dress, black hair to the waist. Frame 2: hands over her face.
  llorona: [[
    '..kkkk..', '.kkkkkk.', '.kksskk.', '.kksskk.', '.kkwwkk.', 'kkwwwwkk', 'k.wwwwsk', '..wwwww.',
    '..wwwww.', '.wwmwwww', '.wwwwmww', 'wwmwwwww', '.w.ww.w.'
  ], [
    '..kkkk..', '.kkkkkk.', '.kssssk.', '.kssssk.', '.kkwwkk.', 'kkwwwwkk', 'k.wwwwwk', '..wwwww.',
    '..wwwww.', '.wwmwwww', '.wwwwmww', 'wwmwwwww', '.w.ww.w.'
  ]],
  // a free-tailed bat, one of twenty million
  bat: [['k......k', 'kD.kk.Dk', '.kDDDDk.', '..kDDk..', '...kk...'], ['..kkkk..', '.kDDDDk.', 'kDDrrDDk', 'kD.kk.Dk', 'k......k']],
  grackleprince: [[
    '..kkkkkk....', '.kjjjjjjkk..', 'kjjjjjjjjjk.', 'kjjwwjjjjkky',
    'kjjjjjjjjjk.', '.kjjjjjjjjk.', 'kk.kjjjjk.k.', 'k...kk.kk...'
  ], [
    '..kkkkkk....', 'kkjjjjjjkk..', '.kjjjjjjjjk.', '.kjjwwjjjkky',
    '.kjjjjjjjjk.', 'kkjjjjjjjjkk', '.k.kjjjjk.k.', '..k.kk.k....'
  ]],
  hippo: [[
    '............', '...kkkkkkk..', '..kgggggggk.', '.kgkwgggggk.',
    'kggggggggggk', 'kgggkppkgggk', '.kgggggggggk', '..k.k...k.k.'
  ], [
    '............', '...kkkkkkk..', '..kgggggggk.', '.kgkwgggggk.',
    'kggggggggggk', 'kgggkwwkgggk', '.kgggggggggk', '..kk.k.kk...'
  ]],
  mariachi: [[
    '.kkkkkkkkkk.', '..kmmmmmmk..', '...kkkkkk...', '....kssk....', '...ksskss...',
    '....kssk....', '..kkkkkkkk..', '.kmkkkkkkmk.', '.kkkkkkkkkk.', '.kkyykkyykk.',
    '.kkkkkkkkkk.', '..kkkkkkkk..', '..kkk..kkk..', '..kkk..kkk..', '..kkk..kkk..', '.kkkk..kkkk.'
  ], [
    '.kkkkkkkkkk.', '..kmmmmmmk..', '...kkkkkk...', '....kssk....', '...ksskss...',
    '....kssk....', '..kkkkkkkk..', '.kmkkkkkkmk.', '.kkkkkkkkkk.', '.kkyykkyykk.',
    '.kkkkkkkkkk.', '..kkkkkkkk..', '..kkkkkkkk..', '..kkk..kkk..', '..kkk..kkk..', '.kkkk.kkkkk.'
  ]],
  cedarking: [[
    '...kkkkkk...', '..kDbbbbDk..', '.kDbbbbbbDk.', 'kDbkwbbwkbDk',
    'kDbbbbbbbbDk', 'kDbbkkkkbbDk', 'kDbbbbbbbbDk', '.kDbbbbbbDk.',
    '.kDbbbbbbDk.', '.kDbbbbbbDk.', '.kDbbbbbbDk.', 'kDbbbbbbbbDk',
    'kDbbbbbbbbDk', 'kkDDDDDDDDkk', 'kk.kkkk.kk..'
  ], [
    '...kkkkkk...', '..kDbbbbDk..', '.kDbbbbbbDk.', 'kDbkwbbwkbDk',
    'kDbbbbbbbbDk', 'kDbkkkkkkbDk', 'kDbbbbbbbbDk', '.kDbbbbbbDk.',
    '.kDbbbbbbDk.', '.kDbbbbbbDk.', '.kDbbbbbbDk.', 'kDbbbbbbbbDk',
    'kDbbbbbbbbDk', 'kkDDDDDDDDkk', '.kk.kkkk.kkk'
  ]],
  // his crown is a tree crown. Drawn big, and yes, it is bouncy.
  cedarcrown: [['...nnnnn...', '..nnnnnnn..', '.nndnnndnn.', '..nnnnnnn..', '...ndnnn...']],
  // ...and until it rains, it is caked gold with pollen and nothing lands on it
  cedarcrownp: [['...nynyn...', '..nynnnyn..', '.nyynnnyyn.', '..nnynynn..', '...ynnyn...']],

  // ---- pickups / items ----
  // Fiesta pin: a 1-up. Pin trading is the real tradition; these are the ones worth trading for.
  pin: [['..kkkk..', '.kyyyyk.', 'kyrrccyk', 'kyrrccyk', 'kynnppyk', 'kynnppyk', '.kyyyyk.', '..kkkk..']],
  heart: [['.kk.kk..', 'krrkrrk.', 'krRrrrk.', 'krrrrrk.', '.krrrk..', '..krk...', '...k....']],
  heartbig: [['.kkk.kkk.', 'krrrkrrrk', 'krRRrrrrk', 'krRrrrrrk', 'krrrrrrrk', '.krrrrrk.', '..krrrk..', '...krk...', '....k....']],
  cascaron: [['..kkkk..', '.kwwwwk.', 'kwrwcwnk', 'kwcwnwrk', 'kwnwrwck', 'kwwwwwwk', '.kkkkkk.'],
             ['..kkkk..', '.kwwwwk.', 'kwnwrwck', 'kwrwcwnk', 'kwcwnwrk', 'kwwwwwwk', '.kkkkkk.']],
  bigred: [['.kkkkk.', 'kmmmmmk', 'kRRRRRk', 'kRwwwRk', 'kRwRwRk', 'kRRRRRk', 'kRRRRRk', '.kkkkk.']],
  medal: [['..kkkk..', '.kcccck.', '.kcwwck.', '.kcccck.', '..kyyk..', '.kyyyyk.', 'kyyYYyyk', 'kyyYYyyk', '.kyyyyk.', '..kkkk..']],
  skey: [['.kkk.', 'km.mk', '.kmk.', '..mk.', '..mk.', '..mkk', '..mk.', '..mkk']],   // a palace's small key
  keystone: [['.kkk.', 'ky.yk', '.kyk.', '..yk.', '..yk.', '..ykk', '..yk.', '..ykk']],
  scroll: [['kkkkkkkkk.', 'kaaaaaaakk', 'kaaaaaaaak', 'kkaaaaaaak', '.kkkkkkkk.']],
  validation: [['kkkkkkkkkk', 'kwwwwwwwwk', 'kwkkwkkwwk', 'kwwwwwwwwk', 'kwyyyyyywk', 'kkkkkkkkkk']],
  rose: [['...kkk...', '..kyyyk..', '.kyYYYyk.', 'kyYyyyYyk', 'kyYyoyYyk', 'kyYYYYYyk', '.kyyyyyk.', '..kdkdk..', '...ndn...']],
  chest: [[
    '.kkkkkkkkkk.', 'kBbbbbbbbbBk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk', 'kBbbbkybbbBk',
    'kBbbbkkbbbBk', 'kBbbbbbbbbBk', '.kkkkkkkkkk.'
  ], [
    '.kkkkkkkkkk.', 'kB........Bk', 'kB.kkkkkk.Bk', 'kkkkkkkkkkkk', 'kBbbbkybbbBk',
    'kBbbbkkbbbBk', 'kBbbbbbbbbBk', '.kkkkkkkkkk.'
  ]],
  spark: [['.yy.', 'yYYy', 'yYYy', '.yy.']],
  // a blue heeler who followed the matachines too far
  dog: [['.......kk.', '......kmmk', 'kk...kmmkk', 'kmkkkmmmk.', '.kmmmmmmk.', '.kmkkkmk..', '.kk..kk...']],
  maglite: [['.........', 'kkkkkkkkk', 'kgkgkgkyy', 'kkkkkkkkk']],                       // four D cells, and the lens
  accordion: [['kkkkkkk', 'krwrwrk', 'kkkkkkk', 'krwrwrk', 'kkkkkkk', '.k...k.']],       // a button accordion, bellows out

  // ---- overworld minis ----
  mini: [[
    '.kkkk...', 'kDDDDk..', 'kkkkkk..', 'kssssk..', 'kttttk..', 'kttttk..', '.kjjk...', '.k..k...'
  ], [
    '.kkkk...', 'kDDDDk..', 'kkkkkk..', 'kssssk..', 'kttttk..', 'kttttk..', '.kjjk...', 'k....k..'
  ]],
  // traffic. It is always there and it is always moving toward you.
  traffic: [[
    '..kkkk..', '.kkkkkk.', 'kkkrkkkk', 'kkkkkkkk', '.kkkkkk.', '..k..k..'
  ], [
    '..kkkk..', '.kkkkkk.', 'kkkkrkkk', 'kkkkkkkk', '.kkkkkk.', '.k....k.'
  ]]
};

// NES trick: tiers are palette swaps of one sprite
SPR.cartknight1 = SPR.cartknight.map(f => f.map(r => r.replace(/y/g, 'r')));
SPR.cartknight2 = SPR.cartknight.map(f => f.map(r => r.replace(/y/g, 'c')));
const sprCache = new Map();
function sprCanvas(name, f, flip, tint) {
  const key = name + '|' + f + (flip ? 'F' : '') + (tint || '');
  let c = sprCache.get(key);
  if (c) return c;
  const rows = SPR[name][f];
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      g.fillStyle = PAL[ch] || '#f0f';
      g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
  }
  // ponytail: Shadow Greg IS your sprite, repainted. Not a second sprite sheet.
  if (tint) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = tint; g.fillRect(0, 0, w, h); }
  sprCache.set(key, c);
  return c;
}
function drawSpr(name, f, x, y, flip, scale, tint) {
  scale = scale || 1;
  const c = sprCanvas(name, f, flip, tint);
  ctx.drawImage(c, Math.round(x - c.width * scale / 2), Math.round(y - c.height * scale), c.width * scale, c.height * scale);
}

// ---------------- 16-bit art ----------------
// art/*.png and art/atlas.js come from tools/sprites.py. Anything without a sheet (or run headless) falls back to
// the pixel-string sprites above, so a missing file costs looks, never the game.
const ART = (typeof window !== 'undefined' && window.ART) || {};
const IMG = {};
if (typeof Image !== 'undefined') for (const k in ART) { IMG[k] = new Image(); IMG[k].src = 'art/' + ART[k].src; }
const hasArt = k => !!(IMG[k] && IMG[k].complete && IMG[k].naturalWidth);
const artTint = new Map();
// Who wears which body: [sheet, first frame]. Townsfolk are five bodies in three palettes (0 man, 2 woman, 4 old man,
// 6 old woman, 8 kid), each with two walking frames; Zelda II's towns were the same trick.
const NPC_ART = {
  marisa: ['cast', 0], hoa: ['cast', 1], golfpro: ['cast', 2], abuela: ['cast', 3], bagu: ['cast', 4], director: ['cast', 5],
  captain: ['cast', 6], tourist: ['cast', 7], marisa_sleep: ['marisa_asleep', 0],
  beekeeper: ['townsfolk_props', 0], lifeguard: ['townsfolk_props', 2], rancher: ['townsfolk_props', 4], papel: ['townsfolk_props', 6],
  grackleman: ['townsfolk_props', 8],
  pitmaster: ['townsfolk', 0], valet: ['townsfolk', 0], fireworks: ['townsfolk', 0], bartender: ['townsfolk', 0],
  cousin: ['townsfolk_b', 0], concierge: ['townsfolk_b', 0], fiddler: ['townsfolk_b', 0],
  musician: ['townsfolk_c', 0], dogwalker: ['townsfolk_c', 0], storekeeper: ['townsfolk_c', 0],
  mom: ['townsfolk', 2], wife: ['townsfolk', 2], jogger: ['townsfolk_b', 2], tennis: ['townsfolk_b', 2],
  shopper: ['townsfolk_c', 2], artist: ['townsfolk_c', 2],
  colonel: ['townsfolk', 4], silversmith: ['townsfolk', 4], abuelo: ['townsfolk_b', 4], elder: ['townsfolk_b', 4], oldman: ['townsfolk_c', 4],
  tia: ['townsfolk', 6], devout: ['townsfolk', 6], gardener: ['townsfolk_b', 6], candlemaker: ['townsfolk_c', 6],
  kid: ['townsfolk', 8],
  glassman: ['cast_2', 0], curandera: ['cast_2', 1], dog: ['dog', 0]
};
// pickups.png, in the brief's order
const PICKUP_ART = { heart: 0, heartbig: 1, cascaron: 2, bigred: 4, skey: 5, pin: 6, medal: 7, keystone: 8, rose: 9, validation: 10, scroll: 11 };
// frame f of sheet k, its anchor (the feet) at x,y. False when there's no art, so the caller can fall back.
function drawArt(k, f, x, y, flip, tint, scale) {
  if (!hasArt(k)) return false;
  const a = ART[k], s = scale || 1;
  let src = IMG[k];
  if (tint) {                                    // Shadow Greg: the same sheet, painted one colour
    if (!artTint.has(k + tint)) {
      const c = document.createElement('canvas'); c.width = src.naturalWidth; c.height = src.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = tint; g.fillRect(0, 0, c.width, c.height);
      artTint.set(k + tint, c);
    }
    src = artTint.get(k + tint);
  }
  f = ((f | 0) % a.n + a.n) % a.n;
  const dx = Math.round(x - (flip ? a.w - 1 - a.ax : a.ax) * s), dy = Math.round(y - a.ay * s);
  if (flip) { ctx.save(); ctx.translate(dx + a.w * s, dy); ctx.scale(-1, 1); ctx.drawImage(src, f * a.w, 0, a.w, a.h, 0, 0, a.w * s, a.h * s); ctx.restore(); }
  else ctx.drawImage(src, f * a.w, 0, a.w, a.h, dx, dy, a.w * s, a.h * s);
  return true;
}
// a 16x16 tile from a tile sheet at the tile's top-left
function drawTile(k, i, x, y) {
  if (!hasArt(k)) return false;
  ctx.drawImage(IMG[k], i * 16, 0, 16, 16, x, y, 16, 16);
  return true;
}

// ---------------- game state ----------------
const G = {
  state: 'title',   // title | play | dialog | shop | pause | levelup | quiz | dying | gameover | win
  mode: 'over',     // over (top-down city map) | side (side-scroll scene)
  scene: null, sceneName: '',
  player: null, avatar: { x: 0, y: 0, t: 0, flip: false }, ocamX: 0, ocamY: 0, truck: null, truckT: 20,
  traffic: [], trafficT: 4,
  enemies: [], pickups: [], shots: [], parts: [], chests: [], npcs: [], plats: [],
  camX: 0, shakeT: 0, shakeMag: 0, freeze: 0,
  fade: 0, fadeDir: 0, fadeCb: null,
  dialog: null, toastMsg: '', toastT: 0, hintT: 10,
  bossBar: null, bossName: '', returnPos: null,
  playTime: 0, stabId: 0, pollenT: 0,
  lives: 3, declined: 0, lostXp: 0, levelSel: 0, shopSel: 0, spellSel: 0, quizSel: 0,
  // persistent
  xp: 0, atk: 1, mag: 1, lif: 1,   // xp is the unspent pool: the only currency, and the only thing you can lose
  maxHp: 4, hp: 4, maxMg: 4, mg: 4,
  medals: 0,
  jumpKnown: false, healKnown: false, hasThrust: false, hasUp: false, hasNote: false,
  hasKeystone: false, hasParking: false, hasRose: false, hasCooler: false, hasChamoy: false, pins: {},
  keys: {}, gotKeys: {}, opened: {}, broken: {}, carry: {}, pinned: {}, hasJackhammer: false, hasWaders: false,
  gateOpen: false, chestScroll: false, chestMagic: false, chestLife: false,
  metHoa: false, examPassed: false, raspa: false,
  bossRim: false, bossRiver: false, bossZoo: false, bossCedar: false, bossShadow: false,
  bossStacks: false, bossCaverns: false, bossMissions: false, hasMaglite: false, hasAccordion: false,
  shadeKnown: false, limpiaKnown: false, hasDog: false,
  easy: false, easyPick: false, quest2: false,   // EASY: half damage, lighter bosses, kinder game overs (picked on the title, saved with the game)
  // the towns: what you carry for whom, and what they taught you for it
  spfKnown: false, rocketKnown: false, grackleKnown: false, washKnown: false,
  hasPutter: false, hasMolcajete: false, hasHoney: false, hasWater: false, gaveWater: false, kidSaved: false,
  thermosClub: false, helotes: false, burnt: {},
  jumpT: 0, spf: false, rocket: false, rainT: 0
};
window.G = G;

// Zelda II-style: each stat has its own price, you spend XP to level, and ATTACK costs the most.
const COST = { atk: [40, 80, 130, 190, 260, 340], mag: [25, 50, 85, 125, 170, 220], lif: [20, 40, 70, 105, 145, 190] };
const STATS = ['atk', 'mag', 'lif'];
const level = () => G.atk + G.mag + G.lif - 2;
const heatLimit = () => G.easy ? 5 : 3;   // seconds of standing in the August sun before it costs life
// play time as H:MM:SS, or M:SS under an hour
const clock = sec => { const h = (sec / 3600) | 0, m = ((sec / 60) | 0) % 60, s2 = (sec | 0) % 60, p = n => (n < 10 ? '0' : '') + n; return (h ? h + ':' + p(m) : m) + ':' + p(s2); };

// Zelda II's spells with San Antonio nouns. Each is taught in a town, for a favor.
// Cost drops one per MAGIC level, never below one. SPF 50 and BOTTLE ROCKET last until you leave the scene.
const SPELLS = [
  { name: 'HEAL', flag: 'healKnown', cost: 4 },
  { name: 'JUMP', flag: 'jumpKnown', cost: 3 },
  { name: 'SPF 50', flag: 'spfKnown', cost: 2 },
  { name: 'BOTTLE ROCKET', flag: 'rocketKnown', cost: 3 },
  { name: 'GRACKLE', flag: 'grackleKnown', cost: 4 },
  { name: 'GULLYWASHER', flag: 'washKnown', cost: 8 },
  { name: 'SUNSHADE', flag: 'shadeKnown', cost: 3 },       // Zelda II's REFLECT
  { name: 'LIMPIA', flag: 'limpiaKnown', cost: 6 }         // Zelda II's SPELL
];
const spellCost = i => Math.max(1, SPELLS[i].cost - (G.mag - 1));

const SAVE_KEY = 'marisa2.v1';
// ponytail: storage shim — localStorage throws in sandboxed iframes; fall back to in-memory
const store = (() => {
  try {
    localStorage.setItem('__m2t', '1'); localStorage.removeItem('__m2t');
    return localStorage;
  } catch (e) {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
  }
})();
const SAVE_FIELDS = ['xp', 'atk', 'mag', 'lif', 'maxHp', 'maxMg', 'medals',
  'jumpKnown', 'healKnown', 'hasThrust', 'hasUp', 'hasNote', 'hasKeystone', 'hasParking', 'hasRose',
  'gateOpen', 'chestScroll', 'chestMagic', 'chestLife', 'metHoa', 'examPassed', 'raspa',
  'bossRim', 'bossRiver', 'bossZoo', 'bossCedar', 'bossShadow', 'playTime',
  'bossStacks', 'bossCaverns', 'bossMissions', 'hasMaglite', 'hasAccordion', 'shadeKnown', 'limpiaKnown', 'hasDog', 'easy', 'quest2',
  'hasCooler', 'hasChamoy', 'pins', 'keys', 'gotKeys', 'opened', 'broken', 'carry', 'pinned', 'hasJackhammer', 'hasWaders',
  'spfKnown', 'rocketKnown', 'grackleKnown', 'washKnown', 'hasPutter', 'hasMolcajete', 'hasHoney', 'hasWater', 'gaveWater',
  'kidSaved', 'thermosClub', 'helotes', 'burnt'];
function save() {
  const p = {};
  SAVE_FIELDS.forEach(k => p[k] = G[k]);
  store.setItem(SAVE_KEY, JSON.stringify(p));
  toast('SAVED');
  SFX.save();
}
function loadSave() {
  try {
    const p = JSON.parse(store.getItem(SAVE_KEY));
    if (!p) return false;
    Object.assign(G, p);
    G.hp = G.maxHp; G.mg = G.maxMg;
    // a save from before the six-medal update: it loads fine, but the Alamo moved the goalposts, so say so once
    G.oldSave = !('bossStacks' in p) && G.medals > 0;
    return true;
  } catch (e) { return false; }
}
const hasSave = () => !!store.getItem(SAVE_KEY);

function toast(msg) { G.toastMsg = msg; G.toastT = 2; }
function shake(mag, t) { G.shakeMag = Math.max(G.shakeMag, mag); G.shakeT = Math.max(G.shakeT, t); }
function fadeTo(cb) { G.fadeDir = 1; G.fadeCb = cb; }
function say(lines, cb) { G.dialog = { lines, i: 0, chars: 0, cb }; G.state = 'dialog'; }

// ---------------- overworld map ----------------
// San Antonio. Loop 1604 across the north, 281 down the middle, the river through the Pearl to downtown.
// The north suburbs are sealed off from the city by hill country and the 281/1604 interchange, which is
// closed for construction (it always is). The Rim's jackhammer gets you through. Downtown's east bank is
// walled off by the freeway; the only way to the Alamo is the low-water crossing, in waders.
// legend: # city block  h hill country  ~ river  b bridge  = low-water crossing (waders)
//         % construction (jackhammer)  R road (traffic)  : cedar brake (pollen)  . open ground
// Helotes (E) is a hill until the jackhammer goes through it, like New Kasuto under its forest.
const OVER = [
  '############################################################',
  '#.................................R........................#',
  '#............:::::::::::..........R.....O.......hhhhh......#',
  '#.......R....:::::::::::..........R.....R.......hhhhh......#',
  '#.......H....:::::::::::..........R.....R.......hhhhh......#',
  '#.......R.........................R.....R.........U........#',
  '#RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR#',
  '#..R..............................R..........:::::::::::...#',
  '#..M............hhhhC...:::::.....R..........:::::::::::...#',
  '#...............hhhh....:::::.....R..........:::::::::::...#',
  '#.................................R........................#',
  '#hhhhhEhhhhhhhhhhhhhhhhhhhhhhhh%%%%%%%hhhhhhhhhhhhhhhhhhhhh#',
  '#hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh%%%%%%%hhhhhhhhhhhhhhhhhhhhh#',
  '#..............................~~.R.................::::::.#',
  '#...#######...........:::::..Z.~~.R.....#########...::::::.#',
  '#...#######...........:::::....~~.R.....#########...::::::.#',
  '#..............................~~.R..........Q.............#',
  '#RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRbbRRRRRRRRRRRRRRRRRRRRRRRRRR#',
  '#..............................~~.R........................#',
  '#.................K............~~.R.....###########........#',
  '#...........#####..............~~.R.....###########........#',
  '#....T......#####...........P..~~.R.....###########........#',
  '#..............................~~.R........................#',
  '#RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRbbRRRRRRRRRRRRRRRRRRRRRRRRRR#',
  '#..............................~~.R........................#',
  '#..............................~~###########################',
  '#...........S..................~~.......R..................#',
  '#..............................~~.......R...#######........#',
  '#RRRRRRRRRRRRRRRRRRRRRRRRRRVRRR~~...L...R...#######........#',
  '#..............................~~.......R...#######........#',
  '#.....#######..................==.......A..................#',
  '#.....#######.....#######......~~.......R..................#',
  '#.................#######hh&hhh~~RRRRRRRRRRRRRRRRRRRRRRRRRR#',
  '#.................#######..N...~~...................######.#',
  '#.......................h......~~............W......######.#',
  '############################################################'
];
const OVER_W = 60, OVER_H = 36;
const overTile = (tx, ty) => (tx < 0 || ty < 0 || tx >= OVER_W || ty >= OVER_H) ? '#' : OVER[ty][tx];
const overSolid = ch => ch === '#' || ch === 'h' || ch === '~' || ((ch === '%' || ch === 'E') && !G.hasJackhammer) || (ch === '=' && !G.hasWaders) || (ch === '&' && !G.hasAccordion);
const LOC = { H: 'home', O: 'stoneoak', M: 'rim0', P: 'pearl', V: 'river0', Z: 'zoo0', K: 'keystone', A: 'alamo0',
  C: 'culvert', Q: 'heights', S: 'southtown', L: 'villita', E: 'helotes', U: 'caverns0', N: 'missions0', W: 'kingwilliam', T: 'westside' };
// where each place is on the map, and a spot just outside it to stand
const LOC_AT = {};
OVER.forEach((row, y) => [...row].forEach((ch, x) => { if (LOC[ch]) LOC_AT[ch] = { x, y }; }));
function outside(ch) {
  const { x, y } = LOC_AT[ch];
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (!overSolid(overTile(x + dx, y + dy)) && !LOC[overTile(x + dx, y + dy)]) return { x: (x + dx) * 16 + 8, y: (y + dy) * 16 + 8 };
  return { x: x * 16 + 8, y: y * 16 + 8 };
}
const LOC_NAME = { H: 'HOME', O: 'STONE OAK', M: 'THE RIM', P: 'THE PEARL', V: 'RIVERWALK', Z: 'THE ZOO', K: 'KEYSTONE', A: 'THE ALAMO',
  C: 'THE CULVERT', Q: 'ALAMO HEIGHTS', S: 'SOUTHTOWN', L: 'LA VILLITA', E: 'HELOTES', U: 'THE CAVERNS', N: 'THE MISSIONS', W: 'KING WILLIAM', T: 'WEST SIDE' };

// ---------------- scenes (side-scroll) ----------------
// legend: '#' wall   X steel/catwalk   - sidewalk   g grass   d caliche
//         3 fire-ant mound (hurts)     w water (hurts)        G keystone gate
//         D door     S furniture/stall (deco)   T tree (deco, casts SHADE)
//         L light pole (deco)          k drum kit (deco)      C couch (deco)
//         W house front  r roof  n window (town deco: you walk in front of them)
//         Y cedar brush (solid; only a bottle rocket gets through it)
function pad(rows, w) { return rows.map(r => (r + ' '.repeat(w)).slice(0, w)); }
// ponytail: every house is the same room at a different width. Who is inside is the difference.
function room(back, npcs, o) {
  o = o || {};
  const w = o.w || 24, wall = '#' + ' '.repeat(w - 2) + '#';
  return () => ({
    music: 'town', backdrop: 'living', town: true,
    tiles: pad([
      '#'.repeat(w), wall, wall, wall, wall, wall, wall, wall, wall,
      '#D' + ' '.repeat(w - 3) + '#', ('#D' + (o.deco || '')).padEnd(w - 1) + '#', 'f'.repeat(w)
    ], w),
    npcs: (npcs || []).map(n => Object.assign({}, n)), chests: o.chests,
    doors: { 1: back }, exits: {}, spawnX: 2 * 16 + 8
  });
}
const SCENES = {
  // --- H: Redwoods Crest, Lawrence Creek ---
  home: () => ({
    music: 'home', backdrop: 'living',
    tiles: pad([
      '############################',
      '#                          #',
      '#                          #',
      '#                          #',
      '#                          #',
      '#                          #',
      '#       SS                 #',
      '#                          #',
      '#                          #',
      '#    CCCCC                 #',
      '#    CCCCC       kkk    D  #',
      'ffffffffffffffffffffffffffff'
    ], 28),
    npcs: [
      { kind: 'marisa_sleep', x: 6 * 16 + 8, y: 9 * 16 + 10, who: 'marisa' },
      { kind: 'hoa', x: 23 * 16, who: 'hoa' }
    ],
    doors: { 24: { mode: 'over' } },
    spawnX: 20 * 16, exits: {}
  }),

  // --- O: Stone Oak. Gated communities, as literal walls. The golf pro teaches JUMP for his putter. ---
  stoneoak: () => ({
    music: 'town', backdrop: 'suburb', town: true, facade: 'a',
    tiles: pad([
      '',
      '',
      '',
      '',
      '',
      '            T                        T         rrrrrrrr   T       T     ',
      '    rrrrrr  T  rrrrrrr  rrrrrr   L   T         WWWWWWWW   T       T     ',
      '    WWWWWW  T  WWWWWWW  WWWWWW   L   T         WnWnWWnW   T       T     ',
      '    WnWWnW  T  WnWWWnW  WnWWnW   L   T   ###   WnWnWWnW   T       T     ',
      '    WWDWWW  T  WWWDWWW  WWDWWW   L   T   ###   WWWWDWWW   T       T     ',
      '    WWDWWW  T  WWWDWWW  WWDWWW   L   T   ###   WWWWDWWW   T       T     ',
      '------------------------------------------------------------------------'
    ], 72),
    npcs: [
      { kind: 'jogger', x: 10 * 16, walk: [2, 39], lines: ['JOGGER: THERE IS A CULVERT UNDER 1604,',
        'WEST OF HERE, AT THE FOOT OF THE HILLS.', 'THE GRACKLES KEEP THINGS DOWN THERE.'] },
      { kind: 'mom', x: 29 * 16, walk: [9, 39], lines: ['MOM: THE HOA PUT THE GATE UP IN 1998.',
        'MY HUSBAND JUMPS IT EVERY MORNING.', 'HE IS SIXTY. HE SAYS IT IS ALL IN THE HIPS.'] },
      { kind: 'cousin', x: 34 * 16, who: 'healer', heal: 'magic', lines: ['NEIGHBOR: YOU LOOK LIKE YOU NEED A BIG RED.',
        'THE GARAGE FRIDGE IS FULL OF THEM.'] }
    ],
    doors: { 6: ['so_colonel', 2, 11], 18: ['so_pro', 2, 11], 26: ['so_smoker', 2, 11], 51: ['so_club', 2, 11] },
    exits: { left: 'over', right: 'over' }, spawnX: 1 * 16 + 8
  }),
  so_colonel: room(['stoneoak', 6, 11], [{ kind: 'colonel', x: 14 * 16, lines: ['RETIRED COLONEL: THIRTY YEARS AT FORT SAM.',
    'A CART KNIGHT GUARDS WHERE YOUR STICK IS.', 'SO PUT IT SOMEWHERE ELSE, THEN HIT HIM.'] }], { deco: '          SS' }),
  so_pro: room(['stoneoak', 18, 11], [{ kind: 'golfpro', x: 14 * 16, who: 'golfpro' }], { deco: '              S' }),
  so_smoker: room(['stoneoak', 26, 11], [{ kind: 'pitmaster', x: 13 * 16, who: 'healer', heal: 'life',
    lines: ['NEIGHBOR: BRISKET. TWELVE HOURS.', 'SIT DOWN. EAT. YOU LOOK TERRIBLE.'] }], { deco: '                SS' }),
  // behind the gate: only the JUMP spell gets you here
  so_club: room(['stoneoak', 51, 11], [], { w: 20, deco: '        SSSS', chests: [{ id: 'thermosClub', x: 16 * 16 + 8, y: 11 * 16 - 8 }] }),

  // --- C: the culvert under 1604. The grackles keep what they take down here. ---
  culvert: () => ({
    music: 'palace', backdrop: 'tunnel',
    tiles: pad([
      '##################################################',
      '                                                 #',
      '                                                 #',
      '                                                 #',
      '                                                 #',
      '                                                 #',
      '                                    XXXX         #',
      '                 XXXX                            #',
      '                                                 #',
      '                      XXXX                       #',
      '                                                 #',
      '----------ww-----------------ww------------------#'
    ], 50),
    spawns: [['ant', 15, 11], ['grackle', 20, 5], ['wisp', 26, 7], ['ant', 34, 11], ['grackle', 40, 4]],
    chests: [{ id: 'hasPutter', x: 46 * 16 + 8, y: 11 * 16 - 8 }],
    exits: { left: 'over' }, spawnX: 2 * 16
  }),

  // --- M: The Rim. A parking-garage palace: five levels and a roof, joined by elevators. ---
  // Links are [scene, col, floorRow]: you arrive standing at that column on that floor.
  rim0: () => ({ // the entrance plaza. The sash waits here for its medal.
    music: 'town', backdrop: 'accessroad', palace: 'rim',
    tiles: pad([
      '',
      '',
      '',
      '                         #####',
      '                         #####',
      '        L                #####',
      '        L                #####',
      '        L                #####',
      '        L                #####',
      '                         D####',
      '                         D####',
      '------------------------------'
    ], 30),
    npcs: [{ kind: 'sash', x: 14 * 16, who: 'sash', palace: 'rim' }],
    doors: { 25: ['rim1', 1, 11] },
    exits: { left: 'over' }, spawnX: 2 * 16 + 8
  }),
  rim1: () => ({ // Level 1, west
    music: 'palace', backdrop: 'garage', palace: 'rim',
    tiles: pad([
      '########################################################',
      '#                                                      #',
      '#                                                      #',
      '#                                                      #',
      '#                                                      #',
      '#                        XXXXX                         #',
      '#                                                      #',
      '#              XXXX              XXXX                  #',
      '#                                                      #',
      '#D       XXXX                            XXXX         D#',
      '#D                                                    D#',
      '######################  ################  ##############'
    ], 56),
    spawns: [['cartknight', 12, 11, 0], ['grackle', 20, 5], ['cartknight', 30, 11, 0],
             ['ant', 36, 11], ['grackle', 44, 5], ['cartknight', 48, 11, 1]],
    loot: [['cascaron', 27 * 16, 4 * 16]],
    doors: { 1: ['rim0', 25, 11], 54: ['rim1b', 1, 11] },
    exits: {}, spawnX: 3 * 16
  }),
  rim1b: () => ({ // Level 1, east. The elevator up.
    music: 'palace', backdrop: 'garage', palace: 'rim',
    tiles: pad([
      '########################################',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                     XXXXXX           #',
      '#                                      #',
      '#              XXXXX                   #',
      '#                                      #',
      '#D       XXXXX                         #',
      '#D                                     #',
      '##################################EE####'
    ], 40),
    spawns: [['grackle', 12, 6], ['ant', 20, 11], ['cartknight', 27, 11, 0], ['grackle', 30, 4]],
    doors: { 1: ['rim1', 54, 11] },
    elev: { 34: { up: ['rim2', 22, 11] } },
    exits: {}, spawnX: 3 * 16
  }),
  rim2: () => ({ // Level 2. West to the key room, east to the next elevator.
    music: 'palace', backdrop: 'garage', palace: 'rim',
    tiles: pad([
      '################################################',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#            XXXX                              #',
      '#                                              #',
      '#D      XXXX                      XXXX        D#',
      '#D                                            D#',
      '######################EE########  ##############'
    ], 48),
    spawns: [['cartknight', 12, 11, 0], ['grackle', 18, 5], ['ant', 28, 11], ['cartknight', 40, 11, 1]],
    loot: [['cascaron', 14 * 16, 6 * 16]],
    doors: { 1: ['rim2k', 28, 11], 46: ['rim2b', 1, 11] },
    elev: { 22: { down: ['rim1b', 34, 11] } },
    exits: {}, spawnX: 23 * 16
  }),
  rim2k: () => ({ // the attendant's booth. A small key, and someone guarding it.
    music: 'palace', backdrop: 'garage', palace: 'rim',
    tiles: pad([
      '##############################',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#           XXXX             #',
      '#                            #',
      '#                  XXXX     D#',
      '#                           D#',
      '##############################'
    ], 30),
    spawns: [['cartknight', 8, 11, 1], ['ant', 16, 11]],
    keys: [{ id: 'rim_a', x: 13 * 16 + 8, y: 7 * 16 }],
    doors: { 28: ['rim2', 1, 11] },
    exits: {}, spawnX: 27 * 16
  }),
  rim2b: () => ({ // Level 2, east
    music: 'palace', backdrop: 'garage', palace: 'rim',
    tiles: pad([
      '########################################',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                                      #',
      '#                  XXXX                #',
      '#                                      #',
      '#                                      #',
      '#D           XXXX        XXXX          #',
      '#D                                     #',
      '############  ##########  ########EE####'
    ], 40),
    spawns: [['ant', 8, 11], ['grackle', 16, 5], ['cartknight', 19, 11, 1], ['grackle', 28, 4], ['ant', 30, 11]],
    chests: [{ id: 'hasJackhammer', x: 30 * 16 + 8, y: 11 * 16 - 8 }],   // the garage crew's jackhammer
    doors: { 1: ['rim2', 46, 11] },
    elev: { 34: { up: ['rim3', 3, 11] } },
    exits: {}, spawnX: 3 * 16
  }),
  rim3: () => ({ // Level 3. The big-box canyon: every light pole has a grackle.
    music: 'palace', backdrop: 'garage', palace: 'rim',
    tiles: pad([
      '########################################################',
      '#                                                      #',
      '#       L          L           L          L            #',
      '#       L          L           L          L            #',
      '#                                                      #',
      '#                                                      #',
      '#                                                      #',
      '#                                                      #',
      '#                                                      #',
      '#               XXX            XXX                    D#',
      '#                                                     D#',
      '###EE##########   ############   #######################'
    ], 56),
    spawns: [['grackle', 8, 5], ['grackle', 19, 5], ['grackle', 31, 5], ['grackle', 42, 5],
             ['cartknight', 24, 11, 1], ['ant', 38, 11], ['cartknight', 46, 11, 1]],
    doors: { 54: ['rim3b', 1, 11] },
    elev: { 3: { down: ['rim2b', 34, 11] } },
    exits: {}, spawnX: 4 * 16
  }),
  rim3b: () => ({ // Level 3, east. A cracked wall, and what's behind it.
    music: 'palace', backdrop: 'garage', palace: 'rim',
    tiles: pad([
      '####################################',
      '#                           B      #',
      '#                           B      #',
      '#                           B      #',
      '#                           B      #',
      '#                           B      #',
      '#                           B      #',
      '#              XXXX         B      #',
      '#                           B      #',
      '#D        XXXX              B      #',
      '#D                          B      #',
      '####################EE##############'
    ], 36),
    spawns: [['cartknight', 8, 11, 1], ['grackle', 18, 5]],
    keys: [{ id: 'rim_b', x: 16 * 16 + 8, y: 7 * 16 }],
    pin: { id: 'rim', x: 32 * 16, y: 11 * 16 },   // Fiesta pin (1-up), behind the cracked wall
    doors: { 1: ['rim3', 54, 11] },
    elev: { 20: { up: ['rim4', 3, 11] } },
    exits: {}, spawnX: 3 * 16
  }),
  rim4: () => ({ // Level 4: the gauntlet, then a locked gate
    music: 'palace', backdrop: 'garage', palace: 'rim',
    tiles: pad([
      '####################################################',
      '#                                       K          #',
      '#                                       K          #',
      '#                                       K          #',
      '#                                       K          #',
      '#                                       K          #',
      '#                                       K          #',
      '#                                       K          #',
      '#                                       K          #',
      '#                                       K          #',
      '#                                       K          #',
      '###EE#########################################EE####'
    ], 52),
    spawns: [['ant', 8, 11], ['cartknight', 14, 11, 0], ['cartknight', 24, 11, 1], ['cartknight', 34, 11, 1]],
    elev: { 3: { down: ['rim3b', 20, 11] }, 46: { up: ['rimroof', 3, 11] } },
    exits: {}, spawnX: 4 * 16
  }),
  rimroof: () => ({ // roof deck. No shade up here. That is the level design.
    music: 'palace', backdrop: 'roof', heat: true, palace: 'rim',
    tiles: pad([
      '################################################',
      '#                                          K   #',
      '#                                          K   #',
      '#              L               L           K   #',
      '#        XXXX  L       XXXX    L     XXXX  K   #',
      '#                                          K   #',
      '#   XXXX          XXXX          XXXX       K   #',
      '#                                          K   #',
      '#                                          K   #',
      '#                                          K  D#',
      '#                                          K  D#',
      '###EE###########################################'
    ], 48),
    spawns: [['grackle', 10, 4], ['cartknight', 20, 11, 0], ['grackle', 30, 4], ['cartknight', 38, 11, 1]],
    chests: [{ id: 'chestScroll', x: 26 * 16 + 8, y: 4 * 16 - 8 }],
    plats: [{ x: 22 * 16, w: 28, y0: 6 * 16, y1: 11 * 16, spd: 44 }],   // garage elevator: floor to the row-6 deck
    doors: { 46: ['rimboss', 1, 11] },
    elev: { 3: { down: ['rim4', 46, 11] } },
    exits: {}, spawnX: 4 * 16
  }),
  rimboss: () => ({
    music: 'palace', backdrop: 'roof', palace: 'rim',
    tiles: pad([
      '##############################',
      '#                            #',
      '#                            #',
      '#      L              L      #',
      '#      L              L      #',
      '#                            #',
      '#    XXXX          XXXX      #',
      '#                            #',
      '#                            #',
      '#D                           #',
      '#D                           #',
      '##########################EE##'
    ], 30),
    boss: 'grackleprince', bossX: 22,
    doors: { 1: ['rimroof', 46, 11] },
    elev: { 26: { down: ['rim0', 22, 11] } },   // the express elevator out, for the walk back to the sash
    exits: {}, spawnX: 3 * 16
  }),

  // --- P: The Pearl. Weekend market. The abuela teaches HEAL once she can cook again. ---
  pearl: () => ({
    music: 'town', backdrop: 'market', town: true, facade: 'a',
    tiles: pad([
      '',
      '',
      '',
      '                  rrrrrrrrr                                     ',
      '                  WWWWWWWWW                                     ',
      '                  WnWnWWnWn   T  rrrrrrrr             T         ',
      '          rrrrrr  WWWWWWWWW   T  WWWWWWWW   L         T         ',
      '          WWWWWW  WWWWWWWWW   T  WnWWWnnW   L         T         ',
      '          WnWWnW  WnWnWWnWn   T  WnWWWnnW   L         T         ',
      '          WWDWWW  WWWWDWWWW   T  WWWDWWWW   L         T         ',
      '   SSSS   WWDWWW  WWWWDWWWW   T  WWWDWWWW   L  SSS    T         ',
      '----------------------------------------------------------------'
    ], 64),
    npcs: [
      { kind: 'abuela', x: 5 * 16, who: 'abuela' },
      { kind: 'musician', x: 27 * 16, walk: [16, 43], lines: ['MUSICIAN: THE MARIACHI UNDER THE RIVERWALK',
        'PLAYS ON ONE AND THREE. EVERYONE KNOWS.', 'NOBODY GOES DOWN THERE TO CHECK.'] },
      { kind: 'shopper', x: 50 * 16, walk: [42, 61], lines: ['SHOPPER: ALAMO HEIGHTS IS ACROSS THE RIVER.',
        'A POOL, AND A LOT OF OPINIONS.', 'THE OLD LIFEGUARD THERE KNOWS A SPELL.'] },
      { kind: 'valet', x: 41 * 16, lines: ['VALET: DOWNTOWN DOES NOT VALIDATE.', 'THE ABUELA DOES. HER NEPHEW STAMPS IT.'] }
    ],
    doors: { 12: ['pearl_bagu', 2, 11], 22: ['cellar', 2, 11], 36: ['pearl_hotel', 2, 11] },
    exits: { left: 'over', right: 'over' }, spawnX: 1 * 16 + 8
  }),
  pearl_bagu: room(['pearl', 12, 11], [{ kind: 'bagu', x: 14 * 16, who: 'bagu' }], { deco: '         S' }),
  pearl_hotel: room(['pearl', 36, 11], [{ kind: 'concierge', x: 12 * 16, lines: ['CONCIERGE: SOUTHTOWN IS SOUTH OF HERE, ON',
    'THIS SIDE OF THE RIVER. A MAN THERE SELLS', 'FIREWORKS OUTSIDE CITY LIMITS EVERY JULY.',
    'HIS WIFE DECIDES WHO GETS IN.'] }], { w: 28, deco: '     SSS           SS' }),
  // the old brewhouse cellar. Salsa night got out of hand, and then the ants moved in.
  cellar: () => ({
    music: 'palace', backdrop: 'basement',
    tiles: pad([
      '############################################',
      '#                                          #',
      '#                                          #',
      '#                                          #',
      '#                                          #',
      '#                     XXXX                 #',
      '#                                          #',
      '#            XXXX              XXXX        #',
      '#                                          #',
      '#D                                         #',
      '#D                                         #',
      '############################################'
    ], 44),
    spawns: [['ant', 10, 11], ['ant', 18, 11], ['cone', 25, 11], ['cartknight', 31, 11, 0], ['ant', 37, 11]],
    chests: [{ id: 'hasMolcajete', x: 41 * 16 + 8, y: 11 * 16 - 8 }],
    doors: { 1: ['pearl', 22, 11] },
    exits: {}, spawnX: 3 * 16
  }),

  // --- V: The Riverwalk. Barges, ducks, tourists. ---
  river1: () => ({
    music: 'battle', backdrop: 'river', palace: 'river',
    tiles: pad([
      '############################################################',
      '#                                                          #',
      '#                                                          #',
      '#     T                T                 T                 #',
      '#     T                T                 T                 #',
      '#     T                T                 T                 #',
      '#D                                                        D#',
      '#D                                                        D#',
      '#--------wwwwwwww--------wwwwwwwwwwww---------wwwww--------#',
      '#wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww#',
      '#wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww#',
      '############################################################'
    ], 60),
    spawns: [['tourist', 6, 8], ['grackle', 14, 5], ['tourist', 22, 8], ['ant', 40, 8],
             ['grackle', 30, 5], ['tourist', 52, 8], ['cartknight', 44, 8, 1]],
    plats: [{ x: 8 * 16, w: 44, y0: 8 * 16, y1: 8 * 16, spd: 0, mx: 17 * 16 },
            { x: 24 * 16, w: 44, y0: 8 * 16, y1: 8 * 16, spd: 0, mx: 37 * 16 },
            { x: 45 * 16, w: 44, y0: 8 * 16, y1: 8 * 16, spd: 0, mx: 51 * 16 }],
    loot: [['cascaron', 20 * 16, 6 * 16]],
    chests: [{ id: 'hasCooler', x: 40 * 16 + 8, y: 8 * 16 - 8 }],   // the abuela's cooler
    doors: { 1: ['river0', 25, 11], 58: ['river2', 1, 11] },
    exits: {}, spawnX: 3 * 16, spawnY: 8 * 16, spawnRight: 56 * 16
  }),
  riverboss: () => ({
    music: 'palace', backdrop: 'river', palace: 'river',
    tiles: pad([
      '##############################',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#D                           #',
      '#D                           #',
      '#--------ww------ww-------EE-#',   // a clean blast knocks you back; mind the gaps
      '#wwwwwwwwwwwwwwwwwwwwwwwwwwww#',
      '#wwwwwwwwwwwwwwwwwwwwwwwwwwww#',
      '##############################'
    ], 30),
    boss: 'mariachi', bossX: 24, bossY: 8,
    doors: { 1: ['river5', 28, 11] },
    elev: { 26: { down: ['river0', 22, 11] } },   // the express elevator back up to the landing
    exits: {}, spawnX: 3 * 16, spawnY: 8 * 16
  }),

  // --- Z: The Zoo. The animals are not evil. They are pollen-drunk. ---
  zoo1: () => ({
    music: 'battle', backdrop: 'zoo', heat: true, palace: 'zoo',
    tiles: pad([
      '########################################',
      '#                                      #',
      '#    XXXX                    XXXX      #',
      '#                                      #',
      '#              XXXXXXXX                #',
      '#                                      #',
      '#    XXXX                    XXXX      #',
      '#           T                          #',
      '#           T          XXXXXX          #',
      '#D          T                           ',
      '#D                                      ',
      '#gggggggggggggggggg333ggggggggggggggggg#'
    ], 40),
    spawns: [['grackle', 8, 2], ['ant', 14, 11], ['grackle', 30, 2], ['ant', 26, 11],
             ['wisp', 20, 5], ['cone', 34, 11]],
    chests: [{ id: 'chestLife', x: 19 * 16 + 8, y: 4 * 16 - 8 }, { id: 'hasChamoy', x: 25 * 16 + 8, y: 8 * 16 - 8 }],
    doors: { 1: ['zoo0', 25, 11] },
    exits: { right: 'av1' }, spawnX: 3 * 16, spawnRight: 37 * 16
  }),
  zooboss: () => ({
    music: 'palace', backdrop: 'zoo', palace: 'zoo',
    tiles: pad([
      '################################',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '    XXXXX  XXXX  XXXX  XXXEE   #',
      '                               #',
      'ggg                          gg#',
      '#gwwwwwwwwwwwwwwwwwwwwwwwwwwwwg#',
      '#gwwwwwwwwwwwwwwwwwwwwwwwwwwwwg#',
      '################################'
    ], 32),
    boss: 'hippo', bossX: 16,
    elev: { 26: { down: ['zoo0', 22, 11] } },   // the keeper's lift, back out to the gate
    exits: { left: 'poolgate' }, spawnX: 5 * 16, spawnY: 6 * 16, spawnRight: 26 * 16
  }),

  // --- K: Keystone School. A riddle at the door, and stacks that go too deep. ---
  keystone: () => ({
    music: 'town', backdrop: 'school', palace: 'stacks',
    tiles: pad([
      '################################',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#       SS            SS       #',
      '#                              #',
      '#                              #',
      '#D                            D#',
      '#D                            D#',
      '################################'
    ], 32),
    npcs: [{ kind: 'director', x: 12 * 16, who: 'director' }, { kind: 'sash', x: 19 * 16, who: 'sash', palace: 'stacks' }],
    doors: { 1: { mode: 'over' }, 30: ['stacks', 2, 3] },
    exam: true,
    exits: {}, spawnX: 3 * 16, spawnRight: 28 * 16
  }),
  stacks: () => ({
    music: 'palace', backdrop: 'stacks', palace: 'stacks',
    tiles: pad([
      '####################################',
      '#D                                 #',
      '#D                                 #',
      '#XXXX                              #',
      '#            XXXX          XXXX    #',
      '#     XXXX                         #',
      '#                    XXXX          #',
      '#          XXXX                    #',
      '#                          XXXX    #',
      '#    XXXX                          #',
      '#                                  #',
      '##############################EE####'
    ], 36),
    spawns: [['wisp', 14, 6], ['ant', 18, 11], ['wisp', 26, 8], ['cartknight', 30, 11, 1]],
    doors: { 1: ['keystone', 30, 11] },
    elev: { 30: { down: ['stacks2', 3, 11] } },
    exits: {}, spawnX: 2 * 16 + 8, spawnY: 3 * 16
  }),

  // --- A: The Alamo. Six medals on the sash. ---
  alamo1: () => ({
    music: 'palace', backdrop: 'basement', palace: 'alamo',
    tiles: pad([
      '####################################################',
      '#                         G                        #',
      '#      XXXXXX             G      XXXXXX            #',
      '#                         G                        #',
      '#              XXXXXX     GXXXXXX                  #',
      '#                         G                        #',
      '#   XXXX                  G             XXXX       #',
      '#                         G                        #',
      '#                         G                        #',
      '#D                        G                       D#',
      '#D                        G                       D#',
      '######33############333######  ####33###############'
    ], 52),
    spawns: [['cartknight', 10, 11, 1], ['wisp', 18, 5], ['ant', 25, 11],
             ['cartknight', 34, 11, 2], ['wisp', 42, 6], ['ant', 46, 11]],
    chests: [{ id: 'chestMagic', x: 17 * 16 + 8, y: 4 * 16 - 8 }],
    plats: [{ x: 13 * 16, w: 28, y0: 4 * 16, y1: 11 * 16, spd: 44 }],   // service lift up to the thermos ledge
    doors: { 1: ['alamo0', 25, 11], 50: ['alamo2', 1, 11] },
    exits: {}, spawnX: 3 * 16, spawnRight: 48 * 16
  }),
  cedar: () => ({
    music: 'palace', backdrop: 'basement', palace: 'alamo',
    tiles: pad([
      '################################',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#   XXXX              XXXX     #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#D                            D#',
      '#D                            D#',
      '################################'
    ], 32),
    boss: 'cedarking', bossX: 24,
    doors: { 1: ['alamo3', 34, 11], 30: ['shadow', 1, 11] },
    exits: {}, spawnX: 3 * 16
  }),
  shadow: () => ({
    music: 'palace', backdrop: 'void', palace: 'alamo',
    tiles: pad([
      '##############################',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#D                           #',
      '#D                           #',
      '##########################EE##'
    ], 30),
    boss: 'shadowgreg', bossX: 24,
    doors: { 1: ['cedar', 30, 11] },
    elev: { 26: { down: ['alamo0', 22, 11] } },   // up and out, with the rose
    exits: {}, spawnX: 3 * 16
  }),

  // --- V: the Riverwalk palace. The landing, the walkway, under the bridge, the tunnel, the lower dock. ---
  river0: () => ({
    music: 'town', backdrop: 'river', palace: 'river',
    tiles: pad([
      '',
      '',
      '',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         D####',
      '                         D####',
      '------------------------------'
    ], 30),
    npcs: [{ kind: 'sash', x: 8 * 16, who: 'sash', palace: 'river' }, { kind: 'captain', x: 18 * 16, who: 'captain' }],
    doors: { 25: ['river1', 1, 8] },
    exits: { left: 'over' }, spawnX: 2 * 16 + 8
  }),
  river2: () => ({
    music: 'battle', backdrop: 'river', palace: 'river',   // under the Commerce St bridge
    tiles: pad([
      '############################################',
      '#                                          #',
      '#                                          #',
      '#                                          #',
      '#                                          #',
      '#                                          #',
      '#                                          #',
      '#                     XXXX                 #',
      '#                                          #',
      '#D                XXXX                    D#',
      '#D                                        D#',
      '#---------wwwwww------------wwwwww---------#'
    ], 44),
    spawns: [['grackle', 12, 5], ['tourist', 20, 11], ['ant', 24, 11], ['cartknight', 38, 11, 1]],
    plats: [{ x: 9 * 16, w: 40, y0: 11 * 16, y1: 11 * 16, spd: 0, mx: 15 * 16 },
            { x: 27 * 16, w: 40, y0: 11 * 16, y1: 11 * 16, spd: 0, mx: 33 * 16 }],
    keys: [{ id: 'river_a', x: 23 * 16 + 8, y: 7 * 16 }],
    doors: { 1: ['river1', 58, 8], 42: ['river3', 1, 11] },
    exits: {}, spawnX: 3 * 16
  }),
  river3: () => ({
    music: 'palace', backdrop: 'tunnel', palace: 'river',   // the flood tunnel
    tiles: pad([
      '################################################',
      '#                             K                #',
      '#                             K                #',
      '#                             K                #',
      '#                             K                #',
      '#                             K                #',
      '#                             K                #',
      '#               XXXX          K                #',
      '#                             K                #',
      '#D        XXXX                K                #',
      '#D                            K                #',
      '########################################EE######'
    ], 48),
    spawns: [['wisp', 12, 6], ['ant', 20, 11], ['wisp', 36, 6], ['ant', 44, 11]],
    loot: [['cascaron', 17 * 16, 6 * 16]],
    doors: { 1: ['river2', 42, 11] },
    elev: { 40: { down: ['river4', 3, 11] } },
    exits: {}, spawnX: 3 * 16
  }),
  river4: () => ({
    music: 'battle', backdrop: 'river', palace: 'river',   // the lower dock
    tiles: pad([
      '############################################',
      '#                                   B      #',
      '#                                   B      #',
      '#                                   B      #',
      '#                                   B      #',
      '#                                   B      #',
      '#                                   B      #',
      '#                    XXXX           B      #',
      '#                                   B      #',
      '#                XXXX            D  B      #',
      '#                                D  B      #',
      '#--EE-----wwwwww----------wwww-------------#'
    ], 44),
    spawns: [['tourist', 7, 11], ['grackle', 18, 5], ['cartknight', 31, 11, 1]],
    plats: [{ x: 9 * 16, w: 40, y0: 11 * 16, y1: 11 * 16, spd: 0, mx: 15 * 16 },
            { x: 25 * 16, w: 40, y0: 11 * 16, y1: 11 * 16, spd: 0, mx: 28 * 16 }],
    keys: [{ id: 'river_b', x: 22 * 16 + 8, y: 7 * 16 }],
    chests: [{ id: 'hasWaders', x: 30 * 16 + 8, y: 11 * 16 - 8 }],   // a pair of waders, left on the dock
    pin: { id: 'river', x: 40 * 16, y: 11 * 16 },   // Fiesta pin (1-up), behind the cracked wall
    doors: { 33: ['river5', 1, 11] },
    elev: { 3: { up: ['river3', 40, 11] } },
    exits: {}, spawnX: 5 * 16
  }),
  river5: () => ({
    music: 'palace', backdrop: 'tunnel', palace: 'river',   // the boat house
    tiles: pad([
      '##############################',
      '#                   K        #',
      '#                   K        #',
      '#                   K        #',
      '#                   K        #',
      '#                   K        #',
      '#                   K        #',
      '#                   K        #',
      '#                   K        #',
      '#D                  K       D#',
      '#D                  K       D#',
      '##############################'
    ], 30),
    spawns: [['cartknight', 12, 11, 1]],
    doors: { 1: ['river4', 33, 11], 28: ['riverboss', 1, 8] },
    exits: {}, spawnX: 3 * 16
  }),
  // --- Z: the Zoo palace. The gate, the grounds, a three-level aviary, the pool gate. ---
  zoo0: () => ({
    music: 'town', backdrop: 'zoo', palace: 'zoo',
    tiles: pad([
      '',
      '',
      '',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         D####',
      '                         D####',
      '------------------------------'
    ], 30),
    npcs: [{ kind: 'sash', x: 8 * 16, who: 'sash', palace: 'zoo' }],
    doors: { 25: ['zoo1', 1, 11] },
    exits: { left: 'over' }, spawnX: 2 * 16 + 8
  }),
  av1: () => ({
    music: 'battle', backdrop: 'zoo', palace: 'zoo',   // the aviary, ground level
    tiles: pad([
      '####################################',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                   XXXX           #',
      '#                                  #',
      '#               XXXX               #',
      '#                                  #',
      '            XXXX                   #',
      '                                   #',
      'ggggggggggggggggggggggggggggggEEggg#'
    ], 36),
    spawns: [['grackle', 8, 4], ['grackle', 26, 3], ['wisp', 14, 6], ['ant', 24, 11]],
    keys: [{ id: 'zoo_a', x: 21 * 16 + 8, y: 5 * 16 }],
    elev: { 30: { up: ['av2', 3, 11] } },
    exits: { left: 'zoo1' }, spawnX: 2 * 16, spawnRight: 28 * 16
  }),
  av2: () => ({
    music: 'battle', backdrop: 'zoo', palace: 'zoo',   // the aviary, second tier
    tiles: pad([
      '####################################',
      '#                   K              #',
      '#                   K              #',
      '#                   K              #',
      '#                   K              #',
      '#                   K              #',
      '#                   K              #',
      '#                   K              #',
      '#                   K              #',
      '#        XXXX       K              #',
      '#                   K              #',
      'gggEEgggggggggggggggggggggggggEEgggg'
    ], 36),
    spawns: [['grackle', 8, 4], ['ant', 14, 11], ['wisp', 26, 6], ['grackle', 28, 4]],
    loot: [['cascaron', 10 * 16, 8 * 16]],
    elev: { 3: { down: ['av1', 30, 11] }, 30: { up: ['av3', 3, 11] } },
    exits: {}, spawnX: 4 * 16
  }),
  av3: () => ({
    music: 'battle', backdrop: 'zoo', palace: 'zoo',   // the top of the aviary
    tiles: pad([
      '########################################',
      '#                             B        #',
      '#                             B        #',
      '#                             B        #',
      '#                             B        #',
      '#                             B        #',
      '#                             B        #',
      '#         XXXX                B        #',
      '#                             B        #',
      '#     XXXX                    B        #',
      '#                             B        #',
      'gggEEgggggggggggggggggggEEggggggggggggg#'
    ], 40),
    spawns: [['grackle', 16, 4], ['wisp', 20, 6], ['ant', 18, 11]],
    keys: [{ id: 'zoo_b', x: 11 * 16 + 8, y: 7 * 16 }],
    pin: { id: 'zoo', x: 34 * 16, y: 11 * 16 },   // Fiesta pin (1-up), behind the cracked wall
    elev: { 3: { down: ['av2', 30, 11] }, 24: { down: ['poolgate', 3, 11] } },
    exits: {}, spawnX: 4 * 16
  }),
  poolgate: () => ({
    music: 'palace', backdrop: 'zoo', palace: 'zoo',   // the keeper's gate to the hippo pool
    tiles: pad([
      '##############################',
      '#                 K          #',
      '#                 K          #',
      '#                 K          #',
      '#                 K          #',
      '#                 K          #',
      '#                 K          #',
      '#                 K          #',
      '#                 K          #',
      '#                 K         D#',
      '#                 K         D#',
      'gggEEgggggggggggggggggggggggg#'
    ], 30),
    spawns: [['ant', 10, 11], ['wisp', 12, 6]],
    doors: { 28: ['zooboss', 5, 6] },
    elev: { 3: { up: ['av3', 24, 11] } },
    exits: {}, spawnX: 4 * 16, spawnRight: 26 * 16
  }),
  // --- K: the stacks below Keystone. Each level is a book-cart lift further down. ---
  stacks2: () => ({
    music: 'palace', backdrop: 'stacks', palace: 'stacks',
    tiles: pad([
      '####################################',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                XXXX              #',
      '#                                  #',
      '#           XXXX        XXXX       #',
      '#                                  #',
      '###EE###########################EE##'
    ], 36),
    spawns: [['wisp', 10, 6], ['ant', 20, 11], ['cartknight', 28, 11, 1], ['wisp', 30, 5]],
    keys: [{ id: 'st_a', x: 18 * 16 + 8, y: 7 * 16 }],
    elev: { 3: { up: ['stacks', 30, 11] }, 32: { down: ['stacks3', 3, 11] } },
    exits: {}, spawnX: 4 * 16
  }),
  stacks3: () => ({
    music: 'palace', backdrop: 'stacks', palace: 'stacks',   // the bottom. further down than the school is tall
    tiles: pad([
      '########################################',
      '#             K                   B    #',
      '#             K                   B    #',
      '#             K                   B    #',
      '#             K                   B    #',
      '#             K                   B    #',
      '#             K                   B    #',
      '#             K                   B    #',
      '#             K                   B    #',
      '#             K                   B    #',
      '#             K                   B    #',
      '###EE#################EE################'
    ], 40),
    spawns: [['cartknight', 24, 11, 1], ['wisp', 20, 6]],
    keystone: { x: 28 * 16, y: 11 * 16 },
    pin: { id: 'stacks', x: 37 * 16, y: 11 * 16 },   // Fiesta pin (1-up), behind the cracked wall
    elev: { 3: { up: ['stacks2', 32, 11] }, 22: { down: ['stacks4', 3, 11] } },   // and further down than that
    exits: {}, spawnX: 4 * 16
  }),
  // --- K, deeper: the bottom of the Stacks. Something lives under the last shelf. ---
  stacks4: () => ({
    music: 'palace', backdrop: 'stacks', palace: 'stacks',
    tiles: pad([
      '####################################',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                  #',
      '#                                 D#',
      '#                                 D#',
      '###EE###############################'
    ], 36),
    boss: 'silverfish', bossX: 22,
    chests: [{ id: 'hasMaglite', x: 31 * 16 + 8, y: 11 * 16 - 8 }],   // behind the last shelf
    doors: { 34: ['keystone', 16, 11] },                             // the staff stairs, up to the lobby and the sash
    elev: { 3: { up: ['stacks3', 22, 11] } },
    exits: {}, spawnX: 5 * 16
  }),

  // --- U: the Caverns, north past the hills. Perfectly dark past the first turn. ---
  caverns0: () => ({
    music: 'caverns', backdrop: 'greenbelt', palace: 'caverns',
    tiles: pad([
      '                              ',
      '                              ',
      '                              ',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         D####',
      '                         D####',
      'dddddddddddddddddddddddddddddd'
    ], 30),
    npcs: [{ kind: 'sash', x: 8 * 16, who: 'sash', palace: 'caverns' }],
    doors: { 25: ['caverns1', 1, 11] },
    exits: { left: 'over' }, spawnX: 2 * 16 + 8
  }),
  caverns1: () => ({ // the long room: formations, pools, and things that hang from the ceiling
    music: 'caverns', backdrop: 'caverns', palace: 'caverns', dark: true,
    tiles: pad([
      '################################################',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#          XXXX                                #',
      '#                                  XXXX        #',
      '#                   XXXX                       #',
      '#                                              #',
      '#D     XXXX                  XXXX             D#',
      '#D                                            D#',
      '#ddddddddddddwwddddddddddddddddddwwdddddddddddd#'
    ], 48),
    spawns: [['bat', 10, 5], ['ant', 18, 11], ['wisp', 24, 6], ['bat', 32, 4], ['ant', 40, 11]],
    loot: [['cascaron', 21 * 16, 6 * 16]],
    doors: { 1: ['caverns0', 25, 11], 46: ['caverns2', 1, 11] },
    exits: {}, spawnX: 3 * 16
  }),
  caverns2: () => ({ // the side chamber. A key on a ledge, and a wall that sounds hollow.
    music: 'caverns', backdrop: 'caverns', palace: 'caverns', dark: true,
    tiles: pad([
      '########################################',
      '#                                      #',
      '#                                      #',
      '#                                B     #',
      '#                                B     #',
      '#                                B     #',
      '#                                B     #',
      '#               XXXX             B     #',
      '#                                B     #',
      '#D       XXXX           XXXX   D B     #',
      '#D                             D B     #',
      '#dddddddddddddddddddddddddddddddddddddd#'
    ], 40),
    spawns: [['bat', 12, 5], ['ant', 20, 11], ['bat', 26, 4], ['cartknight', 28, 11, 1]],
    keys: [{ id: 'cav_a', x: 17 * 16 + 8, y: 7 * 16 }],
    pin: { id: 'caverns', x: 36 * 16, y: 11 * 16 },   // Fiesta pin (1-up), behind the cracked wall
    doors: { 1: ['caverns1', 46, 11], 31: ['caverns3', 1, 11] },
    exits: {}, spawnX: 3 * 16
  }),
  caverns3: () => ({ // the gate chamber. Someone put a door in a cave.
    music: 'caverns', backdrop: 'caverns', palace: 'caverns', dark: true,
    tiles: pad([
      '############################################',
      '#                             K            #',
      '#                             K            #',
      '#                             K            #',
      '#                             K            #',
      '#                             K            #',
      '#                             K            #',
      '#             XXXX            K            #',
      '#                             K            #',
      '#D    XXXX            XXXX    K            #',
      '#D                            K            #',
      '#dddddddddwwddddddddddwwdddddddddddddddEEdd#'
    ], 44),
    spawns: [['bat', 12, 5], ['wisp', 18, 7], ['cartknight', 26, 11, 1], ['bat', 36, 4]],
    doors: { 1: ['caverns2', 31, 11] },
    elev: { 39: { down: ['caverns4', 3, 11] } },
    exits: {}, spawnX: 3 * 16
  }),
  caverns4: () => ({ // the bat chamber. The ceiling is moving.
    music: 'caverns', backdrop: 'caverns', palace: 'caverns', dark: true,
    tiles: pad([
      '################################',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '###EE######################EE###'
    ], 32),
    boss: 'brackenbat', bossX: 18, bossY: 5,
    chests: [{ id: 'hasAccordion', x: 25 * 16 + 8, y: 11 * 16 - 8 }],
    elev: { 3: { up: ['caverns3', 39, 11] }, 27: { up: ['caverns0', 22, 11] } },   // the gift-shop lift, back out to the sash
    exits: {}, spawnX: 5 * 16
  }),

  // --- N: Mission Espada, down the river. The matachines let you by once you play. ---
  missions0: () => ({
    music: 'missions', backdrop: 'mission', palace: 'missions',
    tiles: pad([
      '                              ',
      '                              ',
      '                              ',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         D####',
      '                         D####',
      'dddddddddddddddddddddddddddddd'
    ], 30),
    npcs: [{ kind: 'sash', x: 8 * 16, who: 'sash', palace: 'missions' }, { kind: 'dog', x: 17 * 16, who: 'dog', unless: 'hasDog' }],
    doors: { 25: ['missions1', 1, 11] },
    exits: { left: 'over' }, spawnX: 2 * 16 + 8
  }),
  missions1: () => ({ // the nave. Three doors: back out, the granary, and the acequia.
    music: 'missions', backdrop: 'mission', palace: 'missions',
    tiles: pad([
      '################################################',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#             XXXX              XXXX           #',
      '#                                              #',
      '#       XXXX                          XXXX     #',
      '#D                      D                     D#',
      '#D                      D                     D#',
      '#----------------------------------------------#'
    ], 48),
    spawns: [['grackle', 10, 5], ['cartknight', 16, 11, 1], ['wisp', 30, 6], ['ant', 36, 11], ['grackle', 40, 4]],
    loot: [['cascaron', 34 * 16, 5 * 16]],
    doors: { 1: ['missions0', 25, 11], 24: ['missions2', 1, 11], 46: ['missions3', 1, 11] },
    exits: {}, spawnX: 3 * 16
  }),
  missions2: () => ({ // the granary. A key in the rafters, and a wall the mortar gave up on.
    music: 'missions', backdrop: 'mission', palace: 'missions',
    tiles: pad([
      '####################################',
      '#                           B      #',
      '#                           B      #',
      '#                           B      #',
      '#                           B      #',
      '#                           B      #',
      '#                           B      #',
      '#           XXXX            B      #',
      '#                           B      #',
      '#D                  XXXX    B      #',
      '#D                          B      #',
      '#----------------------------------#'
    ], 36),
    spawns: [['cartknight', 10, 11, 2], ['grackle', 18, 4], ['ant', 22, 11]],
    keys: [{ id: 'mis_a', x: 13 * 16 + 8, y: 7 * 16 }],
    pin: { id: 'missions', x: 32 * 16, y: 11 * 16 },   // Fiesta pin (1-up), behind the cracked wall
    doors: { 1: ['missions1', 24, 11] },
    exits: {}, spawnX: 3 * 16
  }),
  missions3: () => ({ // the acequia: three hundred years of irrigation ditch, still running
    music: 'missions', backdrop: 'mission', palace: 'missions',
    tiles: pad([
      '################################################',
      '#                                   K          #',
      '#                                   K          #',
      '#                                   K          #',
      '#                                   K          #',
      '#                                   K          #',
      '#                                   K          #',
      '#                                   K          #',
      '#         XXXX            XXXX      K          #',
      '#D                                  K         D#',
      '#D                                  K         D#',
      '#-------ww--------ww--------ww-----------------#'
    ], 48),
    spawns: [['ant', 6, 11], ['grackle', 14, 5], ['cartknight', 22, 11, 2], ['wisp', 28, 7], ['grackle', 32, 4]],
    doors: { 1: ['missions1', 46, 11], 46: ['missionsboss', 1, 11] },
    exits: {}, spawnX: 3 * 16
  }),
  missionsboss: () => ({ // where the acequia runs past the old wall. Someone is crying by the water.
    music: 'missions', backdrop: 'mission', palace: 'missions',
    tiles: pad([
      '################################',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#                              #',
      '#D                             #',
      '#D                             #',
      '#--------------------------EE###'
    ], 32),
    boss: 'llorona', bossX: 20,
    doors: { 1: ['missions3', 46, 11] },
    elev: { 27: { up: ['missions0', 22, 11] } },   // the bell-tower stairs, back out to the sash
    exits: {}, spawnX: 3 * 16
  }),
  // --- A: the Alamo. The entrance, the basement, the catacombs, the roots, and what is under them. ---
  alamo0: () => ({
    music: 'palace', backdrop: 'basement', palace: 'alamo',
    tiles: pad([
      '',
      '',
      '',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         #####',
      '                         D####',
      '                         D####',
      '------------------------------'
    ], 30),
    doors: { 25: ['alamo1', 1, 11] },
    exits: { left: 'over' }, spawnX: 2 * 16 + 8
  }),
  alamo2: () => ({
    music: 'palace', backdrop: 'basement', palace: 'alamo',   // the catacombs
    tiles: pad([
      '################################################',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                                              #',
      '#                  XXXX                        #',
      '#                                              #',
      '#D            XXXX            XXXX             #',
      '#D                                             #',
      '########################  ##################EE##'
    ], 48),
    spawns: [['cartknight', 10, 11, 2], ['wisp', 18, 5], ['cartknight', 36, 11, 1], ['ant', 40, 11]],
    keys: [{ id: 'al_a', x: 20 * 16 + 8, y: 7 * 16 }],
    doors: { 1: ['alamo1', 50, 11] },
    elev: { 44: { down: ['alamo3', 3, 11] } },
    exits: {}, spawnX: 3 * 16
  }),
  alamo3: () => ({
    music: 'palace', backdrop: 'basement', palace: 'alamo',   // the roots come through here
    tiles: pad([
      '############################################',
      '#                     K             B      #',
      '#                     K             B      #',
      '#                     K             B      #',
      '#                     K             B      #',
      '#                     K             B      #',
      '#                     K             B      #',
      '#                     K             B      #',
      '#                     K             B      #',
      '#                     K           D B      #',
      '#                     K           D B      #',
      '###EE#######################################'
    ], 44),
    spawns: [['cartknight', 14, 11, 2], ['wisp', 28, 6], ['ant', 30, 11]],
    pin: { id: 'alamo', x: 40 * 16, y: 11 * 16 },   // Fiesta pin (1-up), behind the cracked wall
    doors: { 34: ['cedar', 1, 11] },
    elev: { 3: { up: ['alamo2', 44, 11] } },
    exits: {}, spawnX: 4 * 16
  }),

  // --- W: King William. Darunia's child is a dog here: bring him home from the Missions road and learn SUNSHADE. ---
  kingwilliam: () => ({
    music: 'kingwilliam', backdrop: 'suburb', town: true, facade: 'a',
    tiles: pad([
      '',
      '',
      '',
      '',
      '',
      '            T  rrrrrrr                      T             T         ',
      '    rrrrrr  T  WWWWWWW    rrrrrr   L        T   rrrrrr    T         ',
      '    WWWWWW  T  WnWWnnW    WWWWWW   L        T   WWWWWW    T         ',
      '    WnWWnW  T  WnWWnnW    WnWWnW   L        T   WnWWnW    T         ',
      '    WWDWWW  T  WWDWWWW    WWDWWW   L        T   WWDWWW    T         ',
      '    WWDWWW  T  WWDWWWW    WWDWWW   L        T   WWDWWW    T         ',
      '--------------------------------------------------------------------'
    ], 68),
    npcs: [
      { kind: 'artist', x: 12 * 16, walk: [2, 46], lines: ['ARTIST: GERMAN MERCHANTS BUILT THESE IN',
        'THE EIGHTEEN-SEVENTIES. LIMESTONE, PORCHES,', 'AND NOT ONE OF THEM HAS PARKING.'] },
      { kind: 'devout', x: 40 * 16, walk: [22, 64], lines: ['WOMAN: THE CURANDERA ON THE WEST SIDE CURED',
        'MY SUSTO IN ONE AFTERNOON. ONE EGG.', 'SHE ONLY TEACHES PEOPLE WHO CAN HOLD A LOT.'] }
    ],
    doors: { 6: ['kw_tia', 2, 11], 17: ['kw_glass', 2, 11], 28: ['kw_house', 2, 11], 50: ['kw_garage', 2, 11] },
    exits: { left: 'over', right: 'over' }, spawnX: 1 * 16 + 8
  }),
  kw_tia: room(['kingwilliam', 6, 11], [{ kind: 'tia', x: 14 * 16, who: 'healer', heal: 'life',
    lines: ['TIA: FIDEO. SIT DOWN.', 'YOU LOOK LIKE YOU CAME FROM THE MISSIONS.'] }], { deco: '           SS' }),
  kw_glass: room(['kingwilliam', 17, 11], [{ kind: 'glassman', x: 11 * 16, who: 'glassman' },
    { kind: 'dog', x: 17 * 16, who: 'dog', when: 'hasDog' }], { w: 26, deco: '                  S' }),
  kw_house: room(['kingwilliam', 28, 11], [{ kind: 'colonel', x: 14 * 16, lines: ['NEIGHBOR: HIS DOG RAN OFF AFTER THE',
    'MATACHINES LAST FEAST DAY. FOLLOWED THEM', 'ALL THE WAY DOWN TO ESPADA. GOOD DOG. BAD SENSE.'] }], { deco: '        S' }),
  kw_garage: room(['kingwilliam', 50, 11], [{ kind: 'cousin', x: 12 * 16, who: 'healer', heal: 'magic',
    lines: ['COUSIN: BIG RED IN THE GARAGE FRIDGE.', 'THE HOUSE IS 1878. THE FRIDGE IS 1994.'] }], { w: 20, deco: '      SS' }),

  // --- T: the West Side. New Kasuto's old woman is a curandera: she teaches LIMPIA to someone who can hold enough. ---
  westside: () => ({
    music: 'westside', backdrop: 'suburb', town: true, facade: 'p',
    tiles: pad([
      '',
      '',
      '',
      '',
      '',
      '            T  rrrrrrr                      T             T         ',
      '    rrrrrr  T  WWWWWWW    rrrrrr   L        T   rrrrrr    T         ',
      '    WWWWWW  T  WnWWnnW    WWWWWW   L        T   WWWWWW    T         ',
      '    WnWWnW  T  WnWWnnW    WnWWnW   L        T   WnWWnW    T         ',
      '    WWDWWW  T  WWDWWWW    WWDWWW   L        T   WWDWWW    T         ',
      '    WWDWWW  T  WWDWWWW    WWDWWW   L        T   WWDWWW    T         ',
      '--------------------------------------------------------------------'
    ], 68),
    npcs: [
      { kind: 'kid', x: 12 * 16, walk: [2, 46], lines: ['KID: MY GRANDMA SAYS THE LADY IN THE',
        'TURQUOISE HOUSE CAN TAKE THE EVIL EYE', 'OFF YOU. I ASKED IF SHE COULD DO HOMEWORK.'] },
      { kind: 'shopper', x: 40 * 16, walk: [22, 64], lines: ['WOMAN: THE AUTO-GLASS MAN IN KING WILLIAM',
        'KNOWS A SPELL. HE WILL NOT TEACH IT', 'WHILE HIS DOG IS MISSING. NOBODY WOULD.'] }
    ],
    doors: { 6: ['ws_tia', 2, 11], 17: ['ws_curandera', 2, 11], 28: ['ws_panaderia', 2, 11], 50: ['ws_garage', 2, 11] },
    exits: { left: 'over', right: 'over' }, spawnX: 1 * 16 + 8
  }),
  ws_tia: room(['westside', 6, 11], [{ kind: 'tia', x: 14 * 16, who: 'healer', heal: 'both',
    lines: ['TIA: MENUDO. IT IS SATURDAY.', 'IT IS ALWAYS SATURDAY IN THIS KITCHEN.'] }], { deco: '           SS' }),
  ws_curandera: room(['westside', 17, 11], [{ kind: 'curandera', x: 13 * 16, who: 'curandera' }], { w: 26, deco: '         SS     S' }),
  ws_panaderia: room(['westside', 28, 11], [{ kind: 'storekeeper', x: 14 * 16, lines: ['BAKER: CONCHAS, MARRANITOS, EMPANADAS.',
    'THE CASCARONES ARE FOR FIESTA. THEY ARE', 'NOT FOR EATING. PEOPLE ASK.'] }], { deco: '      SSSS' }),
  ws_garage: room(['westside', 50, 11], [{ kind: 'musician', x: 12 * 16, lines: ['MUSICIAN: CONJUNTO WAS BORN RIGHT HERE.',
    'THE ACCORDION CAME FROM THE GERMANS IN KING', 'WILLIAM. THE REST OF IT CAME FROM US.'] }], { w: 20, deco: '      SS' }),
  // --- Q: Alamo Heights. The retired lifeguard teaches SPF 50, once her grandson stops sneezing. ---
  heights: () => ({
    music: 'town', backdrop: 'suburb', town: true, facade: 'w',
    tiles: pad([
      '',
      '',
      '',
      '',
      '',
      '            T  rrrrrrr                      T             T         ',
      '    rrrrrr  T  WWWWWWW    rrrrrr   L        T   rrrrrr    T         ',
      '    WWWWWW  T  WnWWnnW    WWWWWW   L        T   WWWWWW    T         ',
      '    WnWWnW  T  WnWWnnW    WnWWnW   L        T   WnWWnW    T         ',
      '    WWDWWW  T  WWDWWWW    WWDWWW   L        T   WWDWWW    T         ',
      '    WWDWWW  T  WWDWWWW    WWDWWW   L        T   WWDWWW    T         ',
      '--------------------------------------------------------------------'
    ], 68),
    npcs: [
      { kind: 'dogwalker', x: 12 * 16, walk: [2, 46], lines: ['DOG WALKER: CEDAR FEVER GOT THE WHOLE',
        'BLOCK. THE LIFEGUARD SWEARS BY LOCAL', 'HONEY. HELOTES HONEY. GOOD LUCK GETTING IT.'] },
      { kind: 'tennis', x: 40 * 16, walk: [22, 64], lines: ['TENNIS MOM: THE QUARRY WAS A CEMENT PLANT.',
        'NOW IT IS A GOLF COURSE. EVERYTHING HERE', 'USED TO BE SOMETHING HARDER.'] }
    ],
    doors: { 6: ['ah_tia', 2, 11], 17: ['ah_guard', 2, 11], 28: ['ah_wife', 2, 11], 50: ['ah_garage', 2, 11] },
    exits: { left: 'over', right: 'over' }, spawnX: 1 * 16 + 8
  }),
  ah_tia: room(['heights', 6, 11], [{ kind: 'tia', x: 14 * 16, who: 'healer', heal: 'life',
    lines: ['TIA: CALDO. YES, IN AUGUST.', 'ESPECIALLY IN AUGUST. SIT.'] }], { deco: '           SS' }),
  ah_guard: room(['heights', 17, 11], [{ kind: 'lifeguard', x: 11 * 16, who: 'lifeguard' },
    { kind: 'kid', x: 17 * 16, who: 'grandson' }], { w: 26, deco: '                  S' }),
  ah_wife: room(['heights', 28, 11], [{ kind: 'wife', x: 14 * 16, lines: ['WOMAN: MY HUSBAND IS FROM HELOTES. HE SAYS',
    'THE OLD ROAD IS STILL THERE, UNDER THE', 'HILLS BELOW THE RIM. HE SAYS IT EVERY',
    'THANKSGIVING. ALL IT WOULD TAKE, HE SAYS,', 'IS A JACKHAMMER.'] }], { deco: '        S' }),
  ah_garage: room(['heights', 50, 11], [{ kind: 'cousin', x: 12 * 16, who: 'healer', heal: 'magic',
    lines: ['COUSIN: THE GARAGE FRIDGE IS ALL BIG RED.', 'THAT IS WHAT A GARAGE FRIDGE IS FOR.'] }], { w: 20, deco: '      SS' }),

  // --- S: Southtown. Carry water from the acequia and the fireworks man will teach BOTTLE ROCKET. ---
  southtown: () => ({
    music: 'town', backdrop: 'suburb', town: true, facade: 'p',
    tiles: pad([
      '',
      '',
      '',
      '',
      '',
      '             T        rrrrrrr  T                    T                   ',
      '    rrrrrr   T        WWWWWWW  T   rrrrrr    L      T                   ',
      '    WWWWWW   T        WnWWWnn  T   WWWWWW    L      T                   ',
      '    WnWWnW   T        WnWWWnn  T   WnWWnW    L      T                   ',
      '    WWDWWW   T        WWWDWWW  T   WWDWWW    L      T                   ',
      '    WWDWWW   T        WWWDWWW  T   WWDWWW    L      T                   ',
      '------------------------------------------------------------------------'
    ], 72),
    npcs: [
      { kind: 'gardener', x: 19 * 16, who: 'gardener' },
      { kind: 'artist', x: 30 * 16, walk: [14, 50], lines: ['ARTIST: LA VILLITA IS ACROSS THE RIVER,',
        'DOWNTOWN. THE ONLY WAY OVER IS THE', 'LOW-WATER CROSSING. SO: WADERS.'] },
      { kind: 'cousin', x: 44 * 16, who: 'healer', heal: 'magic', lines: ['COUSIN: BIG RED, FROM THE COOLER.',
        'DO NOT ASK WHAT FLAVOR. NOBODY KNOWS.'] },
      { kind: 'abuelo', x: 56 * 16, walk: [48, 62], lines: ['ABUELO: BOTTLE ROCKETS SET THE CEDAR OFF',
        'EVERY JULY. THE HILLS CATCH. I SAY GOOD.'] },
      { kind: 'acequia', x: 66 * 16, who: 'acequia' }
    ],
    doors: { 6: ['st_tia', 2, 11], 25: ['st_rocket', 2, 11], 37: ['st_oldman', 2, 11] },
    exits: { left: 'over', right: 'over' }, spawnX: 1 * 16 + 8
  }),
  st_tia: room(['southtown', 6, 11], [{ kind: 'tia', x: 14 * 16, who: 'healer', heal: 'life',
    lines: ['TIA: BARBACOA. IT IS SUNDAY.', 'IN THIS HOUSE IT IS ALWAYS SUNDAY.'] }], { deco: '           SS' }),
  st_rocket: room(['southtown', 25, 11], [{ kind: 'fireworks', x: 15 * 16, who: 'fireworks' }], { deco: '     SSSS' }),
  st_oldman: room(['southtown', 37, 11], [{ kind: 'oldman', x: 13 * 16, lines: ['OLD MAN: SOMEBODY LEFT A PAIR OF WADERS',
    'ON THE LOWER DOCK OF THE RIVERWALK.', 'NOBODY CLAIMS THEM. NOBODY GOES DOWN THAT', 'FAR.'] }], { deco: '         S' }),

  // --- E: Helotes, under the hills. Burn the cedar off the grackle man's door and he teaches GRACKLE. ---
  helotes: () => ({
    music: 'town', backdrop: 'greenbelt', town: true, facade: 'b',
    tiles: pad([
      '',
      '',
      '',
      '',
      '                                      YYY               ',
      '                      rrrrrrrrr  T    YYY           T   ',
      '    rrrrrr   rrrrrr   WWWWWWWWW  T    YYY   rrrrrr  T   ',
      '    WWWWWW   WWWWWW   WnnWWWnnW  T    YYY   WWWWWW  T   ',
      '    WnWWnW   WnWWnW   WnnWWWnnW  T    YYY   WnWWnW  T   ',
      '    WWDWWW   WWDWWW   WWWWDWWWW  T    YYY   WWDWWW  T   ',
      '    WWDWWW   WWDWWW   WWWWDWWWW  T    YYY   WWDWWW  T   ',
      '--------------------------------------------------------'
    ], 56),
    npcs: [
      { kind: 'fiddler', x: 18 * 16, walk: [2, 31], lines: ['FIDDLER: THE DANCE HALL HAS BEEN HERE',
        'SINCE 1942. THE ROAD CAME AND WENT.'] },
      { kind: 'rancher', x: 35 * 16, lines: ['RANCHER: THE OLD MAN PAST THE CEDAR FEEDS',
        'THE GRACKLES. THE CEDAR GREW OVER HIS DOOR.', 'IT GROWS OVER EVERYTHING OUT HERE.',
        'FIRE IS THE ONLY THING IT RESPECTS.'] }
    ],
    doors: { 6: ['he_store', 2, 11], 15: ['he_bees', 2, 11], 26: ['he_hall', 2, 11], 46: ['he_grackle', 2, 11] },
    exits: { left: 'over' }, spawnX: 1 * 16 + 8
  }),
  he_store: room(['helotes', 6, 11], [{ kind: 'storekeeper', x: 13 * 16, who: 'healer', heal: 'both',
    lines: ['STOREKEEPER: TAMALES AND A BIG RED.', 'ON THE HOUSE. YOU CAME THROUGH A HILL.'] }], { deco: '     SSSS    SSS' }),
  he_bees: room(['helotes', 15, 11], [{ kind: 'beekeeper', x: 14 * 16, who: 'beekeeper' }], { deco: '         SS' }),
  he_hall: room(['helotes', 26, 11], [{ kind: 'bartender', x: 20 * 16, lines: ['BARTENDER: THE NORTHER BRINGS THE CEDAR IN.',
    'RAIN IS WHAT TAKES IT DOWN. AN OLD MAN IN', 'LA VILLITA CAN CALL A GULLYWASHER. HE ONLY',
    'TEACHES IT TO SOMEBODY WITH A BIG THERMOS.'] }], { w: 30, deco: '                    SSSSSS' }),
  he_grackle: room(['helotes', 46, 11], [{ kind: 'grackleman', x: 13 * 16, who: 'grackleman' }], { deco: '        S' }),

  // --- L: La Villita. Bring the kid down off the chapel roof and the old man teaches GULLYWASHER. ---
  villita: () => ({
    music: 'town', backdrop: 'market', town: true, facade: 'a',
    tiles: pad([
      '',
      '',
      '',
      '                         ######                                 ',
      '                         rrrrrr                                 ',
      '             rrrrrrr     WWWWWW                         T       ',
      '    rrrrrr   WWWWWWW     WnWWnW    L  rrrrrr            T       ',
      '    WWWWWW   WnWWWnn     WWWWWW    L  WWWWWW            T       ',
      '    WnWWnW   WnWWWnn     WnWWnW    L  WnWWnW            T       ',
      '    WWDWWW   WWWDWWW     WWDWWW    L  WWDWWW            T       ',
      '    WWDWWW   WWWDWWW     WWDWWW    L  WWDWWW            T       ',
      '----------------------------------------------------------------'
    ], 64),
    npcs: [
      { kind: 'kid', x: 27 * 16 + 8, y: 3 * 16, who: 'roofkid', unless: 'kidSaved' },   // 128 px up: no jump gets there
      { kind: 'papel', x: 21 * 16, walk: [9, 33], lines: ["WOMAN: THE ABUELO'S GREAT-GRANDSON IS UP",
        'ON THE CHAPEL ROOF AGAIN. NOT A LADDER IN', 'LA VILLITA REACHES. SOMETHING WITH WINGS', 'COULD.'] },
      { kind: 'silversmith', x: 48 * 16, walk: [36, 60], lines: ['SILVERSMITH: THE ALAMO IS ONE BLOCK OVER.',
        'EVERYONE SAYS THERE IS NO BASEMENT.', 'EVERYONE HAS NOT LOOKED.'] }
    ],
    doors: { 6: ['lv_candles', 2, 11], 16: ['lv_elder', 2, 11], 27: ['lv_chapel', 2, 11], 40: ['lv_tia', 2, 11] },
    exits: { left: 'over', right: 'over' }, spawnX: 1 * 16 + 8
  }),
  lv_candles: room(['villita', 6, 11], [{ kind: 'candlemaker', x: 13 * 16, lines: ['CANDLE MAKER: THE CEDAR KING SITS UNDER',
    'THE ALAMO. EVERYTHING ON HIM IS BARK', 'EXCEPT THE CROWN, AND THE CROWN IS CAKED', 'IN POLLEN. RAIN ON IT FIRST. THEN COME',
    'DOWN ON IT.'] }], { deco: '      SSS' }),
  lv_elder: room(['villita', 16, 11], [{ kind: 'elder', x: 12 * 16, who: 'rainmaker' },
    { kind: 'kid', x: 17 * 16, when: 'kidSaved', lines: ['KID: I SAW YOU FLY.', 'NOBODY BELIEVES ME.'] }], { w: 26 }),
  lv_chapel: room(['villita', 27, 11], [{ kind: 'devout', x: 14 * 16, lines: ['WOMAN: I LIGHT ONE FOR EVERYONE WHO',
    'CANNOT BREATHE THIS TIME OF YEAR.', 'THAT IS A LOT OF CANDLES.'] }], { deco: '        S S S S' }),
  lv_tia: room(['villita', 40, 11], [{ kind: 'tia', x: 14 * 16, who: 'healer', heal: 'both',
    lines: ['TIA: EAT. THERE IS BIG RED IN THE FRIDGE.', 'THE ALAMO WILL STILL BE THERE.'] }], { deco: '           SS' }),

  // --- random encounters off the loop ---
  access: () => ({
    music: 'battle', backdrop: 'accessroad', battle: true, heat: true,
    tiles: pad([
      '                                                    ',
      '                                                    ',
      '                                                    ',
      '                                  XXXXXX            ',
      '                                                    ',
      '            L                          L            ',
      '            L                          L            ',
      '        XXXX                XXXXXX                  ',
      '                                                    ',
      '                                                    ',
      '              XX                                    ',
      '----------------------------------------------------'
    ], 52),
    spawns: [['ant', 18, 11], ['cone', 26, 11], ['ant', 33, 11], ['cartknight', 42, 11, 0], ['grackle', 27, 6]],
    loot: [['cascaron', 37 * 16 + 8, 4 * 16]],
    exits: { left: 'over', right: 'over' }, spawnX: 3 * 16
  }),
  greenbelt: () => ({
    music: 'battle', backdrop: 'greenbelt', battle: true, heat: true,
    tiles: pad([
      '                                            ',
      '                                            ',
      '                                            ',
      '                                            ',
      '                                            ',
      '                                            ',
      '        T           T             T         ',
      '        T           T             T         ',
      '        T           T             T         ',
      '            XX             XX               ',
      '                                            ',
      'ggggggggggggggggg333gggggggggggggg333ggggggg'
    ], 44),
    spawns: [['ant', 16, 11], ['wisp', 12, 5], ['wisp', 30, 5], ['ant', 38, 11], ['cone', 24, 11]],
    loot: [['bigred', 21 * 16 + 8, 11 * 16]],
    exits: { left: 'over', right: 'over' }, spawnX: 3 * 16
  })
};

const SOLID = new Set(['#', 'X', 'G', '-', 'g', 'd', '3', 'w', 'f', 'E', 'K', 'B', 'Y']);   // E elevator car, K locked door, B cracked wall, Y cedar brush
const HAZARD = new Set(['3', 'w']);
function tileAt(tx, ty) {
  const s = G.scene;
  if (!s) return '#';
  if (tx < 0 || tx >= s.w) return '#';
  if (ty < 0) return ' ';
  if (ty >= ROWS) return s.tiles[ROWS - 1][tx] === ' ' ? ' ' : '#';   // a gap in the floor goes all the way down
  return s.tiles[ty][tx];
}
function solidAt(tx, ty) {
  const ch = tileAt(tx, ty);
  if (ch === 'G') return !G.gateOpen;
  return SOLID.has(ch);
}
// Shade is anything over your head. That is the whole rule, and it is enough.
function inShade(e) {
  const tx = (e.x / 16) | 0, ty = (e.y / 16) | 0;
  for (let y = ty - 1; y >= Math.max(0, ty - 5); y--) {
    const ch = tileAt(tx, y);
    if (ch === 'T' || SOLID.has(ch)) return true;
  }
  return false;
}

// Body sizes, matched to the 16-bit art (tools/sprites.py). Greg stands 22 px and crouches to 15, and the stick comes
// in at chest height (HIGH) or knee height (LOW). The Cart Knight guards and thrusts on the same two lines, so the
// stance duel reads straight off the art.
const BODY_H = 22, CROUCH_H = 15, HIGH = 16, LOW = 6;

const BOSS = {
  grackleprince: { flag: 'bossRim', name: 'THE GRACKLE PRINCE', hp: 14, w: 36, h: 26, xp: 40, medal: 'THE RIM' },
  mariachi: { flag: 'bossRiver', name: 'MARIACHI OF THE DEEP', hp: 14, w: 12, h: 26, xp: 40, medal: 'THE RIVERWALK', theme: 'cumbia' },
  hippo: { flag: 'bossZoo', name: 'THE HIPPO', hp: 12, w: 30, h: 20, xp: 40, medal: 'THE ZOO' },
  silverfish: { flag: 'bossStacks', name: 'THE SILVERFISH', hp: 20, w: 30, h: 8, xp: 40, medal: 'THE STACKS', theme: 'silverfish' },
  brackenbat: { flag: 'bossCaverns', name: 'THE BRACKEN BAT', hp: 30, w: 30, h: 16, xp: 50, medal: 'THE CAVERNS', theme: 'brackenbat' },
  llorona: { flag: 'bossMissions', name: 'LA LLORONA', hp: 36, w: 12, h: 26, xp: 50, medal: 'THE MISSIONS', theme: 'llorona', theme2: 'llorona2' },
  cedarking: { flag: 'bossCedar', name: 'THE CEDAR KING', hp: 16, w: 34, h: 44, xp: 60 },
  shadowgreg: { flag: 'bossShadow', name: 'SHADOW GREG', hp: 12, w: 10, h: BODY_H, xp: 80 }
};
const isBoss = e => !!BOSS[e.kind];
const MEDALS = 6;   // six Fiesta medals, like Zelda II's six crystals

// Palaces: a set of rooms with one entrance. Dying sends you back to the entrance with doors and keys kept.
// The medal is carried out and pinned to the sash at the entrance — that is when it counts.
const PALACES = {
  rim: { name: 'THE RIM', entry: 'rim0' },
  river: { name: 'THE RIVERWALK', entry: 'river0' },
  zoo: { name: 'THE ZOO', entry: 'zoo0' },
  stacks: { name: 'THE STACKS', entry: 'keystone' },
  caverns: { name: 'THE CAVERNS', entry: 'caverns0' },
  missions: { name: 'THE MISSIONS', entry: 'missions0' },
  alamo: { name: 'THE ALAMO', entry: 'alamo0' }
};

// Cart Knights come in three carts. The guard follows Greg's stick height after `react` seconds,
// so the technique is the feint: settle into one line, switch, and strike before he catches up.
const KNIGHT = [
  { name: 'GROCERY', react: 20 / 60, wind: 0.30, cd: 1.4, spd: 32, hp: 6, xp: 12, vest: 'y' },
  { name: 'LUMBER', react: 12 / 60, wind: 0.24, cd: 1.1, spd: 40, hp: 9, xp: 18, vest: 'r' },
  { name: 'CORRAL', react: 8 / 60, wind: 0.20, cd: 0.9, spd: 46, hp: 12, xp: 26, vest: 'c', shove: true }
];
// the pogo lands on the crown, not the trunk
const crownBox = e => ({ x: e.x, y: e.y - 46, w: 30, h: 12 });
const pogoDamage = () => 1 + Math.ceil(G.atk / 2);

function enterScene(name, opts) {
  opts = opts || {};
  const s = SCENES[name]();
  s.name = name;
  s.w = s.tiles[0].length;
  s.tiles = s.tiles.map(r => r.split(''));
  if (G.gateOpen) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < s.w; x++) if (s.tiles[y][x] === 'G') s.tiles[y][x] = ' ';
  }
  // what you've already done in here stays done
  for (let x = 0; x < s.w; x++) if (G.opened[name + ':' + x]) for (let y = 0; y < ROWS; y++) if (s.tiles[y][x] === 'K') s.tiles[y][x] = ' ';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < s.w; x++) {
    const k = name + ':' + x + ':' + y;
    if ((s.tiles[y][x] === 'B' && G.broken[k]) || (s.tiles[y][x] === 'Y' && G.burnt[k])) s.tiles[y][x] = ' ';
  }
  G.scene = s; G.sceneName = name; G.mode = 'side';
  G.enemies = []; G.pickups = []; G.shots = []; G.parts = []; G.chests = []; G.npcs = []; G.plats = [];
  G.bossBar = null; G.bossName = ''; G.pollenT = 0;
  G.spf = G.rocket = G.shade = false; G.rainT = 0;      // SPF 50, BOTTLE ROCKET and SUNSHADE last until you leave
  (s.spawns || []).forEach(sp => spawnEnemy(sp[0], sp[1] * 16 + 8, sp[2] * 16, sp[3]));
  (s.loot || []).forEach(l => G.pickups.push({ kind: l[0], x: l[1], y: l[2], t: 1, vx: 0, vy: 0 }));
  (s.chests || []).forEach(c => { if (!G[c.id]) G.chests.push({ id: c.id, x: c.x, y: c.y }); });
  (s.npcs || []).forEach(n => { if (!(n.when && !G[n.when]) && !(n.unless && G[n.unless])) G.npcs.push(n); });
  (s.plats || []).forEach(p => G.plats.push({
    x: p.x, w: p.w, y: p.y0, y0: p.y0, y1: p.y1, spd: p.spd || 0, dir: 1,
    x0: p.x, x1: p.mx != null ? p.mx : p.x, hspd: p.mx != null ? (p.hspd || 24) : 0, hdir: 1
  }));
  (s.keys || []).forEach(k => { if (!G.gotKeys[k.id]) G.pickups.push({ kind: 'skey', id: k.id, x: k.x, y: k.y - 10, t: 1, vx: 0, vy: 0 }); });
  if (s.pin && !G.pins[s.pin.id]) G.pickups.push({ kind: 'pin', id: s.pin.id, x: s.pin.x, y: s.pin.y - 10, t: 1, vx: 0, vy: 0 });
  if (s.keystone && !G.hasKeystone) G.pickups.push({ kind: 'keystone', x: s.keystone.x, y: s.keystone.y - 10, t: 1, vx: 0, vy: 0 });
  if (opts.strong) {                         // an 18-wheeler: everything in this fight is a size up
    G.enemies.forEach(e => { if (e.kind === 'cartknight' && e.tier < 2) { const t = KNIGHT[e.tier + 1]; Object.assign(e, { tier: e.tier + 1, hp: t.hp, xp: t.xp }); } });
    spawnEnemy('cartknight', ((s.w / 2) | 0) * 16 + 8, 11 * 16, 1); spawnEnemy(s.name === 'greenbelt' ? 'wisp' : 'ant', ((s.w * 0.7) | 0) * 16 + 8, 11 * 16 - (s.name === 'greenbelt' ? 60 : 0));
  }
  if (s.boss && !G[BOSS[s.boss].flag]) spawnEnemy(s.boss, (s.bossX || 22) * 16 + 8, (s.bossY || 11) * 16);
  const P = newSidePlayer();
  P.x = opts.fromRight && s.spawnRight ? s.spawnRight : (opts.x != null ? opts.x : s.spawnX);
  P.y = opts.y != null ? opts.y : (s.spawnY != null ? s.spawnY : 11 * 16);
  P.safeX = P.x; P.safeY = P.y;
  if (opts.fromRight) P.face = -1;
  G.player = P;
  G.camX = clamp(P.x - VW / 2, 0, s.w * TILE - VW);
  playMusic(s.music);
  music.speed = 1;
}
function travel(link) {
  if (typeof link === 'string') enterScene(link, {});
  else if (Array.isArray(link)) enterScene(link[0], { x: link[1] * 16 + 8, y: link[2] * 16 });
  else returnOver();
}
function toOverworld(x, y) {
  G.mode = 'over';
  G.scene = null;
  G.enemies = []; G.shots = []; G.parts = []; G.pickups = []; G.chests = []; G.npcs = []; G.plats = [];
  G.bossBar = null; G.pollenT = 0; G.spf = G.rocket = G.shade = false; G.rainT = 0;
  if (x != null) { G.avatar.x = x; G.avatar.y = y; }
  G.traffic = []; G.trafficT = 5;
  G.ocamX = clamp(G.avatar.x - VW / 2, 0, OVER_W * 16 - VW); G.ocamY = clamp(G.avatar.y - (VH - HUD_H) / 2, 0, OVER_H * 16 - (VH - HUD_H));
  playMusic('over');
  music.speed = 1;
}

function newSidePlayer() {
  return {
    x: 48, y: 11 * 16, w: 10, h: BODY_H, vx: 0, vy: 0, face: 1,
    onGround: false, coyote: 0, crouch: false, walkT: 0,
    stabT: 0, stabCd: 0, thrusting: false,
    bufJump: 0, bufAtk: 0,
    invuln: 0, kx: 0, heatT: 0, napT: 0, napImmune: 0, onPlat: false,
    safeX: 48, safeY: 11 * 16,
    tape: []   // input history — Shadow Greg reads this
  };
}

// ---------------- XP / levels ----------------
function nextCost(i) {
  return level() >= 7 ? Infinity : COST[STATS[i]][G[STATS[i]] - 1];
}
const affordable = () => [0, 1, 2].filter(i => G.xp >= nextCost(i)).length;
const cheapest = () => Math.min(nextCost(0), nextCost(1), nextCost(2));
// Prompt when something is affordable, but after a CANCEL only once a pricier stat comes into reach.
const levelReady = () => affordable() > G.declined;
function gainXp(n) {
  G.xp += n;
  SFX.xp();
  if (levelReady() && G.state === 'play') { G.state = 'levelup'; G.levelSel = 0; SFX.levelup(); }
}
function loseXp(n) {
  G.xp = Math.max(0, G.xp - n);
}
function applyLevel(stat) {
  if (stat === 3) { G.declined = affordable(); G.state = 'play'; SFX.blip(); return; }   // CANCEL: bank it
  const cost = nextCost(stat);
  if (G.xp < cost) { SFX.deny(); return; }
  G.xp -= cost;
  if (stat === 0) G.atk++;
  else if (stat === 1) { G.mag++; G.maxMg += 1; G.mg = G.maxMg; }
  else { G.lif++; G.maxHp += 1; G.hp = G.maxHp; }
  G.declined = 0;
  SFX.levelup();
  save();
  if (!levelReady()) G.state = 'play';
}

// ---------------- combat ----------------
function damagePlayer(dmg, sx, noKb) {
  const P = G.player;
  if (!P || P.invuln > 0 || G.state !== 'play') return;
  if (G.spf) dmg = Math.ceil(dmg / 2);        // SPF 50: big hits hurt half
  if (G.quest2) dmg = Math.ceil(dmg * 1.5);   // the second quest hits harder
  if (G.easy) dmg /= 2;                       // EASY: everything hurts half, down to half a pip
  G.hp -= dmg;
  P.invuln = 1.1;
  SFX.hurt(); shake(4, 0.25); G.freeze = 0.05;
  if (!noKb) { P.kx = (P.x < sx ? -1 : 1) * 150; P.vy = -170; }
  burst(P.x, P.y - 8, PAL.r, 8);
  if (G.hp <= 0) { G.hp = 0; startDeath(); }
}
function startDeath() {
  G.state = 'dying';
  G.deathT = 1.2;
  stopMusic();
  SFX.boom();
}
function damageEnemy(e, dmg, sx, opts) {
  opts = opts || {};
  if (isBoss(e)) { if (e.iframe > 0) return false; e.iframe = 0.5; }   // bosses get a beat after every hit
  e.hp -= dmg;
  e.flash = 0.15;
  G.freeze = 0.04; shake(2, 0.1);
  SFX.hit();
  if (!opts.noKb) { e.kx = (e.x < sx ? -1 : 1) * (e.kb || 140); if (e.grav) e.vy = -120; }
  // hitstun buys tempo against the small stuff; a Cart Knight never flinches (the cart takes it), so he can't be stun-locked
  if (!isBoss(e) && e.kind !== 'cartknight') e.stunT = 0.18;
  burst(e.x, e.y - e.h / 2, PAL.w, 6);
  if (e.hp <= 0) killEnemy(e);
  return true;
}
function killEnemy(e) {
  e.dead = true;
  SFX.poof();
  burst(e.x, e.y - e.h / 2, PAL.m, 12);
  const B = BOSS[e.kind];
  if (B) {
    SFX.boom(); shake(6, 0.6);
    G[B.flag] = true;
    G.bossBar = null;
    music.speed = 1;
    if (B.theme && G.scene) playMusic(G.scene.music);   // the room's own music comes back
    const pal = G.scene && G.scene.palace;
    if (B.medal && PALACES[pal]) {                  // carried out and pinned at the entrance; that's when it counts
      G.carry[pal] = true;
      spawnPickup('medal', e.x, e.y - 10);
      say(['A FIESTA MEDAL.',
           'IT DOES NOT COUNT UNTIL IT IS PINNED.',
           'THE SASH IS AT THE ENTRANCE.'], () => save());
    } else if (B.medal) {
      G.medals++;
      spawnPickup('medal', e.x, e.y - 10);
      say(['A FIESTA MEDAL. PINNED, NOT EARNED —',
           'EARNED IS WHAT PEOPLE SAY AFTERWARD.',
           'MEDALS: ' + G.medals + ' OF ' + MEDALS + '.',
           'GO HOME. MARISA TALKS IN HER SLEEP.'], () => save());
    } else if (e.kind === 'cedarking') {
      say(['THE CEDAR KING COMES APART IN SECTIONS,',
           'LIKE A BRUSH PILE ON COLLECTION DAY.',
           'THE POLLEN STOPS.',
           'THE DOOR AT THE FAR END WAS ALWAYS THERE.'], () => save());
    } else if (e.kind === 'shadowgreg') {
      G.hasRose = true;
      spawnPickup('rose', e.x, e.y - 10);
      say(['SHADOW GREG SETS DOWN THE STICK.',
           'HE LOOKS RELIEVED, WHICH IS THE WORST PART.',
           'BEHIND HIM: ONE YELLOW ROSE.'], () => save());
    }
    gainXp(B.xp);
    return;
  }
  gainXp(e.xp || 3);
  const r = Math.random();
  if (r < 0.35) spawnPickup('cascaron', e.x, e.y - 6, 5);
  else if (r < 0.58) spawnPickup('bigred', e.x, e.y - 6);
  else if (r < 0.68) spawnPickup('heart', e.x, e.y - 6);
  if (G.scene && G.scene.battle && !G.enemies.some(x => !x.dead && x.kind !== 'tourist')) {
    toast('ROAD CLEARED! +10 XP');
    gainXp(10);
  }
}
function spawnPickup(kind, x, y, val) {
  G.pickups.push({ kind, x, y, val: val || 0, t: 0, vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 40 });
}
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 70;
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.3, color, sz: Math.random() < 0.5 ? 1 : 2 });
  }
}
function dustPuff(x, y) {
  for (let i = 0; i < 4; i++) {
    G.parts.push({ x: x + (Math.random() - 0.5) * 8, y, vx: (Math.random() - 0.5) * 25, vy: -15 - Math.random() * 15, life: 0.3, color: PAL.a, sz: 2 });
  }
}

function spawnEnemy(kind, x, y, tier) {
  const e = { kind, x, y, vx: 0, vy: 0, hp: 2, w: 10, h: 12, t: Math.random() * 2, state: 'idle', flash: 0, kx: 0, face: -1, grav: true, xp: 3, hitBy: -1 };
  if (kind === 'ant') Object.assign(e, { hp: 2, h: 6, w: 16, spd: 62, xp: 3 });
  if (kind === 'grackle' || kind === 'bat') Object.assign(e, { hp: 2, h: 10, w: 16, grav: false, by: y - 40, y: y - 40, xp: 5 });   // a bat flies a grackle's pattern
  if (kind === 'wisp') Object.assign(e, { hp: 2, h: 9, w: 12, grav: false, by: y, xp: 6 });
  if (kind === 'cone') Object.assign(e, { hp: 3, h: 15, w: 12, spd: 70, xp: 8, live: Math.random() < 0.55, state: 'cone' });
  if (kind === 'cartknight') {
    const T = KNIGHT[tier || 0];
    Object.assign(e, { tier: tier || 0, hp: T.hp, h: BODY_H, w: 12, xp: T.xp, kb: 60, guardHi: true, readT: 0, atkCd: 1, shoveT: 2 });
  }
  if (kind === 'tourist') Object.assign(e, { hp: 999, h: BODY_H, w: 12, spd: 10, xp: 0, harmless: true });
  if (G.quest2 && !BOSS[kind] && kind !== 'tourist') {      // the second quest: everything takes more, and knights come a tier up
    if (kind === 'cartknight' && e.tier < 2) { const T = KNIGHT[e.tier + 1]; Object.assign(e, { tier: e.tier + 1, hp: T.hp, xp: T.xp }); }
    e.hp *= 2;
  }
  const B = BOSS[kind];
  const bhp = B && Math.ceil(B.hp * (G.easy ? 0.75 : 1) * (G.quest2 ? 1.5 : 1));   // EASY: a quarter lighter; second quest: half again
  if (B) Object.assign(e, { hp: bhp, maxHp: bhp, w: B.w, h: B.h, xp: B.xp, state: 'sleep', stun: 0, grav: !['grackleprince', 'hippo', 'brackenbat', 'llorona'].includes(kind) });
  G.enemies.push(e);
  return e;
}

// ---------------- side physics ----------------
function bodyHits(x, y, w, h) { // x,y = feet center
  const l = x - w / 2, r = x + w / 2 - 1, top = y - h, bot = y - 1;
  return solidAt((l / 16) | 0, (top / 16) | 0) || solidAt((r / 16) | 0, (top / 16) | 0) ||
         solidAt((l / 16) | 0, (bot / 16) | 0) || solidAt((r / 16) | 0, (bot / 16) | 0) ||
         solidAt((l / 16) | 0, (((top + bot) / 2) / 16) | 0) || solidAt((r / 16) | 0, (((top + bot) / 2) / 16) | 0);
}
function moveX(e, dx) {
  if (!dx) return false;
  const step = Math.sign(dx);
  let moved = 0, want = Math.abs(dx);
  while (moved < want) {
    const inc = Math.min(1, want - moved);
    if (bodyHits(e.x + step * inc, e.y, e.w, e.h)) return true;
    e.x += step * inc; moved += inc;
  }
  return false;
}
function moveY(e, dy) {
  if (!dy) return false;
  const step = Math.sign(dy);
  let moved = 0, want = Math.abs(dy);
  while (moved < want) {
    const inc = Math.min(1, want - moved);
    if (bodyHits(e.x, e.y + step * inc, e.w, e.h)) return true;
    e.y += step * inc; moved += inc;
  }
  return false;
}
function floorCh(e) { return tileAt((e.x / 16) | 0, (e.y / 16) | 0); }

// ---------------- player (side) ----------------
function stabBox(P) {
  const high = !P.crouch;
  return { x: P.x + P.face * 13, y: P.y - (high ? HIGH : LOW), w: 14, h: 5 };
}
function thrustBox(P) { return { x: P.x, y: P.y + 5, w: 8, h: 10 }; }
// is there floor under the next step? walkers don't choose to step into a pit
const pitAhead = (e, dir) => tileAt(((e.x + dir * (e.w / 2 + 2)) / 16) | 0, ROWS - 1) === ' ';
function hb(e) { return { x: e.x, y: e.y - e.h / 2, w: e.w, h: e.h }; }

function updateSidePlayer(dt) {
  const P = G.player;
  P.invuln = Math.max(0, P.invuln - dt);
  P.stabCd = Math.max(0, P.stabCd - dt);
  P.bufJump = Math.max(0, P.bufJump - dt);
  P.bufAtk = Math.max(0, P.bufAtk - dt);
  P.coyote = Math.max(0, P.coyote - dt);
  G.jumpT = Math.max(0, G.jumpT - dt);

  // pollen nap: you are standing up, asleep, in traffic
  const napping = P.napT > 0;
  if (napping) { P.napT -= dt; P.bufJump = 0; P.bufAtk = 0; }
  P.napImmune = Math.max(0, P.napImmune - dt);

  if (P.kx) { moveX(P, P.kx * dt); P.kx *= Math.pow(0.001, dt); if (Math.abs(P.kx) < 5) P.kx = 0; }
  if (P.flyT > 0) { flyGreg(P, dt); return; }

  P.crouch = !napping && P.onGround && keys.down;
  P.h = P.crouch ? CROUCH_H : BODY_H;

  // walk
  let mx = napping ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (P.crouch) mx = 0;
  if (mx) { P.face = mx; P.walkT += dt; } else P.walkT = 0;
  moveX(P, mx * 95 * dt);

  // Shadow Greg is watching. Record everything.
  P.tape.push({ mx, jump: !!P.bufJump, atk: !!P.bufAtk, crouch: P.crouch });
  if (P.tape.length > 90) P.tape.shift();

  // jump
  if (P.bufJump > 0 && (P.onGround || P.coyote > 0)) {
    P.bufJump = 0; P.coyote = 0;
    P.vy = -(G.jumpT > 0 ? 350 : 285);
    P.onGround = false;
    SFX.jump(); dustPuff(P.x, P.y);
  }
  if (!keys.jump && P.vy < -120) P.vy = -120; // variable jump height

  // gravity
  P.vy += 900 * dt;
  P.vy = Math.min(P.vy, 330);
  const hitV = moveY(P, P.vy * dt);
  if (hitV) {
    if (P.vy > 0) {
      if (!P.onGround) dustPuff(P.x, P.y);
      P.onGround = true;
      P.thrusting = false;
    }
    P.vy = 0;
  } else if (P.vy > 40) {
    if (P.onGround) P.coyote = 0.08;
    P.onGround = false;
  }

  // barges and elevators
  P.onPlat = false;
  for (const pl of G.plats) {
    const onIt = P.vy >= 0 && P.x + P.w / 2 > pl.x && P.x - P.w / 2 < pl.x + pl.w &&
                 P.y >= pl.y - 4 && P.y <= pl.y + 6;
    if (onIt) {
      P.y = pl.y; P.vy = 0; P.onGround = true; P.thrusting = false; P.onPlat = true;
      if (!(pl.wait > 0)) P.y += pl.dir * pl.spd * dt;
      if (pl.hspd) moveX(P, pl.hdir * pl.hspd * dt);
    }
  }

  // pits: two life and back to the last solid ground. Knockback finally has somewhere to send you.
  if (P.y > ROWS * 16 + 12) {
    SFX.boom(); P.invuln = 0;
    damagePlayer(2, P.x, true);
    if (G.hp > 0) { P.x = P.safeX; P.y = P.safeY; P.vy = 0; P.kx = 0; P.thrusting = false; toast('INTO THE PIT'); }
    return;
  }

  // hazard floors: fire-ant mounds and the river
  if (P.onGround && !P.onPlat && HAZARD.has(floorCh(P))) {
    const water = floorCh(P) === 'w';
    if (water) { SFX.splash(); burst(P.x, P.y, PAL.c, 10); }
    else { SFX.sneeze(); burst(P.x, P.y, PAL.R, 8); }
    damagePlayer(1, P.x, true);
    if (G.hp > 0) { P.x = P.safeX; P.y = P.safeY; P.vy = 0; P.kx = 0; }
    toast(water ? 'INTO THE RIVER' : 'FIRE ANTS');
  } else if (P.onGround && !P.onPlat && SOLID.has(floorCh(P)) && !HAZARD.has(floorCh(P))) {   // only real ground: never mid-knockback over water
    P.safeX = P.x; P.safeY = P.y;
  }

  // heat: August, outdoors, standing still. Shade is a resource.
  if (G.scene.heat && !napping && !G.spf && G.state === 'play') {
    if (mx === 0 && P.onGround && !P.onPlat && !inShade(P)) {   // riding a lift or barge isn't standing still
      P.heatT += dt;
      if (P.heatT >= heatLimit()) { P.heatT = 0; damagePlayer(1, P.x, true); toast('THE HEAT'); }
    } else P.heatT = Math.max(0, P.heatT - dt * 2.5);
  } else P.heatT = Math.max(0, P.heatT - dt * 2.5);

  // stab
  if (P.bufAtk > 0 && P.stabCd <= 0 && !P.thrusting) {
    P.bufAtk = 0;
    P.stabT = 0.16; P.stabCd = 0.28; G.stabId++;
    SFX.stab();
    if (G.rocket) G.shots.push({ from: 'greg', kind: 'rocket', x: P.x + P.face * 8, y: P.y - (P.crouch ? 4 : 9), vx: P.face * 210, vy: 0, life: 1.2, t: 0, high: !P.crouch });
  }
  if (P.stabT > 0) {
    P.stabT -= dt;
    const sb = stabBox(P);
    for (const e of G.enemies) {
      if (e.dead || e.hitBy === G.stabId) continue;
      if (overlap(sb, hb(e))) {
        e.hitBy = G.stabId;
        if (e.kind === 'tourist') { SFX.clang(); toast('DO NOT STAB THE TOURISTS'); continue; }
        if (e.kind === 'cone' && e.state === 'cone') { SFX.clang(); continue; }
        if (e.kind === 'cartknight') { cartStabbed(e, P); continue; }
        if (isBoss(e)) { bossStabbed(e, P); continue; }
        damageEnemy(e, G.atk, P.x);
      }
    }
    hitChests(sb);
    breakBlocks(sb);
  }

  // downthrust — hold down in midair and ride the stick
  if (!P.onGround && keys.down && G.hasThrust && P.vy > -40) P.thrusting = true;
  if (P.onGround) P.thrusting = false;
  if (P.thrusting) {
    const tb = thrustBox(P);
    if (breakBlocks(tb)) { P.vy = -250; P.thrusting = false; SFX.pogo(); }
    for (const e of G.enemies) {
      if (e.dead || e.harmless) continue;
      if (e.kind === 'cedarking' ? !overlap(tb, crownBox(e)) : !overlap(tb, hb(e))) continue;
      if (e.kind === 'cartknight' && e.guardHi) {                                 // a rimshot on the cart rail
        SFX.clang(); burst(P.x, P.y + 4, PAL.m, 5);
      } else if (e.kind === 'shadowgreg' && e.phase2) {                             // he knows this one too
        SFX.clang(); burst(P.x, P.y + 4, PAL.j, 6); toast('HE SAW THAT COMING');
      } else if (e.kind === 'cedarking' && !e.washed) {                             // Zelda II's Thunderbird: nothing lands until the rain
        SFX.clang(); burst(P.x, P.y + 4, PAL.y, 8);
        if (!e.pollenT || G.playTime - e.pollenT > 6) { e.pollenT = G.playTime; toast('POLLEN TAKES THE HIT. IT NEEDS RAIN'); }
      } else if (isBoss(e)) damageEnemy(e, pogoDamage(), P.x, { noKb: true });  // the crown. It is bouncy.
      else damageEnemy(e, G.atk + 1, P.x);
      P.vy = -250; P.thrusting = false;
      SFX.pogo();
      break;
    }
  }

  // UPSTROKE — hold up in midair and drive the stick overhead
  const up = !P.onGround && keys.up && G.hasUp && !P.thrusting && !napping;
  if (up && !P.upT) { G.stabId++; P.upId = G.stabId; SFX.stab(); }
  P.upT = up;
  if (up) {
    const ub = { x: P.x, y: P.y - P.h - 6, w: 8, h: 12 };
    breakBlocks(ub);
    for (const e of G.enemies) {
      if (e.dead || e.hitBy === P.upId || !overlap(ub, hb(e))) continue;
      e.hitBy = P.upId;
      if (e.kind === 'tourist') { SFX.clang(); toast('DO NOT STAB THE TOURISTS'); continue; }
      if (e.kind === 'cone' && e.state === 'cone') { SFX.clang(); continue; }
      if (e.kind === 'cartknight' && e.guardHi) { SFX.clang(); continue; }
      if (isBoss(e)) { bossStabbed(e, P); continue; }
      damageEnemy(e, G.atk, P.x);
    }
  }

  // spells: Q cycles through the ones somebody has taught you
  if (pressed.cycle) {
    const known = SPELLS.map((s, i) => i).filter(i => G[SPELLS[i].flag]);
    if (!known.length) { SFX.deny(); toast('NOBODY HAS TAUGHT YOU A SPELL'); }
    else { G.spellSel = known[(known.indexOf(G.spellSel) + 1) % known.length]; SFX.blip(); toast('SPELL: ' + SPELLS[G.spellSel].name); }
  }
  if (pressed.cast) castSpell(P);

  // elevators: stand on the car, press down or up
  if ((pressed.down || pressed.up) && !napping && P.onGround && tileAt((P.x / 16) | 0, (P.y / 16) | 0) === 'E') {
    const tx = (P.x / 16) | 0, elev = G.scene.elev || {};
    const car = elev[tx] || elev[tx - 1], link = car && car[pressed.down ? 'down' : 'up'];
    if (link) {
      SFX.door(); beep('triangle', pressed.down ? 330 : 220, pressed.down ? 160 : 440, 0.35, 0.3);
      G.freeze = 0.15;
      fadeTo(() => travel(link));
      return;
    }
  }

  // doors (press up)
  if (pressed.up && !napping && P.onGround) {
    const tx = (P.x / 16) | 0;
    const doors = G.scene.doors || {};
    if (doors[tx] !== undefined && (tileAt(tx, ((P.y - 4) / 16) | 0) === 'D' || tileAt(tx, ((P.y - 12) / 16) | 0) === 'D')) {
      if (doorGate(G.sceneName, doors[tx])) {
        const d = doors[tx];
        SFX.door();
        fadeTo(() => travel(d));
        return;
      }
    }
    npcTalk();
  }
  if (pressed.use && !napping) npcTalk();
  playerTail(P, dt);
}

function castSpell(P) {
  const i = G.spellSel, sp = SPELLS[i], cost = spellCost(i);
  if (!G[sp.flag]) { SFX.deny(); toast('NOBODY HAS TAUGHT YOU ' + sp.name); return; }
  if (G.mg < cost) { SFX.deny(); toast('NOT ENOUGH MAGIC'); return; }
  if (i === 0 && G.hp >= G.maxHp) { SFX.deny(); toast('LIFE IS FULL'); return; }
  G.mg -= cost;
  SFX.cast();
  burst(P.x, P.y - 10, PAL.c, 12);
  if (i === 0) { G.hp = Math.min(G.maxHp, G.hp + 4); toast('HEALED'); }
  else if (i === 1) { G.jumpT = 20; toast('JUMP UP!'); }
  else if (i === 2) { G.spf = true; toast('SPF 50. REAPPLY LATER'); }
  else if (i === 3) { G.rocket = true; toast('BOTTLE ROCKETS: STAB TO FIRE'); }
  else if (i === 4) { P.flyT = 8; P.h = 14; toast('GRACKLE!'); }
  else if (i === 5) gullywasher(P);
  else if (i === 6) { G.shade = true; toast('SUNSHADE: WHAT YOU BLOCK GOES BACK'); }
  else limpia(P);
}
// LIMPIA: an egg passed over everything small that wishes you harm. What was there is a cascaron now; break it for the XP.
function limpia(P) {
  let n = 0;
  for (const e of G.enemies) {
    if (e.dead || e.harmless || isBoss(e) || Math.abs(e.x - (G.camX + VW / 2)) > VW / 2 + 8) continue;
    e.dead = true; n++;
    burst(e.x, e.y - e.h / 2, PAL.w, 10);
    spawnPickup('cascaron', e.x, e.y - 6, (e.xp || 3) * 2);
  }
  toast(n ? 'LIMPIA' : 'NOTHING HERE WISHES YOU HARM');
}
// The one thing the cedar respects. Everything small on screen goes down the gutter; bosses stand in it.
function gullywasher(P) {
  G.rainT = 1.4; G.pollenT = 0; P.napT = 0;
  shake(4, 0.6); SFX.splash(); SFX.boom();
  let king = false;
  for (const e of G.enemies) {
    if (e.kind === 'cedarking' && !e.dead && !e.washed) {        // the whole basement gets it: his crown comes clean for this fight
      e.washed = king = true; burst(e.x, e.y - 46, PAL.y, 24); SFX.roar(); shake(6, 0.8);
    }
    if (e.dead || e.harmless || isBoss(e) || Math.abs(e.x - (G.camX + VW / 2)) > VW / 2 + 8) continue;
    killEnemy(e);
  }
  toast(king ? 'THE RAIN STRIPS THE POLLEN OFF HIS CROWN' : 'GULLYWASHER!');
}

// GRACKLE: you fly until it wears off. You cannot stab. You can look down on things.
function flyGreg(P, dt) {
  P.flyT -= dt;
  const awake = P.napT <= 0;                    // a pollen nap still gets you, you just hover
  const fx = awake ? (keys.right ? 1 : 0) - (keys.left ? 1 : 0) : 0, fy = awake ? (keys.down ? 1 : 0) - (keys.up ? 1 : 0) : 0;
  if (fx) P.face = fx;
  moveX(P, fx * 85 * dt); moveY(P, fy * 75 * dt);
  P.y = clamp(P.y, P.h + 6, 11 * 16);          // not off the top of the screen, and not down a pit
  P.vy = 0; P.onGround = false; P.coyote = 0; P.crouch = false; P.thrusting = false; P.stabT = 0; P.bufAtk = 0; P.bufJump = 0;
  P.tape.push({ mx: fx, jump: false, atk: false, crouch: false });
  if (P.tape.length > 90) P.tape.shift();
  if (pressed.use) npcTalk();
  playerTail(P, dt);
}

// walking or flying: the edges of the scene, what you bump into, and what you pick up
function playerTail(P, dt) {
  // scene edge exits
  const ex = G.scene.exits || {};
  if (P.x < 6 && ex.left) {
    if (ex.left === 'over') fadeTo(() => returnOver());
    else fadeTo(() => enterScene(ex.left, { fromRight: true }));
    P.x = 6;
  } else if (P.x > G.scene.w * 16 - 6 && ex.right) {
    if (ex.right === 'over') fadeTo(() => returnOver());
    else fadeTo(() => enterScene(ex.right, {}));
    P.x = G.scene.w * 16 - 6;
  }

  // enemy contact
  for (const e of G.enemies) {
    if (e.dead || isBoss(e)) continue;
    if (!overlap({ x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h }, hb(e))) continue;
    if (e.kind === 'tourist') { moveX(P, (P.x < e.x ? -1 : 1) * 30 * dt); continue; }  // excuse me
    if (e.kind === 'cone' && e.state === 'cone') continue;                              // it is just a cone
    if (e.kind === 'wisp') {
      if (P.napT <= 0 && P.napImmune <= 0 && P.invuln <= 0) {
        P.napT = 3; P.napImmune = 4.5;           // 3 s asleep, then 1.5 s you can't be put back under
        e.dead = true;                           // its pollen is spent
        SFX.sneeze(); toast('...ZZZ'); burst(e.x, e.y - 4, PAL.y, 14);
      }
      continue;
    }
    if (e.kind === 'grackle' && P.invuln <= 0 && G.xp > 0) { loseXp(4); toast('THE GRACKLE TOOK YOUR XP'); }
    damagePlayer(1, e.x);   // bumping a knight is a shove; the cart is the weapon
  }

  updatePickupsSide(dt);
  hitChests({ x: P.x, y: P.y - P.h / 2, w: P.w + 4, h: P.h });
}

// Some doors want something from you first.
function doorGate(from, link) {
  const target = Array.isArray(link) ? link[0] : link;
  if (target === 'cedar' && G.medals < MEDALS) {
    say(['SIX PINS ON THE SASH. YOU HAVE ' + G.medals + '.',
         'THE DOOR IS NOT BEING DIFFICULT.',
         'THE DOOR IS BEING SPECIFIC.']);
    return false;
  }
  if (target === 'shadow' && !G.bossCedar) {
    say(['THE DOOR AT THE FAR END IS SHUT.',
         'SOMETHING ENORMOUS IS STILL IN THE WAY.']);
    return false;
  }
  if (target === 'stacks' && !G.examPassed) {
    startExam();
    return false;
  }
  if (target === 'st_rocket' && !G.gaveWater) {
    say(['LOCKED. A NOTE ON THE DOOR:', 'ASK MY WIFE. SHE IS IN THE GARDEN.']);
    return false;
  }
  return true;
}

// ---------------- NPCs ----------------
// Marisa is asleep and still running the operation.
function marisaClue() {
  if (G.hasRose) return null; // handled as the ending
  if (!G.metHoa) return ['MARISA (ASLEEP): "GREG, ON YOUR WAY—"', 'AND THAT WAS IT. FOUR WORDS.',
    'THE HOA PRESIDENT IS BY THE DOOR AND HE',
    'HAS A DOCUMENT. HE ALWAYS HAS A DOCUMENT.'];
  if (!G.jumpKnown && !G.bossRim) return ['MARISA (ASLEEP): "...THE GATES ARE TALLER',   // a hint, not a toll: she moves on after the Rim
    'UP NORTH. ASK THE MAN AT THE NINTH TEE."',
    'SHE ROLLS OVER. STONE OAK, THEN.'];
  if (!G.bossRim) return ['MARISA (ASLEEP): "...PARK ON FOUR. THE BIRDS',
    'OWN THE LOT AFTER SIX."',
    'THE RIM. GO WEST.'];
  if (!G.hasJackhammer) return ['MARISA (ASLEEP): "...THEY CLOSED 281 AGAIN.',
    'THE GARAGE CREW AT THE RIM HAS A JACKHAMMER."',
    'THE CITY IS PAST THE INTERCHANGE.'];
  if (!G.hasNote) return ['MARISA (ASLEEP): "...THE ABUELA AT THE PEARL',
    'FIXES EVERYTHING. AND THERE IS A MAN BY THE',
    'WATER WHOSE NAME IS A TYPO. GET HIS NOTE."'];
  if (!G.bossRiver) return ['MARISA (ASLEEP): "...THE HORN LANDS ON ONE',
    'AND THREE. YOU KNOW WHAT TO DO WITH TWO',
    'AND FOUR." SHE TAPS THE COUCH. TWICE.'];
  if (!G.bossZoo) return ['MARISA (ASLEEP): "...THEY ARE NOT MEAN,',
    'THEY ARE STUFFED UP. BONK THEM GENTLY."',
    'THE ZOO. AND STAY ON THE FOOTBRIDGE.'];
  if (!G.hasKeystone) return ['MARISA (ASLEEP): "...THE STACKS GO DOWN',
    'FURTHER THAN THE SCHOOL GOES UP. ANSWER THE',
    'DOOR HONESTLY." SHE SNIFFS.'];
  if (!G.bossStacks) return ['MARISA (ASLEEP): "...SOMETHING LIVES UNDER THE',
    'BOTTOM SHELF. IT IS LOW AND IT IS FAST.',
    'GET LOW, GREG." SHE CURLS UP SMALLER.'];
  if (!G.hasMaglite) return ['MARISA (ASLEEP): "...THE LIBRARIAN KEEPS A',
    'MAGLITE BEHIND THE LAST SHELF. SHE WILL NOT',
    'MISS IT. SHE HAS THREE."'];
  if (!G.bossCaverns) return ['MARISA (ASLEEP): "...THE CAVERNS, UP PAST THE',
    'HILLS. NO LIGHTS DOWN THERE. THE BATS LEAVE AT',
    'DUSK AND COME BACK IN A MOOD."'];
  if (!G.bossMissions) return ['MARISA (ASLEEP): "...ESPADA. THE MATACHINES',
    'DANCE IN THE ROAD AND THEY DO NOT STOP FOR CARS.',
    'THEY STOP FOR A SONG." SHE HUMS. BADLY.',
    'MARISA (ASLEEP): "...AND DO NOT TALK TO THE',
    'WOMAN BY THE WATER. EVERYBODY KNOWS THAT."'];
  if (!G.hasWaders) return ['MARISA (ASLEEP): "...THE ALAMO IS ACROSS THE',
    'LOW-WATER CROSSING. SOMEBODY LEFT WADERS ON THE',
    'RIVERWALK DOCK." SHE SNIFFS.'];
  if (!G.hasParking) return ['MARISA (ASLEEP): "...AND VALIDATE. GREG. THE ABUELA',
    'LEFT HER COOLER ON THE RIVERWALK. HER NEPHEW',
    'WORKS THE GARAGE." SHE SNIFFS.',
    'MARISA (ASLEEP): "...AND VALIDATE. GREG.',
    'VALIDATE THE PARKING. I MEAN IT."'];
  if (!G.washKnown && !G.bossCedar) {           // his crown only answers to rain, and the rain is three towns away
    if (!G.rocketKnown) return ['MARISA (ASLEEP): "...HIS CROWN WILL NOT FEEL',
      'A THING UNTIL IT RAINS. START WITH FIRE. THE',
      'FIREWORKS MAN IN SOUTHTOWN."'];
    if (!G.grackleKnown) return ['MARISA (ASLEEP): "...HELOTES IS UNDER THE HILLS',
      'BELOW THE RIM. BURN YOUR WAY TO THE MAN WHO',
      'FEEDS THE GRACKLES."'];
    if (!G.kidSaved) return ['MARISA (ASLEEP): "...THERE IS A KID ON THE CHAPEL',
      'ROOF IN LA VILLITA. HIS GREAT-GRANDFATHER',
      'CAN CALL THE RAIN." SHE SNIFFS.'];
    return ['MARISA (ASLEEP): "...A GULLYWASHER TAKES A BIG',
      'THERMOS, GREG." SHE SNIFFS. "A BIG ONE."'];
  }
  if (!G.bossCedar) return ['MARISA (ASLEEP): "...IT IS UNDER THE ALAMO.',
    'EVERYONE SAYS THERE IS NO BASEMENT.',
    'EVERYONE HAS NOT LOOKED."'];
  return ['MARISA (ASLEEP): "...ONE MORE ROOM.',
    'HE FIGHTS LIKE YOU BECAUSE HE IS YOU.',
    'SO STOP DOING THE THING YOU ALWAYS DO."'];
}

// Talk to whoever is closest. Everyone in town has something to say; some of them want something first.
function npcTalk() {
  const P = G.player;
  let n = null, best = 37;
  for (const m of G.npcs) {
    const d = Math.abs(m.x - P.x);
    if (d < best && Math.abs((m.y != null ? m.y : 11 * 16) - P.y) < 24) { n = m; best = d; }
  }
  if (n) (TALK[n.who] || TALK.lines)(n);
}
// a teacher hands over a spell
function learn(flag, i, then) {
  G[flag] = true; G.spellSel = i; SFX.levelup(); toast('LEARNED ' + SPELLS[i].name); save();
  if (then) then();
}
const TALK = {
  lines(n) { say(n.lines); },
  // the women in every Zelda II town, and here the neighbors: they fill you back up
  healer(n) {
    say(n.lines, () => {
      if (n.heal !== 'magic') G.hp = G.maxHp;
      if (n.heal !== 'life') G.mg = G.maxMg;
      SFX.heart();
      toast(n.heal === 'life' ? 'LIFE FULL' : n.heal === 'magic' ? 'MAGIC FULL' : 'LIFE AND MAGIC FULL');
    });
  },

  marisa() {
    if (G.hasRose) {
      say(['YOU PUT THE YELLOW ROSE ON THE PILLOW.',
           'THE CEDAR HAS FALLEN. THE CITY WAKES.',
           'MARISA OPENS HER EYES AND FINISHES',
           'THE SENTENCE: "—GRAB TACOS."',
           'YOU ALREADY DID. THEY ARE STILL WARM.'], () => {
        save(); G.state = 'win'; stopMusic(); SFX.fanfare();
      });
    } else say(marisaClue());
  },

  hoa() {
    if (!G.metHoa) {
      say(['HOA PRESIDENT: MR. GREG. ARTICLE NINE.',
           'LAWRENCE CREEK COVENANT, SUBSECTION C:',
           '"NO RESIDENT SHALL PERMIT A JUNIPER TO',
           'ROOT BENEATH A PROTECTED STRUCTURE."',
           'THE CEDAR KING IS IN VIOLATION.',
           'I HAVE CITED HIM. HE DID NOT RESPOND.',
           'SIX MEDALS OPEN THE DOOR DOWNTOWN.',
           'AND GREG — VALIDATE YOUR PARKING.'], () => { G.metHoa = true; SFX.unlock(); save(); });
    } else if (G.medals >= MEDALS) {
      say(['HOA PRESIDENT: SIX MEDALS. DOCUMENTED.',
           'I HAVE ALREADY FILED THE PAPERWORK FOR',
           'WHAT YOU ARE ABOUT TO DO.']);
    } else {
      say(['HOA PRESIDENT: MEDALS ON FILE: ' + G.medals + ' OF ' + MEDALS + '.',
           'I AM NOT RUSHING YOU. I AM DOCUMENTING YOU.']);
    }
  },

  // Stone Oak. Ruto's trophy is a putter here.
  golfpro() {
    if (G.jumpKnown) say(['RETIRED GOLF PRO: HIPS, GREG. HIPS.']);
    else if (!G.hasPutter) {
      say(['RETIRED GOLF PRO: YOU WANT THE JUMP? I',
           'TEACH IT WITH A PUTTER IN MY HAND, AND',
           'SOMETHING WITH FEATHERS TOOK MY PUTTER.',
           'THE CULVERT UNDER 1604. BRING IT BACK.']);
    } else {
      say(['RETIRED GOLF PRO: MY PUTTER. SCUFFED.',
           'GRACKLES. IT IS ALWAYS THE GRACKLES.',
           'SEE THAT GATE? THEY PUT IT UP IN 1998.',
           'I PLAY THROUGH IT. IT IS ALL IN THE HIPS.',
           'HERE: THE JUMP SPELL. Q SELECTS, L CASTS.',
           'TECHNICALLY THIS IS TRESPASSING.',
           'IT IS FINE. I KNOW THE BOARD.'], () => learn('jumpKnown', 1));
    }
  },

  // The Pearl. Saria's mirror is a molcajete here. Her stand feeds you either way.
  abuela() {
    if (!G.healKnown && G.hasMolcajete) {
      say(['ABUELA: MI MOLCAJETE. MIJO. GRACIAS.',
           'THE HEAL SPELL. IT IS NOT COMPLICATED,',
           'YOU JUST HAVE TO ACTUALLY STOP AND USE IT.',
           'NOW. WHAT DO YOU NEED.'], () => learn('healKnown', 0, openShop));
    } else if (!G.healKnown) {
      say(['ABUELA: SIENTATE. YOU LOOK TERRIBLE.',
           'I TEACH THE HEAL SPELL OVER FOOD, AND I',
           'CANNOT COOK WITHOUT MY MOLCAJETE.',
           'THE BOYS BORROWED IT FOR SALSA NIGHT IN',
           'THE OLD BREWHOUSE CELLAR. THEN THE ANTS',
           'MOVED IN. MIENTRAS: WHAT DO YOU NEED.'], () => openShop());
    } else if (G.hasRose) {
      say(['ABUELA: SHE IS AWAKE? BUENO.', 'BRING HER HERE. I WILL FEED HER.'], () => openShop());
    } else if (G.hasCooler && !G.hasParking) {
      say(['ABUELA: MY COOLER! MIJO, GRACIAS.', 'MY NEPHEW WORKS THE DOWNTOWN GARAGE.', 'ASK ME FOR THE VALIDATION.'], () => openShop());
    } else openShop();
  },

  sash(n) {
    const pal = n.palace;
    if (G.pinned[pal]) say(['THE SASH HOLDS ITS MEDAL.', 'THE ENTRANCE BEHIND IT HAS GONE QUIET.']);
    else if (G.carry[pal]) {
      G.pinned[pal] = true; G.medals++;
      SFX.fanfare(); G.freeze = 0.3; shake(3, 0.4);
      say(['YOU PIN THE MEDAL TO THE SASH.',
           'SOMEWHERE A BRASS BAND HITS ONE CHORD.',
           'MEDALS: ' + G.medals + ' OF ' + MEDALS + '.',
           'GO HOME. MARISA TALKS IN HER SLEEP.'], () => save());
    } else say(['A FIESTA FIGURE IN A SASH WITH ONE EMPTY PIN.', 'THE MEDAL IS AT THE TOP OF ' + PALACES[pal].name + '.']);
  },

  captain() {
    say(['BARGE CAPTAIN: BAGU SENT YOU. FINE.',
         'THE BARGES RUN THE WALKWAY. DO NOT FALL IN.',
         'AND DO NOT STAB THE TOURISTS. THEY TIP.']);
  },

  director() {
    if (!G.examPassed) say(['BAND DIRECTOR: ADMISSIONS FIRST.', 'THEN WE CAN TALK ABOUT YOUR HANDS.']);
    else if (!G.hasUp) {
      say(['BAND DIRECTOR: YOU PLAY? SHOW ME A DOWNSTROKE.',
           '...FINE. NOW THE OTHER HALF OF IT.',
           'THE UPSTROKE. IN THE AIR, HOLD UP,',
           'AND DRIVE THE STICK OVER YOUR HEAD.',
           'BIRDS HATE IT. SO DO CEILINGS.'], () => { G.hasUp = true; SFX.levelup(); toast('LEARNED UPSTROKE'); save(); });
    } else say(['BAND DIRECTOR: UP ON THE BEAT, GREG.']);
  },

  bagu() {
    if (!G.hasNote) {
      say(['I AM BAGU.',
           '...IT IS A PAYROLL TYPO. SAME HR MIGRATION',
           'THAT GOT A GUY NAMED ERROR AT A BODEGA',
           'BACK EAST. WE HAVE A GROUP CHAT.',
           'HERE. SHOW THIS TO THE BARGE CAPTAIN.',
           'THEY DO NOT RESPECT MUCH. THEY RESPECT ME.'], () => {
        G.hasNote = true; SFX.unlock(); toast("GOT BAGU'S NOTE"); save();
      });
    } else say(['I AM BAGU.', "THAT'S IT. THAT'S THE LORE."]);
  },

  // King William. Darunia's lost child is a blue heeler, and he is at the Missions gate.
  glassman() {
    if (G.shadeKnown) say(['AUTO-GLASS MAN: SHADE ON THE DASH, GREG.', 'EVERY TIME YOU PARK.']);
    else if (!G.hasDog) {
      say(['RETIRED AUTO-GLASS MAN: FORTY YEARS OF',
           'WINDSHIELDS. I KNOW A SPELL. IT IS THE',
           'ONLY THING IN THIS CITY THAT BEATS AUGUST.',
           'BUT MY DOG FOLLOWED THE MATACHINES DOWN',
           'TO ESPADA, AND I DO NOT TEACH ALONE.']);
    } else {
      say(['AUTO-GLASS MAN: CHATO. YOU FOUND HIM.',
           'SIT DOWN. BOTH OF YOU.',
           'SUNSHADE: UNTIL YOU LEAVE, WHATEVER YOUR',
           'STICK BLOCKS GOES BACK WHERE IT CAME FROM,',
           'FASTER, AND IT HURTS WHOEVER THREW IT.'], () => learn('shadeKnown', 6));
    }
  },
  dog(n) {
    if (G.hasDog) say(['CHATO LOOKS AT YOU LIKE HE ALWAYS KNEW', 'YOU WOULD COME. HE DID NOT.']);
    else say(['A BLUE HEELER WITH A KING WILLIAM TAG.', 'CHATO. HE HAS BEEN WAITING FOR A RIDE.'],
      () => { G.hasDog = true; SFX.unlock(); toast('CHATO IS COMING WITH YOU'); G.npcs = G.npcs.filter(m => m !== n); save(); });
  },
  // the West Side. New Kasuto's old woman wants to see how much you can hold.
  curandera() {
    if (G.limpiaKnown) say(['CURANDERA: THE EGG TAKES IT. YOU DO NOT', 'HAVE TO CARRY IT.']);
    else if (G.maxMg < 7) {
      say(['CURANDERA: SIT. I SEE IT ON YOU.',
           'A LIMPIA TAKES MORE THAN YOU CAN HOLD.',
           'COME BACK WHEN YOU CAN HOLD SEVEN.',
           'LEVEL YOUR MAGIC. FIND THE THERMOSES.']);
    } else {
      say(['CURANDERA: NOW YOU CAN HOLD IT.',
           'AN EGG, PASSED OVER EVERYTHING THAT WISHES',
           'YOU HARM. WHAT IS SMALL IS TAKEN. WHAT IS',
           'LEFT IS A CASCARON. BREAK IT. THAT IS LIMPIA.'], () => learn('limpiaKnown', 7));
    }
  },

  // Alamo Heights. Mido's sick child: the grandson has cedar fever, and Helotes has the honey.
  lifeguard() {
    if (G.spfKnown) say(['RETIRED LIFEGUARD: REAPPLY.']);
    else if (!G.hasHoney) {
      say(['RETIRED LIFEGUARD: THIRTY-ONE SUMMERS AT',
           'THE OLMOS BASIN POOL. I KNOW A SPELL.',
           'BUT MY GRANDSON HAS CEDAR FEVER, AND I',
           'DO NOT TEACH WHILE HE IS SNEEZING.',
           'LOCAL HONEY. THE BEEKEEPER IN HELOTES.']);
    } else {
      say(['RETIRED LIFEGUARD: HELOTES HONEY.',
           'YOU ACTUALLY WENT. SIT DOWN.',
           'THE SPELL IS SPF 50. THE HEAT CANNOT',
           'TOUCH YOU, AND BIG HITS HURT HALF, UNTIL',
           'YOU LEAVE WHERE YOU CAST IT. REAPPLY.'], () => learn('spfKnown', 2));
    }
  },
  grandson() {
    if (G.spfKnown) say(['GRANDSON: THE HONEY WAS GROSS.', 'I FEEL BETTER, THOUGH.']);
    else say(['GRANDSON: ACHOO.']);
  },

  // Southtown. Nabooru's fountain is the acequia, and the wife decides who goes in.
  gardener() {
    if (G.gaveWater) say(['GARDENER: THE TOMATOES SAY THANK YOU.']);
    else if (G.hasWater) {
      say(['GARDENER: FROM THE ACEQUIA. GOOD.',
           'GO ON IN. HE IS IN THE BACK, COUNTING',
           'WHAT IS LEFT OVER FROM JULY.'], () => { G.gaveWater = true; SFX.unlock(); save(); });
    } else {
      say(['GARDENER: IT IS AUGUST. MY TOMATOES ARE',
           'DYING. THE ACEQUIA RUNS AT THE END OF THE',
           'STREET. THE MISSIONS DUG IT. IT STILL RUNS.',
           'BRING ME WATER AND I WILL LET YOU IN',
           'TO SEE MY HUSBAND.']);
    }
  },
  acequia() {
    if (G.hasWater || G.gaveWater) say(['THE ACEQUIA RUNS THE WAY IT HAS RUN', 'SINCE THE SEVENTEEN-HUNDREDS.']);
    else {
      say(['THE ACEQUIA. COLD, SOMEHOW, AND OLDER',
           'THAN THE CITY. YOU FILL A BUCKET.'], () => { G.hasWater = true; SFX.splash(); toast('A BUCKET OF ACEQUIA WATER'); save(); });
    }
  },
  fireworks() {
    if (G.rocketKnown) say(['FIREWORKS MAN: POINT IT AWAY FROM YOUR FACE.']);
    else {
      say(['FIREWORKS MAN: SHE LET YOU IN? THEN YOU',
           'CARRIED THE WATER. RESPECT.',
           'EVERY JULY I SELL THESE OUTSIDE THE CITY',
           'LIMITS. THIS ONE I DO NOT SELL.',
           'BOTTLE ROCKET: UNTIL YOU LEAVE, EVERY',
           'STAB SENDS ONE DOWN THE LINE. MIND THE',
           'CEDAR. IT BURNS LIKE IT HAS BEEN WAITING.'], () => learn('rocketKnown', 3));
    }
  },

  // Helotes, the hidden town. New Kasuto's sage, behind cedar instead of a wall.
  beekeeper() {
    if (G.hasHoney) say(['BEEKEEPER: THE BEES DO NOT CARE ABOUT THE', 'CEDAR. THE BEES DO NOT HAVE SINUSES.']);
    else {
      say(['BEEKEEPER: LOCAL HONEY. A SPOON A DAY FOR',
           'A MONTH BEFORE THE CEDAR COMES.',
           'IT IS A LITTLE LATE FOR THAT.',
           'TAKE A JAR ANYWAY.'], () => { G.hasHoney = true; SFX.unlock(); toast('GOT LOCAL HONEY'); save(); });
    }
  },
  grackleman() {
    if (G.grackleKnown) say(['GRACKLE MAN: THEY ARE NOT PESTS.', 'THEY ARE PARKING LOT PEOPLE.']);
    else {
      say(['GRACKLE MAN: YOU BURNED MY CEDAR. GOOD.',
           'I HAVE FED THE GRACKLES FOR FORTY YEARS.',
           'THEY TAUGHT ME ONE THING. NOW I TEACH YOU.',
           'THE GRACKLE SPELL: YOU FLY UNTIL IT WEARS',
           'OFF. YOU CANNOT STAB. YOU CAN LOOK DOWN',
           'ON EVERYTHING, WHICH IS WHAT THEY LIKE.'], () => learn('grackleKnown', 4));
    }
  },

  // La Villita. Darunia's lost child is up on the chapel roof, and only something with wings gets there.
  roofkid(n) {
    say(['KID: ARE YOU A BIRD?',
         'I CAME UP TO WATCH FOR THE RAIN.',
         'I CANNOT GET DOWN.',
         'HE HOLDS ON TO YOUR BOOTS THE WHOLE WAY',
         'DOWN, AND RUNS HOME WITHOUT A WORD.'], () => {
      G.kidSaved = true; G.npcs = G.npcs.filter(m => m !== n); SFX.fanfare(); save();
    });
  },
  rainmaker() {
    const cost = spellCost(5);
    if (G.washKnown) say(['ABUELO: WHEN IT RAINS NOW, YOU WILL KNOW', 'SOMEBODY CALLED IT.']);
    else if (!G.kidSaved) {
      say(['ABUELO: MY GREAT-GRANDSON IS ON THE ROOF',
           'OF THE CHAPEL. HE WANTS TO SEE THE RAIN',
           'COME. I TEACH NOTHING UNTIL HE IS DOWN.']);
    } else if (G.maxMg < cost) {
      say(['ABUELO: MIJO. GRACIAS.',
           'I CAN CALL A GULLYWASHER, BUT IT TAKES',
           'A BIG THERMOS TO CARRY ONE: ' + cost + ' MAGIC.',
           'YOU CARRY ' + G.maxMg + '. COME BACK WITH MORE.']);
    } else {
      say(['ABUELO: MIJO. GRACIAS.',
           'THE CEDAR HATES ONE THING, AND IT IS RAIN.',
           'THE GULLYWASHER: EVERYTHING SMALL ON',
           'SCREEN GOES DOWN THE GUTTER. IT TAKES',
           'A LOT OF MAGIC. IT IS WORTH IT.',
           'AND THE KING UNDER THE ALAMO? HIS CROWN',
           'WILL NOT FEEL A THING UNTIL IT IS WASHED.'], () => learn('washKnown', 5));
    }
  }
};

// ---------------- Keystone entrance exam ----------------
const EXAM = {
  q: ['ADMISSIONS. ONE QUESTION. NO PHONES.',
      'I AM THE ONE STONE HOLDING THE ARCH UP.',
      'PULL ME AND THE WHOLE THING IS RUBBLE.',
      'WHAT AM I?'],
  opts: ['THE CORNERSTONE', 'THE KEYSTONE', 'THE CURB'],
  answer: 1
};
function startExam() { G.state = 'quiz'; G.quizSel = 0; SFX.blip(); }
function updateQuiz() {
  if (pressed.down) { G.quizSel = (G.quizSel + 1) % 3; SFX.blip(); }
  if (pressed.up) { G.quizSel = (G.quizSel + 2) % 3; SFX.blip(); }
  if (pressed.use || pressed.atk) {
    if (G.quizSel === EXAM.answer) {
      G.examPassed = true;
      SFX.unlock(); G.state = 'play';
      say(['CORRECT. THE DOOR OPENS INWARD,',
           'WHICH NOBODY EXPECTS.'], () => save());
    } else {
      SFX.deny(); G.state = 'play';
      say(['INCORRECT.', 'SEE YOU NEXT YEAR.']);
    }
  }
}

// ---------------- chests, keystone gate ----------------
function hitChests(box) {
  for (const c of G.chests) {
    if (c.opened) continue;
    if (overlap(box, { x: c.x, y: c.y - 4, w: 14, h: 10 })) {
      c.opened = true;
      G[c.id] = true;
      G.freeze = 0.15;
      SFX.fanfare();
      burst(c.x, c.y - 8, PAL.y, 14);
      if (c.id === 'chestScroll') {
        G.hasThrust = true;
        say(['YOU LEARNED THE DOWNTHRUST!',
             'HOLD DOWN IN MIDAIR AND RIDE THE STICK.',
             'EVERY LANDING IS A RIMSHOT.',
             "THE CEDAR KING'S CROWN LOOKS... BOUNCY."], () => save());
      } else if (c.id === 'chestMagic') {
        G.maxMg += 2; G.mg = G.maxMg;
        say(['A MAGIC CONTAINER. IT IS A THERMOS.',
             'MAX MAGIC UP.'], () => save());
      } else if (c.id === 'hasJackhammer') {
        say(['A JACKHAMMER, SIGNED OUT TO THE GARAGE CREW.',
             'THE 281 INTERCHANGE HAS BEEN CLOSED SINCE',
             'BEFORE YOU COULD DRIVE. NOT ANYMORE.'], () => save());
      } else if (c.id === 'hasWaders') {
        say(['A PAIR OF CHEST WADERS, STILL DAMP.',
             'THE LOW-WATER CROSSING DOWNTOWN',
             'WILL NOT STOP YOU NOW.'], () => save());
      } else if (c.id === 'hasCooler') {
        say(["THE ABUELA'S COOLER. STILL COLD, SOMEHOW.",
             'HER NEPHEW WORKS THE DOWNTOWN GARAGE.',
             'TAKE IT BACK TO THE PEARL.'], () => save());
      } else if (c.id === 'hasChamoy') {
        say(['A JAR OF CHAMOY FROM THE ZOO SNACK BAR.',
             'THE ABUELA WILL KNOW WHAT TO DO WITH IT.'], () => save());
      } else if (c.id === 'chestLife') {
        G.maxHp += 1; G.hp = G.maxHp;
        say(['A LIFE CONTAINER. MAX LIFE UP.',
             'THE PEACOCK WATCHES YOU TAKE IT',
             'AND SAYS NOTHING.'], () => save());
      } else if (c.id === 'hasPutter') {
        say(['A PUTTER, IN A GRACKLE NEST OF BOTTLE',
             'CAPS AND ONE GOLF BALL.',
             'THE GOLF PRO WILL WANT THIS BACK.'], () => save());
      } else if (c.id === 'hasMolcajete') {
        say(['THE MOLCAJETE. VOLCANIC ROCK, SEASONED',
             'SINCE BEFORE THE BREWERY CLOSED.',
             'HEAVIER THAN IT LOOKS. TAKE IT TO HER.'], () => save());
      } else if (c.id === 'hasMaglite') {
        say(["THE LIBRARIAN'S MAGLITE. FOUR D CELLS.",
             'HEAVY ENOUGH TO BE A SECOND STICK.',
             'THE CAVERNS UP NORTH ARE DARK. NOT ANYMORE.'], () => save());
      } else if (c.id === 'hasAccordion') {
        say(['A BUTTON ACCORDION IN A HARD CASE,',
             'LEFT BY A CONJUNTO THAT NEVER CAME BACK UP.',
             'THE MATACHINES AT ESPADA WILL WANT A SONG.'], () => save());
      } else if (c.id === 'thermosClub') {
        G.maxMg += 2; G.mg = G.maxMg;
        say(['A THERMOS ON THE CLUBHOUSE BAR.',
             'NO NAME ON IT. THE HOA WILL NOT MISS IT.',
             'MAX MAGIC UP.'], () => save());
      }
    }
  }
  const P = G.player;
  if (G.scene) {                                    // locked doors take a small key from this palace
    const tx = ((P.x + P.face * 8) / 16) | 0, ty = ((P.y - 8) / 16) | 0, pal = G.scene.palace;
    if (tileAt(tx, ty) === 'K') {
      if ((G.keys[pal] || 0) > 0) {
        G.keys[pal]--;
        G.opened[G.sceneName + ':' + tx] = true;
        for (let y = 0; y < ROWS; y++) if (G.scene.tiles[y][tx] === 'K') G.scene.tiles[y][tx] = ' ';
        SFX.unlock(); shake(2, 0.2); toast('UNLOCKED'); save();
      } else if (!G.gateMsgT || G.playTime - G.gateMsgT > 4) {
        G.gateMsgT = G.playTime;
        say(['LOCKED. A SMALL KEY WOULD DO IT.', 'SOMEWHERE ON THESE LEVELS THERE IS ONE.']);
      }
    }
  }
  if (!G.gateOpen && G.scene) {
    const tx = ((P.x + P.face * 8) / 16) | 0, ty = ((P.y - 8) / 16) | 0;
    if (tileAt(tx, ty) === 'G') {
      if (G.hasKeystone) {
        G.gateOpen = true;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < G.scene.w; x++) if (G.scene.tiles[y][x] === 'G') G.scene.tiles[y][x] = ' ';
        SFX.unlock(); shake(2, 0.2); toast('THE KEYSTONE FITS'); save();
      } else if (!G.gateMsgT || G.playTime - G.gateMsgT > 4) {
        G.gateMsgT = G.playTime;
        say(['LOCKED. NO KEYHOLE, NO HINGE, NO SIGN.',
             'SOMETHING AT KEYSTONE OPENS THIS.']);
      }
    }
  }
}

function breakBlocks(box) {
  let broke = false;
  const x0 = ((box.x - box.w / 2) / 16) | 0, x1 = ((box.x + box.w / 2) / 16) | 0;
  const y0 = ((box.y - box.h / 2) / 16) | 0, y1 = ((box.y + box.h / 2) / 16) | 0;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tileAt(tx, ty) !== 'B') continue;
    G.scene.tiles[ty][tx] = ' ';
    G.broken[G.sceneName + ':' + tx + ':' + ty] = true;
    burst(tx * 16 + 8, ty * 16 + 8, PAL.g, 10); SFX.boom(); shake(2, 0.15);
    broke = true;
  }
  if (broke) save();
  return broke;
}
// Cedar burns all at once: fire runs through a stand of it like it has been waiting to.
function burnBrush(tx, ty) {
  const q = [[tx, ty]];
  while (q.length) {
    const [x, y] = q.pop();
    if (tileAt(x, y) !== 'Y') continue;
    G.scene.tiles[y][x] = ' ';
    G.burnt[G.sceneName + ':' + x + ':' + y] = true;
    burst(x * 16 + 8, y * 16 + 8, PAL.o, 6); burst(x * 16 + 8, y * 16 + 8, PAL.y, 3);
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  SFX.boom(); shake(3, 0.3); toast('THE CEDAR GOES UP'); save();
}
// A bottle rocket flies the line you stabbed on, burns cedar, and minds the same guards your stick does.
function rocketFly(s) {
  const tx = (s.x / 16) | 0, ty = (s.y / 16) | 0;
  if (Math.random() < 0.6) G.parts.push({ x: s.x - Math.sign(s.vx) * 5, y: s.y, vx: -s.vx * 0.1, vy: -8, life: 0.25, color: PAL.y, sz: 1 });
  if (tileAt(tx, ty) === 'Y') { burnBrush(tx, ty); s.life = 0; return; }
  if (solidAt(tx, ty)) { s.life = 0; burst(s.x, s.y, PAL.y, 4); return; }
  for (const e of G.enemies) {
    if (e.dead || !overlap({ x: s.x, y: s.y, w: 6, h: 4 }, hb(e))) continue;
    s.life = 0;
    if (e.harmless || isBoss(e) || (e.kind === 'cone' && e.state === 'cone') || (e.kind === 'cartknight' && e.guardHi === s.high)) {
      SFX.clang(); burst(s.x, s.y, PAL.m, 4);
    } else damageEnemy(e, G.atk, s.x - s.vx);
    return;
  }
}

// a shot SUNSHADE sent back: it hurts whatever it meets, open or not, except bark and whatever is not all there
function backFly(s) {
  if (solidAt((s.x / 16) | 0, (s.y / 16) | 0)) { s.life = 0; burst(s.x, s.y, PAL.y, 3); return; }
  for (const e of G.enemies) {
    if (e.dead || e.harmless || !overlap({ x: s.x, y: s.y, w: 8, h: 6 }, hb(e))) continue;
    if (e.kind === 'llorona' && (e.state === 'fade' || e.state === 'appear')) continue;
    s.life = 0;
    if (e.kind === 'cedarking') { SFX.clang(); burst(s.x, s.y, PAL.b, 4); }
    else damageEnemy(e, G.atk, s.x - s.vx, { noKb: isBoss(e) });   // a stab's worth: an extra opening, not a bigger one
    return;
  }
}

function returnOver() {
  const r = G.returnPos;
  const h = outside('H');
  toOverworld(r ? r.x : h.x, r ? r.y : h.y);
}

// ---------------- enemies (side) ----------------
function cartStabbed(e, P) {
  const highStab = !P.crouch;
  if ((e.guardHi && highStab) || (!e.guardHi && !highStab)) {
    SFX.clang();
    burst(P.x + P.face * 14, P.y - (highStab ? 9 : 4), PAL.m, 4);
    P.kx = -P.face * 120;
  } else {
    damageEnemy(e, G.atk, P.x);
  }
}
function bossStabbed(e, P) {
  if (e.kind === 'cedarking') {   // bark. nothing but bark.
    SFX.clang(); burst(P.x + P.face * 14, P.y - 9, PAL.b, 4); P.kx = -P.face * 140;
    if (!e.barkT || G.playTime - e.barkT > 6) { e.barkT = G.playTime; toast('BARK. GO OVER THE TOP.'); }
    return;
  }
  if (e.kind === 'shadowgreg') {  // he has heard about crouching in the corner
    if (P.crouch === e.crouch) { SFX.clang(); burst(P.x + P.face * 14, P.y - (P.crouch ? 4 : 9), PAL.m, 4); P.kx = -P.face * 130; }
    else damageEnemy(e, G.atk, P.x, { noKb: true });
    return;
  }
  if (e.kind === 'llorona' && (e.state === 'fade' || e.state === 'appear')) return;   // the stick goes through
  if (e.open) damageEnemy(e, G.atk, P.x, { noKb: true });
  else { SFX.clang(); burst(P.x + P.face * 14, P.y - 9, PAL.m, 4); P.kx = -P.face * 140; }
}

function updateEnemy(e, dt) {
  const P = G.player;
  e.flash = Math.max(0, e.flash - dt);
  e.t += dt;
  if (e.kx) { moveX(e, e.kx * dt); e.kx *= Math.pow(0.001, dt); if (Math.abs(e.kx) < 5) e.kx = 0; }
  if (e.grav) {
    e.vy = Math.min((e.vy || 0) + 950 * dt, 330);
    if (moveY(e, e.vy * dt)) { if (e.vy > 0) e.onGround = true; e.vy = 0; }
    if (e.y > ROWS * 16 + 12 && !isBoss(e)) { toast('OVER THE EDGE'); killEnemy(e); return; }   // knocked into a pit
    else if (e.vy > 40) e.onGround = false;
  }
  const dx = P.x - e.x, adx = Math.abs(dx);
  e.iframe = Math.max(0, (e.iframe || 0) - dt);
  if (e.stunT > 0) { e.stunT -= dt; return; }   // hitstun: a clean hit buys you tempo

  if (e.kind === 'ant') {
    if (adx < 150) e.face = Math.sign(dx) || 1;
    else if (Math.random() < dt * 0.5) e.face = -e.face;
    if (pitAhead(e, e.face) || moveX(e, e.face * e.spd * dt)) e.face = -e.face;
    if (adx < 90 && e.vy === 0 && Math.random() < dt * 0.8) e.vy = -180;
  } else if (e.kind === 'grackle' || e.kind === 'bat') {
    if (e.state === 'idle') {
      e.x += Math.sin(e.t * 1.6) * 18 * dt;
      e.y = e.by + Math.sin(e.t * 2.2) * 8;
      if (adx < 110) {   // dive at where Greg is standing, then climb back slowly: that climb is your opening
        const ty = P.y - 4, d = Math.max(1, dist(e.x, e.y, P.x, ty));
        e.state = 'dive'; e.st = Math.min(1, d / 200 + 0.1);
        e.dv = [(P.x - e.x) / d * 200, (ty - e.y) / d * 200];
        SFX.screech();
      }
    } else if (e.state === 'dive') {
      e.st -= dt;
      moveX(e, e.dv[0] * dt); e.y += e.dv[1] * dt;
      if (e.st <= 0 || e.y > 11 * 16 - 4) e.state = 'rise';
    } else if (e.state === 'rise') {
      e.y -= 60 * dt;
      if (e.y <= e.by) { e.y = e.by; e.state = 'idle'; }
    }
  } else if (e.kind === 'wisp') {
    // drifts. glows. does not hurry.
    const d = Math.max(1, dist(e.x, e.y, P.x, P.y - P.h / 2));
    e.x += (P.x - e.x) / d * 22 * dt;
    e.y += (P.y - P.h / 2 - e.y) / d * 16 * dt + Math.sin(e.t * 3) * 10 * dt;
    if (Math.random() < dt * 2) G.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 12, vy: 8, life: 0.6, color: PAL.y, sz: 1 });
  } else if (e.kind === 'cone') {
    // some are just cones. some are not.
    if (e.state === 'cone') {
      if (e.live && adx < 46) { e.state = 'up'; e.st = 0.4; SFX.zap(); }
    } else if (e.state === 'up') {
      e.st -= dt;
      if (e.st <= 0) e.state = 'run';
    } else {
      e.face = Math.sign(dx) || 1;
      if (moveX(e, e.face * e.spd * dt)) e.face = -e.face;
    }
  } else if (e.kind === 'cartknight') {
    updateKnight(e, dt, dx, adx);
  } else if (e.kind === 'tourist') {
    if (Math.random() < dt * 0.4) e.face = -e.face;
    if (moveX(e, e.face * e.spd * dt)) e.face = -e.face;
  } else if (isBoss(e)) {
    updateBoss(e, dt, dx, adx);
  }
}

// ---------------- the Cart Knight: a stance duel ----------------
function updateKnight(e, dt, dx, adx) {
  const P = G.player, T = KNIGHT[e.tier];
  e.face = Math.sign(dx) || 1;
  e.atkCd -= dt; e.shoveT -= dt;
  // the cart follows the height of Greg's stick, one reaction-time behind (not while recovering: that's your opening)
  if (e.state === 'idle') {
    const want = !P.crouch;
    if (want !== e.guardHi) { e.readT += dt; if (e.readT >= T.react) { e.guardHi = want; e.readT = 0; } }
    else e.readT = 0;
  }
  if (e.state === 'wind') {                       // the tell: cart drawn back at the line it will come in on
    e.st -= dt;
    if (e.st <= 0) { e.state = 'thrust'; e.st = 0.12; e.hitDone = false; SFX.stab(); }
  } else if (e.state === 'thrust') {
    e.st -= dt;
    // high comes in at chest height and still catches a crouch — ducking is not a free answer, blocking is
    // same reach as Greg's stick (~25px center to center), so neither side can out-range the other
    const box = e.guardHi ? { x: e.x + e.face * 13, y: e.y - HIGH, w: 16, h: 7 } : { x: e.x + e.face * 13, y: e.y - LOW, w: 16, h: 5 };
    if (!e.hitDone && overlap(box, { x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h })) {
      e.hitDone = true;
      // same shield rule as everything else: standing blocks high, crouching blocks low, facing only
      const blocked = P.face === -e.face && (e.guardHi ? !P.crouch : P.crouch);
      if (blocked) { SFX.clang(); burst(P.x + P.face * 8, P.y - (e.guardHi ? 11 : 4), PAL.m, 5); P.kx = e.face * 110; e.kx = -e.face * 110; }
      else damagePlayer(2, e.x);
    }
    if (e.st <= 0) { e.state = 'recover'; e.st = 0.3; }
  } else if (e.state === 'recover') {
    e.st -= dt;
    if (e.st <= 0) { e.state = 'idle'; e.atkCd = T.cd; }
  } else {                                        // idle: hold dueling range, then commit
    if (adx > 22 && !pitAhead(e, e.face)) moveX(e, e.face * T.spd * dt);
    else if (adx < 16 && !pitAhead(e, -e.face)) moveX(e, -e.face * T.spd * dt);
    if (adx < 26 && e.atkCd <= 0) {
      // he attacks the line you are NOT blocking; the cart swinging over is the tell
      e.state = 'wind'; e.st = T.wind; e.guardHi = P.crouch; e.readT = 0;
    }
    if (T.shove && adx > 60 && adx < 180 && e.shoveT <= 0) {   // corral knights send a loose cart down the floor
      e.shoveT = 3;
      G.shots.push({ from: 'enemy', kind: 'cart', x: e.x + e.face * 10, y: e.y - 3, vx: e.face * 110, vy: 0, life: 2.5, t: 0, high: false });
      SFX.clang();
    }
  }
}

// ---------------- bosses ----------------
function bossWake(e, lines) {
  e.state = 'go'; e.st = 0.8;
  G.bossBar = e; G.bossName = BOSS[e.kind].name;
  shake(5, 0.5); music.speed = 1.25;
  const B = BOSS[e.kind];
  if (B.theme) { music.track = null; playMusic(B.theme); music.speed = 1; }   // a boss with a song of its own
  if (e.kind === 'mariachi') {        // his beat is read off the audio clock so they can't drift
    e.t0 = AC ? music.nextT : null; e.clock = 0; e.beat = 3; e.half = -1;
  }
  say(lines);
}
// Every boss turns at half health: a beat of freeze, a roar, one new rule.
function bossPhase(e) {
  if (e.phase2 || e.hp > e.maxHp / 2) return;
  e.phase2 = true;
  G.freeze = 0.3; shake(6, 0.6); SFX.roar(); e.flash = 0.4;
  if (BOSS[e.kind].theme2) { music.track = null; playMusic(BOSS[e.kind].theme2); music.speed = 1; }
  toast({ grackleprince: 'HE CALLS THE WHOLE LOT', mariachi: 'THE BAND PICKS UP', hippo: 'HE IS WIDE AWAKE NOW',
          silverfish: 'IT TURNS AROUND AT THE WALL NOW', brackenbat: 'THE COLONY WAKES UP', llorona: 'SHE CRIES TWICE NOW',
          cedarking: 'THE CROWN BEGINS TO SWAY', shadowgreg: 'HE IS CATCHING UP TO YOU' }[e.kind]);
}
function updateBoss(e, dt, dx, adx) {
  const P = G.player;
  if (e.state === 'sleep') {
    if (adx < 150) {
      if (e.kind === 'grackleprince') { SFX.screech(); bossWake(e, ['EVERY LIGHT POLE IN THE LOT GOES QUIET.', 'THE GRACKLE PRINCE DROPS OFF THE SIGN', 'AND LANDS ON A MINIVAN LIKE HE OWNS IT.', 'HE DOES OWN IT.']); }
      else if (e.kind === 'mariachi') { SFX.trumpet(); bossWake(e, ['A BARGE COMES AROUND THE BEND WITH', 'NOBODY DRIVING IT.', 'THE MARIACHI OF THE DEEP LIFTS THE HORN.', 'HE PLAYS ON ONE AND ON THREE.', 'YOU ARE A DRUMMER. COUNT.']); }
      else if (e.kind === 'hippo') { SFX.rustle(); bossWake(e, ['THE POOL SURFACE BULGES AND SETTLES.', 'HE IS NOT ANGRY. HE IS CONGESTED.', 'STAY ON THE FOOTBRIDGE.']); }
      else if (e.kind === 'silverfish') { SFX.rustle(); bossWake(e, ['THE BOTTOM SHELF IS NOT A SHELF.', 'IT IS THE SILVERFISH, AS LONG AS A CANOE,', 'AND IT HAS BEEN EATING THE BINDINGS SINCE 1948.', 'IT IS LOW. YOUR STICK IS NOT.']); }
      else if (e.kind === 'brackenbat') { SFX.screech(); bossWake(e, ['THE CEILING PEELS OFF IN ONE PIECE.', 'THE BRACKEN BAT. TWENTY MILLION BATS', 'LIVE UP THE ROAD, AND THIS IS THEIR MOTHER.', 'WHEN SHE SCREAMS, SHE IS AIMING.']); }
      else if (e.kind === 'llorona') { SFX.rustle(); bossWake(e, ['A WOMAN IN WHITE, AT THE EDGE OF THE ACEQUIA.', 'SHE IS LOOKING FOR HER CHILDREN.', 'SHE HAS BEEN LOOKING SINCE BEFORE THE MISSION.', 'SHE THINKS YOU KNOW WHERE THEY ARE.']); }
      else if (e.kind === 'cedarking') { SFX.roar(); bossWake(e, ['THE BASEMENT THAT DOES NOT EXIST.', 'THE CEDAR KING FILLS IT ROOT TO CEILING,', 'OLD AND ENORMOUS AND EXTREMELY PLEASED.', '"SHE SLEEPS WELL," HE SAYS.', 'HIS CROWN IS CAKED GOLD WITH POLLEN.', 'NOTHING GETS THROUGH THAT BUT RAIN.']); }
      else { SFX.roar(); bossWake(e, ['THE LAST CHAMBER HAS ONE PERSON IN IT.', 'HE KNOWS EVERYTHING YOU KNOW.', 'HE HAS YOUR STICK.', 'HE ALSO KNOWS THE CORNER TRICK.']); }
    }
    return;
  }
  bossPhase(e);
  if (e.kind === 'grackleprince') updateGracklePrince(e, dt, dx, adx);
  else if (e.kind === 'mariachi') updateMariachi(e, dt, dx, adx);
  else if (e.kind === 'hippo') updateHippo(e, dt, dx, adx);
  else if (e.kind === 'silverfish') updateSilverfish(e, dt, dx, adx);
  else if (e.kind === 'brackenbat') updateBrackenBat(e, dt, dx, adx);
  else if (e.kind === 'llorona') updateLlorona(e, dt, dx, adx);
  else if (e.kind === 'cedarking') updateCedarKing(e, dt, dx, adx);
  else if (e.kind === 'shadowgreg') updateShadowGreg(e, dt, dx, adx);
}

// Low and fast. A standing stab goes over it; crouch, or come down on it. It rears (the tell) and commits to where you
// were standing: it runs through that spot (jump it), skids a little past, and lies stunned: that is the opening.
// Phase 2: it turns at the end of the run and comes back through once more.
function updateSilverfish(e, dt, dx, adx) {
  const P = G.player;
  e.st -= dt;
  e.open = e.state === 'dazed';
  if (e.state === 'go') {
    e.face = Math.sign(dx) || 1;
    if (adx > 44) moveX(e, e.face * (e.phase2 ? 80 : 55) * dt);
    if (e.st <= 0) { e.state = 'rear'; e.st = e.phase2 ? 0.35 : 0.5; e.mark = P.x; SFX.rustle(); }
  } else if (e.state === 'rear') {
    if (e.st <= 0) { e.state = 'dash'; e.st = 1.8; SFX.zap(); }
  } else if (e.state === 'dash') {
    const wall = moveX(e, e.face * 250 * dt);
    if (Math.random() < dt * 30) G.parts.push({ x: e.x - e.face * 14, y: e.y - 1, vx: -e.face * 20, vy: -10, life: 0.3, color: PAL.m, sz: 1 });
    if (wall || e.st <= 0 || (e.x - e.mark) * e.face >= 56) {   // the wall, or a skid's length past where you were
      if (wall) { shake(3, 0.2); SFX.clang(); }
      if (e.phase2 && !e.turned) { e.turned = true; e.face = -e.face; e.state = 'rear'; e.st = 0.25; }
      else { e.turned = false; e.state = 'dazed'; e.st = e.phase2 ? 1.1 : 1.4; }
    }
  } else if (e.state === 'dazed') {
    if (e.st <= 0) { e.state = 'go'; e.st = 1.0 + Math.random() * 0.8; }
  }
  if (e.state !== 'dazed' && overlap(hb(e), { x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h })) damagePlayer(e.state === 'dash' ? 2 : 1, e.x);
  // a standing stab goes clean over it, and nothing tells you why; this does
  if (e.state === 'dazed' && P.stabT > 0 && !P.crouch && P.onGround && adx < 40 && (!e.hintT || G.playTime - e.hintT > 6)) { e.hintT = G.playTime; toast('IT IS UNDER YOUR STICK. GET LOW.'); }
}

// She hangs at the ceiling, screams (the tell: she is taking aim), and swoops through where you stood.
// At the bottom of the swoop she lands, winded: that is the opening. Phase 2: every scream wakes a few of the colony.
function updateBrackenBat(e, dt, dx, adx) {
  const P = G.player, top = 4 * 16, floorY = 11 * 16;
  e.st -= dt;
  e.open = e.state === 'rest';
  if (e.state === 'go') {
    e.y += clamp(top + Math.sin(e.t * 3) * 6 - e.y, -90 * dt, 90 * dt);
    e.x += clamp(P.x - e.x, -60 * dt, 60 * dt);
    if (e.st <= 0 && Math.abs(e.y - top) < 10) {
      e.state = 'screech'; e.st = e.phase2 ? 0.35 : 0.55; e.mark = P.x; SFX.screech();
      if (e.phase2) {
        const colony = G.enemies.filter(b => b.kind === 'bat' && !b.dead).length;
        for (let i = colony; i < Math.min(3, colony + 2); i++) spawnEnemy('bat', e.x + (i % 2 ? 50 : -50), 5 * 16 + 40);
      }
    }
  } else if (e.state === 'screech') {
    if (e.st <= 0) { e.state = 'swoop'; e.dur = e.phase2 ? 0.6 : 0.75; e.st = e.dur; e.x0 = e.x; e.y0 = e.y; }
  } else if (e.state === 'swoop') {           // one dive, onto the spot you were standing on when she screamed
    const u = 1 - Math.max(0, e.st) / e.dur;
    e.x = e.x0 + (e.mark - e.x0) * u;
    e.y = e.y0 + (floorY - e.y0) * u * u;
    if (u >= 1) { e.state = 'rest'; e.y = floorY; e.st = e.phase2 ? 0.9 : 1.2; shake(3, 0.2); dustPuff(e.x, e.y); }
  } else if (e.state === 'rest') {
    if (e.st <= 0) { e.state = 'go'; e.st = 1.2 + Math.random() * 0.6; SFX.screech(); }
  }
  e.face = Math.sign(dx) || 1;
  e.x = clamp(e.x, 24, G.scene.w * 16 - 24);
  if (e.state === 'swoop' && overlap(hb(e), { x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h })) damagePlayer(2, e.x);   // only the dive hurts: taking off is not an attack
}

// She drifts toward you, and cries: high or low, and the ! shows which (stand and face her for high, crouch for low).
// Then she reaches for you, and stops to weep: that is the opening. Sometimes she is simply somewhere else.
function updateLlorona(e, dt, dx, adx) {
  const P = G.player, floorY = 11 * 16;
  e.st -= dt;
  e.open = e.state === 'weep';
  e.y = floorY - 3 + Math.sin(e.t * 2) * 2;             // she does not touch the ground
  const cry = (hi) => { G.shots.push({ from: 'enemy', kind: 'cry', x: e.x + e.face * 8, y: hi ? P.y - HIGH : P.y - 3, vx: e.face * 150, vy: 0, life: 2.2, t: 0, high: hi }); SFX.screech(); };
  if (e.state === 'go') {
    e.face = Math.sign(dx) || 1;
    if (adx > 60) moveX(e, e.face * 30 * dt);
    if (adx < 44) { e.state = 'fade'; e.st = 0.4; return; }   // she does not let you close
    if (e.st <= 0) {
      if (Math.random() < 0.3) { e.state = 'fade'; e.st = 0.4; }
      else { e.state = 'wail'; e.st = e.phase2 ? 0.45 : 0.6; e.hi = Math.random() < 0.5; }
    }
  } else if (e.state === 'wail') {          // high or low, and the tell says which. Phase 2: that one, then the other
    if (e.st <= 0 && !e.cried) { e.cried = true; cry(e.hi); if (e.phase2) e.second = 0.35; }
    if (e.second > 0 && (e.second -= dt) <= 0) cry(!e.hi);
    if (e.cried && e.st <= -0.35) { e.cried = false; e.second = 0; e.state = 'reach'; e.st = 0.5; e.face = Math.sign(dx) || 1; }
  } else if (e.state === 'reach') {
    moveX(e, e.face * 170 * dt);
    if (e.st <= 0) { e.state = 'weep'; e.st = e.phase2 ? 0.8 : 1.0; }
  } else if (e.state === 'weep') {
    if (e.st <= 0) { e.state = 'go'; e.st = 0.6 + Math.random() * 0.6; }
  } else if (e.state === 'fade') {           // gone, and back on the other side of you
    if (e.st <= 0) {
      e.x = clamp(P.x - (Math.sign(dx) || 1) * 80, 40, G.scene.w * 16 - 40);
      e.state = 'appear'; e.st = 0.45; e.face = Math.sign(P.x - e.x) || 1;
    }
  } else if (e.state === 'appear') {
    if (e.st <= 0) { e.state = 'wail'; e.st = 0.5; e.hi = Math.random() < 0.5; }
  }
  e.x = clamp(e.x, 24, G.scene.w * 16 - 24);
  const solid = e.state !== 'weep' && e.state !== 'fade' && e.state !== 'appear';
  if (solid && overlap(hb(e), { x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h })) damagePlayer(e.state === 'reach' ? 2 : 1, e.x);
}

// He calls the whole parking lot.
function updateGracklePrince(e, dt, dx, adx) {
  const P = G.player;
  e.st -= dt;
  e.open = (e.state === 'rest');
  const aim = () => { e.state = 'aim'; e.st = e.phase2 ? 0.3 : 0.45; e.mark = P.x; SFX.screech(); };
  if (e.state === 'go') {
    e.y = 5 * 16 + Math.sin(e.t * 2) * 10;
    e.x += Math.sign(dx) * 40 * dt;
    if (e.st <= 0) {
      const flock = G.enemies.filter(g => g.kind === 'grackle' && !g.dead).length;
      if (Math.random() < (e.phase2 ? 0.45 : 0.3) && flock < 3) { e.state = 'call'; e.st = 0.9; } else aim();
    }
  } else if (e.state === 'aim') {           // the tell: his shadow on the asphalt where he will land
    e.y -= 20 * dt;
    if (e.st <= 0) { e.state = 'dive'; e.dvx = (e.mark - e.x) / Math.max(0.2, (11 * 16 - e.y) / 210); }
  } else if (e.state === 'dive') {
    e.x += e.dvx * dt;
    e.y += 210 * dt;
    if (e.y >= 11 * 16 - 2) { e.y = 11 * 16; e.state = 'rest'; e.st = e.phase2 ? 0.8 : 1.1; shake(4, 0.2); dustPuff(e.x, e.y); e.dives = (e.dives || 0) + 1; }
  } else if (e.state === 'rest') {
    if (e.st <= 0) {
      if (e.phase2 && e.dives % 2 === 1) { e.y = 11 * 16 - 60; aim(); }   // phase 2: straight back up and down again
      else { e.state = 'go'; e.st = 0.9 + Math.random() * 0.6; }
    }
  } else if (e.state === 'call') {
    if (Math.random() < dt * 12) burst(e.x, e.y - 10, PAL.j, 1);
    if (e.st <= 0) {
      SFX.screech(); shake(3, 0.3);
      const flock = G.enemies.filter(g => g.kind === 'grackle' && !g.dead).length;
      for (let i = flock; i < Math.min(3, flock + 2); i++) spawnEnemy('grackle', e.x + (i % 2 ? 40 : -40), 4 * 16 + 40);
      e.state = 'go'; e.st = 1.0;
    }
  }
  e.face = Math.sign(dx) || 1;
  e.x = clamp(e.x, 24, G.scene.w * 16 - 24);
  if (overlap(hb(e), { x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h })) damagePlayer(2, e.x);
}

// One and three are his. Two and four are yours.
const MARIACHI_BEAT = 60 / 130.4;
function updateMariachi(e, dt, dx, adx) {
  const P = G.player;
  e.clock = (e.clock || 0) + dt;
  const now = e.t0 != null && AC ? AC.currentTime - e.t0 : e.clock;   // audio clock when there is one: hitstop can't knock him off the beat
  const half = Math.floor(now / MARIACHI_BEAT * 2);
  if (half !== e.half && now >= 0) {
    e.half = half;
    const onBeat = half % 2 === 0, beat = (half >> 1) % 4;
    const blast = (hi) => {
      G.shots.push({ from: 'enemy', x: e.x, y: hi ? P.y - HIGH : P.y - 3, vx: Math.sign(dx) * 150, vy: 0, life: 2, t: 0, high: hi });
      SFX.trumpet(); e.open = false;
    };
    if (onBeat) {
      e.beat = beat;
      SFX.tick(beat === 0);
      if (beat === 0 || beat === 2) { e.hi = e.phase2 ? Math.random() < 0.5 : !e.hi; blast(e.hi); }
      else e.open = true;   // horn down. this is your bar.
    } else if (e.phase2 && beat === 3) blast(!e.hi);   // phase 2: the & of 4, on the other line
  }
  e.face = Math.sign(dx) || 1;
  if (adx > 50) moveX(e, e.face * 26 * dt);         // he holds you inside stick range: the fight is the timing, not the chase
  else if (adx < 18) moveX(e, -e.face * 26 * dt);
  e.x = clamp(e.x, 19 * 16 + 8, 28 * 16);          // he stays on his own planks
  if (overlap(hb(e), { x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h })) damagePlayer(1, e.x);
}

// Fought from a footbridge, between surfacings. He comes up through the gaps in the planks.
const HIPPO_GAPS = [10 * 16, 16 * 16, 22 * 16];
function updateHippo(e, dt, dx, adx) {
  const P = G.player;
  e.st -= dt;
  e.open = (e.state === 'stuck');
  const nearest = HIPPO_GAPS.reduce((a, g) => Math.abs(g - P.x) < Math.abs(a - P.x) ? g : a);
  if (e.state === 'go') {
    e.y = 10 * 16 + 8;
    e.gap = nearest;
    e.x += clamp(e.gap - e.x, -70 * dt, 70 * dt);
    if (Math.random() < dt * 8) G.parts.push({ x: e.x + (Math.random() - 0.5) * 26, y: 9 * 16, vx: 0, vy: -14, life: 0.5, color: PAL.m, sz: 1 });
    if (e.st <= 0 && Math.abs(e.x - e.gap) < 3) {
      e.state = 'warn'; e.st = 0.75; e.bubbleAt = e.x;
      // phase 2: the bubbles are at one gap, he comes up at the next one over
      if (e.phase2 && Math.random() < 0.6) { const others = HIPPO_GAPS.filter(g => g !== e.gap); e.gap = others.reduce((a, g) => Math.abs(g - P.x) < Math.abs(a - P.x) ? g : a); }
    }
  } else if (e.state === 'warn') {
    if (Math.random() < dt * 30) G.parts.push({ x: e.bubbleAt + (Math.random() - 0.5) * 30, y: 9 * 16, vx: 0, vy: -34, life: 0.5, color: PAL.w, sz: 2 });
    if (e.st < 0.2 && Math.random() < dt * 40) G.parts.push({ x: e.gap + (Math.random() - 0.5) * 20, y: 9 * 16, vx: 0, vy: -50, life: 0.3, color: PAL.c, sz: 2 });  // the real tell, late
    e.x += clamp(e.gap - e.x, -300 * dt, 300 * dt);
    if (e.st <= 0) { e.x = e.gap; e.state = 'lunge'; e.st = 0.45; SFX.rustle(); shake(3, 0.2); }
  } else if (e.state === 'lunge') {
    e.y = Math.max(6 * 16 + 4, e.y - 330 * dt);
    if (e.st <= 0) { e.state = 'stuck'; e.st = 1.2; }
  } else if (e.state === 'stuck') {
    // he surfaces, fills his cheeks (the tell), and spouts along the planks at ankle height
    e.sprayT = (e.sprayT == null ? 0.35 : e.sprayT) - dt;
    if (e.sprayT <= 0 && !e.sprayed) {
      e.sprayed = true; SFX.splash();
      const dirs = e.phase2 ? [-1, 1] : [Math.sign(dx) || 1];
      for (const d of dirs) G.shots.push({ from: 'enemy', kind: 'spray', x: e.x + d * 16, y: 6 * 16 - 3, vx: d * 170, vy: 0, life: 1.6, t: 0, high: false });
    }
    if (e.st <= 0) { e.state = 'sink'; e.st = 0.7; e.sprayT = null; e.sprayed = false; }
  } else if (e.state === 'sink') {
    e.y = Math.min(10 * 16 + 8, e.y + 260 * dt);
    if (e.st <= 0) { e.state = 'go'; e.st = 1.4 + Math.random() * 0.8; SFX.splash(); }
  }
  e.face = Math.sign(dx) || 1;
  e.x = clamp(e.x, 40, G.scene.w * 16 - 40);
  if (e.state !== 'go' && overlap(hb(e), { x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h })) damagePlayer(2, e.x);
}

// Rooted. Immune to everything except the top of him.
function updateCedarKing(e, dt, dx, adx) {
  const P = G.player;
  e.st -= dt;
  if (e.state === 'go') {
    if (e.st <= 0) {
      const r = Math.random();
      e.state = e.phase2 && r < 0.4 ? 'sway' : r < 0.7 ? 'shake' : 'roots';
      e.st = { shake: 1.0, roots: 0.8, sway: 0.75 }[e.state];
      if (e.state === 'roots') e.rx = P.x;
    }
  } else if (e.state === 'sway') {                 // crown leans back (the tell), then sweeps the air around it
    if (e.st <= 0.25 && !e.blew) {
      e.blew = true; SFX.rustle(); shake(3, 0.25);
      if (!P.onGround && P.y < e.y - 30 && Math.abs(P.x - e.x) < 46) { damagePlayer(1, e.x); P.vy = 60; P.thrusting = false; }
    }
    if (e.st <= 0) { e.blew = false; e.state = 'go'; e.st = 1.0; }
  } else if (e.state === 'shake') {
    if (e.st > 0.45) { if (Math.random() < dt * 20) burst(e.x + (Math.random() - 0.5) * 34, e.y - 30, PAL.y, 1); }
    else if (!e.blew) {
      e.blew = true;
      G.pollenT = 0.8; shake(4, 0.5); SFX.rustle();
      const wisps = G.enemies.filter(w => w.kind === 'wisp' && !w.dead).length;
      for (let i = wisps; i < 3; i++) spawnEnemy('wisp', e.x - 40 - i * 26, e.y - 40);   // never more than 3 up
      // the wave goes over a crouch. that is the read.
      if (!P.crouch) damagePlayer(1, e.x);
    }
    if (e.st <= 0) { e.blew = false; e.state = 'go'; e.st = 1.3; }
  } else if (e.state === 'roots') {
    if (e.st > 0.35) {
      if (Math.random() < dt * 24) G.parts.push({ x: e.rx + (Math.random() - 0.5) * 16, y: 11 * 16, vx: 0, vy: -20, life: 0.4, color: PAL.b, sz: 2 });
    } else if (!e.blew) {
      e.blew = true; SFX.boom(); shake(3, 0.3);
      burst(e.rx, 11 * 16 - 8, PAL.b, 12);
      if (Math.abs(P.x - e.rx) < 14 && P.onGround) damagePlayer(1, e.rx);
    }
    if (e.st <= 0) { e.blew = false; e.state = 'go'; e.st = 1.1; }
  }
  // no contact damage: he is a tree. He fights with the crown and the roots,
  // and you need to be able to stand under him to get on top of him.
}

// He has your stick and your muscle memory. About forty frames behind.
function updateShadowGreg(e, dt, dx, adx) {
  const P = G.player;
  const lag = e.phase2 ? 24 : 40;                 // phase 2: he's catching up to you
  const cmd = P.tape[Math.max(0, P.tape.length - lag)] || { mx: 0, jump: false, atk: false, crouch: false };
  e.crouch = cmd.crouch;
  e.h = cmd.crouch ? CROUCH_H : BODY_H;
  const mx = -cmd.mx;
  e.face = mx ? mx : (Math.sign(dx) || -1);
  if (!e.crouch) moveX(e, mx * 95 * dt);
  if (cmd.jump && e.onGround) { e.vy = -285; e.onGround = false; SFX.jump(); }
  e.stabT = Math.max(0, (e.stabT || 0) - dt);
  e.stabCd = Math.max(0, (e.stabCd || 0) - dt);
  if (cmd.atk && e.stabCd <= 0) { e.stabT = 0.16; e.stabCd = 0.28; SFX.stab(); }
  if (e.stabT > 0) {
    const sb = { x: e.x + e.face * 13, y: e.y - (e.crouch ? LOW : HIGH), w: 14, h: 5 };
    if (overlap(sb, { x: P.x, y: P.y - P.h / 2, w: P.w, h: P.h })) damagePlayer(2, e.x);
  }
  e.x = clamp(e.x, 20, G.scene.w * 16 - 20);
}

// Townsfolk walk their block, and stop and face you when you come up to them.
function updateNpcs(dt) {
  const P = G.player;
  for (const n of G.npcs) {
    if (!n.walk) continue;
    n.face = n.face || 1;
    if (Math.abs(n.x - P.x) < 40 && Math.abs((n.y != null ? n.y : 11 * 16) - P.y) < 24) { n.face = P.x < n.x ? -1 : 1; n.stop = true; continue; }
    n.stop = false;
    if ((n.pause = (n.pause || 0) - dt) > 0) continue;
    n.x += n.face * 16 * dt;
    if (n.x < n.walk[0] * 16 || n.x > n.walk[1] * 16) { n.x = clamp(n.x, n.walk[0] * 16, n.walk[1] * 16); n.face = -n.face; n.pause = 1 + Math.random() * 2; }
    else if (Math.random() < dt * 0.15) n.pause = 1 + Math.random() * 2;
  }
}

// ---------------- shots / pickups / parts / barges ----------------
function updateShots(dt) {
  const P = G.player;
  for (const s of G.shots) {
    s.t += dt; s.life -= dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.from === 'greg') { rocketFly(s); continue; }
    if (s.from === 'back') { backFly(s); continue; }
    if (solidAt((s.x / 16) | 0, (s.y / 16) | 0)) { s.life = 0; burst(s.x, s.y, PAL.y, 3); continue; }
    if (Math.abs(s.x - P.x) < 6 && Math.abs(s.y - (P.y - P.h / 2)) < P.h / 2 + 3) {
      // standing blocks high, crouching blocks low. Same rule everywhere in this game.
      const blocked = (s.high && !P.crouch && Math.sign(s.vx) !== P.face) ||
                      (!s.high && P.crouch && Math.sign(s.vx) !== P.face);
      if (blocked && G.shade) {                    // SUNSHADE: it goes back where it came from, a little faster
        s.from = 'back'; s.vx = -s.vx * 1.3; s.x += Math.sign(s.vx) * 8; s.life = 2;
        SFX.clang(); burst(s.x, s.y, PAL.y, 6);
        continue;
      }
      s.life = 0;
      if (blocked) { SFX.clang(); burst(s.x, s.y, PAL.m, 5); }
      else damagePlayer(1, s.x - s.vx);
    }
  }
  G.shots = G.shots.filter(s => s.life > 0);
}
function updatePickupsSide(dt) {
  const P = G.player;
  for (const p of G.pickups) {
    p.t += dt;
    p.vy = Math.min((p.vy || 0) + 700 * dt, 300);
    p.x += p.vx * dt;
    if (solidAt((p.x / 16) | 0, ((p.y + p.vy * dt) / 16) | 0)) { p.vy = 0; p.vx *= 0.8; }
    else p.y += p.vy * dt;
    const d = dist(p.x, p.y, P.x, P.y - P.h / 2);
    if (d < 30 && p.t > 0.3) { p.x += (P.x - p.x) / d * 160 * dt; p.y += (P.y - P.h / 2 - p.y) / d * 160 * dt; }
    if (d < 10 && p.t > 0.25) {
      p.dead = true;
      if (p.kind === 'skey') { G.gotKeys[p.id] = true; const pal = G.scene.palace; G.keys[pal] = (G.keys[pal] || 0) + 1; SFX.unlock(); toast('SMALL KEY'); save(); }
      else if (p.kind === 'pin') { G.pins[p.id] = true; G.lives++; SFX.fanfare(); toast('FIESTA PIN! +1 LIFE'); save(); }
      else if (p.kind === 'heart') { G.hp = Math.min(G.maxHp, G.hp + 1); SFX.heart(); }
      else if (p.kind === 'bigred') { G.mg = Math.min(G.maxMg, G.mg + 2); SFX.heart(); }
      else if (p.kind === 'cascaron') { gainXp(p.val || 5); toast('+' + (p.val || 5) + ' XP'); burst(p.x, p.y, PAL.p, 8); }
      else if (p.kind === 'medal') { SFX.fanfare(); }
      else if (p.kind === 'keystone') {
        G.hasKeystone = true; SFX.fanfare(); G.freeze = 0.15;
        say(['THE KEYSTONE.', 'IT IS WARM, WHICH NOBODY WARNED YOU ABOUT.',
             'IT OPENS THE DOOR UNDER DOWNTOWN.'], () => save());
      } else if (p.kind === 'rose') {
        SFX.fanfare(); G.freeze = 0.2;
        toast('TAKE IT HOME');
      }
    }
  }
  G.pickups = G.pickups.filter(p => !p.dead);
}
function updateParts(dt) {
  for (const p of G.parts) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 60 * dt;
  }
  G.parts = G.parts.filter(p => p.life > 0);
}
function updatePlats(dt) {
  for (const pl of G.plats) {
    if (pl.spd) {
      if (pl.wait > 0) pl.wait -= dt;          // lifts dwell at each floor so you can actually get on and off
      else {
        pl.y += pl.dir * pl.spd * dt;
        if (pl.y > pl.y1) { pl.y = pl.y1; pl.dir = -1; pl.wait = 1.2; }
        if (pl.y < pl.y0) { pl.y = pl.y0; pl.dir = 1; pl.wait = 1.2; }
      }
    }
    if (pl.hspd) {
      pl.x += pl.hdir * pl.hspd * dt;
      if (pl.x > pl.x1) { pl.x = pl.x1; pl.hdir = -1; }
      if (pl.x < pl.x0) { pl.x = pl.x0; pl.hdir = 1; }
    }
  }
}

// ---------------- overworld ----------------
// Some places want to see something before they let you in.
function locGate(ch) {
  if (ch === 'V' && !G.hasNote) {
    say(['THE BARGE CAPTAIN WAVES YOU OFF WITHOUT',
         'BREAKING EYE CONTACT WITH THE RIVER.',
         'THERE IS ONE MAN THEY LISTEN TO,',
         'AND HE IS STANDING AT THE PEARL.']);
    return false;
  }
  if (ch === 'A') {
    if (G.medals < MEDALS) {
      say(['THE SASH ON THE DOOR HAS SIX EMPTY PINS.',
           'YOU HAVE ' + G.medals + '.',
           'REMEMBER THE ALAMO. IT REMEMBERS YOU.']);
      return false;
    }
    if (!G.hasParking) {
      say(['DOWNTOWN. NO SPOTS. NONE. ANYWHERE.',
           'A GARAGE ARM LIFTS AND WAITS.',
           'YOU NEED PARKING VALIDATION.',
           'THE ABUELA AT THE PEARL SELLS IT.']);
      return false;
    }
  }
  if (ch === 'U' && !G.hasMaglite) {        // no lights down there, and no tour without one
    say(['THE CAVERN MOUTH BREATHES OUT COLD AIR.',
         'PAST THE FIRST TURN IT IS PERFECTLY DARK.',
         'NOT DIM. DARK. YOU NEED A LIGHT.']);
    return false;
  }
  if (ch === 'E' && !G.helotes) {           // the jackhammer finds the old road
    say(['THE JACKHAMMER GOES THROUGH A SHELF OF',
         'CALICHE, AND THERE IS A ROAD UNDER IT.',
         'HELOTES. IT WAS HERE THE WHOLE TIME.'], () => {
      G.helotes = true; save(); SFX.door(); fadeTo(() => enterScene('helotes', {}));
    });
    SFX.boom(); shake(3, 0.3);
    return false;
  }
  return true;
}
function updateOverworld(dt) {
  const A = G.avatar;
  A.t += dt;
  let mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const m = Math.hypot(mx, my);
  const px = A.x, py = A.y;
  if (m) {
    mx /= m; my /= m;
    if (mx) A.flip = mx < 0;
    A.vert = !mx;
    const nx = A.x + mx * 75 * dt, ny = A.y + my * 75 * dt;
    const bx = [overTile(((nx - 3) / 16) | 0, (A.y / 16) | 0), overTile(((nx + 3) / 16) | 0, (A.y / 16) | 0)];
    if (!overSolid(bx[0]) && !overSolid(bx[1])) A.x = nx; else barrier(bx);
    const by = [overTile((A.x / 16) | 0, ((ny - 3) / 16) | 0), overTile((A.x / 16) | 0, ((ny + 3) / 16) | 0)];
    if (!overSolid(by[0]) && !overSolid(by[1])) A.y = ny; else barrier(by);
  }
  G.ocamX = clamp(A.x - VW / 2, 0, OVER_W * 16 - VW);
  G.ocamY = clamp(A.y - (VH - HUD_H) / 2, 0, OVER_H * 16 - (VH - HUD_H));
  const ch = overTile((A.x / 16) | 0, (A.y / 16) | 0);
  if (LOC[ch]) {
    A.x = px; A.y = py;                       // step back off the icon: that's where you come back to
    G.returnPos = { x: px, y: py };
    if (!locGate(ch)) return;
    SFX.door();
    fadeTo(() => enterScene(LOC[ch], {}));
    return;
  }
  // the taco truck: the overworld's healing fairy. It parks nearby for a while, then drives off.
  G.truckT -= dt;
  if (!G.truck && G.truckT <= 0) {
    G.truckT = 40;
    for (let tries = 0; tries < 30; tries++) {
      const tx = ((A.x / 16) | 0) + ((Math.random() * 20) | 0) - 10, ty = ((A.y / 16) | 0) + ((Math.random() * 12) | 0) - 6;
      if (overTile(tx, ty) === 'R' && dist(tx * 16 + 8, ty * 16 + 8, A.x, A.y) > 60) { G.truck = { x: tx * 16 + 8, y: ty * 16 + 8, life: 20, t: 0 }; break; }
    }
  }
  if (G.truck) {
    G.truck.life -= dt; G.truck.t += dt;
    if (dist(G.truck.x, G.truck.y, A.x, A.y) < 10) {
      G.hp = G.maxHp; G.mg = G.maxMg; SFX.heart(); SFX.fanfare(); toast('TACO TRUCK! LIFE AND MAGIC FULL');
      G.truck = null;
    } else if (G.truck.life <= 0) G.truck = null;
  }
  // encounters: traffic on the roads, pollen in the cedar. Big shadows are 18-wheelers: a harder fight.
  G.trafficT -= dt;
  if (G.trafficT <= 0 && G.traffic.length < 3) {
    G.trafficT = 4 + Math.random() * 4;
    for (let tries = 0; tries < 30; tries++) {
      const tx = ((A.x / 16) | 0) + ((Math.random() * 24) | 0) - 12, ty = ((A.y / 16) | 0) + ((Math.random() * 12) | 0) - 6;
      const t = overTile(tx, ty);
      if ((t === 'R' || t === ':') && dist(tx * 16 + 8, ty * 16 + 8, A.x, A.y) > 70) {
        G.traffic.push({ x: tx * 16 + 8, y: ty * 16 + 8, t: Math.random() * 2, big: t === 'R' && Math.random() < 0.25, pollen: t === ':' });
        break;
      }
    }
  }
  for (const s of G.traffic) {
    s.t += dt;
    const d = Math.max(1, dist(s.x, s.y, A.x, A.y)), spd = s.big ? 58 : s.pollen ? 30 : 44;
    const nx = s.x + (A.x - s.x) / d * spd * dt, ny = s.y + (A.y - s.y) / d * spd * dt;
    if (!overSolid(overTile((nx / 16) | 0, (s.y / 16) | 0))) s.x = nx;
    if (!overSolid(overTile((s.x / 16) | 0, (ny / 16) | 0))) s.y = ny;
    if (d < 8) {
      G.returnPos = { x: A.x, y: A.y };
      G.traffic = [];
      SFX.roar();
      const where = overTile((A.x / 16) | 0, (A.y / 16) | 0) === ':' || s.pollen ? 'greenbelt' : 'access';   // where you got caught is where you fight
      fadeTo(() => enterScene(where, { fromRight: Math.random() < 0.5, strong: s.big }));
      return;
    }
    if (dist(s.x, s.y, A.x, A.y) > 360) s.gone = true;       // lost them
  }
  G.traffic = G.traffic.filter(s => !s.gone);
}
// what a barrier tells you when you walk into it
function barrier(tiles) {
  const ch = tiles.find(t => t === '%' || t === '=' || t === '&');
  if (!ch || (G.barrierT && G.playTime - G.barrierT < 3)) return;
  G.barrierT = G.playTime;
  toast({ '%': '281 AT 1604: CLOSED FOR CONSTRUCTION', '=': "LOW WATER. TURN AROUND, DON'T DROWN",
    '&': 'MATACHINES IN THE ROAD. THEY WILL NOT STOP FOR YOU' }[ch]);
}

// ---------------- shop (the abuela's stand at the Pearl) ----------------
// She won't take your money. The cost of a taco is the drive back to the Pearl.
function shopItems() {
  return [
    { name: 'BARBACOA TACO', desc: 'FULL LIFE. SUNDAY ONLY. IT IS SUNDAY.', ok: () => G.hp < G.maxHp, give: () => { G.hp = G.maxHp; } },
    { name: 'BIG RED', desc: 'FULL MAGIC. DO NOT ASK WHAT FLAVOR.', ok: () => G.mg < G.maxMg, give: () => { G.mg = G.maxMg; } },
    { name: 'PARKING VALIDATION', ok: () => !G.hasParking, locked: () => !G.hasCooler,
      desc: G.hasParking ? 'VALIDATED. DOWNTOWN IS OPEN.' : G.hasCooler ? 'HER NEPHEW WORKS THE GARAGE.' : 'SHE LEFT HER COOLER ON THE RIVERWALK.',
      give: () => { G.hasParking = true; toast('PARKING VALIDATED'); } },
    { name: 'LARGE RASPA', ok: () => !G.raspa, locked: () => !G.hasChamoy,
      desc: G.raspa ? 'YOU ALREADY HAD THE BIG ONE.' : G.hasChamoy ? '+1 MAX LIFE. WITH CHAMOY.' : 'NOT WITHOUT CHAMOY. THE ZOO HAS SOME.',
      give: () => { G.raspa = true; G.maxHp += 1; G.hp = G.maxHp; } },
    { name: 'LEAVE', desc: 'TELL MARISA WE SAID HI.', ok: () => true, give: null }
  ];
}
function openShop() { G.state = 'shop'; G.shopSel = 0; SFX.blip(); }
function updateShop() {
  const items = shopItems();
  if (pressed.down) { G.shopSel = (G.shopSel + 1) % items.length; SFX.blip(); }
  if (pressed.up) { G.shopSel = (G.shopSel + items.length - 1) % items.length; SFX.blip(); }
  if (pressed.pause) { G.state = 'play'; return; }
  if (pressed.use || pressed.atk) {
    const it = items[G.shopSel];
    if (!it.give) { G.state = 'play'; return; }
    if (!it.ok()) { SFX.deny(); toast('NO NEED RIGHT NOW'); return; }
    if (it.locked && it.locked()) { SFX.deny(); toast(it.desc); return; }
    it.give();
    SFX.buy();
    save();
  }
}

// ---------------- dialog ----------------
function updateDialog(dt) {
  const d = G.dialog;
  const line = d.lines[d.i];
  if (d.chars < line.length) {
    d.chars += dt * 45;
    if (((d.chars | 0) & 1) === 0) SFX.blip();
    if (pressed.use || pressed.atk) d.chars = line.length;
  } else if (pressed.use || pressed.atk) {
    d.i++;
    d.chars = 0;
    if (d.i >= d.lines.length) {
      G.dialog = null;
      G.state = 'play';
      if (d.cb) d.cb();
    }
  }
}

// ---------------- death / lives ----------------
// You lose the run, not the progress.
function resolveDeath() {
  G.lives--;
  if (G.lives <= 0) {
    // Game over costs the unspent XP, right now, so reloading can't dodge it. Levels and gear are never touched.
    if (!G.easy) { G.lostXp = G.xp; G.xp = 0; G.declined = 0; }   // EASY keeps what you haven't spent
    save();
    G.state = 'gameover';
    return;
  }
  G.hp = G.maxHp;
  const pal = G.scene && G.scene.palace, back = PALACES[pal] && PALACES[pal].entry;
  if (back) { enterScene(back, {}); toast('BACK TO THE ENTRANCE'); }
  else toOverworld(outside('H').x, outside('H').y);
  G.state = 'play';
}

// ---------------- main update ----------------
function update(dt) {
  if (pressed.mute) { muted = !muted; toast(muted ? 'SOUND OFF' : 'SOUND ON'); }
  if (G.fadeDir === 1) {
    G.fade = Math.min(1, G.fade + dt * 3.2);
    if (G.fade >= 1) { G.fadeDir = -1; if (G.fadeCb) { const cb = G.fadeCb; G.fadeCb = null; cb(); } }
  } else if (G.fadeDir === -1) {
    G.fade = Math.max(0, G.fade - dt * 3.2);
    if (G.fade <= 0) G.fadeDir = 0;
  }
  G.toastT = Math.max(0, G.toastT - dt);
  G.shakeT = Math.max(0, G.shakeT - dt);
  G.pollenT = Math.max(0, G.pollenT - dt);
  G.rainT = Math.max(0, G.rainT - dt);
  if (G.shakeT <= 0) G.shakeMag = 0;

  if (G.state === 'title') {
    if (pressed.left || pressed.right) { G.easyPick = !G.easyPick; SFX.blip(); }   // the mode for a new game; a saved game keeps its own
    if (pressed.use || pressed.atk || pressed.jump) startGame(!hasSave());
    else if (pressed.new && hasSave()) {
      // no confirm() — blocked in sandboxed iframes; double-press N instead
      if (G.eraseArm && performance.now() - G.eraseArm < 3000) { G.eraseArm = 0; startGame(true); }
      else { G.eraseArm = performance.now(); SFX.deny(); }
    }
    return;
  }
  if (G.state === 'gameover') {
    if (pressed.use || pressed.atk || pressed.pause) {
      G.lives = G.easy ? 5 : 3; G.hp = G.maxHp; G.mg = G.maxMg; G.lostXp = 0;
      toOverworld(outside('H').x, outside('H').y);      // continue at Home, like Zelda II's North Palace
      G.state = 'play';
      playMusic('over');
    }
    return;
  }
  if (G.state === 'win') {
    if (pressed.use || pressed.atk || pressed.pause) { G.state = 'credits'; G.creditsT = 0; music.track = null; playMusic('credits'); }
    return;
  }
  if (G.state === 'credits') {
    G.creditsT += dt * (keys.down || keys.atk ? 4 : 1);     // hold to hurry it
    if (pressed.new && G.creditsT * 22 > 200) { startQuest2(); return; }
    if ((pressed.use || pressed.pause) && G.creditsT > 2) { G.state = 'play'; playMusic(G.mode === 'side' ? G.scene.music : 'over'); }
    return;
  }
  if (G.state === 'pause') { if (pressed.pause || pressed.use) G.state = 'play'; return; }
  if (G.state === 'shop') { updateShop(); return; }
  if (G.state === 'quiz') { updateQuiz(); return; }
  if (G.state === 'dialog') { updateDialog(dt); return; }
  if (G.state === 'levelup') {
    if (pressed.down) { G.levelSel = (G.levelSel + 1) % 4; SFX.blip(); }
    if (pressed.up) { G.levelSel = (G.levelSel + 3) % 4; SFX.blip(); }
    if (pressed.use || pressed.atk) applyLevel(G.levelSel);
    return;
  }
  if (G.state === 'dying') {
    G.deathT -= dt;
    if (G.deathT <= 0) resolveDeath();
    return;
  }

  // ---- play ----
  if (pressed.pause) { G.state = 'pause'; return; }
  if (levelReady()) { G.state = 'levelup'; G.levelSel = 0; SFX.levelup(); return; }
  G.playTime += dt;
  G.hintT = Math.max(0, G.hintT - dt);
  if (G.player) {
    if (pressed.atk) G.player.bufAtk = 0.14;
    if (pressed.jump) G.player.bufJump = 0.12;
  }
  if (G.freeze > 0) { G.freeze -= dt; return; }

  if (G.mode === 'over') {
    updateOverworld(dt);
  } else {
    updatePlats(dt);
    updateSidePlayer(dt);
    updateNpcs(dt);
    for (const e of G.enemies) if (!e.dead) updateEnemy(e, dt);
    G.enemies = G.enemies.filter(e => !e.dead);
    updateShots(dt);
    updateParts(dt);
    const P = G.player;
    const t = clamp(P.x - VW / 2, 0, G.scene.w * TILE - VW);
    G.camX += (t - G.camX) * Math.min(1, dt * 10);
  }
}

// The second quest, Zelda II's way: levels, spells and techniques stay; every medal, tool, key and favor goes back.
const QUEST2_KEEP = ['atk', 'mag', 'lif', 'maxHp', 'maxMg', 'hasThrust', 'hasUp', 'easy', 'playTime'];
function startQuest2() {
  const keep = {}; for (const k of QUEST2_KEEP) keep[k] = G[k];
  for (const sp of SPELLS) keep[sp.flag] = G[sp.flag];
  G.easyPick = G.easy;
  startGame(true);
  Object.assign(G, keep, { quest2: true, hp: keep.maxHp, mg: keep.maxMg });
  G.spellSel = Math.max(0, SPELLS.findIndex(s => G[s.flag]));
  save();
  say(['THE SECOND QUEST.', 'YOU KEEP WHAT YOU LEARNED. YOU KEEP NOTHING YOU CARRIED.',
       'THE MEDALS ARE BACK ON THEIR BOSSES, AND THE BOSSES', 'HAVE BEEN WORKING OUT. SO HAS EVERYONE ELSE.']);
}
function startGame(fresh) {
  if (fresh) {
    store.removeItem(SAVE_KEY);
    Object.assign(G, {
      xp: 0, atk: 1, mag: 1, lif: 1, maxHp: 4, hp: 4, maxMg: 4, mg: 4, medals: 0,
      jumpKnown: false, healKnown: false, hasThrust: false, hasUp: false, hasNote: false,
      hasKeystone: false, hasParking: false, hasRose: false,
      gateOpen: false, chestScroll: false, chestMagic: false, chestLife: false,
      metHoa: false, examPassed: false, raspa: false, hasCooler: false, hasChamoy: false, pins: {},
      keys: {}, gotKeys: {}, opened: {}, broken: {}, carry: {}, pinned: {}, hasJackhammer: false, hasWaders: false,
      bossRim: false, bossRiver: false, bossZoo: false, bossCedar: false, bossShadow: false,
      bossStacks: false, bossCaverns: false, bossMissions: false, hasMaglite: false, hasAccordion: false,
      shadeKnown: false, limpiaKnown: false, hasDog: false, easy: G.easyPick, quest2: false,
      spfKnown: false, rocketKnown: false, grackleKnown: false, washKnown: false,
      hasPutter: false, hasMolcajete: false, hasHoney: false, hasWater: false, gaveWater: false, kidSaved: false,
      thermosClub: false, helotes: false, burnt: {},
      playTime: 0
    });
  } else loadSave();
  G.declined = 0; G.lostXp = 0; G.spellSel = Math.max(0, SPELLS.findIndex(s => G[s.flag]));
  for (const k of ['pins', 'keys', 'gotKeys', 'opened', 'broken', 'carry', 'pinned', 'burnt']) if (!G[k]) G[k] = {};   // older saves
  G.lives = G.easy ? 5 : 3;
  G.hp = G.maxHp; G.mg = G.maxMg;
  G.state = 'play';
  G.hintT = 10;
  toOverworld(outside('H').x, outside('H').y);
  if (G.oldSave && G.metHoa) {                  // anyone with medals has met her; her intro goes first otherwise
    G.oldSave = false;
    say(['WHILE YOU WERE AWAY, THE CITY GREW.',
         'THE SASH ON THE ALAMO DOOR HAS SIX PINS NOW.',
         'YOU HAVE ' + G.medals + '. THE STACKS GO DEEPER, THE CAVERNS',
         'ARE OPEN UP NORTH, AND THE MISSIONS ARE DOWN',
         'THE RIVER. MARISA HAS NOTES.'], () => save());
  }
  if (!G.metHoa) say([
    'THE CEDAR CAME EARLY THIS YEAR,',
    'AND IT CAME ON PURPOSE.',
    'MARISA GOT FOUR WORDS INTO A SENTENCE',
    'ON THE COUCH AND THE POLLEN TOOK HER.',
    'YOU ARE GREG. YOU HAVE ONE HICKORY',
    'DRUMSTICK AND NOWHERE TO PARK DOWNTOWN.',
    'START AT HOME. THE ICON MARKED H.'
  ]);
}

// ---------------- rendering ----------------
function render() {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, VW, VH);
  if (G.state === 'title') { renderTitle(); return; }

  const shx = G.shakeT > 0 ? (Math.random() - 0.5) * 2 * G.shakeMag : 0;

  if (G.mode === 'over') renderOverworld();
  else renderSide(Math.round(G.camX + shx));

  renderHUD();

  if (G.state === 'dialog') renderDialog();
  if (G.state === 'shop') renderShop();
  if (G.state === 'quiz') renderQuiz();
  if (G.state === 'pause') renderPause();
  if (G.state === 'levelup') renderLevelup();
  if (G.state === 'gameover') renderGameover();
  if (G.state === 'win') renderWin();
  if (G.state === 'credits') renderCredits();
  if (G.state === 'dying') {
    ctx.fillStyle = 'rgba(136,20,0,' + (0.7 - G.deathT * 0.4) + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
  if (G.pollenT > 0) {   // he shook the crown
    ctx.globalAlpha = Math.min(0.6, G.pollenT);
    ctx.fillStyle = PAL.y; ctx.fillRect(0, HUD_H, VW, VH - HUD_H);
    ctx.globalAlpha = 1;
  }
  if (G.rainT > 0) {     // a gullywasher: the sky goes dark and comes down all at once
    const t = performance.now();
    ctx.globalAlpha = Math.min(0.4, G.rainT * 0.4);
    ctx.fillStyle = PAL.j; ctx.fillRect(0, HUD_H, VW, VH - HUD_H);
    ctx.globalAlpha = Math.min(0.9, G.rainT);
    ctx.fillStyle = PAL.w;
    for (let i = 0; i < 140; i++) ctx.fillRect(((hash(i, 1) * VW + t / 4) % VW) | 0, HUD_H + (((hash(i, 2) * (VH - HUD_H) + t / 2) % (VH - HUD_H)) | 0), 1, 7);
    ctx.globalAlpha = 1;
  }

  if (G.toastT > 0) {
    ctx.globalAlpha = Math.min(1, G.toastT * 2);
    const w = textW(G.toastMsg) + 8;
    ctx.fillStyle = '#000000';
    ctx.fillRect((VW - w) / 2, 30, w, 12);
    textC(G.toastMsg, 32, PAL.a);
    ctx.globalAlpha = 1;
  }
  if (G.fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${G.fade})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < VH; y += 2) ctx.fillRect(0, y, VW, 1);
}

function renderSide(camX) {
  const s = G.scene;
  drawBackdrop(s.backdrop, camX);
  const tx0 = Math.max(0, (camX / 16) | 0), tx1 = Math.min(s.w - 1, ((camX + VW) / 16) | 0);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const ch = s.tiles[ty][tx];
      if (ch === ' ' || ch === '') {
        if (ty === ROWS - 1) { ctx.fillStyle = PAL.k; ctx.fillRect(tx * 16 - camX, HUD_H + ty * 16, 16, 16); }   // a pit
        continue;
      }
      drawSideTile(ch, tx * 16 - camX, HUD_H + ty * 16, tx, ty);
    }
  }
  // barges / elevators
  for (const pl of G.plats) {
    const x = pl.x - camX, y = HUD_H + pl.y;
    if (pl.hspd && hasArt('barge')) { ctx.drawImage(IMG.barge, Math.round(x + pl.w / 2 - 24), y - 6); continue; }   // bench tops are the deck
    if (!pl.hspd && hasArt('tiles_fixtures')) {                                   // the lift: the car floor's top half, on its cable
      ctx.fillStyle = PAL.g; ctx.fillRect(x + pl.w / 2 - 1, HUD_H, 2, y - HUD_H);
      for (let i = 0; i < pl.w; i += 16) ctx.drawImage(IMG.tiles_fixtures, 16, 0, Math.min(16, pl.w - i), 8, x + i, y, Math.min(16, pl.w - i), 8);
      continue;
    }
    ctx.fillStyle = PAL.k; ctx.fillRect(x - 1, y - 1, pl.w + 2, 8);
    ctx.fillStyle = PAL.b; ctx.fillRect(x, y, pl.w, 6);
    ctx.fillStyle = PAL.D; ctx.fillRect(x, y + 3, pl.w, 3);
    if (!pl.hspd) { ctx.fillStyle = PAL.g; ctx.fillRect(x + pl.w / 2 - 1, HUD_H, 2, y - HUD_H); }
  }
  for (const c of G.chests) if (!drawArt('chest', c.opened ? 1 : 0, c.x - camX, HUD_H + c.y + 8, false)) drawSpr('chest', c.opened ? 1 : 0, c.x - camX, HUD_H + c.y + 8, false);
  for (const n of G.npcs) {
    const ny = n.y != null ? n.y : 11 * 16;
    const walking = n.walk && !n.stop && !(n.pause > 0), art = NPC_ART[n.kind];
    const flip = n.walk ? n.face < 0 : art && n.kind !== 'marisa_sleep' && G.player && G.player.x < n.x;   // people turn to you
    if (!(art && (n.kind === 'marisa_sleep'
      ? drawArt(art[0], art[1], n.x + 16 - camX, HUD_H + 11 * 16, false)                             // the couch comes with her
      : drawArt(art[0], art[1] + (walking && (ART[art[0]] || {}).n >= 10 ? ((performance.now() / 250) | 0) % 2 : 0), n.x - camX, HUD_H + ny, flip)))) {
      const bob = walking ? ((performance.now() / 160) | 0) % 2 : 0;   // a step
      drawSpr(n.kind, 0, n.x - camX, HUD_H + ny - bob, n.walk ? n.face < 0 : false);
    }
    if (n.who === 'marisa' && !G.hasRose) {   // she is asleep and she is still talking
      const t = performance.now() / 600;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.4 + 0.5 * Math.sin(t + i);
        text('Z', n.x - camX + 10 + i * 4, HUD_H + ny - 16 - i * 5, PAL.w);
      }
      ctx.globalAlpha = 1;
    }
    if (n.who === 'sash') {   // the sash, and the pin it's waiting for
      const sx = Math.round(n.x - camX), sy = HUD_H + ny;
      ctx.fillStyle = PAL.q; for (let i = 0; i < 9; i++) ctx.fillRect(sx - 4 + i, sy - 14 + i, 2, 2);
      ctx.fillStyle = G.pinned[n.palace] ? PAL.y : PAL.k; ctx.fillRect(sx + 1, sy - 9, 3, 3);
    }
    if (n.who === 'hoa') { ctx.fillStyle = PAL.w; ctx.fillRect(Math.round(n.x - camX) + 6, HUD_H + ny - 10, 5, 7); }
  }
  for (const p of G.pickups) {
    const bob = Math.sin(p.t * 5) * 1.5;
    const pf = p.kind === 'cascaron' ? ((p.t * 8) | 0) % 2 : 0;
    if (PICKUP_ART[p.kind] != null && drawArt('pickups', PICKUP_ART[p.kind] + pf, p.x - camX, HUD_H + p.y + bob, false)) continue;
    drawSpr(p.kind, pf, p.x - camX, HUD_H + p.y + bob, false);
    if (p.kind === 'cascaron') text('*', p.x - camX - 1, HUD_H + p.y - 6 + bob, PAL.w);
  }
  for (const e of G.enemies) renderEnemySide(e, camX);
  renderGreg(camX);
  for (const s2 of G.shots) {
    if (s2.kind === 'rocket') {
      const rx = Math.round(s2.x - camX), ry = HUD_H + Math.round(s2.y), d = Math.sign(s2.vx);
      ctx.fillStyle = PAL.b; ctx.fillRect(rx - d * 8 - 3, ry, 6, 1);              // the stick
      ctx.fillStyle = PAL.r; ctx.fillRect(rx - 3, ry - 1, 6, 3);                   // the rocket
      ctx.fillStyle = PAL.w; ctx.fillRect(rx + (d > 0 ? 3 : -4), ry, 1, 1);
    } else if (s2.kind === 'cart') drawCart(s2.x - camX, HUD_H + s2.y + 3, 0, false);
    else if (s2.kind === 'cry') {   // a wail you can see: three rings, travelling
      ctx.strokeStyle = PAL.w; ctx.globalAlpha = 0.8;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(Math.round(s2.x - camX - Math.sign(s2.vx) * i * 4), HUD_H + Math.round(s2.y), 3 + i * 2, -1, 1); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    else if (s2.kind === 'spray') { ctx.fillStyle = PAL.c; ctx.fillRect(Math.round(s2.x - camX) - 5, HUD_H + Math.round(s2.y) - 1, 10, 3); ctx.fillStyle = PAL.w; ctx.fillRect(Math.round(s2.x - camX) - 2, HUD_H + Math.round(s2.y) - 2, 4, 2); }
    else drawSpr('spark', 0, s2.x - camX, HUD_H + s2.y + 2, false);
  }
  for (const p of G.parts) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.min(1, p.life * 3);
    ctx.fillRect(Math.round(p.x - camX), Math.round(HUD_H + p.y), p.sz, p.sz);
  }
  ctx.globalAlpha = 1;

  if (s.dark) {   // the Caverns: nothing but what the Maglite points at
    const P = G.player, px = P.x - camX, py = HUD_H + P.y - P.h / 2;
    const grd = ctx.createRadialGradient(px + P.face * 36, py, 16, px + P.face * 36, py, 110);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.7)'); grd.addColorStop(1, 'rgba(0,0,0,0.97)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, HUD_H, VW, VH - HUD_H);
    for (const e of G.enemies) {                 // eyeshine: bats catch the light even where you can't see them
      if (e.dead || (e.kind !== 'bat' && e.kind !== 'brackenbat')) continue;
      if (hasArt('bat') && hasArt('bracken_bat')) { ctx.globalAlpha = 0.4; renderEnemySide(e, camX); ctx.globalAlpha = 1; continue; }
      const big = e.kind === 'brackenbat', ex = Math.round(e.x - camX), ey = Math.round(HUD_H + e.y - (big ? 14 : 5)), gap = big ? 4 : 2;
      ctx.fillStyle = PAL.r; ctx.fillRect(ex - gap - 1, ey, big ? 3 : 1, big ? 2 : 1); ctx.fillRect(ex + gap - 1, ey, big ? 3 : 1, big ? 2 : 1);
    }
  } else if (s.backdrop === 'basement' || s.backdrop === 'stacks' || s.backdrop === 'void' || s.backdrop === 'tunnel') {
    const P = G.player;
    const px = P.x - camX, py = HUD_H + P.y - P.h / 2;
    const grd = ctx.createRadialGradient(px, py, 40, px, py, 150);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, HUD_H, VW, VH - HUD_H);
  }
  if (G.bossBar) {
    const e = G.bossBar, w = 130;
    ctx.fillStyle = PAL.k; ctx.fillRect((VW - w) / 2 - 2, HUD_H + 4, w + 4, 10);
    ctx.fillStyle = PAL.R; ctx.fillRect((VW - w) / 2, HUD_H + 6, w, 6);
    ctx.fillStyle = PAL.r; ctx.fillRect((VW - w) / 2, HUD_H + 6, w * Math.max(0, e.hp) / e.maxHp, 6);
    textC(G.bossName, HUD_H + 16, PAL.a);
    // the Mariachi keeps time whether or not you do
    if (e.kind === 'mariachi') {
      for (let i = 0; i < 4; i++) {
        const on = e.beat === i;
        ctx.fillStyle = on ? (i % 2 === 0 ? PAL.r : PAL.w) : PAL.g;
        ctx.fillRect(VW / 2 - 14 + i * 8, HUD_H + 26, on ? 6 : 4, on ? 6 : 4);
      }
    }
  }
}

// ---- 16-bit tiles and backdrops: a scene's backdrop picks its tile set. Anything unmapped draws the pixel way. ----
const TILESET = { suburb: 'town', market: 'town', living: 'town', garage: 'garage', roof: 'garage', river: 'riverwalk',
  zoo: 'zoo', school: 'school', stacks: 'school', basement: 'alamo', void: 'alamo', tunnel: 'culvert', greenbelt: 'greenbelt', accessroad: 'greenbelt', caverns: 'caverns', mission: 'mission' };
const BACKDROP_ART = { suburb: 'bg_town', garage: 'bg_garage', roof: 'bg_rooftop', market: 'bg_pearl', river: 'bg_riverwalk', zoo: 'bg_zoo',
  school: 'bg_school', stacks: 'bg_school', tunnel: 'bg_flood_tunnel', basement: 'bg_alamo', greenbelt: 'bg_greenbelt', accessroad: 'bg_overpass', living: 'bg_house', void: 'bg_void', caverns: 'bg_caverns', mission: 'bg_mission' };
const FRONT = { a: 2, w: 3, p: 4 };        // tiles_town house fronts: limestone, white stucco, pink
function drawTileArt(ch, x, y, tx, ty) {
  const set = TILESET[G.scene.backdrop], t = performance.now(), T = (k, i) => drawTile(k, i, x, y);
  const front = () => FRONT[G.scene.facade || 'a'] != null && T('tiles_town', FRONT[G.scene.facade || 'a']);
  const own = set === 'caverns' ? 'tiles_caverns' : set === 'mission' ? 'tiles_mission' : null;
  if (own) switch (ch) {
    case '#': return T(own, 0);
    case '-': case 'd': return T(own, 1);
    case 'X': return T(own, 2);
    case 'w': return T(own, 3 + (((t / 400) | 0) % 2));
    case 'B': return T(own, 5);
  }
  switch (ch) {
    case '-': return set === 'riverwalk' ? T('tiles_riverwalk', 0) : set === 'culvert' ? T('tiles_culvert', 0) : T('tiles_town', 0);
    case '#': return set === 'alamo' ? T('tiles_alamo', 0) : set === 'school' ? T('tiles_school', 0) : set === 'town' ? T('tiles_town', 2)
      : set === 'riverwalk' ? T('tiles_riverwalk', 0) : T('tiles_culvert', 0);
    case 'g': return set === 'zoo' ? T('tiles_zoo', 0) : T('tiles_greenbelt', 0);
    case '3': return T('tiles_greenbelt', 1 + (((t / 300) | 0) % 2));
    case 'w': return set === 'culvert' ? T('tiles_culvert', 1) : T('tiles_riverwalk', 1 + (((t / 220) | 0) % 4));
    case 'W': return G.scene.facade === 'b' ? T('tiles_fixtures', 5) : front();   // Helotes: weathered plank
    case 'n': return front() && T('tiles_town', hash(tx, ty) < 0.4 ? 7 : 8);
    case 'r': return T('tiles_town', 5);
    case 'D': if (FRONT[G.scene.facade] != null && tileAt(tx - 1, ty) === 'W') front();
      return T('tiles_town', tileAt(tx, ty + 1) === 'D' ? 9 : 10);
    case 'T': {
      if (!hasArt('tiles_town')) return false;
      const im = IMG.tiles_town, sx = 11 * 16, top = tileAt(tx, ty - 1) !== 'T';
      ctx.drawImage(im, sx, 6, 16, 1, x, y, 16, 16);                                   // straight bark: one row, extruded
      if (top) ctx.drawImage(im, sx, 0, 16, 8, x, y, 16, 8);                            // where it branches into the canopy
      if (tileAt(tx, ty + 1) !== 'T') ctx.drawImage(im, sx, 8, 16, 8, x, y + 8, 16, 8); // roots
      if (top) for (let i = -1; i <= 1; i++) drawTile('tiles_town', 13 + i, x + i * 16, y - 16);   // the canopy
      return true;
    }
    case 'L': if (tileAt(tx, ty - 1) === 'L') return false;   // the lamp on top; the pole under it is the pixel one
      return T('tiles_town', 15);
    case 'S': return set === 'school' || G.scene.backdrop === 'living' ? T('tiles_school', 0) : T('tiles_town', 16);   // indoors it's a bookshelf, not a stall
    case 'Y': return T('tiles_town', 17);
    case 'K': return T('tiles_garage', 3);
    case 'B': return set === 'alamo' ? T('tiles_alamo', 1) : T('tiles_garage', 4);
    case 'E': if (set === 'school') return T('tiles_school', 1);   // the stacks' book-cart lifts
      if (!T('tiles_fixtures', 1)) return false;
      ctx.fillStyle = PAL.G; ctx.fillRect(x + 3, HUD_H, 1, y - HUD_H); ctx.fillRect(x + 12, HUD_H, 1, y - HUD_H);   // the cables
      return true;
    case 'X': return T('tiles_fixtures', 0);
    case 'G': return T('tiles_fixtures', 2);
    case 'f': return T('tiles_fixtures', 3);
    case 'k': return T('tiles_fixtures', 4);
  }
  return false;
}
// a backdrop scrolls at a third of the camera, tiled mirror-image so the seam never shows
function drawBackdropArt(kind, camX) {
  const k = BACKDROP_ART[kind];
  if (!hasArt(k)) return false;
  const im = IMG[k], w = ART[k].w, h = ART[k].h, off = Math.round((camX * 0.3) % (2 * w));
  for (let i = 0; i < 4; i++) {
    const x = i * w - off;
    if (x >= VW || x + w <= 0) continue;
    if (i % 2 === 0) ctx.drawImage(im, x, HUD_H, w, h);
    else { ctx.save(); ctx.translate(x + w, HUD_H); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, w, h); ctx.restore(); }
  }
  return true;
}
function drawBackdrop(kind, camX) {
  if (drawBackdropArt(kind, camX)) return;
  kind = { caverns: 'tunnel', mission: 'basement' }[kind] || kind;   // no art: the nearest old look
  const y0 = HUD_H, H = VH - y0;
  const band = (col, y, h) => { ctx.fillStyle = col; ctx.fillRect(0, y0 + y, VW, h); };
  const par = (f, step, cb) => { for (let i = -1; i < VW / step + 2; i++) cb(i * step - (camX * f) % step, i); };

  if (kind === 'living') {
    band(PAL.D, 0, H); band(PAL.b, 0, 60);
    par(0.3, 96, x => { ctx.fillStyle = PAL.a; ctx.fillRect(x + 20, y0 + 22, 26, 20); ctx.fillStyle = PAL.c; ctx.fillRect(x + 23, y0 + 25, 20, 14); });
    band(PAL.B, H - 40, 40);
  } else if (kind === 'suburb') {
    band('#3CBCFC', 0, H); band('#A4E4FC', 0, 44);
    par(0.4, 74, x => { // limestone, tile roof, cedar
      ctx.fillStyle = PAL.a; ctx.fillRect(x, y0 + H - 78, 56, 62);
      ctx.fillStyle = PAL.o; ctx.fillRect(x - 3, y0 + H - 84, 62, 8);
      ctx.fillStyle = PAL.d; ctx.fillRect(x + 58, y0 + H - 60, 12, 44);
    });
  } else if (kind === 'garage') {
    band('#004058', 0, H);
    for (let lv = 0; lv < 4; lv++) { ctx.fillStyle = PAL.g; ctx.fillRect(0, y0 + 14 + lv * 40, VW, 4); }
    par(0.5, 62, x => { ctx.fillStyle = PAL.G; ctx.fillRect(x, y0, 12, H); ctx.fillStyle = PAL.m; ctx.fillRect(x, y0, 3, H); });
    par(0.5, 62, x => { ctx.fillStyle = PAL.Y; ctx.fillRect(x + 26, y0 + 20, 6, 2); ctx.fillRect(x + 26, y0 + 60, 6, 2); });
  } else if (kind === 'roof') {
    band('#0058F8', 0, H); band('#6844FC', 0, 34); band(PAL.o, 30, 10); band('#F87858', 40, 6);
    par(0.35, 58, x => { ctx.fillStyle = '#004058'; ctx.fillRect(x, y0 + H - 52, 40, 40); });
    par(0.7, 90, x => { ctx.fillStyle = PAL.k; ctx.fillRect(x + 30, y0 + 30, 2, 60); ctx.fillStyle = PAL.Y; ctx.fillRect(x + 26, y0 + 28, 10, 3); });
  } else if (kind === 'market') {
    band(PAL.D, 0, H); band('#881400', 0, 70);
    par(0.3, 52, x => { ctx.fillStyle = PAL.B; ctx.fillRect(x, y0 + 16, 30, 22); });
    par(0.55, 22, (x, i) => { ctx.fillStyle = i % 3 === 0 ? PAL.y : i % 3 === 1 ? PAL.r : PAL.n; ctx.fillRect(x, y0 + 10, 3, 3); });
  } else if (kind === 'river') {
    band('#004058', 0, H);                       // you are one storey below the street
    band('#3CBCFC', 0, 22); band('#0078F8', 18, 8);
    par(0.3, 70, x => {                          // cypress along the bank
      ctx.fillStyle = PAL.D; ctx.fillRect(x + 4, y0 + 20, 6, 42);
      ctx.fillStyle = PAL.e; ctx.fillRect(x - 8, y0 + 4, 30, 20);
      ctx.fillStyle = PAL.d; ctx.fillRect(x - 4, y0 + 8, 22, 11);
    });
    par(0.6, 122, x => {                         // stone arches
      ctx.fillStyle = PAL.a; ctx.fillRect(x, y0 + 50, 64, 6);
      ctx.fillStyle = PAL.m; ctx.fillRect(x + 12, y0 + 56, 6, 16); ctx.fillRect(x + 46, y0 + 56, 6, 16);
    });
  } else if (kind === 'zoo') {
    band('#3CBCFC', 0, H); band('#A4E4FC', 0, 40);
    par(0.3, 96, x => { ctx.fillStyle = PAL.d; ctx.fillRect(x, y0 + H - 74, 84, 60); });
    par(0.6, 12, x => { ctx.fillStyle = PAL.g; ctx.fillRect(x, y0, 1, 56); });   // aviary mesh
    ctx.fillStyle = PAL.g; ctx.fillRect(0, y0 + 56, VW, 1);
  } else if (kind === 'school') {
    band(PAL.B, 0, H); band('#881400', 0, 64);
    par(0.3, 46, x => { ctx.fillStyle = PAL.k; ctx.fillRect(x + 8, y0 + 12, 14, 40); ctx.fillStyle = '#004058'; ctx.fillRect(x + 10, y0 + 14, 10, 36); });
  } else if (kind === 'tunnel') {              // a flood culvert under downtown
    band('#000000', 0, H);
    par(0.35, 48, x => { ctx.fillStyle = '#004058'; ctx.fillRect(x, y0 + 20, 40, 120); ctx.fillStyle = PAL.G; ctx.fillRect(x, y0 + 20, 40, 3); });
    par(0.6, 30, x => { ctx.fillStyle = PAL.t; ctx.fillRect(x, y0 + H - 22, 18, 2); });
  } else if (kind === 'stacks') {
    band('#000000', 0, H);
    par(0.4, 40, x => {
      ctx.fillStyle = PAL.D; ctx.fillRect(x, y0, 30, H);
      for (let sy = 6; sy < H - 6; sy += 14) { ctx.fillStyle = PAL.b; ctx.fillRect(x, y0 + sy, 30, 2); ctx.fillStyle = PAL.B; ctx.fillRect(x + 2, y0 + sy - 9, 26, 9); }
    });
  } else if (kind === 'basement') {
    band('#000000', 0, H);
    par(0.35, 40, (x, i) => {                     // limestone courses
      for (let r = 0; r < 9; r++) {
        ctx.fillStyle = (r + i) % 2 ? PAL.b : PAL.D;
        ctx.fillRect(x + ((r % 2) ? 0 : 6), y0 + r * 20, 34, 18);
      }
    });
    par(0.7, 46, x => {                           // roots coming through the joints
      ctx.fillStyle = PAL.e; ctx.fillRect(x + 10, y0, 3, 56);
      ctx.fillRect(x + 13, y0 + 22, 10, 3); ctx.fillRect(x + 3, y0 + 40, 8, 3);
    });
  } else if (kind === 'void') {
    band('#000000', 0, H);
    for (let i = 0; i < 26; i++) {
      const t = performance.now() / 3000;
      ctx.fillStyle = PAL.G;
      ctx.fillRect(((hash(i, 2) * VW + t * 20 * (1 + hash(i, 8))) % VW) | 0, y0 + ((hash(i, 5) * H) | 0), 1, 1);
    }
  } else if (kind === 'greenbelt') {
    band('#3CBCFC', 0, H); band('#A4E4FC', 0, 46);
    par(0.3, 80, x => { ctx.fillStyle = PAL.e; ctx.fillRect(x, y0 + H - 86, 70, 70); });
    par(0.55, 34, x => { ctx.fillStyle = PAL.d; ctx.fillRect(x, y0 + H - 62, 26, 50); });
  } else { // accessroad
    band('#3CBCFC', 0, H); band('#A4E4FC', 0, 40);
    par(0.25, 120, x => { ctx.fillStyle = PAL.g; ctx.fillRect(x, y0 + 44, 108, 10); ctx.fillRect(x + 20, y0 + 54, 8, 40); ctx.fillRect(x + 80, y0 + 54, 8, 40); });
    par(0.5, 96, x => { ctx.fillStyle = PAL.k; ctx.fillRect(x + 40, y0 + 30, 2, 34); ctx.fillStyle = PAL.w; ctx.fillRect(x + 26, y0 + 18, 30, 14); ctx.fillStyle = PAL.R; ctx.fillRect(x + 29, y0 + 22, 24, 3); });
  }
}

function drawSideTile(ch, x, y, tx, ty) {
  if (drawTileArt(ch, x, y, tx, ty)) return;
  const h = hash(tx, ty);
  switch (ch) {
    case '#':
      ctx.fillStyle = PAL.g; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.G;
      ctx.fillRect(x + (ty % 2 ? 0 : 8), y + 4, 7, 3);
      ctx.fillRect(x + (ty % 2 ? 8 : 0), y + 12, 7, 3);
      ctx.fillStyle = PAL.m; ctx.fillRect(x, y, 16, 2);
      break;
    case 'X': // steel deck / catwalk / shelf — same part in every building in town
      ctx.fillStyle = PAL.g; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.m; ctx.fillRect(x, y, 16, 2);
      ctx.fillStyle = PAL.y; ctx.fillRect(x, y + 2, 16, 1);
      ctx.fillStyle = PAL.k;
      ctx.fillRect(x + 2, y + 7, 2, 2); ctx.fillRect(x + 12, y + 7, 2, 2);
      ctx.fillRect(x, y + 12, 16, 1);
      break;
    case '-':
      ctx.fillStyle = PAL.m; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.w; ctx.fillRect(x, y, 16, 3);
      ctx.fillStyle = PAL.g; ctx.fillRect(x + (tx % 2) * 8, y + 8, 2, 6);
      break;
    case 'g':
      ctx.fillStyle = PAL.d; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.n; ctx.fillRect(x, y, 16, 3);
      if (h < 0.4) { ctx.fillStyle = PAL.e; ctx.fillRect(x + (h * 90 | 0) % 12, y + 7, 2, 3); }
      break;
    case 'd':
      ctx.fillStyle = PAL.b; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.a; ctx.fillRect(x, y, 16, 3);
      if (h < 0.3) { ctx.fillStyle = PAL.B; ctx.fillRect(x + (h * 90 | 0) % 12, y + 8, 3, 2); }
      break;
    case '3': // fire-ant mound. Do not stand here.
      ctx.fillStyle = PAL.b; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.o; ctx.fillRect(x + 2, y + 2, 12, 14);
      ctx.fillStyle = PAL.R;
      for (let i = 0; i < 4; i++) {
        const a = performance.now() / 300 + i * 1.6 + tx;
        ctx.fillRect(x + 8 + Math.cos(a) * 5, y + 8 + Math.sin(a) * 4, 2, 2);
      }
      break;
    case 'w': // the river. Green in life, teal on a 2C02.
      ctx.fillStyle = '#004058'; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.t; ctx.fillRect(x, y + 2, 16, 14);
      ctx.fillStyle = '#00A844';
      ctx.fillRect(x + ((performance.now() / 90 + tx * 5) % 16 | 0), y + 1, 5, 2);
      ctx.fillStyle = '#00E8D8';
      ctx.fillRect(x + ((performance.now() / 140 + tx * 9) % 16 | 0), y + 7, 3, 1);
      break;
    case 'E': // elevator car: steel deck, yellow chevrons, cables up the shaft
      ctx.fillStyle = PAL.g; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.m; ctx.fillRect(x, y, 16, 3);
      ctx.fillStyle = PAL.y; ctx.fillRect(x + 3, y + 6, 4, 2); ctx.fillRect(x + 9, y + 6, 4, 2);
      ctx.fillStyle = PAL.G; ctx.fillRect(x + 3, HUD_H, 1, y - HUD_H); ctx.fillRect(x + 12, HUD_H, 1, y - HUD_H);
      break;
    case 'K': // locked door
      ctx.fillStyle = PAL.G; ctx.fillRect(x + 1, y, 14, 16);
      ctx.fillStyle = PAL.m; ctx.fillRect(x + 1, y, 2, 16); ctx.fillRect(x + 13, y, 2, 16);
      if (tileAt(tx, ty + 1) !== 'K') { ctx.fillStyle = PAL.y; ctx.fillRect(x + 6, y + 3, 4, 4); ctx.fillStyle = PAL.k; ctx.fillRect(x + 7, y + 5, 2, 3); }
      break;
    case 'B': // cracked wall: looks like the rest, but not quite
      ctx.fillStyle = PAL.g; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.G; ctx.fillRect(x + (ty % 2 ? 0 : 8), y + 4, 7, 3);
      ctx.fillStyle = PAL.k; ctx.fillRect(x + 4, y + 2, 1, 5); ctx.fillRect(x + 5, y + 7, 3, 1); ctx.fillRect(x + 9, y + 9, 1, 5);
      break;
    case 'G':
      ctx.fillStyle = PAL.m;
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 2 + i * 5, y, 3, 16);
      ctx.fillRect(x, y + 2, 16, 2); ctx.fillRect(x, y + 11, 16, 2);
      ctx.fillStyle = PAL.y; ctx.fillRect(x + 6, y + 6, 4, 4);
      break;
    case 'D':
      ctx.fillStyle = PAL.k; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.Y; ctx.fillRect(x + 4, y + 3, 8, 13);
      ctx.fillStyle = PAL.B; ctx.fillRect(x + 7, y + 3, 2, 13);
      break;
    case 'S': // market stall / school locker / furniture
      ctx.fillStyle = PAL.b; ctx.fillRect(x, y + 10, 16, 4);
      ctx.fillStyle = PAL.y; ctx.fillRect(x + 1, y + 3, 4, 7);
      ctx.fillStyle = PAL.r; ctx.fillRect(x + 6, y + 4, 4, 6);
      ctx.fillStyle = PAL.c; ctx.fillRect(x + 11, y + 2, 4, 8);
      break;
    case 'f': // floorboards
      ctx.fillStyle = PAL.B; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.b; ctx.fillRect(x, y, 16, 2);
      ctx.fillStyle = PAL.D; ctx.fillRect(x + ((tx % 2) ? 0 : 8), y + 6, 8, 1);
      break;
    case 'C': // the couch, in two courses: back on top, seat below (the 16-bit art brings its own couch)
      if (hasArt('marisa_asleep')) break;
      if (tileAt(tx, ty - 1) === 'C') {          // seat + skirt
        ctx.fillStyle = PAL.R; ctx.fillRect(x, y, 16, 6);
        ctx.fillStyle = PAL.q; ctx.fillRect(x, y + 6, 16, 10);
        ctx.fillStyle = PAL.k; ctx.fillRect(x, y + 5, 16, 1);
      } else {                                    // back cushions
        ctx.fillStyle = PAL.q; ctx.fillRect(x, y + 2, 16, 14);
        ctx.fillStyle = PAL.R; ctx.fillRect(x + 1, y + 4, 14, 9);
        ctx.fillStyle = PAL.k; ctx.fillRect(x + 8, y + 4, 1, 9);
      }
      break;
    case 'k': // the Gretsch kit
      ctx.fillStyle = PAL.R; ctx.fillRect(x + 2, y + 6, 12, 10);
      ctx.fillStyle = PAL.w; ctx.fillRect(x + 3, y + 7, 10, 2);
      ctx.fillStyle = PAL.y; ctx.fillRect(x + 1, y + 2, 14, 2);
      ctx.fillStyle = PAL.m; ctx.fillRect(x + 7, y + 2, 2, 5);
      break;
    case 'T': // live oak / cedar. Background only. Casts shade.
      ctx.fillStyle = PAL.D; ctx.fillRect(x + 5, y, 6, 16);
      ctx.fillStyle = PAL.b; ctx.fillRect(x + 5, y, 2, 16);
      if (tileAt(tx, ty - 1) !== 'T') {
        ctx.fillStyle = PAL.e; ctx.fillRect(x - 10, y - 14, 36, 18);
        ctx.fillStyle = PAL.d; ctx.fillRect(x - 7, y - 11, 30, 12);
        ctx.fillStyle = PAL.n; ctx.fillRect(x - 3, y - 8, 12, 6);
      }
      break;
    case 'L': // light pole. Grackle furniture.
      ctx.fillStyle = PAL.G; ctx.fillRect(x + 7, y, 3, 16);
      if (tileAt(tx, ty - 1) !== 'L') { ctx.fillStyle = PAL.m; ctx.fillRect(x + 3, y - 3, 11, 3); ctx.fillStyle = PAL.Y; ctx.fillRect(x + 5, y, 7, 2); }
      break;
    case 'W': // a house front, in the town's own colour. You walk in front of it.
    case 'n': { // ...with a window in it
      const front = c => c === 'W' || c === 'n' || c === 'D';
      ctx.fillStyle = PAL[G.scene.facade || 'a']; ctx.fillRect(x, y, 16, 16);
      if (h < 0.3) { ctx.fillStyle = PAL.b; ctx.fillRect(x + ((h * 50) | 0) % 12, y + 4 + ((h * 97) | 0) % 9, 3, 1); }
      ctx.fillStyle = PAL.k;
      if (!front(tileAt(tx - 1, ty))) ctx.fillRect(x, y, 1, 16);
      if (!front(tileAt(tx + 1, ty))) ctx.fillRect(x + 15, y, 1, 16);
      if (ch === 'n') {
        ctx.fillRect(x + 3, y + 3, 10, 10);
        ctx.fillStyle = h < 0.4 ? PAL.Y : '#004058'; ctx.fillRect(x + 4, y + 4, 8, 8);
        ctx.fillStyle = PAL.k; ctx.fillRect(x + 7, y + 4, 1, 8); ctx.fillRect(x + 4, y + 7, 8, 1);
      }
      break;
    }
    case 'r': // clay tile roof
      ctx.fillStyle = PAL.k; ctx.fillRect(x, y + 3, 16, 1);
      ctx.fillStyle = PAL.o; ctx.fillRect(x, y + 4, 16, 12);
      ctx.fillStyle = PAL.R; ctx.fillRect(x, y + 8, 16, 1); ctx.fillRect(x, y + 12, 16, 1);
      ctx.fillRect(x + ((tx % 2) ? 3 : 11), y + 4, 1, 4);
      break;
    case 'Y': // cedar brush, grown over everything. Solid. Fire is the only thing it respects.
      ctx.fillStyle = PAL.e; ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = PAL.d; ctx.fillRect(x + ((h * 7) | 0), y + 2, 7, 5); ctx.fillRect(x + 8 - ((h * 5) | 0), y + 9, 6, 5);
      ctx.fillStyle = PAL.n; ctx.fillRect(x + 3 + ((h * 9) | 0), y + 4, 2, 2);
      if (tileAt(tx, ty - 1) !== 'Y') { ctx.fillStyle = PAL.e; ctx.fillRect(x + 2, y - 3, 5, 3); ctx.fillRect(x + 9, y - 2, 5, 2); }
      break;
  }
}

function renderGreg(camX) {
  const P = G.player;
  if (!P) return;
  if (P.invuln > 0 && ((P.invuln * 12) | 0) % 2 === 0 && G.state === 'play') return;
  const x = P.x - camX, y = HUD_H + P.y;
  const flip = P.face < 0;
  if (P.flyT > 0) {                              // GRACKLE: a grackle in a teal shirt. Flickers as it wears off.
    if (P.flyT > 1.5 || ((P.flyT * 10) | 0) % 2) {
      if (!drawArt('greg_grackle', ((performance.now() / 110) | 0) % 2, x, y, flip)) {
        drawSpr('grackle', ((performance.now() / 90) | 0) % 2, x, y - 1, flip, 2);
        ctx.fillStyle = PAL.t; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 8, 6, 3);
      }
    }
    return;
  }
  if (!drawArt('greg', gregFrame(P, P.invuln > 0.8, P.upT, P.walkT), x, y, flip)) {
    let name = 'g_idle', f = 0;
    if (P.thrusting) name = 'g_thrust';
    else if (!P.onGround) name = 'g_jump';
    else if (P.crouch) name = 'g_crouch';
    else if (P.stabT > 0) name = 'g_stab';
    else if (P.walkT > 0) { name = 'g_walk'; f = ((P.walkT * 8) | 0) % 2; }
    drawSpr(name, f, x, y, flip);
    if (P.upT) { ctx.fillStyle = PAL.b; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 26, 2, 11); ctx.fillStyle = PAL.Y; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 26, 2, 2); }
    else drawStick(x, y, flip, P.thrusting, P.stabT > 0, P.crouch);
  }
  if (P.napT > 0) {
    const t = performance.now() / 400;
    for (let i = 0; i < 2; i++) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t + i); text('Z', x + 5 + i * 4, y - 30 - i * 5, PAL.w); }
    ctx.globalAlpha = 1;
  }
  if (G.jumpT > 0) {
    ctx.globalAlpha = 0.4 + Math.sin(P.walkT * 10) * 0.1;
    ctx.fillStyle = PAL.c;
    ctx.fillRect(Math.round(x) - 6, Math.round(y) + 1, 12, 1);
    ctx.globalAlpha = 1;
  }
}
// Which of Greg's 16 frames a body is in (Shadow Greg uses it too): 0-1 idle, 2-5 walk, 6 rising, 7 falling,
// 8 crouch, 9 wind-up, 10 thrust, 11 recover, 12 crouching stab, 13 downthrust, 14 upstroke, 15 hurt.
function gregFrame(b, hurt, up, walkT) {
  if (hurt) return 15;
  if (b.thrusting) return 13;
  if (up) return 14;
  if (!b.onGround) return b.vy < 0 ? 6 : 7;
  if (b.crouch) return b.stabT > 0 ? 12 : 8;
  if (b.stabT > 0) return b.stabT > 0.04 ? 10 : 11;
  if (walkT > 0) return 2 + ((walkT * 8) | 0) % 4;
  return ((performance.now() / 700) | 0) % 2;
}
// One good hickory drumstick. Drawn here so it never doubles up in the art. (The 16-bit art draws its own.)
function drawStick(x, y, flip, thrusting, stabbing, crouch) {
  ctx.fillStyle = PAL.b;
  if (thrusting) {
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 12);
    ctx.fillStyle = PAL.Y; ctx.fillRect(Math.round(x) - 1, Math.round(y) + 8, 2, 2);
  } else if (stabbing) {
    const sy = y - (crouch ? 4 : 9), len = 13;
    ctx.fillRect(Math.round(x + (flip ? -6 - len : 6)), Math.round(sy) - 1, len, 2);
    ctx.fillStyle = PAL.Y;
    ctx.fillRect(Math.round(x + (flip ? -6 - len : 6 + len - 2)), Math.round(sy) - 1, 2, 2);
  } else if (!crouch) {
    ctx.fillRect(Math.round(x + (flip ? 2 : -4)), Math.round(y) - 7, 2, 5);
  }
}

// the Cart Knight's cart, in front of him on the line he's guarding: chest (HIGH) or knees (LOW)
function drawCart(x, y, face, hi, reach) {
  if (drawArt('cart', 0, x + face * (10 + (reach || 0)), hi ? y - HIGH + 7 : y, face < 0)) return;
  const sx = x + face * (7 + (reach || 0)), sy = hi ? y - 13 : y - 7;
  ctx.fillStyle = PAL.k; ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 1, 6, 9);
  ctx.fillStyle = PAL.m; ctx.fillRect(Math.round(sx) - 2, Math.round(sy), 4, 7);
  ctx.fillStyle = PAL.g; ctx.fillRect(Math.round(sx) - 2, Math.round(sy) + 2, 4, 1); ctx.fillRect(Math.round(sx) - 2, Math.round(sy) + 4, 4, 1);
  ctx.fillStyle = PAL.k; ctx.fillRect(Math.round(sx) - 2, Math.round(sy) + 7, 1, 1); ctx.fillRect(Math.round(sx) + 1, Math.round(sy) + 7, 1, 1);
}

function renderEnemySide(e, camX) {
  const x = e.x - camX, y = HUD_H + e.y;
  const f = ((e.t * 6) | 0) % 2, flip = e.face < 0;
  if (e.kind === 'ant') { if (!drawArt('ant', f, x, y, flip)) drawSpr('ant', f, x, y, flip); }
  else if (e.kind === 'grackle') { if (!drawArt('grackle', e.state === 'dive' ? 2 : f, x, y + 2, flip)) drawSpr('grackle', f, x, y + 4, flip); }
  else if (e.kind === 'wisp') {
    ctx.globalAlpha = 0.3; ctx.fillStyle = PAL.y;
    ctx.fillRect(Math.round(x) - 8, Math.round(y) - 12, 16, 16);
    ctx.globalAlpha = 1;
    if (!drawArt('wisp', f, x, y, false)) drawSpr('wisp', f, x, y, false);
  } else if (e.kind === 'cone') { if (!drawArt('cone', e.state === 'cone' ? 0 : 1, x, y, flip)) drawSpr('cone', e.state === 'cone' ? 0 : 1, x, y, flip); }
  else if (e.kind === 'tourist') {
    if (!drawArt('cast', 7, x, y, flip)) { drawSpr('tourist', 0, x, y, flip); ctx.fillStyle = PAL.k; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 9, 4, 3); }
  } else if (e.kind === 'cartknight') {
    // frames: 0-1 walk, 2 guard high, 3 guard low, 4 wind-up, 5 thrust. Tiers are palette swaps, like the NES did it.
    const kf = e.state === 'wind' ? 4 : e.state === 'thrust' || e.state === 'recover' ? 5 : e.guardHi ? 2 : 3;
    if (!drawArt(e.tier ? 'cartknight' + e.tier : 'cartknight', kf, x, y, flip)) drawSpr(e.tier ? 'cartknight' + e.tier : 'cartknight', f, x, y, flip);
    const reach = e.state === 'wind' ? -3 + (Math.random() < 0.5 ? 1 : 0) : e.state === 'thrust' ? 10 : 0;
    drawCart(x, y, e.face, e.guardHi, reach);
    if (e.state === 'wind') text('!', Math.round(x) - 1, Math.round(y) - 32, PAL[KNIGHT[e.tier].vest]);
  } else if (e.kind === 'grackleprince') {
    const pf = e.state === 'rest' ? 0 : e.state === 'dive' ? 2 : 1;          // perched, flying, diving
    if (!drawArt('grackle_prince', pf, x, y, flip)) drawSpr('grackleprince', f, x, y, flip, 3);
    if (e.state === 'call') { for (let i = 0; i < 3; i++) { const a = e.t * 6 + i * 2.1; ctx.fillStyle = PAL.j; ctx.fillRect(Math.round(x + Math.cos(a) * 18), Math.round(y - 32 + Math.sin(a) * 4), 2, 2); } }
    if (e.state === 'rest') text('!', Math.round(x) - 1, Math.round(y) - 52, PAL.w);
    if (e.state === 'aim' || e.state === 'dive') { ctx.fillStyle = PAL.k; ctx.fillRect(Math.round(e.mark - camX) - 12, HUD_H + 11 * 16 - 3, 24, 3); ctx.fillStyle = PAL.j; ctx.fillRect(Math.round(e.mark - camX) - 8, HUD_H + 11 * 16 - 2, 16, 1); }
  } else if (e.kind === 'mariachi') {
    if (!drawArt('mariachi_deep', e.open ? 2 : e.hi ? 0 : 1, x, y, flip)) {   // horn up high, horn low, horn down: the art is the tell
      drawSpr('mariachi', f, x, y, flip);
      if (!e.open) { ctx.fillStyle = PAL.y; ctx.fillRect(Math.round(x + e.face * 6), Math.round(y) - 12, 8, 3); ctx.fillRect(Math.round(x + e.face * 12), Math.round(y) - 14, 3, 6); }
      else { ctx.fillStyle = PAL.y; ctx.fillRect(Math.round(x + e.face * 5), Math.round(y) - 6, 3, 6); }
    }
  } else if (e.kind === 'hippo') {
    const hf = e.state === 'stuck' ? (e.sprayed ? 2 : 1) : 0;               // surfacing, cheeks full, spouting
    if (!drawArt('hippo', hf, x, y, flip)) {
      drawSpr('hippo', f, x, y, flip, 3);
      if (e.state === 'stuck' && !e.sprayed) { ctx.fillStyle = PAL.w; ctx.fillRect(Math.round(x + e.face * 16) - 2, Math.round(y) - 12, 5, 5); }   // cheeks full
    }
    if (e.state === 'warn') text('!', Math.round(x) - 1, HUD_H + 9 * 16 - 12, PAL.w);
  } else if (e.kind === 'silverfish') {
    const sx = x + (e.state === 'dash' ? (Math.random() - 0.5) * 2 : 0), sf = e.state === 'rear' ? 1 : e.state === 'dazed' ? 2 : 0;   // skitter, rear, stunned
    if (!drawArt('silverfish', sf, sx, y, flip)) drawSpr('silverfish', e.state === 'rear' ? 1 : 0, sx, y, flip, 2);
    if (e.state === 'dazed') text('?', Math.round(x) - 3, Math.round(y) - 20, PAL.w);
  } else if (e.kind === 'brackenbat') {
    const bf = e.state === 'rest' ? 2 : e.state === 'swoop' ? 1 : ((e.t * 8) | 0) % 2;   // wings up, wings down, landed
    if (!drawArt('bracken_bat', bf, x, y, flip)) drawSpr('brackenbat', e.state === 'rest' ? 1 : ((e.t * (e.state === 'swoop' ? 3 : 8)) | 0) % 2, x, y, flip, 3);
    if (e.state === 'screech') { ctx.strokeStyle = PAL.w; ctx.globalAlpha = 0.6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y - 12), 10 + i * 8 + (e.t * 40) % 8, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1; }
    if (e.state === 'rest') text('!', Math.round(x) - 1, Math.round(y) - 32, PAL.w);
  } else if (e.kind === 'llorona') {
    ctx.globalAlpha = e.state === 'fade' ? Math.max(0, e.st / 0.4) : e.state === 'appear' ? 1 - Math.max(0, e.st / 0.45) : 1;
    const lf = e.state === 'weep' ? 2 : e.state === 'wail' ? 1 : 0;   // drifting, wailing, weeping
    if (!drawArt('llorona', lf, x, y, flip)) drawSpr('llorona', e.state === 'weep' ? 1 : 0, x, y, flip, 2);
    ctx.globalAlpha = 1;
    if (e.state === 'wail' && !e.cried) text('!', Math.round(x) + e.face * 10 - 3, Math.round(y) - (e.hi ? HIGH + 4 : LOW + 4), PAL.w);   // at the height it will come in at
  } else if (e.kind === 'bat') {
    if (!drawArt('bat', f, x, y + 2, flip)) drawSpr('bat', f, x, y + 2, flip, 2);
  } else if (e.kind === 'cedarking') {
    const shiver = e.state === 'shake' ? (Math.random() - 0.5) * 3 : 0;
    const lean = e.state === 'sway' ? (e.st > 0.25 ? -8 : 12) : 0;   // leans back, then sweeps
    if (drawArt('cedar_king', ((e.t * 2) | 0) % 2, x + shiver, y, flip)) {
      drawArt(e.washed ? 'cedar_crown_washed' : 'cedar_crown', 0, x + shiver + lean, y - 35, false);   // centred on crownBox
    } else {
      drawSpr('cedarking', f, x + shiver, y, flip, 3);
      drawSpr(e.washed ? 'cedarcrown' : 'cedarcrownp', 0, x + shiver + lean, y - 42, false, 5);
    }
    if (e.state === 'roots') { ctx.fillStyle = PAL.b; ctx.fillRect(Math.round(e.rx - camX) - 5, HUD_H + 11 * 16 - 3, 10, 3); }
  } else if (e.kind === 'shadowgreg') {
    // rim first, silhouette over it — otherwise he is black on black and you fight a rumour
    const gf = gregFrame(e, false, false, e.onGround && !e.crouch && !(e.stabT > 0) ? e.t : 0);
    if (drawArt('greg', gf, x, y, flip, PAL.j)) {
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1]]) drawArt('greg', gf, x + ox, y + oy, flip, PAL.j);
      drawArt('greg', gf, x, y, flip, PAL.k);
      ctx.fillStyle = PAL.r; ctx.fillRect(Math.round(x) + (flip ? -3 : 1), Math.round(y) - (e.crouch ? 13 : 19), 2, 2);
    } else {
      let nm = 'g_idle', ff = 0;
      if (!e.onGround) nm = 'g_jump';
      else if (e.crouch) nm = 'g_crouch';
      else if (e.stabT > 0) nm = 'g_stab';
      else { nm = 'g_walk'; ff = ((e.t * 8) | 0) % 2; }
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawSpr(nm, ff, x + ox, y + oy, flip, 1, PAL.j);
      drawSpr(nm, ff, x, y, flip, 1, PAL.k);
      ctx.fillStyle = PAL.r; ctx.fillRect(Math.round(x) + (flip ? -3 : 1), Math.round(y) - (e.crouch ? 6 : 10), 2, 2);
      drawStick(x, y, flip, false, e.stabT > 0, e.crouch);
    }
  }
  if (e.flash > 0) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = PAL.w;
    ctx.fillRect(Math.round(x - e.w / 2), Math.round(y - e.h), e.w, e.h);
    ctx.globalAlpha = 1;
  }
}

// ---- overworld rendering ----
const MAP_TILE = { R: 0, h: 1, b: 4, '=': 5, '%': 6, ':': 7, '#': 8, '.': 9 };                      // tiles_city_map; river is 2-3
const MAP_ICON = { H: 0, O: 1, M: 2, C: 3, E: 4, P: 5, Z: 6, K: 7, Q: 8, S: 9, V: 10, L: 11, A: 12 };   // map_places
function drawMapArt(raw, ch, x, y) {
  if (!hasArt('tiles_city_map')) return false;
  if (ch === '~') return drawTile('tiles_city_map', 2 + (((performance.now() / 500) | 0) % 2), x, y);
  if (ch === '%' && G.hasJackhammer) return drawTile('tiles_city_map', 0, x, y);          // the barricade came out; it's road
  if (MAP_TILE[ch] != null) {
    drawTile('tiles_city_map', MAP_TILE[ch], x, y);
    if (raw === 'E') { ctx.fillStyle = PAL.k; ctx.fillRect(x + 5, y + 2, 1, 4); ctx.fillRect(x + 6, y + 6, 3, 1); ctx.fillRect(x + 9, y + 7, 1, 5); }   // cracked caliche
    return true;
  }
  if (hasArt('map_places_3') && (ch === 'W' || ch === 'T')) { drawTile('tiles_city_map', 9, x, y); return drawTile('map_places_3', ch === 'W' ? 0 : 1, x, y); }   // King William, the West Side
  if (hasArt('map_places_2') && (ch === 'U' || ch === 'N' || ch === '&')) {   // the Caverns, the Missions, the matachines
    if (ch === '&' && G.hasAccordion) return drawTile('tiles_city_map', 0, x, y);   // they danced aside: it's road
    if (ch !== '&') drawTile('tiles_city_map', 9, x, y);
    return drawTile('map_places_2', { U: 0, N: 1, '&': 2 }[ch], x, y);
  }
  if (MAP_ICON[ch] == null || !hasArt('map_places')) return false;
  drawTile('tiles_city_map', 9, x, y);
  return drawTile('map_places', MAP_ICON[ch], x, y);
}
function renderOverworld() {
  const cx = Math.round(G.ocamX), cy = Math.round(G.ocamY);
  const tx0 = (cx / 16) | 0, ty0 = (cy / 16) | 0;
  for (let ty = ty0; ty <= Math.min(OVER_H - 1, ty0 + 13); ty++) {
    for (let tx = tx0; tx <= Math.min(OVER_W - 1, tx0 + 24); tx++) {
      const raw = OVER[ty][tx], ch = raw === 'E' && !G.helotes ? 'h' : raw;   // Helotes is a hill until you find it
      const x = tx * 16 - cx, y = HUD_H + ty * 16 - cy;
      const h = hash(tx, ty);
      if (drawMapArt(raw, ch, x, y)) continue;
      if (ch === '#') {   // city blocks: lit windows so they never read as open lot
        ctx.fillStyle = h < 0.5 ? PAL.G : PAL.g; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = PAL.k; ctx.fillRect(x, y, 16, 1); ctx.fillRect(x, y, 1, 16);
        ctx.fillStyle = h < 0.35 ? PAL.Y : '#004058';
        ctx.fillRect(x + 3, y + 4, 4, 5); ctx.fillRect(x + 10, y + 4, 4, 5);
        ctx.fillStyle = h < 0.65 ? PAL.Y : '#004058';
        ctx.fillRect(x + 3, y + 11, 4, 4); ctx.fillRect(x + 10, y + 11, 4, 4);
      } else if (ch === 'R') {
        ctx.fillStyle = PAL.k; ctx.fillRect(x, y, 16, 16);
        if ((tx + ty) % 2 === 0) { ctx.fillStyle = PAL.y; ctx.fillRect(x + 7, y + 7, 2, 2); }
      } else if (ch === '%') { // permanently under construction. canon. (until the jackhammer)
        ctx.fillStyle = PAL.k; ctx.fillRect(x, y, 16, 16);
        if (G.hasJackhammer) { ctx.fillStyle = PAL.G; ctx.fillRect(x + 2, y + 9, 4, 3); ctx.fillRect(x + 10, y + 4, 3, 3); ctx.fillStyle = PAL.o; ctx.fillRect(x + 7, y + 12, 5, 2); }
        else {
          ctx.fillStyle = PAL.o; ctx.fillRect(x + 2, y + 3, 5, 11); ctx.fillRect(x + 9, y + 3, 5, 11);
          ctx.fillStyle = PAL.w; ctx.fillRect(x + 2, y + 6, 5, 3); ctx.fillRect(x + 9, y + 6, 5, 3);
        }
      } else if (ch === 'h') {  // hill country: caliche and cedar, too steep to cross
        ctx.fillStyle = PAL.b; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = PAL.a; ctx.fillRect(x + (h * 10 | 0), y + 4, 5, 2);
        ctx.fillStyle = PAL.e; ctx.fillRect(x + 2 + ((h * 7) | 0), y + 8, 6, 6);
        if (raw === 'E') { ctx.fillStyle = PAL.k; ctx.fillRect(x + 5, y + 2, 1, 4); ctx.fillRect(x + 6, y + 6, 3, 1); ctx.fillRect(x + 9, y + 7, 1, 5); }   // cracked caliche
      } else if (ch === '~' || ch === '=') {   // the river; the low-water crossing is a slab you can wade
        ctx.fillStyle = '#004058'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = PAL.t; ctx.fillRect(x + ((performance.now() / 120 + tx * 5) % 12 | 0), y + 6, 4, 1);
        if (ch === '=') { ctx.fillStyle = PAL.m; ctx.fillRect(x, y + 5, 16, 6); ctx.fillStyle = PAL.t; ctx.fillRect(x + ((performance.now() / 90) % 16 | 0), y + 7, 5, 2); }
      } else if (ch === '&') {  // the matachines: dancing in the road until someone plays
        ctx.fillStyle = PAL.k; ctx.fillRect(x, y, 16, 16);
        const step = ((performance.now() / 250) | 0) % 2, aside = G.hasAccordion ? 5 : 0;
        for (const [dx, col] of [[2 - aside, PAL.r], [7, PAL.y], [12 + aside, PAL.c]]) {
          if (G.hasAccordion && dx === 7) continue;
          ctx.fillStyle = col; ctx.fillRect(x + dx, y + 5 + (step ^ (dx & 1)), 3, 6);
          ctx.fillStyle = PAL.y; ctx.fillRect(x + dx - 1, y + 3 + (step ^ (dx & 1)), 5, 2);   // the headdress
        }
      } else if (ch === 'b') {  // a bridge over the river
        ctx.fillStyle = PAL.a; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = PAL.b; ctx.fillRect(x, y, 16, 2); ctx.fillRect(x, y + 14, 16, 2);
      } else if (ch === ':') {
        ctx.fillStyle = PAL.d; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = PAL.e; ctx.fillRect(x + 4, y + 1, 8, 9);
        ctx.fillStyle = PAL.D; ctx.fillRect(x + 7, y + 9, 2, 5);
      } else if (LOC[ch]) {
        ctx.fillStyle = PAL.m; ctx.fillRect(x, y, 16, 16);
        if (ch === 'H') {                       // Redwoods Crest
          ctx.fillStyle = PAL.o; ctx.fillRect(x + 1, y + 3, 14, 4);
          ctx.fillStyle = PAL.a; ctx.fillRect(x + 2, y + 7, 12, 8);
          ctx.fillStyle = PAL.B; ctx.fillRect(x + 6, y + 10, 4, 5);
        } else if (ch === 'O') {                // Stone Oak: a gate
          ctx.fillStyle = PAL.d; ctx.fillRect(x + 1, y + 1, 5, 7);
          ctx.fillStyle = PAL.G; ctx.fillRect(x + 2, y + 8, 12, 7);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 4, y + 8, 1, 7); ctx.fillRect(x + 8, y + 8, 1, 7); ctx.fillRect(x + 12, y + 8, 1, 7);
        } else if (ch === 'M') {                // The Rim: a garage
          ctx.fillStyle = PAL.G; ctx.fillRect(x + 1, y + 2, 14, 13);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 1, y + 5, 14, 2); ctx.fillRect(x + 1, y + 10, 14, 2);
          ctx.fillStyle = PAL.c; ctx.fillRect(x + 5, y + 12, 6, 3);
        } else if (ch === 'P') {                // The Pearl
          ctx.fillStyle = PAL.B; ctx.fillRect(x + 1, y + 6, 14, 9);
          for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? PAL.r : PAL.w; ctx.fillRect(x + 1 + i * 4, y + 2, 4, 4); }
        } else if (ch === 'V') {                // The Riverwalk
          ctx.fillStyle = PAL.d; ctx.fillRect(x, y, 16, 16);
          ctx.fillStyle = PAL.e; ctx.fillRect(x, y + 8, 16, 8);
          ctx.fillStyle = PAL.b; ctx.fillRect(x + 2, y + 6, 12, 2); ctx.fillRect(x + 2, y + 8, 2, 4); ctx.fillRect(x + 12, y + 8, 2, 4);
        } else if (ch === 'Z') {                // The Zoo
          ctx.fillStyle = PAL.d; ctx.fillRect(x, y, 16, 16);
          ctx.fillStyle = PAL.g; ctx.fillRect(x + 2, y + 2, 12, 12);
          ctx.fillStyle = PAL.b; ctx.fillRect(x + 5, y + 7, 6, 6);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 6, y + 5, 1, 3); ctx.fillRect(x + 9, y + 5, 1, 3);
        } else if (ch === 'K') {                // Keystone School
          ctx.fillStyle = PAL.R; ctx.fillRect(x + 1, y + 3, 14, 12);
          ctx.fillStyle = PAL.a; ctx.fillRect(x + 3, y + 6, 3, 5); ctx.fillRect(x + 10, y + 6, 3, 5);
          ctx.fillStyle = PAL.w; ctx.fillRect(x + 6, y + 1, 4, 3);
        } else if (ch === 'U') {                // the Caverns: a hole in the hill
          ctx.fillStyle = PAL.b; ctx.fillRect(x, y, 16, 16);
          ctx.fillStyle = PAL.a; ctx.fillRect(x + 1, y + 2, 14, 3);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 3, y + 6, 10, 10); ctx.fillRect(x + 5, y + 4, 6, 2);
        } else if (ch === 'N') {                // Mission Espada: the bell wall
          ctx.fillStyle = PAL.a; ctx.fillRect(x + 2, y + 4, 12, 11); ctx.fillRect(x + 5, y + 1, 6, 3);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 7, y + 2, 2, 2); ctx.fillRect(x + 6, y + 9, 4, 6);
          ctx.fillStyle = PAL.b; ctx.fillRect(x + 4, y + 6, 2, 2); ctx.fillRect(x + 10, y + 6, 2, 2);
        } else if (ch === 'W') {                // King William: a limestone mansion with a porch
          ctx.fillStyle = PAL.a; ctx.fillRect(x + 2, y + 5, 12, 10);
          ctx.fillStyle = PAL.g; ctx.fillRect(x + 1, y + 2, 14, 3);
          ctx.fillStyle = PAL.w; ctx.fillRect(x + 2, y + 10, 12, 1); ctx.fillRect(x + 3, y + 11, 1, 4); ctx.fillRect(x + 12, y + 11, 1, 4);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 7, y + 11, 2, 4);
        } else if (ch === 'T') {                // the West Side: painted houses, one pink, one turquoise
          ctx.fillStyle = PAL.p; ctx.fillRect(x + 1, y + 7, 6, 8);
          ctx.fillStyle = PAL.t; ctx.fillRect(x + 8, y + 5, 7, 10);
          ctx.fillStyle = PAL.o; ctx.fillRect(x + 1, y + 5, 6, 2); ctx.fillRect(x + 8, y + 3, 7, 2);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 3, y + 11, 2, 4); ctx.fillRect(x + 11, y + 11, 2, 4);
        } else if (ch === 'C') {                // the culvert: a concrete mouth at the foot of the hill
          ctx.fillStyle = PAL.b; ctx.fillRect(x, y, 16, 16);
          ctx.fillStyle = PAL.m; ctx.fillRect(x + 2, y + 4, 12, 12);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 4, y + 6, 8, 10);
        } else if ('QSLE'.includes(ch)) {       // towns: two houses, in each town's own colours
          const [wall, roof, acc] = { Q: [PAL.w, PAL.o, PAL.g], S: [PAL.p, PAL.R, PAL.n], L: [PAL.a, PAL.o, PAL.y], E: [PAL.b, PAL.D, PAL.e] }[ch];
          ctx.fillStyle = roof; ctx.fillRect(x + 1, y + 5, 7, 3); ctx.fillRect(x + 8, y + 2, 7, 3);
          ctx.fillStyle = wall; ctx.fillRect(x + 2, y + 8, 5, 7); ctx.fillRect(x + 9, y + 5, 5, 10);
          ctx.fillStyle = PAL.k; ctx.fillRect(x + 4, y + 11, 2, 4); ctx.fillRect(x + 11, y + 11, 2, 4);
          ctx.fillStyle = acc; ctx.fillRect(x + 10, y + 7, 3, 2);
        } else {                                // The Alamo
          ctx.fillStyle = PAL.a; ctx.fillRect(x + 2, y + 5, 12, 10);
          ctx.fillStyle = PAL.a; ctx.fillRect(x + 5, y + 2, 6, 3); ctx.fillRect(x + 4, y + 3, 8, 2);
          ctx.fillStyle = PAL.B; ctx.fillRect(x + 6, y + 9, 4, 6);
          if (G.medals >= MEDALS) { ctx.fillStyle = PAL.y; ctx.fillRect(x + 2, y + 5, 12, 1); }
        }
      } else {
        ctx.fillStyle = PAL.m; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = PAL.g;
        if ((tx + ty) % 2 === 0) ctx.fillRect(x, y, 16, 1);
        ctx.fillRect(x, y, 1, 16);
      }
    }
  }
  for (const k in LOC_NAME) if (k !== 'E' || G.helotes) labelNear(k, LOC_NAME[k]);
  for (const s of G.traffic) {
    if (s.pollen) drawSpr('wisp', ((s.t * 6) | 0) % 2, s.x - cx, HUD_H + s.y + 4 - cy, false);
    else if (!drawArt(s.big ? 'map_semi' : 'map_sedan', ((s.t * 6) | 0) % 2, s.x - cx, HUD_H + s.y + 5 - cy, s.x > G.avatar.x))   // it drives at you
      drawSpr('traffic', ((s.t * 6) | 0) % 2, s.x - cx, HUD_H + s.y + 4 - cy, false, s.big ? 2 : 1);
  }
  if (G.truck && ((G.truck.life > 4) || ((G.truck.t * 8) | 0) % 2)   // flickers as it gets ready to leave
    && !drawArt('map_taco_truck', ((G.truck.t * 4) | 0) % 2, G.truck.x - cx, HUD_H + G.truck.y + 6 - cy, false)) {
    const x = Math.round(G.truck.x - cx), y = HUD_H + Math.round(G.truck.y - cy);
    ctx.fillStyle = PAL.k; ctx.fillRect(x - 7, y - 5, 14, 9);
    ctx.fillStyle = PAL.w; ctx.fillRect(x - 6, y - 4, 12, 6);
    ctx.fillStyle = PAL.r; ctx.fillRect(x - 6, y - 1, 12, 2);
    ctx.fillStyle = PAL.y; ctx.fillRect(x + 2, y - 4, 3, 2);
  }
  const A = G.avatar;
  if (!drawArt('map_greg', (A.vert ? 2 : 0) + ((A.t * 6) | 0) % 2, A.x - cx, HUD_H + A.y + 6 - cy, !A.vert && A.flip))
    drawSpr('mini', ((A.t * 6) | 0) % 2, A.x - cx, HUD_H + A.y + 5 - cy, A.flip);
  if (G.hintT > 0 && G.state === 'play') {
    ctx.globalAlpha = Math.min(1, G.hintT);
    ctx.fillStyle = PAL.k;
    const hint = 'WALK INTO AN ICON. DODGE THE TRAFFIC.', hw = textW(hint) + 8;
    ctx.fillRect((VW - hw) / 2, VH - 14, hw, 12);
    textC(hint, VH - 12, PAL.m);
    ctx.globalAlpha = 1;
  }
}
function labelNear(ch, label) {
  const A = G.avatar, at = LOC_AT[ch];
  if (!at || dist(at.x * 16 + 8, at.y * 16 + 8, A.x, A.y) >= 44) return;
  const cx = Math.round(G.ocamX), cy = Math.round(G.ocamY);
  const x = clamp(at.x * 16 + 8 - cx - textW(label) / 2, 2, VW - textW(label) - 2);
  ctx.fillStyle = PAL.k;
  ctx.fillRect(x - 2, HUD_H + at.y * 16 - 12 - cy, textW(label) + 4, 10);
  text(label, x, HUD_H + at.y * 16 - 11 - cy, PAL.a);
}

// ---- HUD ----
function renderHUD() {
  ctx.fillStyle = PAL.k;
  ctx.fillRect(0, 0, VW, HUD_H);
  ctx.fillStyle = PAL.G;
  ctx.fillRect(0, HUD_H - 1, VW, 1);
  // 16-bit: the pips are icons and need no label; the 3x5 fallback keeps LIFE/MAG and its old spacing
  const big = bigFont(), px = i => big ? 8 + i * 8 : 26 + i * 6;
  if (!big) { text('LIFE', 4, 3, PAL.r); text('MAG', 4, 12, PAL.c); }
  for (let i = 0; i < G.maxHp; i++) {
    const half = G.hp > i && G.hp < i + 1;   // EASY: half a pip left shows dimmed
    if (half) ctx.globalAlpha = 0.45;
    const drew = drawArt('hud', i < G.hp ? 0 : 1, px(i), 10, false);
    ctx.globalAlpha = 1;
    if (drew) continue;
    ctx.fillStyle = i < G.hp ? PAL.r : PAL.R;
    ctx.fillRect(px(i) - 2, 3, 5, 5);
  }
  for (let i = 0; i < G.maxMg; i++) {
    if (drawArt('hud', i < G.mg ? 2 : 3, px(i), 20, false)) continue;
    ctx.fillStyle = i < G.mg ? PAL.c : '#004058';
    ctx.fillRect(px(i) - 2, 12, 5, 5);
  }
  // heat: fills while you stand in the sun
  const P = G.player;
  if (P && P.heatT > 0.15) {
    const hy = big ? 21 : 19, hh = big ? 2 : 3;
    ctx.fillStyle = PAL.B; ctx.fillRect(4, hy, 68, hh);
    ctx.fillStyle = P.heatT > heatLimit() - 1 ? PAL.r : PAL.y; ctx.fillRect(4, hy, 68 * Math.min(1, P.heatT / heatLimit()), hh);
  }
  text('XP ' + G.xp + (cheapest() < Infinity ? '/' + cheapest() : ''), 108, 3, levelReady() ? PAL.w : PAL.y);
  text('A' + G.atk + ' M' + G.mag + ' L' + G.lif, 108, 12, PAL.m);
  const sp = SPELLS[G.spellSel];
  text('SP:' + (G[sp.flag] ? sp.name : '-'), big ? 186 : 160, 3, PAL.m);
  // what is running right now, until it wears off or you leave; and the heat warning. Under the HUD: there's no room in it.
  const on = [G.jumpT > 0 && 'JUMP', G.spf && 'SPF', G.rocket && 'ROCKET', G.shade && 'SHADE', P && P.flyT > 0 && 'FLY ' + Math.ceil(P.flyT)].filter(Boolean).join(' ');
  const heat = P && P.heatT > heatLimit() - 1 && ((performance.now() / 200) | 0) % 2 === 0 ? 'HEAT' : '';
  if ((on || heat) && G.mode === 'side') {
    const gap = on && heat ? textW(' ') : 0;
    ctx.fillStyle = PAL.k; ctx.fillRect(0, HUD_H, textW(on) + gap + textW(heat) + 6, LINE_H() + 2);
    text(heat, 3 + text(on, 3, HUD_H + 2, PAL.c) + gap, HUD_H + 2, PAL.r);
  }
  // Fiesta medals
  for (let i = 0; i < MEDALS; i++) {
    if (drawArt('hud', i < G.medals ? 6 : 5, 302 + i * 8, 10, false)) continue;
    ctx.fillStyle = i < G.medals ? PAL.y : PAL.G;
    ctx.fillRect(299 + i * 8, 3, 5, 5);
    if (i < G.medals) { ctx.fillStyle = PAL.c; ctx.fillRect(299 + i * 8, 3, 5, 2); }
  }
  let ix = 208;
  // a carried pickup: its 10 px HUD icon, or the pixel sprite at its old baseline
  const item = (k, by) => drawArt('hud_items', PICKUP_ART[k], ix, 22, false) || drawSpr(k, 0, ix, by, false);
  if (G.hasParking) { item('validation', 20); ix += 13; }
  if (G.hasThrust) { item('scroll', 19); ix += 13; }
  if (G.hasKeystone && !G.gateOpen) { item('keystone', 21); ix += hasArt('hud_items') ? 12 : 9; }
  // key_items.png follows the pickups in hud_items: note, jackhammer, waders
  if (G.hasNote) { if (!drawArt('hud_items', 12, ix, 22, false)) { ctx.fillStyle = PAL.a; ctx.fillRect(ix - 3, 14, 7, 6); ctx.fillStyle = PAL.k; ctx.fillRect(ix - 2, 16, 5, 1); } ix += 11; }
  if (G.hasJackhammer) { if (!drawArt('hud_items', 13, ix, 22, false)) { ctx.fillStyle = PAL.o; ctx.fillRect(ix - 3, 14, 3, 7); ctx.fillStyle = PAL.m; ctx.fillRect(ix, 17, 4, 2); } ix += hasArt('hud_items') ? 11 : 9; }
  if (G.hasWaders) { if (!drawArt('hud_items', 14, ix, 22, false)) { ctx.fillStyle = PAL.d; ctx.fillRect(ix - 3, 14, 5, 7); ctx.fillStyle = PAL.k; ctx.fillRect(ix - 3, 20, 6, 1); } ix += hasArt('hud_items') ? 11 : 9; }
  // key_items_2 follows those: Maglite, accordion
  if (G.hasMaglite) { if (!drawArt('hud_items', 15, ix, 22, false)) drawSpr('maglite', 0, ix + 2, 20, false); ix += hasArt('hud_items') ? 11 : 13; }
  if (G.hasAccordion) { if (!drawArt('hud_items', 16, ix, 22, false)) drawSpr('accordion', 0, ix, 21, false); ix += 11; }
  if (G.hasRose) { ix += 2; item('rose', 22); }
  if (G.mode === 'side' && G.scene && PALACES[G.scene.palace]) {   // small keys for this palace
    ix = VW - 52; item('skey', 21); text('' + (G.keys[G.scene.palace] || 0), VW - 45, 13, PAL.m);
    ix = VW - 66; if (G.carry[G.scene.palace] && !G.pinned[G.scene.palace]) item('medal', 22);
  }
  text('X' + G.lives, VW - 20, 3, PAL.w);
  if (!drawArt('hud', 4, VW - 28, 11, false)) drawSpr('mini', 0, VW - 28, 12, false);
}

function renderDialog() {
  const d = G.dialog;
  const line = d.lines[d.i];
  const shown = line.slice(0, d.chars | 0);
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(10, VH - 44, VW - 20, 38);
  ctx.fillStyle = PAL.m;
  ctx.fillRect(10, VH - 44, VW - 20, 1); ctx.fillRect(10, VH - 7, VW - 20, 1);
  ctx.fillRect(10, VH - 44, 1, 38); ctx.fillRect(VW - 11, VH - 44, 1, 38);
  let left = shown.length, y = VH - 38;   // typed out across the wrapped lines
  for (const l of wrap(line, VW - 48)) {
    if (left <= 0) break;
    text(l.slice(0, left), 16, y, PAL.w);
    left -= l.length + 1; y += 11;
  }
  if ((d.chars | 0) >= line.length && ((performance.now() / 350) | 0) % 2 === 0) {
    text('>', VW - 22, VH - 16, PAL.y);
  }
}

function renderShop() {
  const items = shopItems();
  ctx.fillStyle = 'rgba(0,0,0,0.94)';
  ctx.fillRect(40, 30, VW - 80, 160);
  ctx.fillStyle = PAL.y;
  ctx.fillRect(40, 30, VW - 80, 1); ctx.fillRect(40, 189, VW - 80, 1);
  ctx.fillRect(40, 30, 1, 160); ctx.fillRect(VW - 41, 30, 1, 160);
  textC('EL PUESTO DE LA ABUELA', 38, PAL.y);
  if (!drawArt('cast', 3, VW / 2, 86, false)) drawSpr('abuela', 0, VW / 2, 84, false);
  textC('SHE WILL NOT TAKE YOUR MONEY.', 90, PAL.y);
  items.forEach((it, i) => {
    const y = 102 + i * 11;
    const sel = i === G.shopSel;
    const dim = it.give && (!it.ok() || (it.locked && it.locked()));
    const col = sel ? PAL.w : dim ? PAL.G : PAL.m;
    if (sel) text('>', 90, y, PAL.y);
    text(it.name, 102, y, col);
    if (it.locked && it.locked() && it.ok()) text('?', VW - 96, y, PAL.G);
  });
  textWrapC(items[G.shopSel].desc, 162, PAL.m, VW - 96);
}

function renderQuiz() {
  ctx.fillStyle = 'rgba(0,0,0,0.94)';
  ctx.fillRect(30, 34, VW - 60, 152);
  ctx.fillStyle = PAL.c;
  ctx.fillRect(30, 34, VW - 60, 1); ctx.fillRect(30, 185, VW - 60, 1);
  ctx.fillRect(30, 34, 1, 152); ctx.fillRect(VW - 31, 34, 1, 152);
  textC('KEYSTONE ADMISSIONS', 42, PAL.c, 2);
  EXAM.q.forEach((l, i) => textC(l, 66 + i * 11, PAL.w));
  EXAM.opts.forEach((o, i) => {
    const y = 118 + i * 14, sel = i === G.quizSel;
    if (sel) text('>', 102, y, PAL.y);
    text(o, 114, y, sel ? PAL.w : PAL.m);
  });
  textC('ONE ATTEMPT PER VISIT.', 172, PAL.G);
}

function renderLevelup() {
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(30, 40, VW - 60, 136);
  ctx.fillStyle = PAL.y;
  ctx.fillRect(30, 40, VW - 60, 1); ctx.fillRect(30, 175, VW - 60, 1);
  ctx.fillRect(30, 40, 1, 136); ctx.fillRect(VW - 31, 40, 1, 136);
  textC('LEVEL UP!   XP ' + G.xp, 48, PAL.y, 2);
  const opts = [
    ['ATTACK  ' + G.atk + ' > ' + (G.atk + 1), 'HIT HARDER'],
    ['MAGIC   ' + G.mag + ' > ' + (G.mag + 1), 'CHEAPER SPELLS, +1 MAX MAGIC'],
    ['LIFE    ' + G.lif + ' > ' + (G.lif + 1), '+1 MAX LIFE'],
    ['CANCEL', 'KEEP SAVING. GAME OVER TAKES WHAT YOU HAVE NOT SPENT.']
  ];
  opts.forEach((o, i) => {
    const y = 72 + i * 14, sel = i === G.levelSel, cost = i < 3 ? nextCost(i) : 0;
    const can = i === 3 || G.xp >= cost;
    if (sel) text('>', 84, y, PAL.y);
    text(o[0], 96, y, sel ? PAL.w : can ? PAL.m : PAL.G);
    if (i < 3) text(cost === Infinity ? 'MAX' : cost + '', VW - 110, y, can ? PAL.y : PAL.G);
  });
  textWrapC(opts[G.levelSel][1], 132, PAL.m, VW - 80);
  textC('SEVEN LEVELS TOTAL. CHOOSE ACCORDINGLY.', 160, PAL.G);
}

function renderPause() {
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(0, 0, VW, VH);
  textC('PAUSED', 32, PAL.w, 3);
  ['A/D MOVE   SPACE/K JUMP   J STAB', 'S CROUCH (BLOCKS LOW)   STAND BLOCKS HIGH',
   'IN AIR: DOWN FOR DOWNTHRUST, UP FOR UPSTROKE', 'Q SPELL SELECT   L CAST   E TALK   UP: DOORS',
   'M SOUND   ESC RESUME', 'GAMEPAD: A JUMP  X/B STAB  Y TALK'].forEach((l, i) => textC(l, 62 + i * LINE_H(), PAL.m));
  textC('IN AUGUST, STANDING STILL OUTDOORS COSTS LIFE.', 126, PAL.y);
  textC('SHADE IS A RESOURCE.', 126 + LINE_H(), PAL.y);
  textC('MEDALS ' + G.medals + '/' + MEDALS + '   ' + (G.quest2 ? 'SECOND QUEST' : G.easy ? 'EASY MODE' : 'AUTOSAVES ON THE REGULAR'), 152, PAL.G);
  const known = SPELLS.filter(s => G[s.flag]).map(s => s.name);
  const y = textWrapC('SPELLS: ' + (known.join(', ') || 'NONE YET'), 166, PAL.c, VW - 40);
  const carrying = [G.hasPutter && !G.jumpKnown && 'A PUTTER', G.hasMolcajete && !G.healKnown && 'A MOLCAJETE',
    G.hasHoney && !G.spfKnown && 'LOCAL HONEY', G.hasWater && !G.gaveWater && 'A BUCKET OF WATER'].filter(Boolean);
  if (carrying.length) textWrapC('CARRYING: ' + carrying.join(', '), y + 4, PAL.a, VW - 40);
}

function renderGameover() {
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.globalAlpha = 0.5;
  const bigKing = drawArt('cedar_king', 0, VW / 2, 190, false, null, 2);
  if (!bigKing) drawSpr('cedarking', 0, VW / 2, 170, false, 4);
  ctx.globalAlpha = 1;
  if (!bigKing || !drawArt('cedar_crown', 0, VW / 2, 120, false, null, 2)) drawSpr('cedarcrownp', 0, VW / 2, 116, false, 4);
  textC('GAME OVER', 78, PAL.r, 3);
  textC('THE POLLEN COUNT RISES', 108, PAL.y);
  if (((performance.now() / 400) | 0) % 2 === 0) textC('PRESS ENTER TO CONTINUE', 128, PAL.w);
  if (G.lostXp) textC('UNSPENT XP LOST: ' + G.lostXp, 150, PAL.r);
  textC('LEVELS AND GEAR KEPT. REMEMBER THE ALAMO.', 200, PAL.G);
}

function renderWin() {
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(0, 0, VW, VH);
  textC('THE CEDAR HAS FALLEN', 44, PAL.y, 2);
  textC('THE CITY WAKES', 68, PAL.w, 2);
  if (!drawArt('cast', 0, VW / 2 - 16, 132, false)) drawSpr('marisa', 0, VW / 2 - 20, 130, false, 2);
  if (!drawArt('greg', 0, VW / 2 + 16, 132, true)) drawSpr('g_idle', 0, VW / 2 + 20, 130, true, 2);
  drawSpr('rose', 0, VW / 2, 104, false, 2);
  textC('TIME ' + clock(G.playTime) + '   LV ' + level() + '   XP ' + G.xp, 146, PAL.m);
  textC('"—GRAB TACOS."', 160, PAL.a);
  if (((performance.now() / 400) | 0) % 2 === 0) textC('ENTER: KEEP DRIVING', 180, PAL.m);
}

// The roll call, Zelda II style: who held each medal, who taught each spell, and what became of everyone.
const TEACHERS = [['STONE OAK', 'THE GOLF PRO', 1], ['THE PEARL', 'THE ABUELA', 0], ['ALAMO HEIGHTS', 'THE LIFEGUARD', 2],
  ['SOUTHTOWN', 'THE FIREWORKS MAN', 3], ['HELOTES', 'THE GRACKLE MAN', 4], ['LA VILLITA', 'THE RAINMAKER', 5],
  ['KING WILLIAM', 'THE AUTO-GLASS MAN', 6], ['WEST SIDE', 'THE CURANDERA', 7]];
function creditLines() {
  const L = [['MARISA II', PAL.y, 2], ['THE ADVENTURE OF GREG', PAL.w], [''], [''], ['SIX FIESTA MEDALS', PAL.y], ['']];
  for (const B of Object.values(BOSS)) if (B.medal) L.push([B.medal + ' - ' + B.name, PAL.w]);
  L.push([''], ['UNDER THE ALAMO', PAL.y], [''], [BOSS.cedarking.name, PAL.w], [BOSS.shadowgreg.name, PAL.w], [''], [''], ['EIGHT TEACHERS', PAL.y], ['']);
  for (const [town, who, i] of TEACHERS) {
    const known = G[SPELLS[i].flag];
    L.push([town + ': ' + who, known ? PAL.w : PAL.G], [known ? SPELLS[i].name : SPELLS[i].name + ' (NOT LEARNED)', known ? PAL.c : PAL.G], ['']);
  }
  const pins = Object.keys(SCENES).filter(n => SCENES[n]().pin).length, got = Object.keys(G.pins || {}).length;
  L.push([''], ['AND', PAL.y], [''],
    [G.hasDog ? 'CHATO WENT HOME.' : 'CHATO IS STILL WAITING AT ESPADA.', PAL.a],
    ['THE MATACHINES KEPT DANCING.', PAL.a],
    ['THE HOA PRESIDENT FILED THE PAPERWORK.', PAL.a],
    ['BAGU IS STILL BAGU.', PAL.a],
    ['THE GRACKLES KEPT THE PARKING LOT.', PAL.a],
    ['IT RAINED ON THE HILL COUNTRY.', PAL.a], [''], [''],
    ['TIME ' + clock(G.playTime) + '   LEVEL ' + level() + (G.easy ? '   EASY' : '') + (G.quest2 ? '   2ND QUEST' : ''), PAL.m],
    ['FIESTA PINS ' + got + ' OF ' + pins, PAL.m], [''], [''], [''],
    ['THANK YOU FOR PLAYING', PAL.y, 2], [''], ['THERE IS NO MARISA III.', PAL.G], ['DO NOT WORRY ABOUT IT.', PAL.G]);
  return L;
}
function renderCredits() {
  ctx.fillStyle = PAL.k; ctx.fillRect(0, 0, VW, VH);
  const L = creditLines(), gap = 14, end = VH / 2 + (L.length - 1) * gap - 20;   // stop with the last lines around the middle
  const y0 = VH - Math.min(G.creditsT * 22, end);
  L.forEach(([txt, col, scale], i) => {
    const y = y0 + i * gap;
    if (txt && y > -20 && y < VH + 4) textC(txt, y, col, scale);
  });
  if (G.creditsT * 22 >= end && ((performance.now() / 400) | 0) % 2 === 0) textC('ENTER: KEEP DRIVING   N: SECOND QUEST', VH - 14, PAL.m);
}

let titleT = 0;
function renderTitle() {
  titleT += 1 / 60;
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, VW, VH);
  if (hasArt('bg_rooftop')) {                    // sundown over downtown from the top of the Rim, drifting
    const off = (titleT * 6) % (2 * 384);
    for (let i = 0; i < 3; i++) {
      const x = i * 384 - off;
      if (i % 2 === 0) ctx.drawImage(IMG.bg_rooftop, x, -40, 384, 192);
      else { ctx.save(); ctx.translate(x + 384, -40); ctx.scale(-1, 1); ctx.drawImage(IMG.bg_rooftop, 0, 0, 384, 192); ctx.restore(); }
    }
  } else {
    // dusk over the hill country
    ctx.fillStyle = '#4428BC'; ctx.fillRect(0, 0, VW, 90);
    ctx.fillStyle = '#6844FC'; ctx.fillRect(0, 60, VW, 20);
    ctx.fillStyle = PAL.o; ctx.fillRect(0, 78, VW, 10);
    ctx.fillStyle = '#F87858'; ctx.fillRect(0, 88, VW, 6);
    ctx.fillStyle = PAL.Y;
    for (let i = 0; i < 30; i++) if (hash(i, 3) > 0.5) ctx.fillRect((hash(i, 7) * VW) | 0, (hash(i, 13) * 56) | 0, 1, 1);
    // cedar ridgeline
    for (let i = 0; i < 26; i++) {
      const bx = i * 16 - 4, bh = 18 + hash(i, 2) * 22;
      ctx.fillStyle = PAL.e; ctx.fillRect(bx, 94 - bh, 14, bh + 8);
    }
  }
  ctx.fillStyle = PAL.k; ctx.fillRect(0, 100, VW, VH - 100);
  const shade = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, 100) : null;   // keep the title readable over the sky
  if (shade && hasArt('bg_rooftop')) { shade.addColorStop(0, 'rgba(0,0,0,0.45)'); shade.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = shade; ctx.fillRect(0, 0, VW, 100); }
  // the loop, still under construction
  ctx.fillStyle = PAL.G; ctx.fillRect(0, 128, VW, 5);
  for (let i = 0; i < 13; i++) { ctx.fillStyle = PAL.o; ctx.fillRect(i * 30 + ((titleT * 20) % 30), 121, 4, 7); }
  const bob = Math.sin(titleT * 2) * 2;
  textC('MARISA II', 22 + bob, PAL.y, 5);
  textC('THE ADVENTURE OF GREG', 64 + bob, PAL.w, 2);
  textC('A 16-BIT QUEST AT 281 AND 1604', 152, PAL.m);
  if (!drawArt('greg', 10, VW / 2 - 40, 198, false)) { drawSpr('g_stab', 0, VW / 2 - 56, 194, false, 2); ctx.fillStyle = PAL.b; ctx.fillRect(VW / 2 - 44, 194 - 20, 24, 4); }
  if (!drawArt('cartknight', 2, VW / 2 + 40, 198, true)) { drawSpr('cartknight', 0, VW / 2 + 58, 192, true, 2); drawCart(VW / 2 + 58 - 14, 192, -1, true); }
  else drawCart(VW / 2 + 40, 198, -1, true);
  if (((performance.now() / 400) | 0) % 2 === 0) {
    textC(hasSave() ? 'ENTER: CONTINUE' : 'PRESS ENTER', 102, PAL.w, 2);
  }
  if (hasSave()) {
    const arming = G.eraseArm && performance.now() - G.eraseArm < 3000;
    textC(arming ? 'PRESS N AGAIN TO ERASE SAVE' : 'N: NEW GAME', 140, arming ? PAL.r : PAL.G);
  }
  textC((hasSave() ? 'NEW GAME MODE: ' : 'MODE: ') + (G.easyPick ? 'EASY' : 'NORMAL') + '  (LEFT/RIGHT)', 163, G.easyPick ? PAL.c : PAL.m);
  textC('THERE IS NO MARISA I. DO NOT WORRY ABOUT IT.', VH - 9, PAL.G);
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < VH; y += 2) ctx.fillRect(0, y, VW, 1);
}

// ---------------- main loop ----------------
let lastT = performance.now();
function frame(now) {
  pollPad();
  // clamp both ends: a negative dt would run animation counters backwards and index SPR[-1]
  const dt = Math.max(0, Math.min(0.05, (now - lastT) / 1000));
  lastT = now;
  update(dt);
  render();
  for (const k in pressed) pressed[k] = false;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- self-checks ----------------
(function sanity() {
  console.assert(OVER.length === OVER_H && OVER.every(r => r.length === OVER_W), 'overworld dims');
  for (const name in SCENES) {
    const s = SCENES[name]();
    console.assert(s.tiles.length === ROWS, name + ' rows');
    const w = s.tiles[0].length;
    console.assert(s.tiles.every(r => r.length === w), name + ' width uniform');
    (s.spawns || []).forEach(sp => {
      console.assert(sp[1] < w && sp[2] < ROWS, name + ' spawn in bounds');
      console.assert(['ant', 'grackle', 'bat', 'wisp', 'cone', 'cartknight', 'tourist'].includes(sp[0]), name + ' knows enemy ' + sp[0]);
    });
    Object.keys(s.doors || {}).forEach(col => {
      const c = +col;
      console.assert(s.tiles.some(r => r[c] === 'D'), name + ' door tile at col ' + col);
      const d = s.doors[col];
      console.assert(typeof d !== 'string' || SCENES[d], name + ' door target ' + d);
    });
    if (s.boss) console.assert(BOSS[s.boss], name + ' boss ' + s.boss);
    console.assert(!s.backdrop || typeof s.backdrop === 'string', name + ' backdrop');
    (s.npcs || []).forEach(n => console.assert(SPR[n.kind], name + ' npc sprite ' + n.kind));
    (s.loot || []).forEach(l => console.assert(SPR[l[0]], name + ' loot sprite ' + l[0]));
  }
  console.assert(Object.values(LOC).every(n => SCENES[n]), 'LOC targets exist');
  console.assert(Object.keys(LOC).every(k => LOC_NAME[k]), 'every location is labelled');
  console.assert(Object.values(PALACES).every(p => SCENES[p.entry]), 'palace entrances exist');
  for (const n in SPR) SPR[n].forEach(f => {
    console.assert(f.length > 0, 'sprite ' + n);
    console.assert(f.every(r => r.length === f[0].length), 'sprite ' + n + ' is rectangular');
  });
  // six medals is the gate, and six bosses hand them out
  console.assert(Object.values(BOSS).filter(b => b.medal).length === MEDALS, 'exactly six medals exist');
  console.assert(EXAM.opts[EXAM.answer] === 'THE KEYSTONE', 'the exam has the right answer');
})();
