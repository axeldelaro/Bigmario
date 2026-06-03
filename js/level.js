// level.js — tilemap, collisions AABB, rendu décor + parallax, gestion des blocs
import { TILE, VIEW_W, VIEW_H } from './core.js';
import { tileCanvas } from './art.js';

const SOLID = new Set(['X', 'H', 'B', '?', 'M', 'U', 'D', 'p', 'P', 'T']);
const SEMI = new Set(['=']); // solide seulement par le dessus
const HAZARD = new Set(['^']);
const ENEMY_CHARS = { g: 'goon', k: 'shell', f: 'fly', z: 'spiky', O: 'boss' };
const ITEM_QUESTION = { '?': 'coin', 'M': 'mushroom', 'U': 'star' };

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
  isQuestion(ch) { return ch === '?' || ch === 'M' || ch === 'U'; }

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
    if (theme === 'underground') c.fillStyle = '#08111f';
    else if (theme === 'castle') c.fillStyle = '#160e12';
    else c.fillStyle = '#5fa8ff';
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    if (theme === 'overworld') {
      // collines parallax
      const off = (cam.x * 0.3) % 160;
      c.fillStyle = '#3fa24a';
      for (let i = -1; i < VIEW_W / 160 + 2; i++) {
        const bx = i * 160 - off;
        c.beginPath(); c.arc(bx + 40, VIEW_H - 16, 36, Math.PI, 0); c.fill();
        c.beginPath(); c.arc(bx + 110, VIEW_H - 16, 24, Math.PI, 0); c.fill();
      }
      // nuages
      const co = (cam.x * 0.15) % 200;
      c.fillStyle = '#ffffffcc';
      for (let i = -1; i < VIEW_W / 200 + 2; i++) {
        const bx = i * 200 - co + 30;
        cloud(c, bx, 28); cloud(c, bx + 120, 54);
      }
    } else if (theme === 'underground') {
      c.fillStyle = '#0e1c33';
      const off = (cam.x * 0.25) % 64;
      for (let x = -64; x < VIEW_W + 64; x += 64) for (let y = 0; y < VIEW_H; y += 64) {
        c.fillRect(x - off + 28, y + 20, 8, 24);
      }
    } else {
      const off = (cam.x * 0.2) % 48;
      c.fillStyle = '#241419';
      for (let x = -48; x < VIEW_W + 48; x += 48) { c.fillRect(x - off, 0, 24, VIEW_H); }
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
