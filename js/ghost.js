// ghost.js — enregistrement et relecture du « fantôme » (meilleur temps) en contre-la-montre.
// Échantillonnage à intervalle fixe ; chaque échantillon = position + pose compactée.
// pose (entier): bits 0-1 = power(0 petit,1 grand,2 feu) | bit2 = dir(1=droite) | bit3 = en l'air | bit4 = en mouvement

const SAMPLE_MS = 50;        // 20 Hz
const MAX_SAMPLES = 4000;    // ~200 s max

export class GhostRecorder {
  constructor(sampleMs = SAMPLE_MS) { this.dt = sampleMs; this.acc = 0; this.f = []; }
  reset() { this.acc = 0; this.f = []; }
  update(dtSec, player, runMs) {
    this.acc += dtSec * 1000;
    while (this.acc >= this.dt && this.f.length < MAX_SAMPLES * 3) {
      this.acc -= this.dt;
      this._push(player);
    }
  }
  _push(p) {
    const power = p.power === 'fire' ? 2 : p.power === 'big' ? 1 : 0;
    const moving = Math.abs(p.vx) > 6 ? 1 : 0;
    const air = p.onGround ? 0 : 1;
    const dir = p.dir > 0 ? 1 : 0;
    const pose = power | (dir << 2) | (air << 3) | (moving << 4);
    this.f.push(Math.round(p.x), Math.round(p.y), pose);
  }
  data() { return { dt: this.dt, f: this.f }; }
}

export class GhostPlayer {
  constructor(data) { this.dt = data.dt || SAMPLE_MS; this.f = data.f || []; this.n = Math.floor(this.f.length / 3); }
  get valid() { return this.n >= 2; }
  poseAt(runMs) {
    if (this.n === 0) return null;
    const fpos = runMs / this.dt;
    let i = Math.floor(fpos);
    if (i >= this.n - 1) i = this.n - 1;
    if (i < 0) i = 0;
    const base = i * 3;
    let x = this.f[base], y = this.f[base + 1];
    const pose = this.f[base + 2];
    if (i < this.n - 1) {
      const frac = fpos - i;
      x += (this.f[base + 3] - x) * frac;
      y += (this.f[base + 4] - y) * frac;
    }
    return {
      x, y, power: pose & 3, dir: (pose >> 2) & 1 ? 1 : -1,
      air: (pose >> 3) & 1, moving: (pose >> 4) & 1,
      finished: runMs >= this.n * this.dt,
    };
  }
}

const KEY = (levelId) => 'bigmario.ghost.' + levelId;
export const GhostStore = {
  load(levelId) {
    try { const s = localStorage.getItem(KEY(levelId)); return s ? JSON.parse(s) : null; }
    catch { return null; }
  },
  save(levelId, data) {
    try { localStorage.setItem(KEY(levelId), JSON.stringify(data)); return true; }
    catch { return false; }
  },
  has(levelId) { try { return !!localStorage.getItem(KEY(levelId)); } catch { return false; } },
};
