// scene_map.js — carte du monde animée pour choisir un niveau (Aventure ou Contre-la-montre).
import { VIEW_W, VIEW_H, clamp } from './core.js';
import { WORLDS } from './levels.js';
import { Save } from './core.js';
import { SFX } from './audio.js';
import { Leaderboard, fmtTime } from './leaderboard.js';
import { GhostStore } from './ghost.js';

const COLS = 4;
const THEME_COL = { overworld: '#3fa24a', underground: '#3a5a8a', castle: '#8a6a6a' };

export class MapScene {
  constructor(game, mode = 'solo') {
    this.game = game; this.mode = mode; // 'solo' | 'speedrun'
    this.t = 0; this.cursor = 0;
    this.unlocked = Save.get('unlocked', 0);
    this.nodes = this._buildNodes();
    this.selectable = this.nodes.filter((n) => n.unlocked);
    // démarrer le curseur sur le dernier niveau débloqué
    this.cursor = Math.max(0, this.selectable.length - 1);
    this._bindPointer();
  }

  _buildNodes() {
    const nodes = [];
    let i = 0;
    for (let w = 0; w < WORLDS.length; w++) {
      for (let l = 0; l < WORLDS[w].levels.length; l++) {
        const row = Math.floor(i / COLS);
        let col = i % COLS;
        if (row % 2 === 1) col = COLS - 1 - col; // serpentin
        const x = 36 + col * ((VIEW_W - 72) / (COLS - 1));
        const y = 50 + row * 42;
        nodes.push({ w, l, x, y, idx: i, unlocked: w <= this.unlocked, def: WORLDS[w].levels[l] });
        i++;
      }
    }
    return nodes;
  }

  _bindPointer() {
    const cv = this.game.canvas;
    this._onPointer = (e) => {
      const rect = cv.getBoundingClientRect();
      const lx = (e.clientX - rect.left) / rect.width * VIEW_W;
      const ly = (e.clientY - rect.top) / rect.height * VIEW_H;
      let best = -1, bd = 16 * 16;
      this.selectable.forEach((n, k) => { const dx = n.x - lx, dy = n.y - ly; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } });
      if (best >= 0) { this.cursor = best; this.confirm(); }
    };
    cv && cv.addEventListener('pointerdown', this._onPointer);
  }
  dispose() { const cv = this.game.canvas; if (cv && this._onPointer) cv.removeEventListener('pointerdown', this._onPointer); }

  confirm() {
    const n = this.selectable[this.cursor]; if (!n) return;
    SFX.power();
    if (this.mode === 'speedrun') this.game.startSpeedrun(n.w, n.l);
    else this.game.startSolo(n.w, n.l);
  }

  update(dt) {
    this.t += dt;
    const I = this.game.input;
    if (I.justPressed('pause', 0)) { this.dispose(); this.game.returnToMenu(); return; }
    if (this.selectable.length === 0) return;
    let moved = 0;
    if (I.justPressed('right', 0)) moved = 1;
    if (I.justPressed('left', 0)) moved = -1;
    if (I.justPressed('down', 0)) moved = COLS;
    if (I.justPressed('up', 0)) moved = -COLS;
    if (moved) { this.cursor = clamp(this.cursor + moved, 0, this.selectable.length - 1); SFX.count(); }
    if (I.justPressed('jump', 0) || I.justPressed('fire', 0)) this.confirm();
  }

  draw(c) {
    // fond
    const g = c.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#2a1a55'); g.addColorStop(1, '#120a26');
    c.fillStyle = g; c.fillRect(0, 0, VIEW_W, VIEW_H);
    // étoiles
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const x = (i * 53) % VIEW_W, y = (i * 29) % VIEW_H;
      c.globalAlpha = 0.3 + 0.3 * Math.sin(this.t * 2 + i);
      c.fillRect(x, y, 1, 1);
    }
    c.globalAlpha = 1;

    // chemin reliant les niveaux
    c.strokeStyle = '#ffffff55'; c.lineWidth = 2; c.setLineDash([4, 3]);
    c.beginPath();
    this.nodes.forEach((n, i) => { if (i === 0) c.moveTo(n.x, n.y); else c.lineTo(n.x, n.y); });
    c.stroke(); c.setLineDash([]);

    // titre
    c.textAlign = 'center'; c.font = '12px monospace';
    c.fillStyle = '#ffd23b'; c.fillText('CARTE DU MONDE', VIEW_W / 2, 18);
    c.fillStyle = '#cdb8ff'; c.font = '8px monospace';
    c.fillText(this.mode === 'speedrun' ? 'CONTRE-LA-MONTRE' : 'AVENTURE', VIEW_W / 2, 30);

    // nœuds
    const sel = this.selectable[this.cursor];
    for (const n of this.nodes) {
      const r = 8;
      c.fillStyle = n.unlocked ? (THEME_COL[n.def.theme] || '#3fa24a') : '#3a2f55';
      c.beginPath(); c.arc(n.x, n.y, r, 0, 7); c.fill();
      c.lineWidth = 2; c.strokeStyle = '#000'; c.stroke();
      c.fillStyle = n.unlocked ? '#fff' : '#7a6a9a'; c.font = '7px monospace'; c.textAlign = 'center';
      c.fillText(`${n.w + 1}-${n.l + 1}`, n.x, n.y + 2);
      if (!n.unlocked) { c.fillStyle = '#000'; c.fillText('🔒', n.x, n.y + 16); }
      // pastille boss
      if (n.def.map && n.def.map.join('').includes('O')) { c.fillStyle = '#ff5d5d'; c.beginPath(); c.arc(n.x + 7, n.y - 7, 3, 0, 7); c.fill(); }
    }

    // curseur (héros) + halo
    if (sel) {
      const bob = Math.sin(this.t * 6) * 2;
      c.strokeStyle = '#ffd23b'; c.lineWidth = 2;
      c.beginPath(); c.arc(sel.x, sel.y, 12 + Math.sin(this.t * 4), 0, 7); c.stroke();
      const hero = this.game.art.hero.smallIdle;
      c.drawImage(hero, Math.round(sel.x - 8), Math.round(sel.y - 22 + bob));
    }

    // panneau d'info
    this._drawInfo(c, sel);

    c.textAlign = 'center'; c.font = '7px monospace'; c.fillStyle = '#b9a8e6';
    c.fillText('◀▶ choisir   •   Saut/A: jouer   •   Échap: retour', VIEW_W / 2, VIEW_H - 4);
    c.textAlign = 'left';
  }

  _drawInfo(c, sel) {
    if (!sel) { c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '8px monospace'; c.fillText('Aucun niveau débloqué', VIEW_W / 2, VIEW_H - 28); c.textAlign = 'left'; return; }
    const x = 8, y = VIEW_H - 40, w = VIEW_W - 16, h = 26;
    c.fillStyle = '#000'; c.globalAlpha = 0.5; c.fillRect(x, y, w, h); c.globalAlpha = 1;
    c.strokeStyle = '#ffffff44'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    c.textAlign = 'left'; c.font = '8px monospace';
    c.fillStyle = '#fff'; c.fillText((sel.def.name || '').replace(/^[0-9-]+\s*/, ''), x + 6, y + 11);
    const gemKey = `gems.${sel.w}-${sel.l}`;
    const gems = this.game.getGems(gemKey);
    c.fillStyle = '#46d8ff'; c.fillText('◆ ' + gems + '/3', x + 6, y + 21);
    if (this.mode === 'speedrun') {
      const levelId = `${sel.w}-${sel.l}`;
      const pb = Leaderboard.getLocalBest(levelId);
      c.textAlign = 'right'; c.fillStyle = '#ffd23b';
      c.fillText((GhostStore.has(levelId) ? '👻 ' : '') + 'PB ' + fmtTime(pb), x + w - 6, y + 21);
      c.textAlign = 'left';
    }
  }
}
