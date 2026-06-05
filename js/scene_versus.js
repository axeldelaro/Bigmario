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
    this.coop = opts.mode === 'coop';
    this.localId = opts.localId || 0;
    this.playerCount = opts.playerCount || 2;
    this.ids = opts.ids || Array.from({length: Math.max(2, this.playerCount)}, (_, k) => k);
    this._brains = {}; // index du joueur contrôlé en ligne
    this.net = opts.net || null;
    this.arenaIdx = opts.arenaIdx ?? 0;
    this.botSkill = opts.botSkill ?? 0.92; // difficulté de l'IA (0..1)
    this.playerCount = opts.playerCount || 2;
    this.cam = { x: 0, y: 0 };
    this.particles = []; this.floats = []; this.fireballs = [];
    this.timeLeft = 99; this.timeAcc = 0;
    this.over = false; this.winner = -1; this.stateT = 0;
    this.netAcc = 0; this.remoteBuf = null; this.remoteStates = new Map();
    this.kos = [];
    // Fantôme rival: enregistre le joueur 0 (hors ligne) pour créer un adversaire fantôme
    this.matchMs = 0;
    this.rec = (this.mode !== 'online' && this.mode !== 'ffa') ? new GhostRecorder() : null;
    this.rivalGhost = null;
    if (this.mode === 'rival') {
      const data = GhostStore.load(`vghost.${this.arenaIdx}`);
      if (data) { const g = new GhostPlayer(data); if (g.valid) this.rivalGhost = g; }
    }
    this.load();
    if ((this.mode === 'online' || this.mode === 'ffa') && this.net) this.bindNet();
  }

  load() {
    const def = ARENAS[this.arenaIdx];
    this.level = new Level({ ...def });
    // points de spawn marqués '1' et '2'
    const W = this.level.pixelW;
    this.spawnPts = [
      { x: 32, y: 64 },
      { x: W - 48, y: 64 },
      { x: Math.round(W * 0.35), y: 64 },
      { x: Math.round(W * 0.65), y: 64 },
    ];
    for (let ty = 0; ty < this.level.h; ty++) for (let tx = 0; tx < this.level.w; tx++) {
      const ch = this.level.rows[ty][tx];
      if (ch === '1') { this.spawnPts[0] = { x: tx * TILE, y: ty * TILE }; this.level.rows[ty][tx] = ' '; }
      if (ch === '2') { this.spawnPts[1] = { x: tx * TILE, y: ty * TILE }; this.level.rows[ty][tx] = ' '; }
      if (ch === '3') { this.spawnPts[2] = { x: tx * TILE, y: ty * TILE }; this.level.rows[ty][tx] = ' '; }
      if (ch === '4') { this.spawnPts[3] = { x: tx * TILE, y: ty * TILE }; this.level.rows[ty][tx] = ' '; }
    }
    this.coins = this.level.coins.map((cc) => new Coin(cc.tx, cc.ty));
    this.items = [];
    this.players = [];
    this.kos = [];
    const skins = ['p1','p2','p1','p2'];
    const dirs  = [1, -1, 1, -1];
    const N = Math.max(2, Math.min(4, this.playerCount));
    for (let i = 0; i < N; i++) {
      const sp = this.spawnPts[i];
      const pl = new Player(sp.x, sp.y, { skin: skins[i], id: i });
      pl.power = 'big'; pl.setSize(true); pl.dir = dirs[i];
      this.players.push(pl);
      this.kos.push(0);
    }
    playMusic('versus');
  }

  bindNet() {
    this._msgHandler = (m) => {
      const d = m.d || m;
      const from = m.from ?? (d.from ?? (1 - this.localId));
      if (d.t === 'state') { this.remoteStates.set(from, d); this.remoteBuf = d; }
      else if (d.t === 'ko') {
        const killer = d.killer ?? (1 - from);
        const victim = d.victim ?? from;
        if (killer != null && this.kos[killer] != null) this.kos[killer]++;
        const victimLabel = victim === this.localId ? 'Vous' : `J${victim+1}`;
        const killerLabel = killer === this.localId ? 'Vous' : `J${killer+1}`;
        this.addFloat(VIEW_W/2, 40, `${victimLabel} KO par ${killerLabel} !`, '#ffd23b');
      }
      else if (d.t === 'spawnfb') { this.fireballs.push(new Fireball(d.x, d.y, d.dir, from)); }
      else if (d.t === 'end') { this.finish(d.winner); }
    };
    this.net.on('msg', this._msgHandler);

    this._leaveHandler = () => { if (!this.over) { this.addFloat(VIEW_W/2, 60, 'Adversaire parti', '#ff5d5d'); } };
    this.net.on('peerleave', this._leaveHandler);
  }

  unbindNet() {
    if (this.net) {
      if (this._msgHandler) this.net.off('msg', this._msgHandler);
      if (this._leaveHandler) this.net.off('peerleave', this._leaveHandler);
    }
  }

  addFloat(x, y, t, c) { this.floats.push(new FloatText(x, y, t, c)); }
  spawnFireball(fb) {
    this.fireballs.push(fb);
    if (this.mode === 'online' || this.mode === 'ffa') this.net.relay({ t: 'spawnfb', from: this.localId, x: fb.x, y: fb.y, dir: fb.vx > 0 ? 1 : -1 });
  }
  countFireballs(id) { return this.fireballs.filter((f) => f.owner === id).length; }
  onBlockHit(ev, p) {
    if (ev.kind === 'question') { this.items.push(new PowerUp(ev.tx * TILE + 1, ev.ty * TILE - 4, Math.random() < 0.5 ? 'mushroom' : 'flower')); SFX.bump(); }
  }
  burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, rand(-120,120), rand(-120,20), col, rand(0.3,0.7), 2)); }
  addShake(m) { /* vibration légère – optionnel en versus */ }
  dust(x, y, n = 3) { for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, rand(-40,40), rand(-25,-5), '#ddd', rand(0.2,0.4), 2, 150)); }

  // Écrasement piqué : déclenche les blocs juste sous les pieds (comme scene_game)
  onPoundLand(player) {
    const feetTy = Math.floor((player.y + player.h + 2) / TILE);
    const x0 = Math.floor((player.x + 2) / TILE);
    const x1 = Math.floor((player.x + player.w - 3) / TILE);
    let hit = false;
    for (let tx = x0; tx <= x1; tx++) {
      const ev = this.level.hitBlock(tx, feetTy);
      if (ev) { this.onBlockHit(ev, player); hit = true; }
    }
    this.burst(player.x + player.w / 2, player.y + player.h, hit ? '#ffd23b' : '#ccc', hit ? 12 : 4);
  }

  inputFor(idx) {
    // joueur 1 piloté par l'IA en mode bot, ou en mode rival sans fantôme enregistré
    if (idx === 1 && (this.mode === 'bot' || (this.mode === 'rival' && !this.rivalGhost))) return this.aiInput(idx);
    
    // IA personnalisées dans le tableau ids (pour FFA et tournois locaux)
    const realId = this.ids && this.ids[idx];
    if (typeof realId === 'string' && realId.startsWith('AI')) return this.aiInput(idx);

    const I = this.game.input;
    // en ligne, le joueur local utilise le contrôleur 0; en local, p0=clavier1/manette1, p1=clavier2/manette2, etc.
    const player = (this.mode === 'online' || this.mode === 'ffa') ? 0 : idx;
    if (idx === 0 && I.justPressed('pause', 0)) this.game.togglePause();
    return {
      left: I.isDown('left', player), right: I.isDown('right', player), down: I.isDown('down', player), downPressed: I.justPressed('down', player),
      jump: I.isDown('jump', player), jumpPressed: I.justPressed('jump', player),
      fire: I.isDown('fire', player), firePressed: I.justPressed('fire', player), run: I.isDown('run', player),
    };
  }

  // IA du bot (joueur 2) : cerveau combatif partagé, avec prise d'initiative.
  // - poursuit et écrase l'adversaire, tire si plume de feu,
  // - va chercher un power-up disponible quand il est "petit",
  // - esquive boules de feu et projectiles.
  aiInput(idx = 1, dt = 1 / 120) {
    const me = this.players[idx];
    // Trouver l'adversaire le plus proche
    let foe = null, minDist = Infinity;
    for (let i = 0; i < this.players.length; i++) {
      if (i === idx || this.players[i].dead) continue;
      const d = Math.abs(this.players[i].x - me.x) + Math.abs(this.players[i].y - me.y) * 1.5;
      if (d < minDist) { minDist = d; foe = this.players[i]; }
    }
    if (!foe) foe = this.players[0] !== me ? this.players[0] : this.players[1];

    this._brains[idx] = this._brains[idx] || new BotBrain({ skill: this.botSkill });
    // priorité : ramasser un power-up proche si on est encore petit
    let target = null, collect = false;
    if (me.power === 'small' && this.items.length) {
      let best = null, bd = 1e9;
      for (const it of this.items) { const d = Math.abs(it.x - me.x) + Math.abs(it.y - me.y) * 1.3; if (d < bd) { bd = d; best = it; } }
      if (best && bd < 130) { target = { x: best.x + best.w / 2, y: best.y }; collect = true; }
    }
    const threats = this.fireballs.filter((f) => f.owner !== idx);
    return this._brains[idx].think(dt, { me, level: this.level, opponent: foe, target, collect, threats });
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

    if (this.mode !== 'online' && this.mode !== 'ffa') {
      this.matchMs += dt * 1000;
      for (let i = 0; i < this.players.length; i++) {
        if (i === 1 && this.mode === 'rival' && this.rivalGhost && !this.players[1].dead) {
          this.puppetRival(dt);
        } else {
          this.players[i].update(dt, this.level, this, this.inputFor(i));
        }
      }
      if (this.rec && !this.over && this.players[0]) this.rec.update(dt, this.players[0], this.matchMs);
      for (let i = 0; i < this.players.length; i++) for (let j = 0; j < this.players.length; j++) if (i !== j) this.resolveCombat(i, j);
    } else {
      const me = this.players[this.localId];
      if (me) {
        me.update(dt, this.level, this, this.inputFor(this.localId));
        this._applyRemoteAll(dt);
        // détecte si JE me fais écraser par un adversaire (autorité locale)
        for (let i = 0; i < this.players.length; i++) {
          if (i === this.localId) continue;
          const other = this.players[i];
          if (other && !other.dead && !me.dead && aabb(me, other)) {
            const otherPrevFeet = other.prevFeet != null ? other.prevFeet : (other.y + other.h);
            const otherFromAbove = (other.vy > 0 && otherPrevFeet <= me.y + 12) || other.pounding;
            if (otherFromAbove && me.invuln <= 0) {
              this.localKO(me, i);
            }
            
            const mePrevFeet = me.prevFeet != null ? me.prevFeet : (me.y + me.h);
            const meFromAbove = (me.vy > 0 && mePrevFeet <= other.y + 12) || me.pounding;
            if (meFromAbove && other.invuln <= 0) {
              me.vy = me.pounding ? -350 : -260;
              me.pounding = false; me.poundT = 0;
            }
          }
        }
        if (!this.coop) for (const fb of this.fireballs) {
          if (fb.owner !== this.localId && !me.dead && me.invuln <= 0 && aabb(fb, me)) { fb.dead = true; this.localKO(me, fb.owner); }
        }
        this.sendState(dt);
      }
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
    if (this.mode !== 'online' && this.mode !== 'ffa') this.players.forEach((p, i) => { if (p.dead && p.deathT > 1.2) this.respawn(p, i); });
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

  localKO(me, killerIdx) {
    me.die(this); SFX.hurt();
    if (killerIdx != null && this.kos[killerIdx] != null) {
      this.kos[killerIdx]++;
      if (this.kos[killerIdx] >= KO_TO_WIN && this.localId === 0) this.finish(killerIdx);
    } else {
      const otherId = 1 - this.localId;
      this.kos[otherId]++;
      if (this.kos[otherId] >= KO_TO_WIN && this.localId === 0) this.finish(otherId);
    }
    this.burst(me.x + 7, me.y + 7, '#ff5d5d', 12);
    if (this.net) this.net.relay({ t: 'ko', killer: killerIdx, victim: this.localId });
  }

  sendState(dt) {
    this.netAcc += dt;
    if (this.netAcc < 1 / 20) return; // 20 Hz
    this.netAcc = 0;
    const me = this.players[this.localId];
    this.net.relay({ t: 'state', from: this.localId, x: me.x, y: me.y, vx: me.vx, vy: me.vy, dir: me.dir, power: me.power, dead: me.dead, walkT: me.walkT, onGround: me.onGround });
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

  _applyRemoteAll(dt) {
    if (this.playerCount <= 2) { this.applyRemote(dt); return; }
    for (const [id, b] of this.remoteStates) {
      if (id === this.localId) continue;
      const r = this.players[id];
      if (!r) continue;
      r.x += (b.x - r.x) * Math.min(1, dt * 14);
      r.y += (b.y - r.y) * Math.min(1, dt * 14);
      r.vx = b.vx; r.vy = b.vy; r.dir = b.dir; r.power = b.power;
      r.onGround = b.onGround; r.walkT = b.walkT; r.dead = b.dead;
      if (b.power !== 'small') r.setSize(true); else r.setSize(false);
    }
  }

  finishByScore() {
    if (this.players.length <= 2) {
      if (this.kos[0] === this.kos[1]) this.finish(-1);
      else this.finish(this.kos[0] > this.kos[1] ? 0 : 1);
    } else {
      let maxKo = -1, best = [];
      this.kos.forEach((k, idx) => {
        if (k > maxKo) { maxKo = k; best = [idx]; }
        else if (k === maxKo) { best.push(idx); }
      });
      if (best.length === 1) this.finish(best[0]);
      else this.finish(-1); // égalité
    }
  }
  finish(winner) {
    if (this.over) return;
    this.over = true; this.winner = winner; this.stateT = 0;
    SFX.win();
    // sauvegarde le déplacement du joueur comme fantôme rival pour cette arène
    if (this.rec) { const d = this.rec.data(); if (d.f.length >= 60) GhostStore.save(`vghost.${this.arenaIdx}`, d); }
    // succès: victoire du joueur humain
    const humanWon = (this.mode === 'online' || this.mode === 'ffa') ? (winner === this.localId)
      : (this.mode === 'bot' || this.mode === 'rival') ? (winner === 0)
      : (winner >= 0);
    if (humanWon) this.game.stat?.('vwin');
    if ((this.mode === 'online' || this.mode === 'ffa') && this.localId === 0 && this.net) this.net.relay({ t: 'end', winner });
  }
  endByPeer() { this.finish(this.localId); }

  draw(c) { this.drawWorld(c); this.drawOverlay(c); }

  drawWorld(c) {
    this.level.drawBackground(c, this.cam);
    this.level.drawTiles(c, this.cam);
    for (const co of this.coins) co.draw(c, this.cam);
    for (const it of this.items) it.draw(c, this.cam);
    for (const fb of this.fireballs) fb.draw(c, this.cam);
    for (const p of this.players) {
      p.draw(c, this.cam);
      if (!p.dead) {
        let ps = this.net?.pseudos?.get(p.id) || (this.ids[p.id] && typeof this.ids[p.id] === 'string' && this.ids[p.id].startsWith('AI') ? 'IA' : `J${p.id+1}`);
        if (this.mode === 'bot' && p.id === 1) ps = 'IA';
        if (this.mode === 'rival' && p.id === 1) ps = 'Rival';
        c.font = '8px monospace'; c.textAlign = 'center';
        c.fillStyle = p.id === this.localId ? '#ffd23b' : '#fff';
        c.fillText(ps.slice(0,10), Math.round(p.x + p.w/2 - this.cam.x), Math.round(p.y - 6 - this.cam.y));
        c.textAlign = 'left';
      }
    }
    for (const p of this.particles) p.draw(c, this.cam);
    for (const f of this.floats) f.draw(c, this.cam);
  }

  drawOverlay(c) {
    this.drawHUD(c);
    if (this.over) {
      const w = this.winner;
      const wPseudo = this.net?.pseudos?.get(w) || `JOUEUR ${w + 1}`;
      const txt = this.coop ? `COOP : ${this.coopCoins}` :
        w < 0 ? 'EGALITE !' :
        (this.mode === 'online' || this.mode === 'ffa')
          ? (w === this.localId ? 'VICTOIRE !' : `${wPseudo} GAGNE !`)
          : (this.mode === 'bot' || this.mode === 'rival')
            ? (w === 0 ? 'VICTOIRE !' : (this.mode === 'rival' ? 'LE RIVAL GAGNE' : 'L\'IA GAGNE'))
            : `${wPseudo} GAGNE !`;
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
      c.fillStyle = '#37c24a'; c.textAlign = 'left'; c.fillText('CO-OP', 6, 11);
      c.fillStyle = '#ffd23b'; c.textAlign = 'right'; c.fillText('x' + this.coopCoins, VIEW_W - 6, 11);
    } else {
      const cols = ['#7fc6ff','#37c24a','#ff8a3b','#ff5d5d'];
      const labels = this.ids.map(id => typeof id === 'string' && id.startsWith('AI') ? 'IA' : `J${id+1}`);
      const slot = VIEW_W / (labels.length + 1);
      this.players.forEach((p, i) => {
        let ps = this.net?.pseudos?.get(i) || labels[i];
        if (this.mode === 'bot' && i === 1) ps = 'IA';
        if (this.mode === 'rival' && i === 1) ps = 'Rival';
        c.fillStyle = cols[i % 4]; c.textAlign = 'center';
        c.fillText(ps.slice(0, 8) + ' ' + (this.kos[i] || 0) + 'ko', slot * (i + 1), 11);
      });
    }
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(String(this.timeLeft).padStart(2,'0'), VIEW_W/2, 11);
    c.textAlign = 'left';

    // Légende des contrôles en bas (mode local 2 joueurs)
    if (this.mode === 'local') {
      c.globalAlpha = 0.6;
      c.fillStyle = '#000'; c.fillRect(0, VIEW_H - 12, VIEW_W, 12);
      c.globalAlpha = 1;
      c.font = '7px monospace';
      c.fillStyle = '#7fc6ff'; c.textAlign = 'left';
      c.fillText('J1: Fleches/ZQSD  Saut:Espace  Feu:J', 4, VIEW_H - 3);
      c.fillStyle = '#37c24a'; c.textAlign = 'right';
      c.fillText('J2: F/H/T/G  Saut:T/Y  Feu:U', VIEW_W - 4, VIEW_H - 3);
      c.textAlign = 'left';
    }
  }
}
