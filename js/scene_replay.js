// scene_replay.js — visionne un run enregistré (fantôme) : caméra qui suit l'avatar,
// lecture/pause, vitesse, redémarrage. Aucune interaction de jeu.
import { VIEW_W, VIEW_H, TILE, clamp } from './core.js';
import { Level } from './level.js';
import { Enemy, Coin, Gem, MovingPlatform } from './entities.js';
import { GhostPlayer } from './ghost.js';
import { fmtTime } from './leaderboard.js';
import { WORLDS, ARENAS } from './levels.js';

export class ReplayScene {
  constructor(game, opts) {
    this.game = game; this.opts = opts || {};
    this.ghost = new GhostPlayer(opts.ghost);
    this.meta = { name: opts.name || 'JOUEUR', ms: opts.ms || 0 };
    this.speeds = [0.5, 1, 2]; this.speedIdx = 1;
    this.playing = true; this.t = 0;
    this.cam = { x: 0, y: 0 };
    this._load();
  }

  _load() {
    const o = this.opts;
    const def = o.kind === 'arena' ? ARENAS[o.arena || 0] : WORLDS[o.w || 0].levels[o.l || 0];
    this.title = (def.name || '').replace(/^[0-9-]+\s*/, '');
    this.level = new Level({ ...def });
    this.coins = this.level.coins.map((cc) => new Coin(cc.tx, cc.ty));
    this.gems = this.level.gems.map((g) => new Gem(g.tx, g.ty));
    this.platforms = this.level.platforms.map((p) => new MovingPlatform(p.x, p.y, p.axis));
    this.enemies = this.level.spawns.filter((s) => s.type !== 'boss')
      .map((s) => new Enemy(s.x, s.y + (TILE - 14), s.type));
    this.dur = this.ghost.n * this.ghost.dt;
    const pose = this.ghost.poseAt(0);
    if (pose) this.cam.x = clamp(pose.x - VIEW_W * 0.42, 0, Math.max(0, this.level.pixelW - VIEW_W));
  }

  update(dt) {
    const I = this.game.input;
    if (I.justPressed('pause', 0)) { this.game.endReplay(); return; }
    if (I.justPressed('jump', 0)) this.playing = !this.playing;
    if (I.justPressed('fire', 0)) this.speedIdx = (this.speedIdx + 1) % this.speeds.length;
    if (I.justPressed('down', 0)) { this.t = 0; this.playing = true; }

    if (this.playing) {
      this.t += dt * 1000 * this.speeds[this.speedIdx];
      if (this.t >= this.dur) { this.t = this.dur; this.playing = false; }
    }
    for (const e of this.enemies) e.update(dt, this.level, this);
    for (const pf of this.platforms) pf.update(dt);
    for (const co of this.coins) co.update(dt);
    for (const gm of this.gems) gm.update(dt);
    this.enemies = this.enemies.filter((e) => !e.removed);

    const pose = this.ghost.poseAt(this.t);
    if (pose) {
      const tx = pose.x + 7 - VIEW_W * 0.42;
      this.cam.x += (clamp(tx, 0, Math.max(0, this.level.pixelW - VIEW_W)) - this.cam.x) * 0.15;
      this.cam.y = clamp(pose.y - VIEW_H * 0.55, 0, Math.max(0, this.level.pixelH - VIEW_H));
      if (this.level.pixelH <= VIEW_H) this.cam.y = this.level.pixelH - VIEW_H;
    }
  }

  draw(c) {
    this.level.drawBackground(c, this.cam);
    this.level.drawTiles(c, this.cam);
    for (const pf of this.platforms) pf.draw(c, this.cam);
    for (const co of this.coins) co.draw(c, this.cam);
    for (const gm of this.gems) gm.draw(c, this.cam);
    for (const e of this.enemies) e.draw(c, this.cam);
    this._drawAvatar(c);
    this._drawUI(c);
  }

  _drawAvatar(c) {
    const pose = this.ghost.poseAt(this.t);
    if (!pose) return;
    const A = this.game.art.hero;
    const big = pose.power >= 1;
    const set = pose.power === 2
      ? { idle: big ? A.fireBigIdle : A.fireSmallIdle, walk: big ? A.fireBigWalk : A.fireSmallWalk, jump: A.fireJump }
      : { idle: big ? A.bigIdle : A.smallIdle, walk: big ? A.bigWalk : A.smallWalk, jump: A.jump };
    let img;
    if (pose.air) img = set.jump;
    else if (pose.moving) img = (Math.floor(this.t / 120) % 2) ? set.walk : set.idle;
    else img = set.idle;
    const h = big ? 26 : 14;
    const centerX = Math.round(pose.x + 6 - this.cam.x);
    const feetY = Math.round(pose.y + h - this.cam.y);
    const baseY = big ? 1.55 : 1.0, baseX = big ? 1.18 : 1.0;
    c.save();
    c.shadowColor = '#46d8ff'; c.shadowBlur = 6;
    c.translate(centerX, feetY); c.scale(pose.dir < 0 ? -baseX : baseX, baseY);
    c.drawImage(img, -8, -16);
    c.restore();
  }

  _drawUI(c) {
    // bandeau haut
    c.fillStyle = '#000'; c.globalAlpha = 0.4; c.fillRect(0, 0, VIEW_W, 14); c.globalAlpha = 1;
    c.font = '8px monospace'; c.textAlign = 'left'; c.fillStyle = '#fff';
    c.fillText('REPLAY · ' + this.title, 4, 10);
    c.textAlign = 'right'; c.fillStyle = '#46d8ff';
    c.fillText(this.meta.name + ' ' + fmtTime(this.meta.ms), VIEW_W - 4, 10);
    // barre de progression
    const bw = VIEW_W - 16, bx = 8, by = VIEW_H - 18;
    c.fillStyle = '#000'; c.globalAlpha = 0.5; c.fillRect(bx - 2, by - 2, bw + 4, 6); c.globalAlpha = 1;
    c.fillStyle = '#334'; c.fillRect(bx, by, bw, 2);
    const frac = this.dur > 0 ? this.t / this.dur : 0;
    c.fillStyle = '#46d8ff'; c.fillRect(bx, by, bw * frac, 2);
    // infos
    c.textAlign = 'center'; c.font = '7px monospace'; c.fillStyle = '#fff';
    c.fillText(fmtTime(this.t) + (this.playing ? '' : '  ⏸'), VIEW_W / 2, by - 4);
    c.fillStyle = '#b9a8e6';
    c.fillText(`Saut: lecture/pause · Tir: vitesse x${this.speeds[this.speedIdx]} · Bas: ↺ · Échap: quitter`, VIEW_W / 2, VIEW_H - 4);
    c.textAlign = 'left';
  }
}
