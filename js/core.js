// core.js — constantes partagées + utilitaires
export const TILE = 16;
export const VIEW_W = 320;      // résolution logique (paysage 5:3)
export const VIEW_H = 192;
export const VIEW_TW = VIEW_W / TILE; // 20
export const VIEW_TH = VIEW_H / TILE; // 12

// Physique (unités: pixels, secondes)
export const GRAVITY = 1500;
export const MAX_FALL = 560;
export const RUN_ACCEL = 900;
export const RUN_MAX = 110;
export const SPRINT_MAX = 175;
export const FRICTION = 1100;
export const AIR_ACCEL = 600;
export const JUMP_VY = -395;        // impulsion saut
export const JUMP_CUT = 0.42;       // saut variable: coupe la vitesse au relâché
export const COYOTE = 0.09;         // tolérance saut après bord
export const JUMP_BUFFER = 0.11;    // tampon d'appui

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[(Math.random() * arr.length) | 0];

export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Petit gestionnaire d'événements
export class Emitter {
  constructor() { this.map = new Map(); }
  on(ev, fn) { (this.map.get(ev) || this.map.set(ev, []).get(ev)).push(fn); return this; }
  emit(ev, ...args) { (this.map.get(ev) || []).forEach((f) => f(...args)); }
}

// Stockage persistant simple (progression, options)
export const Save = {
  key: 'bigmario.save.v1',
  data: null,
  load() {
    if (this.data) return this.data;
    try { this.data = JSON.parse(localStorage.getItem(this.key)) || {}; }
    catch { this.data = {}; }
    return this.data;
  },
  get(k, def) { const d = this.load(); return k in d ? d[k] : def; },
  set(k, v) { const d = this.load(); d[k] = v; try { localStorage.setItem(this.key, JSON.stringify(d)); } catch {} },
};
