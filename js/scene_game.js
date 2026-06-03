// scene_game.js — scène solo: gère niveau, joueur, ennemis, objets, caméra, HUD
import { VIEW_W, VIEW_H, TILE, clamp, aabb, rand } from './core.js';
import { Level } from './level.js';
import { Player, Enemy, Coin, PowerUp, Fireball, Particle, FloatText } from './entities.js';
import { SFX, playMusic } from './audio.js';
import { WORLDS } from './levels.js';

export class GameScene {
  constructor(game, worldIdx = 0, levelIdx = 0, carry = null) {
    this.game = game;
    this.worldIdx = worldIdx; this.levelIdx = levelIdx;
    this.cam = { x: 0, y: 0 };
    this.particles = []; this.floats = []; this.fireballs = [];
    this.state = 'play'; // play | dying | levelclear | gameover
    this.stateT = 0;
    this.carry = carry || { lives: 3, score: 0, coins: 0 };
    this.loadLevel();
  }

  loadLevel() {
    const world = WORLDS[this.worldIdx];
    const def = world.levels[this.levelIdx];
    this.level = new Level(def);
    this.coins = this.level.coins.map((cc) => new Coin(cc.tx, cc.ty));
    this.enemies = this.level.spawns.map((s) => new Enemy(s.x, s.y + (TILE - 14), s.type));
    this.items = [];
    const ps = this.level.playerStart;
    this.player = new Player(ps.x, ps.y, { lives: this.carry.lives, skin: 'p1', id: 0 });
    this.player.score = this.carry.score; this.player.coins = this.carry.coins;
    this.timeLeft = def.time; this.timeAcc = 0;
    this.cam.x = 0; this.cam.y = 0;
    this.state = 'play'; this.stateT = 0;
    playMusic(def.theme === 'castle' ? 'castle' : def.theme === 'underground' ? 'underground' : 'overworld');
  }

  // ---- API utilisée par les entités ----
  addFloat(x, y, text, col) { this.floats.push(new FloatText(x, y, text, col)); }
  spawnFireball(fb) { this.fireballs.push(fb); }
  countFireballs(id) { return this.fireballs.filter((f) => f.owner === id).length; }

  burst(x, y, col, n = 8, spd = 120) {
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, rand(-spd, spd), rand(-spd, 20), col, rand(0.3, 0.7), 2));
  }

  onBlockHit(ev, player) {
    const wx = ev.tx * TILE + 8, wy = ev.ty * TILE;
    if (ev.kind === 'brick') {
      if (player.big) { this.level.setTile(ev.tx, ev.ty, ' '); SFX.brick(); this.burst(wx, wy, '#c8623a', 10); player.addScore(50, this); }
      else { SFX.bump(); }
    } else if (ev.kind === 'question') {
      SFX.bump();
      if (ev.item === 'coin') { player.addCoin(this); this.addFloat(wx, wy - 6, '+1', '#ffd23b'); SFX.coin(); }
      else {
        const kind = ev.item === 'star' ? 'star' : (player.power === 'small' ? 'mushroom' : 'flower');
        this.items.push(new PowerUp(wx - 7, wy - 4, kind));
      }
    }
  }

  onReachGoal(player) {
    if (this.state !== 'play') return;
    player.win = true; player.invuln = 0;
    this.state = 'levelclear'; this.stateT = 0;
    SFX.win(); playMusic('overworld');
    player.addScore(Math.floor(this.timeLeft) * 10, this);
  }

  onPlayerDeath() {
    if (this.state === 'play') { this.state = 'dying'; this.stateT = 0; }
  }

  // ---------- UPDATE ----------
  update(dt) {
    const input = this.readInput();
    this.curInput = input;
    this.stateT += dt;

    if (this.state === 'play') {
      this.timeAcc += dt;
      if (this.timeAcc >= 1) { this.timeAcc -= 1; this.timeLeft--; if (this.timeLeft <= 0) { this.timeLeft = 0; this.player.die(this); } }
    }

    this.player.update(dt, this.level, this, input);

    // ennemis
    for (const e of this.enemies) e.update(dt, this.level, this);
    // collisions joueur/ennemis
    if (this.state === 'play' || this.state === 'levelclear') this.handleEnemyCollisions(dt);
    // carapaces vs ennemis
    this.handleShellCollisions();

    // objets
    for (const it of this.items) {
      it.update(dt, this.level);
      if (aabb(this.player, it)) { this.player.grow(it.kind, this); it.dead = true; this.burst(it.x + 7, it.y + 7, '#fff', 8); }
    }
    // pièces
    for (const co of this.coins) { co.update(dt); if (aabb(this.player, co)) { co.dead = true; this.player.addCoin(this); SFX.coin(); } }
    // projectiles
    for (const fb of this.fireballs) {
      fb.update(dt, this.level);
      for (const e of this.enemies) {
        if (!e.dead && !e.removed && aabb(fb, e)) { e.kill(fb.vx > 0 ? 1 : -1); fb.dead = true; this.player.addScore(100, this); this.burst(e.x + 7, e.y + 7, '#ff5d2e', 8); }
      }
    }

    // particules / textes
    for (const p of this.particles) p.update(dt);
    for (const f of this.floats) f.update(dt);

    // nettoyage
    this.enemies = this.enemies.filter((e) => !e.removed);
    this.items = this.items.filter((i) => !i.dead);
    this.coins = this.coins.filter((c) => !c.dead);
    this.fireballs = this.fireballs.filter((f) => !f.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.floats = this.floats.filter((f) => !f.dead);

    this.updateCamera();
    this.updateState(dt);
  }

  handleEnemyCollisions(dt) {
    const p = this.player;
    if (p.dead || p.win) {
      // en victoire on ignore les dégâts mais on tue les ennemis touchés par étoile
    }
    const bounce = () => (this.curInput && this.curInput.jump ? -300 : -210);
    for (const e of this.enemies) {
      if (e.dead || e.removed || e.state === 'flat') continue;
      if (!aabb(p, e)) continue;
      if (p.star > 0) { e.kill(p.x < e.x ? 1 : -1); p.addScore(100, this); this.burst(e.x+7,e.y+7,'#ffd23b',8); continue; }
      const fromAbove = (p.y + p.h) - e.y < 12 && p.vy > 40;

      if (e.type === 'shell') {
        const still = e.state === 'shell' && Math.abs(e.vx) < 10;
        if (fromAbove && !p.win) {
          if (e.state !== 'shell') { e.state = 'shell'; e.vx = 0; e.stateT = 0; SFX.stomp(); }
          else if (still) { e.dir = p.x < e.x ? 1 : -1; e.vx = e.dir * 150; SFX.kick(); }
          else { e.vx = 0; SFX.stomp(); }
          p.vy = bounce();
        } else if (still && !p.win) {
          // pousser une carapace immobile par le côté
          e.dir = p.x < e.x ? 1 : -1; e.vx = e.dir * 150; SFX.kick();
        } else if (!p.win) {
          p.hurt(this);
        }
        continue;
      }

      if (fromAbove && !p.win) {
        const r = e.stomp();
        p.vy = bounce();
        if (r.killed) p.addScore(100, this);
      } else if (!p.win) {
        p.hurt(this);
      }
    }
  }

  handleShellCollisions() {
    for (const e of this.enemies) {
      if (e.type !== 'shell' || e.state !== 'shell' || Math.abs(e.vx) < 10) continue;
      for (const o of this.enemies) {
        if (o === e || o.dead || o.removed) continue;
        if (aabb(e, o)) { o.kill(e.vx > 0 ? 1 : -1); this.player.addScore(100, this); SFX.kick(); this.burst(o.x+7,o.y+7,'#fff',6); }
      }
    }
  }

  updateCamera() {
    const target = this.player.x + this.player.w / 2 - VIEW_W * 0.42;
    this.cam.x += (target - this.cam.x) * 0.12;
    this.cam.x = clamp(this.cam.x, 0, Math.max(0, this.level.pixelW - VIEW_W));
    this.cam.y = clamp(this.player.y - VIEW_H * 0.55, 0, Math.max(0, this.level.pixelH - VIEW_H));
    if (this.level.pixelH <= VIEW_H) this.cam.y = this.level.pixelH - VIEW_H;
  }

  updateState(dt) {
    if (this.state === 'dying') {
      if (this.stateT > 1.6) {
        this.player.lives--;
        if (this.player.lives <= 0) { this.state = 'gameover'; this.stateT = 0; this.game.gameOver(this.player.score); }
        else { this.carry = { lives: this.player.lives, score: this.player.score, coins: this.player.coins }; this.loadLevel(); }
      }
    } else if (this.state === 'levelclear') {
      if (this.stateT > 2.6) {
        const world = WORLDS[this.worldIdx];
        const carry = { lives: this.player.lives, score: this.player.score, coins: this.player.coins };
        if (this.levelIdx + 1 < world.levels.length) { this.levelIdx++; this.carry = carry; this.loadLevel(); }
        else if (this.worldIdx + 1 < WORLDS.length) { this.worldIdx++; this.levelIdx = 0; this.carry = carry; this.game.saveProgress(this.worldIdx, 0); this.loadLevel(); }
        else { this.game.gameComplete(this.player.score); }
      }
    }
  }

  readInput() {
    const I = this.game.input;
    if (I.justPressed('pause', 0)) this.game.togglePause();
    return {
      left: I.isDown('left', 0), right: I.isDown('right', 0), down: I.isDown('down', 0),
      jump: I.isDown('jump', 0), jumpPressed: I.justPressed('jump', 0),
      fire: I.isDown('fire', 0), firePressed: I.justPressed('fire', 0),
      run: I.isDown('fire', 0),
    };
  }

  // ---------- DRAW ----------
  draw(c) {
    this.level.drawBackground(c, this.cam);
    this.level.drawTiles(c, this.cam);
    for (const co of this.coins) co.draw(c, this.cam);
    for (const it of this.items) it.draw(c, this.cam);
    for (const e of this.enemies) e.draw(c, this.cam);
    for (const fb of this.fireballs) fb.draw(c, this.cam);
    if (!this.player.dead || this.player.deathT < 9) this.player.draw(c, this.cam);
    for (const p of this.particles) p.draw(c, this.cam);
    for (const f of this.floats) f.draw(c, this.cam);
    this.drawHUD(c);

    if (this.state === 'levelclear') this.banner(c, 'NIVEAU TERMINÉ !', '#ffd23b');
    if (this.state === 'gameover') this.banner(c, 'GAME OVER', '#ff5d5d');
  }

  drawHUD(c) {
    c.fillStyle = '#000'; c.globalAlpha = 0.35; c.fillRect(0, 0, VIEW_W, 14); c.globalAlpha = 1;
    c.font = '8px monospace'; c.textAlign = 'left';
    const p = this.player;
    c.fillStyle = '#fff';
    c.fillText('SCORE ' + String(p.score).padStart(6, '0'), 4, 10);
    c.fillStyle = '#ffd23b'; c.fillText('● ' + String(p.coins).padStart(2, '0'), 96, 10);
    c.fillStyle = '#fff';
    const wl = WORLDS[this.worldIdx];
    c.textAlign = 'center'; c.fillText(`MONDE ${this.worldIdx + 1}-${this.levelIdx + 1}`, VIEW_W / 2, 10);
    c.textAlign = 'right';
    c.fillStyle = this.timeLeft < 60 ? '#ff5d5d' : '#fff';
    c.fillText('TEMPS ' + String(Math.floor(this.timeLeft)).padStart(3, '0'), VIEW_W - 4, 10);
    c.fillStyle = '#7fc6ff'; c.fillText('×' + p.lives + ' ', VIEW_W - 64, 10);
    c.textAlign = 'left';
  }

  banner(c, text, col) {
    c.fillStyle = '#000'; c.globalAlpha = 0.5; c.fillRect(0, VIEW_H / 2 - 16, VIEW_W, 32); c.globalAlpha = 1;
    c.font = '16px monospace'; c.textAlign = 'center';
    c.fillStyle = '#000'; c.fillText(text, VIEW_W / 2 + 1, VIEW_H / 2 + 6);
    c.fillStyle = col; c.fillText(text, VIEW_W / 2, VIEW_H / 2 + 5);
    c.textAlign = 'left';
  }
}
