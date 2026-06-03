// scene_versus.js — mode combat: local (2 joueurs même écran) ou en ligne (WebSocket).
// Règles: s'écraser sur la tête de l'adversaire = 1 KO. Les boules de feu assomment.
// Le plus de KO à la fin du temps (ou premier à 5) gagne. Respawn après KO.
import { VIEW_W, VIEW_H, TILE, clamp, aabb, rand } from './core.js';
import { Level } from './level.js';
import { Player, Enemy, Coin, PowerUp, Fireball, Particle, FloatText } from './entities.js';
import { SFX, playMusic } from './audio.js';
import { ARENAS } from './levels.js';

const KO_TO_WIN = 5;

export class VersusScene {
  constructor(game, opts = {}) {
    this.game = game;
    this.mode = opts.mode || 'local'; // 'local' | 'online'
    this.net = opts.net || null;
    this.localId = opts.localId ?? 0; // index du joueur contrôlé en ligne
    this.arenaIdx = opts.arenaIdx ?? 0;
    this.cam = { x: 0, y: 0 };
    this.particles = []; this.floats = []; this.fireballs = [];
    this.timeLeft = 99; this.timeAcc = 0;
    this.over = false; this.winner = -1; this.stateT = 0;
    this.netAcc = 0; this.remoteBuf = null;
    this.kos = [0, 0];
    this.load();
    if (this.mode === 'online' && this.net) this.bindNet();
  }

  load() {
    const def = ARENAS[this.arenaIdx];
    this.level = new Level({ ...def });
    // points de spawn marqués '1' et '2'
    this.spawnPts = [{ x: 32, y: 64 }, { x: this.level.pixelW - 48, y: 64 }];
    for (let ty = 0; ty < this.level.h; ty++) for (let tx = 0; tx < this.level.w; tx++) {
      const ch = this.level.rows[ty][tx];
      if (ch === '1') { this.spawnPts[0] = { x: tx * TILE, y: ty * TILE }; this.level.rows[ty][tx] = ' '; }
      if (ch === '2') { this.spawnPts[1] = { x: tx * TILE, y: ty * TILE }; this.level.rows[ty][tx] = ' '; }
    }
    this.coins = this.level.coins.map((cc) => new Coin(cc.tx, cc.ty));
    this.items = [];
    this.players = [
      new Player(this.spawnPts[0].x, this.spawnPts[0].y, { skin: 'p1', id: 0 }),
      new Player(this.spawnPts[1].x, this.spawnPts[1].y, { skin: 'p2', id: 1 }),
    ];
    this.players[0].power = 'big'; this.players[0].setSize(true);
    this.players[1].power = 'big'; this.players[1].setSize(true);
    this.players[1].dir = -1;
    playMusic('versus');
  }

  bindNet() {
    this.net.on('msg', (m) => {
      const d = m.d || m;
      if (d.t === 'state') { this.remoteBuf = d; }
      else if (d.t === 'ko') { // l'adversaire annonce qu'on l'a éliminé
        this.kos[this.localId]++; this.addFloat(VIEW_W/2, 40, 'KO !', '#ffd23b');
      }
      else if (d.t === 'spawnfb') { this.fireballs.push(new Fireball(d.x, d.y, d.dir, 1 - this.localId)); }
      else if (d.t === 'end') { this.finish(d.winner); }
    });
    this.net.on('peerleave', () => { if (!this.over) { this.addFloat(VIEW_W/2, 60, 'Adversaire parti', '#ff5d5d'); } });
  }

  addFloat(x, y, t, c) { this.floats.push(new FloatText(x, y, t, c)); }
  spawnFireball(fb) {
    this.fireballs.push(fb);
    if (this.mode === 'online') this.net.relay({ t: 'spawnfb', x: fb.x, y: fb.y, dir: fb.vx > 0 ? 1 : -1 });
  }
  countFireballs(id) { return this.fireballs.filter((f) => f.owner === id).length; }
  onBlockHit(ev, p) {
    if (ev.kind === 'question') { this.items.push(new PowerUp(ev.tx * TILE + 1, ev.ty * TILE - 4, Math.random() < 0.5 ? 'mushroom' : 'flower')); SFX.bump(); }
  }
  burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, rand(-120,120), rand(-120,20), col, rand(0.3,0.7), 2)); }

  inputFor(idx) {
    if (this.mode === 'bot' && idx === 1) return this.aiInput();
    const I = this.game.input;
    // en ligne, le joueur local utilise le contrôleur 0; en local, p0=clavier1/manette1, p1=clavier2/manette2
    const player = this.mode === 'online' ? 0 : idx;
    if (idx === 0 && I.justPressed('pause', 0)) this.game.togglePause();
    return {
      left: I.isDown('left', player), right: I.isDown('right', player), down: I.isDown('down', player),
      jump: I.isDown('jump', player), jumpPressed: I.justPressed('jump', player),
      fire: I.isDown('fire', player), firePressed: I.justPressed('fire', player), run: I.isDown('fire', player),
    };
  }

  // IA simple pour le bot (joueur 2)
  aiInput() {
    const me = this.players[1], foe = this.players[0];
    this._ai = this._ai || { jumpT: 0, fireT: 0, jumpPressed: false, firePressed: false };
    const ai = this._ai;
    ai.jumpT -= 1 / 120; ai.fireT -= 1 / 120;
    const dx = foe.x - me.x, ady = me.y - foe.y;
    const wantRight = dx > 4, wantLeft = dx < -4;
    // sauter pour passer au-dessus de l'adversaire, franchir un mur, ou éviter un vide
    let jump = false;
    const aheadX = me.dir > 0 ? me.x + me.w + 2 : me.x - 2;
    const wallAhead = this.level.solidAt(aheadX, me.y + me.h - 4);
    const gapAhead = !this.level.solidAt(aheadX, me.y + me.h + 4);
    if (me.onGround && ai.jumpT <= 0) {
      if (Math.abs(dx) < 40 && foe.y >= me.y - 4) { jump = true; }      // sauter sur sa tête
      else if (wallAhead || gapAhead) jump = true;
      else if (Math.random() < 0.02) jump = true;
      if (jump) ai.jumpT = 0.5 + Math.random() * 0.4;
    }
    ai.jumpPressed = jump;
    // tir si à portée horizontale et à peu près même hauteur
    let firePressed = false;
    if (me.power === 'fire' && ai.fireT <= 0 && Math.abs(ady) < 24 && Math.abs(dx) < 140 && (dx > 0) === (me.dir > 0)) {
      firePressed = true; ai.fireT = 0.6 + Math.random() * 0.5;
    }
    return {
      left: wantLeft, right: wantRight, down: false,
      jump: jump || (me.vy < 0 && Math.random() < 0.6), jumpPressed: jump,
      fire: firePressed, firePressed, run: Math.abs(dx) > 80,
    };
  }

  respawn(p, idx) {
    const s = this.spawnPts[idx];
    p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0; p.dead = false; p.deathT = 0;
    p.power = 'big'; p.setSize(true); p.invuln = 1.6; p.win = false;
    this.burst(p.x + 7, p.y + 7, '#fff', 12);
  }

  update(dt) {
    this.stateT += dt;
    if (this.over) { if (this.stateT > 3.5) this.game.endVersus(); return; }

    if (this.mode === 'local') this.timeAcc += dt;
    else this.timeAcc += dt; // les deux décomptent; l'hôte fait foi pour la fin
    if (this.timeAcc >= 1) { this.timeAcc -= 1; this.timeLeft = Math.max(0, this.timeLeft - 1); }
    if (this.timeLeft <= 0 && !this.over) this.finishByScore();

    if (this.mode !== 'online') {
      this.players[0].update(dt, this.level, this, this.inputFor(0));
      this.players[1].update(dt, this.level, this, this.inputFor(1));
      this.resolveCombat(0, 1); this.resolveCombat(1, 0);
    } else {
      const me = this.players[this.localId];
      me.update(dt, this.level, this, this.inputFor(this.localId));
      this.applyRemote(dt);
      // détecte si JE me fais écraser par l'adversaire (autorité locale sur ma propre mort)
      const other = this.players[1 - this.localId];
      if (!me.dead && me.invuln <= 0 && aabb(me, other)) {
        const fromAbove = (other.y + other.h) - me.y < 12 && other.vy > 30 && other.y < me.y;
        if (fromAbove) { this.localKO(me); }
      }
      // boules adverses qui me touchent
      for (const fb of this.fireballs) {
        if (fb.owner !== this.localId && !me.dead && me.invuln <= 0 && aabb(fb, me)) { fb.dead = true; this.localKO(me); }
      }
      this.sendState(dt);
    }

    // objets/pièces/particules communs
    for (const it of this.items) { it.update(dt, this.level); for (const p of this.players) if (!p.dead && aabb(p, it)) { p.grow(it.kind, this); it.dead = true; } }
    for (const co of this.coins) { co.update(dt); for (const p of this.players) if (!p.dead && aabb(p, co)) { co.dead = true; SFX.coin(); } }
    for (const fb of this.fireballs) fb.update(dt, this.level);
    for (const p of this.particles) p.update(dt);
    for (const f of this.floats) f.update(dt);

    this.items = this.items.filter((i) => !i.dead);
    this.coins = this.coins.filter((c) => !c.dead);
    this.fireballs = this.fireballs.filter((f) => !f.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.floats = this.floats.filter((f) => !f.dead);

    // respawn morts (local / bot)
    if (this.mode !== 'online') this.players.forEach((p, i) => { if (p.dead && p.deathT > 1.2) this.respawn(p, i); });
    else { const me = this.players[this.localId]; if (me.dead && me.deathT > 1.2) this.respawn(me, this.localId); }

    this.cam.x = clamp((this.level.pixelW - VIEW_W) / 2, 0, Math.max(0, this.level.pixelW - VIEW_W));
    this.cam.y = clamp((this.level.pixelH - VIEW_H), 0, Math.max(0, this.level.pixelH - VIEW_H));
  }

  resolveCombat(aIdx, bIdx) {
    const a = this.players[aIdx], b = this.players[bIdx];
    if (a.dead || b.dead) return;
    if (b.invuln > 0) return;
    if (!aabb(a, b)) return;
    const fromAbove = (a.y + a.h) - b.y < 12 && a.vy > 30 && a.y < b.y;
    if (fromAbove) {
      a.vy = -260; this.kos[aIdx]++; b.die(this); SFX.stomp(); this.burst(b.x+7, b.y+7, '#ff5d5d', 12);
      this.addFloat(b.x, b.y - 8, 'KO !', '#ffd23b');
      if (this.kos[aIdx] >= KO_TO_WIN) this.finish(aIdx);
    }
    // boules de feu sur l'adversaire
    for (const fb of this.fireballs) {
      if (fb.owner === bIdx && !a.dead && a.invuln <= 0 && aabb(fb, a)) { fb.dead = true; a.die(this); this.kos[bIdx]++; if (this.kos[bIdx] >= KO_TO_WIN) this.finish(bIdx); }
    }
  }

  localKO(me) {
    me.die(this); SFX.hurt();
    this.kos[1 - this.localId]++;
    this.burst(me.x + 7, me.y + 7, '#ff5d5d', 12);
    this.net.relay({ t: 'ko' });
    if (this.kos[1 - this.localId] >= KO_TO_WIN && this.localId === 0) this.finish(1 - this.localId);
  }

  sendState(dt) {
    this.netAcc += dt;
    if (this.netAcc < 1 / 20) return; // 20 Hz
    this.netAcc = 0;
    const me = this.players[this.localId];
    this.net.relay({ t: 'state', x: me.x, y: me.y, vx: me.vx, vy: me.vy, dir: me.dir, power: me.power, dead: me.dead, walkT: me.walkT, onGround: me.onGround });
  }
  applyRemote(dt) {
    const r = this.players[1 - this.localId];
    if (!this.remoteBuf) return;
    const b = this.remoteBuf;
    // interpolation simple vers la dernière position reçue
    r.x += (b.x - r.x) * Math.min(1, dt * 14);
    r.y += (b.y - r.y) * Math.min(1, dt * 14);
    r.vx = b.vx; r.vy = b.vy; r.dir = b.dir; r.power = b.power; r.onGround = b.onGround; r.walkT = b.walkT;
    if (b.power !== 'small') r.setSize(true); else r.setSize(false);
    r.dead = b.dead;
  }

  finishByScore() {
    if (this.kos[0] === this.kos[1]) this.finish(-1);
    else this.finish(this.kos[0] > this.kos[1] ? 0 : 1);
  }
  finish(winner) {
    if (this.over) return;
    this.over = true; this.winner = winner; this.stateT = 0;
    SFX.win();
    if (this.mode === 'online' && this.localId === 0) this.net.relay({ t: 'end', winner });
  }
  endByPeer() { this.finish(this.localId); }

  draw(c) {
    this.level.drawBackground(c, this.cam);
    this.level.drawTiles(c, this.cam);
    for (const co of this.coins) co.draw(c, this.cam);
    for (const it of this.items) it.draw(c, this.cam);
    for (const fb of this.fireballs) fb.draw(c, this.cam);
    for (const p of this.players) p.draw(c, this.cam);
    for (const p of this.particles) p.draw(c, this.cam);
    for (const f of this.floats) f.draw(c, this.cam);
    this.drawHUD(c);
    if (this.over) {
      const txt = this.winner < 0 ? 'ÉGALITÉ !' : (this.mode === 'online'
        ? (this.winner === this.localId ? 'VICTOIRE !' : 'DÉFAITE')
        : this.mode === 'bot'
        ? (this.winner === 0 ? 'VICTOIRE !' : 'L\'IA GAGNE')
        : `JOUEUR ${this.winner + 1} GAGNE !`);
      c.fillStyle = '#000'; c.globalAlpha = 0.55; c.fillRect(0, VIEW_H/2-18, VIEW_W, 36); c.globalAlpha = 1;
      c.font = '16px monospace'; c.textAlign = 'center';
      c.fillStyle = this.winner < 0 ? '#fff' : '#ffd23b';
      c.fillText(txt, VIEW_W/2, VIEW_H/2 + 5); c.textAlign = 'left';
    }
  }
  drawHUD(c) {
    c.fillStyle = '#000'; c.globalAlpha = 0.4; c.fillRect(0, 0, VIEW_W, 16); c.globalAlpha = 1;
    c.font = '9px monospace';
    c.fillStyle = '#7fc6ff'; c.textAlign = 'left'; c.fillText('J1  ' + this.kos[0] + ' KO', 6, 11);
    c.fillStyle = '#37c24a'; c.textAlign = 'right'; c.fillText(this.kos[1] + ' KO  ' + (this.mode === 'bot' ? 'IA' : 'J2'), VIEW_W - 6, 11);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(String(this.timeLeft).padStart(2,'0'), VIEW_W/2, 11);
    c.textAlign = 'left';
  }
}
