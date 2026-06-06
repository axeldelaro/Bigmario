// level.js — tilemap, collisions AABB, rendu décor + parallax, gestion des blocs
import { TILE, VIEW_W, VIEW_H } from './core.js';
import { tileCanvas } from './art.js';

const SOLID = new Set(['X', 'H', 'B', '?', 'M', 'U', 'L', 'W', 'D', 'p', 'P', 'T', 'Q']);
const SEMI = new Set(['=']); // solide seulement par le dessus
const HAZARD = new Set(['^']);
const ENEMY_CHARS = { g: 'goon', k: 'shell', f: 'fly', z: 'spiky', O: 'boss', v: 'plant', t: 'lob' };
const ITEM_QUESTION = { '?': 'coin', 'M': 'mushroom', 'Q': 'flower', 'U': 'star', 'L': 'oneup', 'W': 'feather' };

export class Level {
  constructor(def) {
    this.def = def;
    this.theme = def.theme || 'overworld';
    this.time = def.time || 300;
    this.rows = def.map.map((r) => r.split(''));
    this.h = this.rows.length;
    this.w = Math.max(...this.rows.map((r) => r.length));
    // normaliser largeur
    this.rows.forEach((r) => { while (r.length < this.w) r.push(' '); });
    this.pixelW = this.w * TILE;
    this.pixelH = this.h * TILE;
    this.spawns = [];      // {type,x,y}
    this.playerStart = { x: 32, y: 0 };
    this.goal = null;
    this.coins = [];       // pièces issues de 'o'
    this.gems = [];        // gemmes cachées issues de 'j'
    this.platforms = [];   // plateformes mobiles issues de 'm'(horiz) / 'n'(vert)
    this.checkpoints = []; // {tx,ty}
    this.warps = [];       // entrées 'Q' {tx,ty}
    this.warpDests = [];   // destinations 'q' {tx,ty}
    this.hasBoss = false;
    this._extract();
    this._bgCache = null;
  }

  _extract() {
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const ch = this.rows[ty][tx];
        const x = tx * TILE, y = ty * TILE;
        if (ch === 'S') { this.playerStart = { x, y }; this.rows[ty][tx] = ' '; }
        else if (ch === 'o') { this.coins.push({ tx, ty }); this.rows[ty][tx] = ' '; }
        else if (ch === 'j') { this.gems.push({ tx, ty }); this.rows[ty][tx] = ' '; }
        else if (ch === 'm') { this.platforms.push({ x, y, axis: 'h' }); this.rows[ty][tx] = ' '; }
        else if (ch === 'n') { this.platforms.push({ x, y, axis: 'v' }); this.rows[ty][tx] = ' '; }
        else if (ch === 'C') { this.checkpoints.push({ tx, ty }); }
        else if (ch === 'Q') { this.warps.push({ tx, ty }); } // entrée de tuyau-warp (reste solide)
        else if (ch === 'q') { this.warpDests.push({ tx, ty }); this.rows[ty][tx] = ' '; }
        else if (ENEMY_CHARS[ch]) { if (ch === 'O') this.hasBoss = true; this.spawns.push({ type: ENEMY_CHARS[ch], x, y }); this.rows[ty][tx] = ' '; }
        else if (ch === 'G') { if (!this.goal) this.goal = { x: x + 4, y: 0, tx }; }
      }
    }
    if (!this.goal && !this.hasBoss) this.goal = { x: this.pixelW - 48, y: 0, tx: this.w - 3 };
  }

  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return tx < 0 ? 'X' : ' ';
    return this.rows[ty][tx];
  }
  setTile(tx, ty, ch) { if (ty>=0 && ty<this.h && tx>=0 && tx<this.w) this.rows[ty][tx] = ch; }
  isSolid(ch) { return SOLID.has(ch); }
  isQuestion(ch) { return ch === '?' || ch === 'M' || ch === 'U' || ch === 'L' || ch === 'W'; }

  solidAt(px, py) { return SOLID.has(this.tile(Math.floor(px / TILE), Math.floor(py / TILE))); }
  hazardAt(rect) {
    const x0 = Math.floor(rect.x / TILE), x1 = Math.floor((rect.x + rect.w - 1) / TILE);
    const y0 = Math.floor(rect.y / TILE), y1 = Math.floor((rect.y + rect.h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (HAZARD.has(this.tile(tx, ty))) return true;
    return false;
  }

  // Déplacement avec collision tuile par tuile. Renvoie infos de contact.
  // ent: {x,y,w,h,vx,vy}. dt en secondes.
  moveAndCollide(ent, dt, opts = {}) {
    const res = { hitX: false, hitY: false, onGround: false, ceiling: false, ceilTile: null };
    // --- X ---
    ent.x += ent.vx * dt;
    if (ent.vx !== 0) {
      const dir = ent.vx > 0 ? 1 : -1;
      const edgeX = dir > 0 ? ent.x + ent.w : ent.x;
      const tx = Math.floor(edgeX / TILE);
      const y0 = Math.floor((ent.y + 1) / TILE);
      const y1 = Math.floor((ent.y + ent.h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (SOLID.has(this.tile(tx, ty))) {
          ent.x = dir > 0 ? tx * TILE - ent.w : (tx + 1) * TILE;
          ent.vx = 0; res.hitX = true; break;
        }
      }
    }
    // --- Y ---
    ent.y += ent.vy * dt;
    if (ent.vy > 0) { // descente
      const edgeY = ent.y + ent.h;
      const ty = Math.floor(edgeY / TILE);
      const x0 = Math.floor((ent.x + 1) / TILE);
      const x1 = Math.floor((ent.x + ent.w - 1) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        const ch = this.tile(tx, ty);
        const semi = SEMI.has(ch);
        const prevBottom = (ent.y - ent.vy * dt) + ent.h;
        if (SOLID.has(ch) || (semi && prevBottom <= ty * TILE + 2 && !opts.dropThrough)) {
          ent.y = ty * TILE - ent.h; ent.vy = 0; res.onGround = true; res.hitY = true; break;
        }
      }
    } else if (ent.vy < 0) { // montée
      const edgeY = ent.y;
      const ty = Math.floor(edgeY / TILE);
      const x0 = Math.floor((ent.x + 1) / TILE);
      const x1 = Math.floor((ent.x + ent.w - 1) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (SOLID.has(this.tile(tx, ty))) {
          ent.y = (ty + 1) * TILE; ent.vy = 0; res.hitY = true; res.ceiling = true;
          res.ceilTile = { tx, ty }; break;
        }
      }
    }
    return res;
  }

  // Frappe d'un bloc par le dessous (renvoie le type d'événement)
  hitBlock(tx, ty) {
    const ch = this.tile(tx, ty);
    if (ch === 'B') return { kind: 'brick', tx, ty };
    if (this.isQuestion(ch)) { this.setTile(tx, ty, 'D'); return { kind: 'question', item: ITEM_QUESTION[ch], tx, ty }; }
    return null;
  }

  // ---------- Rendu ----------
  drawBackground(c, cam) {
    const theme = this.theme;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    // ciel en dégradé
    let g;
    try { g = c.createLinearGradient(0, 0, 0, VIEW_H); } catch { g = null; }
    if (theme === 'underground') { if (g) { g.addColorStop(0, '#0a1830'); g.addColorStop(1, '#040a16'); } c.fillStyle = g || '#08111f'; }
    else if (theme === 'castle') { if (g) { g.addColorStop(0, '#241019'); g.addColorStop(1, '#0e0608'); } c.fillStyle = g || '#160e12'; }
    else { if (g) { g.addColorStop(0, '#6fc0ff'); g.addColorStop(0.7, '#9fd6ff'); g.addColorStop(1, '#cdecff'); } c.fillStyle = g || '#5fa8ff'; }
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    if (theme === 'overworld') {
      // soleil + halo
      c.fillStyle = '#fff7d0'; c.globalAlpha = 0.9;
      c.beginPath(); c.arc(VIEW_W - 48, 38, 14, 0, 7); c.fill();
      c.globalAlpha = 0.2; c.beginPath(); c.arc(VIEW_W - 48, 38, 24, 0, 7); c.fill(); c.globalAlpha = 1;
      // montagnes lointaines (parallaxe lente)
      const m = (cam.x * 0.12) % 180;
      c.fillStyle = '#7fa8d8';
      for (let i = -1; i < VIEW_W / 180 + 2; i++) {
        const bx = i * 180 - m;
        c.beginPath(); c.moveTo(bx, VIEW_H - 20); c.lineTo(bx + 50, VIEW_H - 78); c.lineTo(bx + 100, VIEW_H - 20); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.moveTo(bx + 42, VIEW_H - 66); c.lineTo(bx + 50, VIEW_H - 78); c.lineTo(bx + 58, VIEW_H - 66); c.fill();
        c.fillStyle = '#7fa8d8';
      }
      // collines proches
      const off = (cam.x * 0.3) % 160;
      c.fillStyle = '#46b454';
      for (let i = -1; i < VIEW_W / 160 + 2; i++) {
        const bx = i * 160 - off;
        c.beginPath(); c.arc(bx + 40, VIEW_H - 14, 40, Math.PI, 0); c.fill();
        c.beginPath(); c.arc(bx + 112, VIEW_H - 14, 26, Math.PI, 0); c.fill();
      }
      // arbres/buissons
      const to = (cam.x * 0.5) % 96;
      for (let i = -1; i < VIEW_W / 96 + 2; i++) tree(c, i * 96 - to + 20, VIEW_H - 20);
      // nuages animés
      const co = (cam.x * 0.15 + now * 6) % 220;
      c.fillStyle = '#ffffffe0';
      for (let i = -1; i < VIEW_W / 220 + 2; i++) { const bx = i * 220 - co + 30; cloud(c, bx, 26); cloud(c, bx + 130, 50); }
    } else if (theme === 'underground') {
      // veines minérales + cristaux scintillants
      const off = (cam.x * 0.25) % 80;
      c.strokeStyle = '#16263f'; c.lineWidth = 3;
      for (let x = -80; x < VIEW_W + 80; x += 80) {
        c.beginPath(); c.moveTo(x - off, 0); c.lineTo(x - off + 30, 60); c.lineTo(x - off + 10, 120); c.lineTo(x - off + 40, VIEW_H); c.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const x = ((i * 73) - cam.x * 0.3) % (VIEW_W + 40); const px = (x + VIEW_W + 40) % (VIEW_W + 40) - 20;
        const y = 24 + (i * 53) % (VIEW_H - 48);
        const tw = 0.5 + 0.5 * Math.sin(now * 3 + i);
        c.fillStyle = `rgba(80,200,255,${0.25 + tw * 0.4})`;
        c.beginPath(); c.moveTo(px, y - 5); c.lineTo(px + 3, y); c.lineTo(px, y + 6); c.lineTo(px - 3, y); c.fill();
      }
    } else {
      // mur de briques sombre + torches vacillantes
      const off = (cam.x * 0.2) % 32;
      c.fillStyle = '#1d1216';
      for (let y = 0; y < VIEW_H; y += 16) for (let x = -32; x < VIEW_W + 32; x += 32) {
        c.fillRect(x - off + ((y / 16) % 2) * 16, y, 30, 14);
      }
      const so = (cam.x * 0.4) % 140;
      for (let i = -1; i < VIEW_W / 140 + 2; i++) torch(c, i * 140 - so + 40, 36, now, i);
    }
  }

  drawTiles(c, cam) {
    const tx0 = Math.max(0, Math.floor(cam.x / TILE));
    const tx1 = Math.min(this.w - 1, Math.floor((cam.x + VIEW_W) / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE));
    const ty1 = Math.min(this.h - 1, Math.floor((cam.y + VIEW_H) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ch = this.rows[ty][tx];
        if (ch === ' ' || ch === 'G') continue;
        const img = tileCanvas(ch, this.theme);
        if (img) c.drawImage(img, Math.round(tx * TILE - cam.x), Math.round(ty * TILE - cam.y));
      }
    }
    // drapeau d'arrivée
    if (this.goal) {
      const gx = Math.round(this.goal.tx * TILE - cam.x);
      c.fillStyle = '#cfd6e0'; c.fillRect(gx + 7, 16, 2, this.pixelH);
      c.fillStyle = '#ff5d5d';
      c.beginPath(); c.moveTo(gx + 9, 22); c.lineTo(gx + 26, 28); c.lineTo(gx + 9, 34); c.fill();
      c.fillStyle = '#2a6'; c.fillRect(gx + 4, this.pixelH - cam.y - 0, 8, 8);
    }
  }
}

function cloud(c, x, y) {
  c.beginPath();
  c.arc(x, y, 9, 0, Math.PI * 2); c.arc(x + 11, y, 12, 0, Math.PI * 2);
  c.arc(x + 24, y, 9, 0, Math.PI * 2); c.fillRect(x, y, 24, 10);
  c.fill();
}

function tree(c, x, baseY) {
  c.fillStyle = '#6a3f1c'; c.fillRect(x + 6, baseY - 10, 4, 12);
  c.fillStyle = '#2f8a3c';
  c.beginPath(); c.arc(x + 8, baseY - 14, 9, 0, Math.PI * 2); c.arc(x + 1, baseY - 9, 6, 0, Math.PI * 2); c.arc(x + 15, baseY - 9, 6, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3fa24a'; c.beginPath(); c.arc(x + 6, baseY - 16, 5, 0, Math.PI * 2); c.fill();
}

function torch(c, x, y, now, seed) {
  const flick = 0.7 + 0.3 * Math.sin(now * 12 + seed * 2.1);
  c.fillStyle = '#3a2a1a'; c.fillRect(x - 1, y, 3, 16);             // support
  c.fillStyle = `rgba(255,170,40,${0.25 * flick})`;                 // halo
  c.beginPath(); c.arc(x, y - 2, 12 * flick, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffcb3b'; c.beginPath();                           // flamme
  c.moveTo(x - 3, y); c.quadraticCurveTo(x, y - 11 * flick, x + 3, y); c.fill();
  c.fillStyle = '#ff7b2e'; c.beginPath();
  c.moveTo(x - 2, y); c.quadraticCurveTo(x, y - 7 * flick, x + 2, y); c.fill();
}
