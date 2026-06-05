// scene_editor.js — éditeur de niveaux in-game. Peins des tuiles à la souris/au
// doigt, choisis le thème, sauvegarde en local, et teste ton niveau.
import { VIEW_W, VIEW_H, TILE, clamp, Save } from './core.js';
import { tileCanvas } from './art.js';

const EH = 12; // hauteur (tuiles)
const PALETTE = [
  ['X', 'Sol'], ['H', 'Bloc dur'], ['B', 'Brique'], ['?', 'Bloc ?'], ['M', 'Power'], ['U', 'Étoile'],
  ['L', '1UP'], ['W', 'Plume'], ['P', 'Tuyau◤'], ['p', 'Tuyau│'], ['Q', 'Warp'], ['q', 'Dest'],
  ['T', 'Ressort'], ['=', 'Plateforme'], ['^', 'Pics'], ['o', 'Pièce'], ['j', 'Gemme'], ['C', 'Check'],
  ['m', 'Plat◄►'], ['n', 'Plat▲▼'],
  ['g', 'Marcheur'], ['k', 'Carapace'], ['f', 'Volant'], ['z', 'Pics✦'], ['v', 'Plante'], ['t', 'Lanceur'], ['O', 'Boss'],
  ['S', 'Départ'], ['G', 'Arrivée'], [' ', 'Gomme'],
];

export class EditorScene {
  constructor(game) {
    this.game = game;
    const saved = Save.get('editor.level', null);
    this.w = saved ? saved.map[0].length : 60;
    this.rows = saved ? saved.map.map((r) => r.split('')) : this._blank(this.w);
    this.theme = saved ? saved.theme : 'overworld';
    this.cam = { x: 0, y: 0 };
    this.sel = 'X'; this.painting = false; this.pointer = null;
    this._buildBar();
    this._bindPointer();
  }
  _blank(w) {
    const g = Array.from({ length: EH }, () => Array(w).fill(' '));
    for (let x = 0; x < w; x++) { g[10][x] = 'X'; g[11][x] = 'X'; }
    g[9][2] = 'S'; g[9][w - 3] = 'G';
    return g;
  }
  def() { return { name: 'Niveau perso', theme: this.theme, time: 400, map: this.rows.map((r) => r.join('')) }; }

  _bindPointer() {
    const cv = this.game.canvas;
    const toTile = (e) => {
      const rect = cv.getBoundingClientRect();
      const lx = (e.clientX - rect.left) / rect.width * VIEW_W + this.cam.x;
      const ly = (e.clientY - rect.top) / rect.height * VIEW_H + this.cam.y;
      return { tx: Math.floor(lx / TILE), ty: Math.floor(ly / TILE) };
    };
    this._paint = (e) => {
      const { tx, ty } = toTile(e);
      if (tx < 0 || tx >= this.w || ty < 0 || ty >= EH) return;
      if (this.sel === 'S') { this._removeAll('S'); }
      if (this.sel === 'G') { this._removeAll('G'); }
      this.rows[ty][tx] = this.sel;
    };
    this._down = (e) => { if (e.target !== cv) return; this.painting = true; this._paint(e); };
    this._move = (e) => { if (this.painting) this._paint(e); };
    this._up = () => { this.painting = false; };
    cv.addEventListener('pointerdown', this._down);
    addEventListener('pointermove', this._move);
    addEventListener('pointerup', this._up);
  }
  _removeAll(ch) { for (let y = 0; y < EH; y++) for (let x = 0; x < this.w; x++) if (this.rows[y][x] === ch) this.rows[y][x] = ' '; }

  _buildBar() {
    const bar = document.createElement('div');
    bar.id = 'editbar';
    bar.innerHTML = `
      <div class="ed-row" id="ed-pal"></div>
      <div class="ed-row">
        <button data-a="left">◀</button><button data-a="right">▶</button>
        <button data-a="theme">🎨</button>
        <button data-a="wider">＋large</button>
        <button data-a="save">💾</button><button data-a="test">▶ Tester</button>
        <button data-a="clear">🗑</button><button data-a="exit">✕</button>
      </div>`;
    document.getElementById('game-shell').appendChild(bar);
    this.bar = bar;
    const pal = bar.querySelector('#ed-pal');
    PALETTE.forEach(([ch, name]) => {
      const b = document.createElement('button'); b.textContent = name; b.dataset.ch = ch;
      if (ch === this.sel) b.classList.add('sel');
      b.onclick = () => { this.sel = ch; pal.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x.dataset.ch === ch)); };
      pal.appendChild(b);
    });
    bar.querySelectorAll('.ed-row button[data-a]').forEach((b) => {
      b.onclick = () => this._action(b.dataset.a);
    });
  }
  _action(a) {
    if (a === 'left') this.cam.x = clamp(this.cam.x - TILE * 6, 0, Math.max(0, this.w * TILE - VIEW_W));
    else if (a === 'right') this.cam.x = clamp(this.cam.x + TILE * 6, 0, Math.max(0, this.w * TILE - VIEW_W));
    else if (a === 'theme') { const t = ['overworld', 'underground', 'castle']; this.theme = t[(t.indexOf(this.theme) + 1) % 3]; }
    else if (a === 'wider') { for (const r of this.rows) { while (r.length < this.w + 20) r.push(' '); r[10] = r[10]; } this.w += 20; for (let x = this.w - 20; x < this.w; x++) { this.rows[10][x] = 'X'; this.rows[11][x] = 'X'; } }
    else if (a === 'save') { Save.set('editor.level', this.def()); this._flash('Sauvegardé ✓'); }
    else if (a === 'clear') { if (confirm('Effacer tout le niveau ?')) this.rows = this._blank(this.w); }
    else if (a === 'test') { Save.set('editor.level', this.def()); this.game.startCustom(this.def()); }
    else if (a === 'exit') this.game.returnToMenu();
  }
  _flash(msg) { const d = this.bar.querySelector('#ed-flash') || (() => { const e = document.createElement('span'); e.id = 'ed-flash'; this.bar.appendChild(e); return e; })(); d.textContent = msg; setTimeout(() => { if (d) d.textContent = ''; }, 1200); }

  dispose() { this.bar?.remove(); const cv = this.game.canvas; cv.removeEventListener('pointerdown', this._down); removeEventListener('pointermove', this._move); removeEventListener('pointerup', this._up); }

  update() {
    const I = this.game.input;
    if (I.justPressed('pause', 0)) { this.game.returnToMenu(); return; }
    if (I.isDown('left', 0)) this.cam.x = clamp(this.cam.x - 4, 0, Math.max(0, this.w * TILE - VIEW_W));
    if (I.isDown('right', 0)) this.cam.x = clamp(this.cam.x + 4, 0, Math.max(0, this.w * TILE - VIEW_W));
  }
  draw(c) {
    c.fillStyle = this.theme === 'underground' ? '#08111f' : this.theme === 'castle' ? '#160e12' : '#5fa8ff';
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    const tx0 = Math.floor(this.cam.x / TILE), tx1 = Math.min(this.w - 1, Math.floor((this.cam.x + VIEW_W) / TILE));
    for (let ty = 0; ty < EH; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const ch = this.rows[ty][tx]; const dx = Math.round(tx * TILE - this.cam.x), dy = ty * TILE;
      if (ch !== ' ') { const img = tileCanvas(ch === 'q' ? 'c' : ch, this.theme); if (img) c.drawImage(img, dx, dy); }
      // marqueurs spéciaux lisibles
      c.fillStyle = '#000'; c.font = '7px monospace'; c.textAlign = 'center';
      if (ch === 'S') { c.fillStyle = '#37c24a'; c.fillText('S', dx + 8, dy + 11); }
      else if (ch === 'G') { c.fillStyle = '#ff5d5d'; c.fillText('G', dx + 8, dy + 11); }
      else if ('gkfzvtO'.includes(ch)) { c.fillStyle = '#ff5d5d'; c.fillText(ch, dx + 8, dy + 11); }
      else if (ch === 'q') { c.fillStyle = '#9a4ad0'; c.fillText('→', dx + 8, dy + 11); }
    }
    // grille
    c.strokeStyle = '#ffffff22'; c.lineWidth = 1;
    for (let tx = tx0; tx <= tx1 + 1; tx++) { const dx = Math.round(tx * TILE - this.cam.x); c.beginPath(); c.moveTo(dx, 0); c.lineTo(dx, EH * TILE); c.stroke(); }
    for (let ty = 0; ty <= EH; ty++) { c.beginPath(); c.moveTo(0, ty * TILE); c.lineTo(VIEW_W, ty * TILE); c.stroke(); }
    // bandeau
    c.fillStyle = '#000'; c.globalAlpha = 0.45; c.fillRect(0, 0, VIEW_W, 12); c.globalAlpha = 1;
    c.fillStyle = '#fff'; c.font = '8px monospace'; c.textAlign = 'left';
    c.fillText(`ÉDITEUR · ${this.theme} · ${this.w} tuiles · pinceau: ${this.sel === ' ' ? 'gomme' : this.sel}`, 4, 9);
    c.textAlign = 'left';
  }
}
