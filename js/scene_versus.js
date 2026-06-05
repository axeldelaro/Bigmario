// scene_versus.js — mode combat: local (2 joueurs même écran) ou en ligne (WebSocket).
// Règles: s'écraser sur la tête de l'adversaire = 1 KO. Les boules de feu assomment.
// Le plus de KO à la fin du temps (ou premier à 5) gagne. Respawn après KO.
import { VIEW_W, VIEW_H, TILE, clamp, aabb, rand } from './core.js';
import { Level } from './level.js';
import { Player, Enemy, Coin, PowerUp, Fireball, Particle, FloatText } from './entities.js';
import { SFX, playMusic } from './audio.js';
import { ARENAS } from './levels.js';
import { GhostRecorder, GhostPlayer, GhostStore } from './ghost.js';
import { BotBrain } from './ai.js';

const KO_TO_WIN = 5;

export class VersusScene {
  constructor(game, opts = {}) {
    this.game = game;
    this.mode = opts.mode || 'local'; // 'local' | 'bot' | 'rival' | 'online'
    this.coop = !!opts.coop;          // co-op : pas de combat, collecte commune
    this.coopCoins = 0;
    this.net = opts.net || null;
    this.localId = opts.localId ?? 0; // index du joueur contrôlé en ligne
    this.arenaIdx = opts.arenaIdx ?? 0;
    this.botSkill = opts.botSkill ?? 0.92; // difficulté de l'IA (0..1)
    this.cam = { x: 0, y: 0 };
    this.particles = []; this.floats = []; this.fireballs = [];
    this.timeLeft = 99; this.timeAcc = 0;
    this.over = false; this.winner = -1; this.stateT = 0;
    this.netAcc = 0; this.remoteBuf = null;
    this.kos = [0, 0];
    // Fantôme rival: enregistre le joueur 0 (hors ligne) pour créer un adversaire fantôme
    this.matchMs = 0;
    this.rec = (this.mode !== 'online') ? new GhostRecorder() : null;
    this.rivalGhost = null;
    if (this.mode === 'rival') {
      const data = GhostStore.load(`vghost.${this.arenaIdx}`);
      if (data) { const g = new GhostPlayer(data); if (g.valid) this.rivalGhost = g; }
    }
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
    // joueur 1 piloté par l'IA en mode bot, ou en mode rival sans fantôme enregistré
    if (idx === 1 && (this.mode === 'bot' || (this.mode === 'rival' && !this.rivalGhost))) return this.aiInput();
    const I = this.game.input;
    // en ligne, le joueur local utilise le contrôleur 0; en local, p0=clavier1/manette1, p1=clavier2/manette2
    const player = this.mode === 'online' ? 0 : idx;
    if (idx === 0 && I.justPressed('pause', 0)) this.game.togglePause();
    return {
      left: I.isDown('left', player), right: I.isDown('right', player), down: I.isDown('down', player), downPressed: I.justPressed('down', player),
      jump: I.isDown('jump', player), jumpPressed: I.justPressed('jump', player),
      fire: I.isDown('fire', player), firePressed: I.justPressed('fire', player), run: I.isDown('fire', player),
    };
  }

  // IA du bot (joueur 2) : cerveau combatif partagé, avec prise d'initiative.
  // - poursuit et écrase l'adversaire, tire si plume de feu,
  // - va chercher un power-up disponible quand il est "petit",
  // - esquive boules de feu et projectiles.
  aiInput(dt = 1 / 120) {
    const me = this.players[1], foe = this.players[0];
    // Créer le cerveau avec le skill configuré (botSkill) si pas encore instancié
    this._brain = this._brain || new BotBrain({ skill: this.botSkill });
    // priorité : ramasser un power-up proche si on est encore petit
    let target = null, collect = false;
    if (me.power === 'small' && this.items.length) {
      let best = null, bd = 1e9;
      for (const it of this.items) { const d = Math.abs(it.x - me.x) + Math.abs(it.y - me.y) * 1.3; if (d < bd) { bd = d; best = it; } }
      if (best && bd < 130) { target = { x: best.x + best.w / 2, y: best.y }; collect = true; }
    }
    const threats = this.fireballs.filter((f) => f.owner !== 1);
    return this._brain.think(dt, { me, level: this.level, opponent: foe, target, collect, threats });
  }

  // Pilote l'adversaire (joueur 1) en rejouant un fantôme enregistré (boucle).
  puppetRival(dt) {
    const r = this.players[1];
    const dur = this.rivalGhost.n * this.rivalGhost.dt;
    const pose = this.rivalGhost.poseAt(dur > 0 ? this.matchMs % dur : 0);
    if (!pose) return;
    if (pose.power >= 1 && r.power === 'small') { r.power = 'big'; r.setSize(true); }
    const prevY = r.y;
    r.prevFeet = r.y + r.h;
    r.x = pose.x; r.y = pose.y;
    r.vy = dt > 0 ? clamp((r.y - prevY) / dt, -400, 400) : 0; // vitesse verticale dérivée (écrasement)
    r.vx = 0; r.dir = pose.dir; r.onGround = !pose.air;
    if (pose.moving) r.walkT += dt * 8;
    if (r.invuln > 0) r.invuln -= dt;
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
      this.matchMs += dt * 1000;
      this.players[0].update(dt, this.level, this, this.inputFor(0));
      if (this.rec && !this.over) this.rec.update(dt, this.players[0], this.matchMs);
      if (this.mode === 'rival' && this.rivalGhost && !this.players[1].dead) this.puppetRival(dt);
      else this.players[1].update(dt, this.level, this, this.inputFor(1));
      this.resolveCombat(0, 1); this.resolveCombat(1, 0);
    } else {
      const me = this.players[this.localId];
      me.update(dt, this.level, this, this.inputFor(this.localId));
      this.applyRemote(dt);
      // détecte si JE me fais écraser par l'adversaire (autorité locale sur ma propre mort)
      const other = this.players[1 - this.localId];
      if (!this.coop && !me.dead && me.invuln <= 0 && aabb(me, other)) {
        const fromAbove = (other.y + other.h) - me.y < 12 && other.vy > 30 && other.y < me.y;
        if (fromAbove) { this.localKO(me); }
      }
      if (!this.coop) for (const fb of this.fireballs) {
        if (fb.owner !== this.localId && !me.dead && me.invuln <= 0 && aabb(fb, me)) { fb.dead = true; this.localKO(me); }
      }
      this.sendState(dt);
    }

    // objets/pièces/particules communs
    for (const it of this.items) { it.update(dt, this.level); for (const p of this.players) if (!p.dead && aabb(p, it)) { p.grow(it.kind, this); it.dead = true; } }
    for (const co of this.coins) { co.update(dt); for (const p of this.players) if (!p.dead && aabb(p, co)) { co.dead = true; SFX.coin(); this.coopCoins++; } }
    for (const fb of this.fireballs) fb.update(dt, this.level);
    for (const p of this.particles) p.update(dt);
    for (const f of this.floats) f.update(dt);

    this.items = this.items.filter((i) => !i.dead);
    this.coins = this.coins.filter((c) => !c.dead);
    this.fireballs = this.fireballs.filter((f) => !f.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    if (this.particles.length > 110) this.particles.splice(0, this.particles.length - 110); // anti-saturation
    this.floats = this.floats.filter((f) => !f.dead);

    // respawn morts (local / bot)
    if (this.mode !== 'online') this.players.forEach((p, i) => { if (p.dead && p.deathT > 1.2) this.respawn(p, i); });
    else { const me = this.players[this.localId]; if (me.dead && me.deathT > 1.2) this.respawn(me, this.localId); }

    this.cam.x = clamp((this.level.pixelW - VIEW_W) / 2, 0, Math.max(0, this.level.pixelW - VIEW_W));
    this.cam.y = clamp((this.level.pixelH - VIEW_H), 0, Math.max(0, this.level.pixelH - VIEW_H));
  }

  resolveCombat(aIdx, bIdx) {
    if (this.coop) return; // co-op : aucun KO entre joueurs
    const a = this.players[aIdx], b = this.players[bIdx];
    if (a.dead || b.dead) return;
    if (b.invuln > 0) return;
    if (!aabb(a, b)) return;
    const aPrevFeet = a.prevFeet != null ? a.prevFeet : (a.y + a.h);
    const fromAbove = (a.vy > 0 && aPrevFeet <= b.y + 8) || a.pounding;
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
    // sauvegarde le déplacement du joueur comme fantôme rival pour cette arène
    if (this.rec) { const d = this.rec.data(); if (d.f.length >= 60) GhostStore.save(`vghost.${this.arenaIdx}`, d); }
    // succès: victoire du joueur humain
    const humanWon = this.mode === 'online' ? (winner === this.localId)
      : (this.mode === 'bot' || this.mode === 'rival') ? (winner === 0)
      : (winner >= 0);
    if (humanWon) this.game.stat?.('vwin');
    if (this.mode === 'online' && this.localId === 0) this.net.relay({ t: 'end', winner });
  }
  endByPeer() { this.finish(this.localId); }

  draw(c) { this.drawWorld(c); this.drawOverlay(c); }

  drawWorld(c) {
    this.level.drawBackground(c, this.cam);
    this.level.drawTiles(c, this.cam);
    for (const co of this.coins) co.draw(c, this.cam);
    for (const it of this.items) it.draw(c, this.cam);
    for (const fb of this.fireballs) fb.draw(c, this.cam);
    for (const p of this.players) p.draw(c, this.cam);
    for (const p of this.particles) p.draw(c, this.cam);
    for (const f of this.floats) f.draw(c, this.cam);
  }

  drawOverlay(c) {
    this.drawHUD(c);
    if (this.over) {
      const txt = this.coop ? `COOP : ${this.coopCoins} ●` : this.winner < 0 ? 'ÉGALITÉ !' : (this.mode === 'online'
        ? (this.winner === this.localId ? 'VICTOIRE !' : 'DÉFAITE')
        : (this.mode === 'bot' || this.mode === 'rival')
        ? (this.winner === 0 ? 'VICTOIRE !' : (this.mode === 'rival' ? 'LE RIVAL GAGNE' : 'L\'IA GAGNE'))
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
    if (this.coop) {
      c.fillStyle = '#37c24a'; c.textAlign = 'left'; c.fillText('🤝 CO-OP', 6, 11);
      c.fillStyle = '#ffd23b'; c.textAlign = 'right'; c.fillText('● ' + this.coopCoins, VIEW_W - 6, 11);
    } else {
      c.fillStyle = '#7fc6ff'; c.textAlign = 'left'; c.fillText('J1  ' + this.kos[0] + ' KO', 6, 11);
      const p2label = this.mode === 'bot' ? 'IA' : this.mode === 'rival' ? '👻RIVAL' : 'J2';
      c.fillStyle = '#37c24a'; c.textAlign = 'right'; c.fillText(this.kos[1] + ' KO  ' + p2label, VIEW_W - 6, 11);
    }
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(String(this.timeLeft).padStart(2,'0'), VIEW_W/2, 11);
    c.textAlign = 'left';
  }
}
