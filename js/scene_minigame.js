// scene_minigame.js — mini-jeux de course à la collecte contre une IA.
// Deux variantes : course aux pièces ('coin') et course aux étoiles ('star').
// Tu (joueur 0) affrontes un bot (joueur 1, cerveau ai.js). Celui qui ramasse
// le plus d'objets avant la fin du temps gagne. Caméra centrée sur toi.
import { VIEW_W, VIEW_H, TILE, clamp, aabb, rand } from './core.js';
import { Level } from './level.js';
import { Player, Coin, Gem, Particle, FloatText } from './entities.js';
import { SFX, playMusic } from './audio.js';
import { MINIGAMES } from './levels.js';
import { BotBrain } from './ai.js';

export class MiniGameScene {
  constructor(game, opts = {}) {
    this.game = game;
    this.kind = opts.kind === 'star' ? 'star' : 'coin'; // 'coin' | 'star'
    this.mapIdx = opts.mapIdx || 0;
    this.cam = { x: 0, y: 0 };
    this.particles = []; this.floats = [];
    this.over = false; this.stateT = 0; this.winner = -1;
    this.scores = [0, 0];
    this.brain = new BotBrain({ skill: opts.botSkill ?? 0.92 });
    this.load();
  }

  load() {
    const def = MINIGAMES[this.mapIdx].build(this.kind === 'star' ? 'j' : 'o');
    this.name = def.name;
    this.timeLeft = def.time || 70; this.timeAcc = 0;
    this.level = new Level({ ...def });
    this.spawnPts = [{ x: 32, y: 64 }, { x: this.level.pixelW - 48, y: 64 }];
    for (let ty = 0; ty < this.level.h; ty++) for (let tx = 0; tx < this.level.w; tx++) {
      const ch = this.level.rows[ty][tx];
      if (ch === '1') { this.spawnPts[0] = { x: tx * TILE, y: ty * TILE }; this.level.rows[ty][tx] = ' '; }
      if (ch === '2') { this.spawnPts[1] = { x: tx * TILE, y: ty * TILE }; this.level.rows[ty][tx] = ' '; }
    }
    // collectibles : pièces (or) ou étoiles/cristaux (gemmes brillantes)
    this.coins = this.kind === 'coin' ? this.level.coins.map((c) => new Coin(c.tx, c.ty)) : [];
    this.gems = this.kind === 'star' ? this.level.gems.map((c) => new Gem(c.tx, c.ty)) : [];
    this.items = [];
    this.total = (this.coins.length + this.gems.length);
    this.players = [
      new Player(this.spawnPts[0].x, this.spawnPts[0].y, { skin: 'p1', id: 0 }),
      new Player(this.spawnPts[1].x, this.spawnPts[1].y, { skin: 'p2', id: 1 }),
    ];
    this.players.forEach((p) => { p.power = 'big'; p.setSize(true); });
    this.players[1].dir = -1;
    playMusic('versus');
  }

  // méthodes appelées par les entités
  addFloat(x, y, t, c) { this.floats.push(new FloatText(x, y, t, c)); }
  burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, rand(-120, 120), rand(-120, 20), col, rand(0.3, 0.7), 2)); }
  onBlockHit() {} onSpring() {} dust() {} spawnFireball() {} countFireballs() { return 0; }
  onReachGoal() {} onPlayerDeath() {} addCombo() {} stat() {}

  active() { return this.kind === 'coin' ? this.coins : this.gems; }

  nearestPickup(me) {
    let best = null, bd = 1e9;
    for (const p of this.active()) {
      if (p.dead) continue;
      const d = Math.abs((p.x + p.w / 2) - (me.x + me.w / 2)) + Math.abs(p.y - me.y) * 1.4;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  humanInput() {
    const I = this.game.input;
    if (I.justPressed('pause', 0)) this.game.togglePause();
    return {
      left: I.isDown('left', 0), right: I.isDown('right', 0),
      down: I.isDown('down', 0), downPressed: I.justPressed('down', 0),
      jump: I.isDown('jump', 0), jumpPressed: I.justPressed('jump', 0),
      fire: I.isDown('fire', 0), firePressed: I.justPressed('fire', 0), run: I.isDown('run', 0),
    };
  }

  update(dt) {
    this.stateT += dt;
    if (this.over) { if (this.stateT > 3.5) this.game.endMiniGame(); return; }

    this.timeAcc += dt;
    if (this.timeAcc >= 1) { this.timeAcc -= 1; this.timeLeft = Math.max(0, this.timeLeft - 1); }

    // joueur humain
    this.players[0].update(dt, this.level, this, this.humanInput());
    // bot : vise le collectible le plus proche
    const me = this.players[1];
    const tgt = this.nearestPickup(me);
    const botIn = this.brain.think(dt, { me, level: this.level, target: tgt ? { x: tgt.x + tgt.w / 2, y: tgt.y } : null, collect: true });
    me.update(dt, this.level, this, botIn);

    // sécurité anti-chute (les mini-jeux n'ont pas de pénalité de mort)
    this.players.forEach((p, i) => { if (p.y > this.level.pixelH + 20 || p.dead) { const s = this.spawnPts[i]; p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0; p.dead = false; p.deathT = 0; p.power = 'big'; p.setSize(true); } });

    // collecte
    for (const pk of this.active()) {
      if (pk.dead) continue;
      pk.update(dt);
      for (let i = 0; i < 2; i++) {
        if (aabb(this.players[i], pk)) {
          pk.dead = true; this.scores[i]++;
          if (this.kind === 'coin') SFX.coin(); else SFX.coin();
          const col = i === 0 ? '#7fc6ff' : '#37c24a';
          this.burst(pk.x + pk.w / 2, pk.y + pk.h / 2, this.kind === 'star' ? '#46d8ff' : '#ffd23b', 8);
          this.addFloat(pk.x, pk.y - 6, '+1', col);
          break;
        }
      }
    }

    for (const p of this.particles) p.update(dt);
    for (const f of this.floats) f.update(dt);
    this.particles = this.particles.filter((p) => !p.dead);
    if (this.particles.length > 110) this.particles.splice(0, this.particles.length - 110);
    this.floats = this.floats.filter((f) => !f.dead);

    const collected = this.scores[0] + this.scores[1];
    if ((this.timeLeft <= 0 || collected >= this.total) && !this.over) this.finish();

    // caméra centrée sur le joueur humain
    const p = this.players[0];
    const tx = clamp(p.x + p.w / 2 - VIEW_W / 2, 0, Math.max(0, this.level.pixelW - VIEW_W));
    const ty = clamp(p.y + p.h / 2 - VIEW_H / 2, 0, Math.max(0, this.level.pixelH - VIEW_H));
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 8);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 8);
  }

  finish() {
    if (this.over) return;
    this.over = true; this.stateT = 0;
    this.winner = this.scores[0] === this.scores[1] ? -1 : (this.scores[0] > this.scores[1] ? 0 : 1);
    SFX.win();
    if (this.winner === 0) this.game.stat?.('vwin');
  }

  draw(c) { this.drawWorld(c); this.drawOverlay(c); }

  drawWorld(c) {
    this.level.drawBackground(c, this.cam);
    this.level.drawTiles(c, this.cam);
    for (const pk of this.coins) if (!pk.dead) pk.draw(c, this.cam);
    for (const pk of this.gems) if (!pk.dead) pk.draw(c, this.cam);
    for (const p of this.players) p.draw(c, this.cam);
    for (const p of this.particles) p.draw(c, this.cam);
    for (const f of this.floats) f.draw(c, this.cam);
  }

  drawOverlay(c) {
    this.drawHUD(c);
    if (this.over) {
      const txt = this.winner < 0 ? 'ÉGALITÉ !' : this.winner === 0 ? 'VICTOIRE !' : 'L\'IA GAGNE';
      c.fillStyle = '#000'; c.globalAlpha = 0.55; c.fillRect(0, VIEW_H / 2 - 18, VIEW_W, 36); c.globalAlpha = 1;
      c.font = '16px monospace'; c.textAlign = 'center';
      c.fillStyle = this.winner === 0 ? '#ffd23b' : '#fff';
      c.fillText(txt, VIEW_W / 2, VIEW_H / 2 + 5); c.textAlign = 'left';
    }
  }

  drawHUD(c) {
    const icon = this.kind === 'star' ? '✦' : '●';
    c.fillStyle = '#000'; c.globalAlpha = 0.4; c.fillRect(0, 0, VIEW_W, 16); c.globalAlpha = 1;
    c.font = '9px monospace';
    c.fillStyle = '#7fc6ff'; c.textAlign = 'left'; c.fillText(`TOI  ${icon} ${this.scores[0]}`, 6, 11);
    c.fillStyle = '#37c24a'; c.textAlign = 'right'; c.fillText(`${icon} ${this.scores[1]}  IA`, VIEW_W - 6, 11);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(String(this.timeLeft).padStart(2, '0'), VIEW_W / 2, 11);
    c.textAlign = 'left';
  }
}
