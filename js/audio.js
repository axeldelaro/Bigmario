// audio.js — effets sonores + musique chiptune générés via WebAudio (aucun asset externe)
let ctx = null;
let master = null;
let musicGain = null;
let muted = false;
let musicTimer = null;

function ensure() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.28;
  musicGain.connect(master);
}

export function resumeAudio() { ensure(); if (ctx.state === 'suspended') ctx.resume(); }
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; }
export function isMuted() { return muted; }

function tone(freq, dur, type = 'square', vol = 0.3, dest = null) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(dest || master);
  o.start(); o.stop(ctx.currentTime + dur + 0.02);
}

function slide(f1, f2, dur, type = 'square', vol = 0.3) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(ctx.currentTime + dur + 0.02);
}

function noise(dur, vol = 0.25) {
  if (!ctx || muted) return;
  const n = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = buf;
  const g = ctx.createGain(); g.gain.value = vol;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 800;
  n.connect(f); f.connect(g); g.connect(master);
  n.start(); n.stop(ctx.currentTime + dur);
}

export const SFX = {
  jump() { slide(380, 660, 0.16, 'square', 0.25); },
  bigjump() { slide(330, 720, 0.22, 'square', 0.28); },
  coin() { tone(988, 0.07, 'square', 0.25); setTimeout(() => tone(1319, 0.12, 'square', 0.25), 70); },
  stomp() { slide(420, 120, 0.12, 'square', 0.3); },
  bump() { tone(140, 0.08, 'square', 0.25); },
  brick() { noise(0.18, 0.3); tone(220, 0.08, 'square', 0.2); },
  power() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.25), i * 60)); },
  fire() { slide(900, 300, 0.1, 'sawtooth', 0.2); },
  hurt() { slide(500, 90, 0.3, 'sawtooth', 0.3); },
  die() { [330, 311, 294, 233, 175].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.3), i * 110)); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'square', 0.3), i * 110)); },
  kick() { slide(300, 500, 0.08, 'square', 0.25); },
  pause() { tone(660, 0.06, 'square', 0.2); },
  hit() { noise(0.1, 0.2); slide(600, 200, 0.12, 'sawtooth', 0.25); },
  count() { tone(1047, 0.05, 'square', 0.2); },
  spring() { slide(300, 900, 0.18, 'square', 0.3); },
  gem() { [1047, 1319, 1568, 2093].forEach((f, i) => setTimeout(() => tone(f, 0.09, 'triangle', 0.22), i * 45)); },
  checkpoint() { [659, 880, 1175].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.25), i * 90)); },
  bosshit() { noise(0.2, 0.35); slide(400, 80, 0.25, 'sawtooth', 0.35); },
  boss() { slide(120, 60, 0.4, 'sawtooth', 0.35); },
  boom() { noise(0.4, 0.4); slide(220, 40, 0.4, 'sawtooth', 0.35); },
};

// ---- Musique: boucles chiptune simples par thème ----
const THEMES = {
  overworld: { tempo: 150, bass: [0,0,7,7,5,5,3,3], lead: [12,12,11,12,14,12,11,9, 7,9,12,11,9,7,5,7] },
  underground: { tempo: 130, bass: [0,3,5,3,0,3,5,7], lead: [0,3,7,10,12,10,7,3] },
  castle: { tempo: 140, bass: [0,0,1,1,3,3,1,1], lead: [12,11,12,15,12,11,8,7, 12,11,12,15,17,15,12,11] },
  versus: { tempo: 168, bass: [0,0,5,5,3,3,7,7], lead: [12,15,17,15,12,10,12,17, 19,17,15,12,15,17,12,10] },
};
const SCALE = [0,2,4,5,7,9,11,12,14,16,17,19,21,23,24]; // majeure étendue
const ROOT = 174.61; // F3
const noteFreq = (deg) => ROOT * Math.pow(2, (SCALE[((deg % SCALE.length) + SCALE.length) % SCALE.length] + (deg >= SCALE.length ? 12 : 0)) / 12);

let curTheme = null;
export function playMusic(name) {
  ensure();
  if (curTheme === name && musicTimer) return;
  stopMusic();
  curTheme = name;
  const t = THEMES[name] || THEMES.overworld;
  const beat = 60 / t.tempo / 2; // double-croches
  let step = 0;
  const tick = () => {
    if (muted) { /* on continue le timing mais silencieux */ }
    const b = t.bass[step % t.bass.length];
    const l = t.lead[step % t.lead.length];
    // basse
    if (!muted && ctx) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = noteFreq(b) / 2;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + beat * 0.9);
      o.connect(g); g.connect(musicGain); o.start(); o.stop(ctx.currentTime + beat);
      // lead
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.type = 'square'; o2.frequency.value = noteFreq(l);
      g2.gain.setValueAtTime(0.0001, ctx.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + beat * 0.8);
      o2.connect(g2); g2.connect(musicGain); o2.start(); o2.stop(ctx.currentTime + beat);
    }
    step++;
  };
  musicTimer = setInterval(tick, beat * 1000);
}
export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null; curTheme = null;
}
