// scene_game.js — scène solo: niveau, joueur, ennemis, objets, boss, caméra, HUD,
// gemmes, plateformes mobiles, checkpoints, ressorts, screen-shake, hit-stop.
import { VIEW_W, VIEW_H, TILE, clamp, aabb, rand } from './core.js';
import { Level } from './level.js';
import { Player, Enemy, Boss, Coin, Gem, MovingPlatform, EnemyShot, PowerUp, Fireball, Particle, FloatText } from './entities.js';
import { SFX, playMusic } from './audio.js';
import { WORLDS } from './levels.js';
import { fmtTime } from './leaderboard.js';
import { GhostRecorder, GhostPlayer, GhostStore } from './ghost.js';

export class GameScene {
  constructor(game, worldIdx = 0, levelIdx = 0, carry = null, opts = {}) {
    this.game = game;
    this.worldIdx = worldIdx; this.levelIdx = levelIdx;
    this.speedrun = !!opts.speedrun;
    this.runMs = 0; this.runFinished = false;
    this.recorder = this.speedrun ? new GhostRecorder() : null;
    this.ghosts = []; // [{g:GhostPlayer, glow, label}]
    if (this.speedrun) {
      const data = GhostStore.load(`${worldIdx}-${levelIdx}`);
      if (data) { const g = new GhostPlayer(data); if (g.valid) this.ghosts.push({ g, glow: '#46d8ff', label: 'PB' }); }
    }
    this.cam = { x: 0, y: 0 };
    this.particles = []; this.floats = []; this.fireballs = []; this.hazards = [];
    this.state = 'intro'; // intro | play | dying | levelclear | gameover
    this.stateT = 0; this.shake = 0; this.freeze = 0; this.pendingClear = 0;
    this.carry = carry || { lives: this.speedrun ? 99 : 3, score: 0, coins: 0 };
    this.collectedGems = new Set();   // gemmes déjà prises (persistent entre morts)
    this.activeCheckpoint = null;     // {x,y}
    this.loadLevel();
  }

  loadLevel() {
    const world = WORLDS[this.worldIdx];
    const def = world.levels[this.levelIdx];
    this.level = new Level(def);
    this.coins = this.level.coins.map((cc) => new Coin(cc.tx, cc.ty));
    this.gems = this.level.gems
      .filter((g) => !this.collectedGems.has(g.tx + ',' + g.ty))
      .map((g) => new Gem(g.tx, g.ty));
    this.totalGems = this.level.gems.length;
    this.platforms = this.level.platforms.map((p) => new MovingPlatform(p.x, p.y, p.axis));
    this.enemies = []; this.boss = null;
    for (const s of this.level.spawns) {
      if (s.type === 'boss') this.boss = new Boss(s.x, s.y + TILE);
      else this.enemies.push(new Enemy(s.x, s.y + (TILE - 14), s.type));
    }
    this.items = []; this.hazards = []; this.fireballs = [];
    // marquer le checkpoint actif comme allumé
    if (this.activeCheckpoint) {
      const tx = Math.floor(this.activeCheckpoint.x / TILE), ty = Math.floor(this.activeCheckpoint.y / TILE);
      if (this.level.tile(tx, ty) === 'C') this.level.setTile(tx, ty, 'c');
    }
    const ps = this.activeCheckpoint || this.level.playerStart;
    this.player = new Player(ps.x, ps.y, { lives: this.carry.lives, skin: 'p1', id: 0 });
    this.player.score = this.carry.score; this.player.coins = this.carry.coins;
    this.timeLeft = def.time; this.timeAcc = 0;
    this.runMs = 0; this.runFinished = false;
    if (this.recorder) this.recorder.reset();
    this.cam.x = clamp(ps.x - VIEW_W * 0.42, 0, Math.max(0, this.level.pixelW - VIEW_W));
    this.cam.y = 0;
    this.state = 'intro'; this.stateT = 0; this.pendingClear = 0;
    this.game.fadeIn?.();
    playMusic(this.level.hasBoss ? 'castle' : def.theme === 'castle' ? 'castle' : def.theme === 'underground' ? 'underground' : 'overworld');
  }

  // ---- API entités ----
  addFloat(x, y, text, col) { this.floats.push(new FloatText(x, y, text, col)); }
  spawnFireball(fb) { this.fireballs.push(fb); }
  countFireballs(id) { return this.fireballs.filter((f) => f.owner === id).length; }
  spawnHazard(h) { this.hazards.push(h); }
  addShake(m) { this.shake = Math.max(this.shake, m); }
  onSpring() { this.addShake(2); }
  burst(x, y, col, n = 8, spd = 120) {
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, rand(-spd, spd), rand(-spd, 20), col, rand(0.3, 0.7), 2));
  }
  // poussière au sol (atterrissage / dérapage)
  dust(x, y, n = 4) {
    for (let i = 0; i < n; i++) {
      const col = i % 2 ? '#e8dcc0' : '#cbbfa0';
      this.particles.push(new Particle(x, y - 1, rand(-50, 50), rand(-30, -5), col, rand(0.25, 0.5), 2, 180));
    }
  }

  onBlockHit(ev, player) {
    const wx = ev.tx * TILE + 8, wy = ev.ty * TILE;
    if (ev.kind === 'brick') {
      if (player.big) { this.level.setTile(ev.tx, ev.ty, ' '); SFX.brick(); this.burst(wx, wy, '#c8623a', 10); player.addScore(50, this); this.addShake(3); this.freeze = 0.03; }
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
    this.saveGems();
    this.game.stat?.('clear', `${this.worldIdx}-${this.levelIdx}`);
    if (this.speedrun) this.finishRun();
  }
  onBossDefeated() { if (this.pendingClear <= 0) this.pendingClear = 1.6; this.addShake(8); this.game.stat?.('boss'); }
  onPlayerDeath() { if (this.state === 'play') { this.state = 'dying'; this.stateT = 0; this.freeze = 0.12; this.addShake(5); } }

  finishRun() {
    if (this.runFinished) return;
    this.runFinished = true;
    const ghostData = this.recorder ? this.recorder.data() : null;
    this.game.onSpeedrunFinish?.(this.worldIdx, this.levelIdx, this.runMs, ghostData);
  }

  saveGems() {
    if (this.totalGems <= 0) return;
    const key = `gems.${this.worldIdx}-${this.levelIdx}`;
    const got = this.collectedGems.size;
    if (got > this.game.getGems(key)) this.game.setGems(key, got);
  }

  // ---------- UPDATE ----------
  update(dt) {
    if (this.freeze > 0) { this.freeze -= dt; this.shake = Math.max(0, this.shake - dt * 30); return; }
    this.shake = Math.max(0, this.shake * 0.88 - 0.05);

    if (this.state === 'intro') {
      this.stateT += dt;
      for (const p of this.particles) p.update(dt);
      this.particles = this.particles.filter((p) => !p.dead);
      if (this.stateT > 1.25) { this.state = 'play'; this.stateT = 0; }
      return;
    }

    const input = this.readInput();
    this.curInput = input;
    this.stateT += dt;
    if (this.pendingClear > 0) { this.pendingClear -= dt; if (this.pendingClear <= 0 && this.state === 'play') { this.bossClear(); } }

    if (this.state === 'play') {
      this.runMs += dt * 1000;
      if (this.recorder) this.recorder.update(dt, this.player, this.runMs);
      this.timeAcc += dt;
      if (this.timeAcc >= 1) { this.timeAcc -= 1; this.timeLeft--; if (this.timeLeft <= 0) { this.timeLeft = 0; this.player.die(this); } }
    }

    this.player.update(dt, this.level, this, input);

    // plateformes mobiles + portage du joueur
    for (const pf of this.platforms) { pf.update(dt); this.ridePlatform(this.player, pf); }

    // ennemis + boss
    for (const e of this.enemies) e.update(dt, this.level, this);
    if (this.boss) this.boss.update(dt, this.level, this);
    if (this.state === 'play' || this.state === 'levelclear') { this.handleEnemyCollisions(); this.handleBossCollision(); }
    this.handleShellCollisions();

    // objets / pièces / gemmes
    for (const it of this.items) { it.update(dt, this.level); if (aabb(this.player, it)) { this.player.grow(it.kind, this); it.dead = true; this.burst(it.x + 7, it.y + 7, '#fff', 8); } }
    for (const co of this.coins) { co.update(dt); if (aabb(this.player, co)) { co.dead = true; this.player.addCoin(this); SFX.coin(); } }
    for (const gm of this.gems) {
      gm.update(dt);
      if (aabb(this.player, gm)) {
        gm.dead = true; const tx = Math.floor((gm.x) / TILE), ty = Math.floor((gm.y) / TILE);
        this.collectedGems.add(tx + ',' + ty); this.player.addScore(1000, this);
        this.game.stat?.('gems', 1);
        SFX.gem(); this.addFloat(gm.x, gm.y - 6, '◆', '#46d8ff'); this.burst(gm.x + 6, gm.y + 6, '#46d8ff', 10);
      }
    }
    // checkpoints (désactivés en contre-la-montre)
    if (!this.speedrun) for (const cp of this.level.checkpoints) {
      if (this.level.tile(cp.tx, cp.ty) !== 'C') continue;
      const r = { x: cp.tx * TILE, y: cp.ty * TILE, w: TILE, h: TILE * 2 };
      if (aabb(this.player, r)) {
        this.level.setTile(cp.tx, cp.ty, 'c'); this.activeCheckpoint = { x: cp.tx * TILE, y: (cp.ty) * TILE };
        SFX.checkpoint(); this.addFloat(cp.tx * TILE + 8, cp.ty * TILE - 4, 'CHECKPOINT', '#46d8ff');
      }
    }

    // projectiles joueur
    for (const fb of this.fireballs) {
      fb.update(dt, this.level);
      for (const e of this.enemies) if (!e.dead && !e.removed && aabb(fb, e)) { e.kill(fb.vx > 0 ? 1 : -1); fb.dead = true; this.player.addScore(100, this); this.burst(e.x + 7, e.y + 7, '#ff5d2e', 8); }
      if (this.boss && !this.boss.dead && aabb(fb, this.boss)) { fb.dead = true; this.boss.hitTop(this); }
    }
    // projectiles hostiles (boss)
    for (const hz of this.hazards) {
      hz.update(dt, this.level);
      if (!this.player.dead && !this.player.win && aabb(hz, this.player)) { hz.dead = true; this.player.hurt(this); this.addShake(3); }
    }

    for (const p of this.particles) p.update(dt);
    for (const f of this.floats) f.update(dt);

    this.enemies = this.enemies.filter((e) => !e.removed);
    if (this.boss && this.boss.removed) this.boss = null;
    this.items = this.items.filter((i) => !i.dead);
    this.coins = this.coins.filter((c) => !c.dead);
    this.gems = this.gems.filter((g) => !g.dead);
    this.fireballs = this.fireballs.filter((f) => !f.dead);
    this.hazards = this.hazards.filter((h) => !h.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.floats = this.floats.filter((f) => !f.dead);

    this.updateCamera();
    this.updateState(dt);
  }

  ridePlatform(p, pf) {
    if (p.dead) return;
    const feet = p.y + p.h;
    const prevFeet = p.prevFeet != null ? p.prevFeet : feet;
    const within = p.x + p.w > pf.x + 1 && p.x < pf.x + pf.w - 1;
    if (!within) return;
    // atterri sur le dessus ce frame (était au-dessus, descend) OU déjà posé dessus
    const landed = p.vy >= 0 && prevFeet <= pf.y + 3 && feet >= pf.y - 1;
    const resting = p.vy >= -1 && feet >= pf.y - 2 && feet <= pf.y + pf.h;
    if (landed || resting) {
      p.y = pf.y - p.h; p.vy = 0; p.onGround = true; p.coyote = 0.09;
      p.x += pf.dx; p.y += pf.dy; // porté par la plateforme
    }
  }

  bossClear() {
    this.state = 'levelclear'; this.stateT = 0; SFX.win(); playMusic('overworld');
    this.player.addScore(5000 + Math.floor(this.timeLeft) * 10, this); this.saveGems();
    this.game.stat?.('clear', `${this.worldIdx}-${this.levelIdx}`);
    if (this.speedrun) this.finishRun();
  }

  handleEnemyCollisions() {
    const p = this.player;
    const bounce = () => (this.curInput && this.curInput.jump ? -300 : -210);
    for (const e of this.enemies) {
      if (e.dead || e.removed || e.state === 'flat') continue;
      if (!aabb(p, e)) continue;
      if (p.star > 0) { e.kill(p.x < e.x ? 1 : -1); p.addScore(100, this); this.burst(e.x + 7, e.y + 7, '#ffd23b', 8); continue; }
      // écrasement fiable: les pieds étaient au-dessus de l'ennemi et on descend
      const prevFeet = p.prevFeet != null ? p.prevFeet : (p.y + p.h);
      const fromAbove = p.vy > 0 && prevFeet <= e.y + 8;

      if (e.type === 'spiky') { if (!p.win) p.hurt(this); continue; } // instompable

      if (e.type === 'shell') {
        const still = e.state === 'shell' && Math.abs(e.vx) < 10;
        if (fromAbove && !p.win) {
          if (e.state !== 'shell') { e.state = 'shell'; e.vx = 0; e.stateT = 0; SFX.stomp(); }
          else if (still) { e.dir = p.x < e.x ? 1 : -1; e.vx = e.dir * 150; SFX.kick(); }
          else { e.vx = 0; SFX.stomp(); }
          p.vy = bounce(); this.freeze = 0.02;
        } else if (still && !p.win) { e.dir = p.x < e.x ? 1 : -1; e.vx = e.dir * 150; SFX.kick(); }
        else if (!p.win) {
          // une carapace lancée ne blesse que si elle vient VERS le joueur (pas celle qu'on vient de tirer)
          const movingShell = e.state === 'shell' && Math.abs(e.vx) >= 10;
          const toward = (e.vx > 0 && e.x < p.x) || (e.vx < 0 && e.x > p.x);
          if (!movingShell || toward) p.hurt(this);
        }
        continue;
      }

      if (fromAbove && !p.win) { const r = e.stomp(); p.vy = bounce(); this.freeze = 0.02; if (r.killed) p.addScore(100, this); }
      else if (!p.win) p.hurt(this);
    }
  }

  handleBossCollision() {
    const b = this.boss, p = this.player;
    if (!b || b.dead || p.dead || p.win) return;
    if (!aabb(p, b)) return;
    if (p.star > 0) { b.hitTop(this); p.vy = -240; return; }
    const prevFeet = p.prevFeet != null ? p.prevFeet : (p.y + p.h);
    const fromAbove = p.vy > 0 && prevFeet <= b.y + 12;
    if (fromAbove) { if (b.hitTop(this)) { p.vy = (this.curInput && this.curInput.jump ? -320 : -240); this.freeze = 0.08; } }
    else p.hurt(this);
  }

  handleShellCollisions() {
    for (const e of this.enemies) {
      if (e.type !== 'shell' || e.state !== 'shell' || Math.abs(e.vx) < 10) continue;
      for (const o of this.enemies) {
        if (o === e || o.dead || o.removed) continue;
        if (aabb(e, o)) { o.kill(e.vx > 0 ? 1 : -1); this.player.addScore(100, this); SFX.kick(); this.burst(o.x + 7, o.y + 7, '#fff', 6); }
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
      if (this.speedrun) {
        if (this.stateT > 0.9) { this.collectedGems = new Set(); this.activeCheckpoint = null; this.loadLevel(); }
        return;
      }
      if (this.stateT > 1.6) {
        this.player.lives--;
        if (this.player.lives <= 0) { this.state = 'gameover'; this.stateT = 0; this.game.gameOver(this.player.score); }
        else { this.carry = { lives: this.player.lives, score: this.player.score, coins: this.player.coins }; this.loadLevel(); }
      }
    } else if (this.state === 'levelclear') {
      if (this.speedrun) return; // fin gérée par l'UI du contre-la-montre
      if (this.stateT > 2.6) {
        const world = WORLDS[this.worldIdx];
        const carry = { lives: this.player.lives, score: this.player.score, coins: this.player.coins };
        this.collectedGems = new Set(); this.activeCheckpoint = null;
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
      fire: I.isDown('fire', 0), firePressed: I.justPressed('fire', 0), run: I.isDown('fire', 0),
    };
  }

  // ---------- DRAW ----------
  draw(c) {
    c.save();
    if (this.shake > 0.2) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.level.drawBackground(c, this.cam);
    this.level.drawTiles(c, this.cam);
    for (const pf of this.platforms) pf.draw(c, this.cam);
    for (const co of this.coins) co.draw(c, this.cam);
    for (const gm of this.gems) gm.draw(c, this.cam);
    for (const it of this.items) it.draw(c, this.cam);
    for (const e of this.enemies) e.draw(c, this.cam);
    if (this.boss) this.boss.draw(c, this.cam);
    for (const hz of this.hazards) hz.draw(c, this.cam);
    for (const fb of this.fireballs) fb.draw(c, this.cam);
    for (const gh of this.ghosts) this.drawGhost(c, gh);
    if (!this.player.dead || this.player.deathT < 9) this.player.draw(c, this.cam);
    for (const p of this.particles) p.draw(c, this.cam);
    for (const f of this.floats) f.draw(c, this.cam);
    c.restore();

    this.drawHUD(c);
    if (this.boss && !this.boss.dead) this.drawBossBar(c);
    if (this.speedrun) this.drawTimer(c);
    if (this.state === 'intro') this.drawIntro(c);
    if (this.state === 'levelclear' && !this.speedrun) this.banner(c, this.level.hasBoss ? 'BOSS VAINCU !' : 'NIVEAU TERMINÉ !', '#ffd23b');
    if (this.state === 'levelclear' && this.speedrun) this.banner(c, fmtTime(this.runMs), '#46d8ff');
    if (this.state === 'gameover') this.banner(c, 'GAME OVER', '#ff5d5d');
  }

  drawTimer(c) {
    const t = fmtTime(this.runMs);
    c.font = '13px monospace'; c.textAlign = 'center';
    c.fillStyle = '#000'; c.fillText(t, VIEW_W / 2 + 1, 27);
    c.fillStyle = this.state === 'levelclear' ? '#46d8ff' : '#fff'; c.fillText(t, VIEW_W / 2, 26);
    if (this.ghosts.length) {
      c.font = '7px monospace'; c.textAlign = 'center';
      const labels = this.ghosts.map((g) => g.label).join(' · ');
      c.fillStyle = '#b9a8e6'; c.fillText('👻 ' + labels, VIEW_W / 2, 36);
    }
    c.textAlign = 'left';
  }

  addGhost(data, opts = {}) {
    const g = new GhostPlayer(data);
    if (!g.valid) return;
    // évite les doublons de label
    this.ghosts = this.ghosts.filter((e) => e.label !== opts.label);
    this.ghosts.push({ g, glow: opts.glow || '#ffd23b', label: opts.label || 'WR' });
  }

  drawGhost(c, entry) {
    const pose = entry.g.poseAt(this.runMs);
    if (!pose) return;
    const A = this.game.art.hero;
    const big = pose.power >= 1;
    const set = pose.power === 2
      ? { idle: big ? A.fireBigIdle : A.fireSmallIdle, walk: big ? A.fireBigWalk : A.fireSmallWalk, jump: A.fireJump }
      : { idle: big ? A.bigIdle : A.smallIdle, walk: big ? A.bigWalk : A.smallWalk, jump: A.jump };
    let img;
    if (pose.air) img = set.jump;
    else if (pose.moving) img = (Math.floor(this.runMs / 120) % 2) ? set.walk : set.idle;
    else img = set.idle;
    const x = Math.round(pose.x - this.cam.x) - 2;
    const y = Math.round(pose.y - this.cam.y) - (big ? 12 : 1);
    c.save();
    c.globalAlpha = 0.42;
    c.shadowColor = entry.glow; c.shadowBlur = 6;
    if (pose.dir < 0) { c.translate(x + 8, 0); c.scale(-1, 1); c.translate(-(x + 8), 0); }
    c.drawImage(img, x, y);
    c.restore();
    c.globalAlpha = 1;
  }

  drawHUD(c) {
    c.fillStyle = '#000'; c.globalAlpha = 0.35; c.fillRect(0, 0, VIEW_W, 14); c.globalAlpha = 1;
    c.font = '8px monospace'; c.textAlign = 'left';
    const p = this.player;
    c.fillStyle = '#fff'; c.fillText('SCORE ' + String(p.score).padStart(6, '0'), 4, 10);
    c.fillStyle = '#ffd23b'; c.fillText('● ' + String(p.coins).padStart(2, '0'), 84, 10);
    if (this.totalGems > 0) { c.fillStyle = '#46d8ff'; c.fillText('◆ ' + this.collectedGems.size + '/' + this.totalGems, 118, 10); }
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(`${this.worldIdx + 1}-${this.levelIdx + 1}`, VIEW_W / 2, 10);
    c.textAlign = 'right'; c.fillStyle = this.timeLeft < 60 ? '#ff5d5d' : '#fff';
    c.fillText('T ' + String(Math.floor(this.timeLeft)).padStart(3, '0'), VIEW_W - 4, 10);
    c.fillStyle = '#7fc6ff'; c.fillText('×' + p.lives + '  ', VIEW_W - 48, 10);
    c.textAlign = 'left';
  }

  drawBossBar(c) {
    const w = 120, x = (VIEW_W - w) / 2, y = VIEW_H - 12;
    c.fillStyle = '#000'; c.fillRect(x - 2, y - 2, w + 4, 8);
    c.fillStyle = '#3a1a1a'; c.fillRect(x, y, w, 4);
    c.fillStyle = '#ff5d5d'; c.fillRect(x, y, w * (this.boss.hp / 3), 4);
    c.fillStyle = '#fff'; c.font = '7px monospace'; c.textAlign = 'center';
    c.fillText('BOSS', VIEW_W / 2, y - 4); c.textAlign = 'left';
  }

  drawIntro(c) {
    c.fillStyle = '#000'; c.globalAlpha = 0.55; c.fillRect(0, 0, VIEW_W, VIEW_H); c.globalAlpha = 1;
    const def = WORLDS[this.worldIdx].levels[this.levelIdx];
    c.textAlign = 'center';
    c.fillStyle = '#ffd23b'; c.font = '18px monospace';
    c.fillText(`MONDE ${this.worldIdx + 1}-${this.levelIdx + 1}`, VIEW_W / 2, VIEW_H / 2 - 8);
    c.fillStyle = '#fff'; c.font = '9px monospace';
    c.fillText((def.name || '').replace(/^[0-9-]+\s*/, ''), VIEW_W / 2, VIEW_H / 2 + 10);
    c.fillStyle = '#7fc6ff'; c.font = '8px monospace';
    c.fillText('× ' + this.player.lives, VIEW_W / 2, VIEW_H / 2 + 26);
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
