// entities.js — joueur, ennemis, objets, projectiles, particules
import {
  TILE, GRAVITY, MAX_FALL, RUN_ACCEL, RUN_MAX, SPRINT_MAX, FRICTION, AIR_ACCEL,
  JUMP_VY, JUMP_CUT, COYOTE, JUMP_BUFFER, clamp, sign, aabb, rand,
} from './core.js';
import { SFX } from './audio.js';

let ART = null;
export function setArt(a) { ART = a; }

// ombre au sol (ellipse douce) pour donner de la profondeur
export function shadow(c, cx, cy, w, alpha = 1) {
  c.save();
  c.globalAlpha = 0.28 * alpha; c.fillStyle = '#000';
  c.beginPath(); c.ellipse(Math.round(cx), Math.round(cy) - 1, w / 2, 2.2, 0, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ---------------------------------------------------------------------------
export class Particle {
  constructor(x, y, vx, vy, col, life = 0.6, size = 2, grav = 600) {
    Object.assign(this, { x, y, vx, vy, col, life, max: life, size, grav, dead: false });
  }
  update(dt) {
    this.vy += this.grav * dt; this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt; if (this.life <= 0) this.dead = true;
  }
  draw(c, cam) {
    c.globalAlpha = Math.max(0, this.life / this.max);
    c.fillStyle = this.col;
    c.fillRect(Math.round(this.x - cam.x), Math.round(this.y - cam.y), this.size, this.size);
    c.globalAlpha = 1;
  }
}

export class FloatText {
  constructor(x, y, text, col = '#fff') { Object.assign(this, { x, y, text, col, life: 0.9, dead: false }); }
  update(dt) { this.y -= 24 * dt; this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(c, cam) {
    c.globalAlpha = clamp(this.life * 1.4, 0, 1);
    c.fillStyle = '#000'; c.font = '8px monospace'; c.textAlign = 'center';
    c.fillText(this.text, Math.round(this.x - cam.x) + 1, Math.round(this.y - cam.y) + 1);
    c.fillStyle = this.col; c.fillText(this.text, Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    c.globalAlpha = 1; c.textAlign = 'left';
  }
}

// ---------------------------------------------------------------------------
export class Coin {
  constructor(tx, ty) { this.x = tx * TILE + 3; this.y = ty * TILE + 2; this.w = 10; this.h = 12; this.t = 0; this.dead = false; }
  update(dt) { this.t += dt; }
  draw(c, cam) {
    const img = (Math.floor(this.t * 8) % 4 < 2) ? ART.coin.a : ART.coin.b;
    c.drawImage(img, Math.round(this.x - cam.x) - 2, Math.round(this.y - cam.y) - 1);
  }
}

export class Gem {
  constructor(tx, ty) { this.x = tx * TILE + 2; this.y = ty * TILE + 2; this.w = 12; this.h = 12; this.t = 0; this.baseY = this.y; this.dead = false; }
  update(dt) { this.t += dt; this.y = this.baseY + Math.sin(this.t * 3) * 2; }
  draw(c, cam) {
    const img = (Math.floor(this.t * 6) % 2) ? ART.gem.a : ART.gem.b;
    c.save(); c.shadowColor = '#46d8ff'; c.shadowBlur = 6;
    c.drawImage(img, Math.round(this.x - cam.x) - 2, Math.round(this.y - cam.y) - 2); c.restore();
  }
}

// Plateforme mobile (collision « solide par le dessus » gérée par la scène)
export class MovingPlatform {
  constructor(x, y, axis = 'h', amp = 48, speed = 1.2) {
    this.w = 32; this.h = 8; this.x = x; this.y = y; this.axis = axis;
    this.ox = x; this.oy = y; this.amp = amp; this.speed = speed;
    this.t = Math.random() * Math.PI * 2; this.dx = 0; this.dy = 0; this.dead = false;
  }
  update(dt) {
    this.t += dt;
    const s = Math.sin(this.t * this.speed) * this.amp;
    if (this.axis === 'h') { const nx = this.ox + s; this.dx = nx - this.x; this.x = nx; this.dy = 0; }
    else { const ny = this.oy + s; this.dy = ny - this.y; this.y = ny; this.dx = 0; }
  }
  draw(c, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    c.fillStyle = '#caa057'; c.fillRect(x, y, this.w, this.h);
    c.fillStyle = '#e8c889'; c.fillRect(x, y, this.w, 2);
    c.fillStyle = '#7a5a2a'; c.fillRect(x, y + this.h - 1, this.w, 1);
    for (let i = 4; i < this.w; i += 8) { c.fillStyle = '#a07c3a'; c.fillRect(x + i, y + 3, 2, 3); }
  }
}

// Projectile hostile (boss)
export class EnemyShot {
  constructor(x, y, vx, vy) { this.x = x; this.y = y; this.w = 8; this.h = 8; this.vx = vx; this.vy = vy; this.t = 0; this.dead = false; }
  update(dt, level) {
    this.t += dt; this.vy += 700 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (level.solidAt(this.x + 4, this.y + 8) || level.solidAt(this.x + 4, this.y)) this.dead = true;
    if (this.t > 4 || this.y > level.pixelH + 20) this.dead = true;
  }
  draw(c, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    c.save(); c.shadowColor = '#ff8c3b'; c.shadowBlur = 5;
    c.fillStyle = '#ffd23b'; c.beginPath(); c.arc(x + 4, y + 4, 4, 0, 7); c.fill();
    c.fillStyle = '#ff5d2e'; c.beginPath(); c.arc(x + 4, y + 4, 2, 0, 7); c.fill(); c.restore();
  }
}

// BOSS — à vaincre en sautant sur sa tête plusieurs fois
export class Boss {
  constructor(x, y) {
    this.w = 48; this.h = 40;            // GROS boss
    this.x = x - this.w / 2 + 8; this.y = y - this.h - 6; this.vx = -42; this.vy = 0;
    this.dir = -1; this.maxHp = 5; this.hp = 5; this.t = 0; this.dead = false; this.removed = false;
    this.invuln = 0; this.shootCd = 1.6; this.jumpCd = 2.2; this.flash = 0; this.intro = 0.7; this.wasGround = false;
  }
  hitTop(scene) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp--; this.invuln = 1.0; this.flash = 0.5; SFX.bosshit();
    scene.addShake?.(7); scene.burst?.(this.x + this.w / 2, this.y + 6, '#46b84a', 18);
    this.vx = (this.vx > 0 ? 1 : -1) * (70 + (this.maxHp - this.hp) * 26);
    this.vy = -160;
    if (this.hp <= 0) { this.dead = true; this.vy = -300; SFX.boom(); scene.onBossDefeated?.(this); }
    return true;
  }
  update(dt, level, scene) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.dead) { this.vy += GRAVITY * dt; this.x += this.vx * dt; this.y += this.vy * dt; if (this.y > level.pixelH + 80) this.removed = true; return; }
    if (this.intro > 0) { this.intro -= dt; return; }
    if (this.invuln > 0) this.invuln -= dt;

    const rage = 1 + (this.maxHp - this.hp) * 0.12; // plus rapide en perdant des PV
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const preVx = this.vx;
    const r = level.moveAndCollide(this, dt);
    if (r.hitX) { const sp = Math.abs(preVx) || 42; this.dir = preVx > 0 ? -1 : 1; this.vx = sp * this.dir; }
    // onde de choc à l'atterrissage d'un saut
    if (r.onGround && !this.wasGround && scene.spawnHazard) {
      scene.addShake?.(5);
      scene.spawnHazard(new Shockwave(this.x + this.w / 2, this.y + this.h, -1));
      scene.spawnHazard(new Shockwave(this.x + this.w / 2, this.y + this.h, 1));
    }
    this.wasGround = r.onGround;
    if (r.onGround) {
      const aheadX = this.vx > 0 ? this.x + this.w + 2 : this.x - 2;
      if (!level.solidAt(aheadX, this.y + this.h + 1)) { this.vx = -this.vx; this.dir = -this.dir; }
      this.jumpCd -= dt;
      if (this.jumpCd <= 0) { this.vy = -330; this.jumpCd = (1.7 + Math.random()) / rage; }
    }
    // tir vers le joueur (double tir en rage)
    this.shootCd -= dt;
    if (this.shootCd <= 0 && scene.player) {
      this.shootCd = Math.max(0.6, 1.9 / rage);
      const dir = (scene.player.x - this.x) > 0 ? 1 : -1;
      scene.spawnHazard?.(new EnemyShot(this.x + this.w / 2, this.y + 12, dir * 95, -190));
      if (this.hp <= 2) scene.spawnHazard?.(new EnemyShot(this.x + this.w / 2, this.y + 12, dir * 130, -120));
    }
    if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); }
    if (this.x > level.pixelW - this.w) { this.x = level.pixelW - this.w; this.vx = -Math.abs(this.vx); }
  }
  draw(c, cam) {
    if (this.flash > 0 && Math.floor(this.t * 30) % 2) return;
    const img = (Math.floor(this.t * 3) % 2) ? ART.boss.a : ART.boss.b;
    const sw = img.width, sh = img.height;       // sprite source (~31x21)
    const dw = this.w, dh = Math.round(sh * (this.w / sw));
    const cx = Math.round(this.x + this.w / 2 - cam.x);
    const topY = Math.round(this.y + this.h - dh - cam.y);
    c.save();
    if (this.flash > 0) { c.shadowColor = '#fff'; c.shadowBlur = 6; }
    c.translate(cx, dh / 2 + topY);
    if (this.dir > 0) c.scale(-1, 1);
    if (this.dead) c.rotate(this.t * 6);
    c.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    c.restore();
  }
}

// Onde de choc au sol (boss) — à enjamber
export class Shockwave {
  constructor(x, y, dir) { this.x = x; this.y = y - 8; this.w = 10; this.h = 8; this.vx = 150 * dir; this.t = 0; this.dead = false; }
  update(dt, level) {
    this.t += dt; this.x += this.vx * dt;
    if (this.t > 1.4 || this.x < -20 || this.x > level.pixelW + 20) this.dead = true;
    if (level.solidAt(this.x + (this.vx > 0 ? this.w : 0), this.y + 4)) this.dead = true;
  }
  draw(c, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    const a = Math.max(0, 1 - this.t / 1.4);
    c.save(); c.globalAlpha = 0.9 * a; c.fillStyle = '#ffd23b';
    c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x + 5, y); c.lineTo(x + 10, y + 8); c.closePath(); c.fill();
    c.globalAlpha = 0.5 * a; c.fillStyle = '#ff7b2e'; c.fillRect(x + 3, y + 4, 4, 4); c.restore();
  }
}

// Objet qui jaillit d'un bloc et se déplace
export class PowerUp {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.w = 14; this.h = 14;
    this.kind = kind; // mushroom | flower | star
    this.vx = kind === 'flower' ? 0 : 40; this.vy = -120; this.emerge = 12; this.dead = false;
    this.t = 0;
  }
  update(dt, level) {
    this.t += dt;
    if (this.emerge > 0) { const d = Math.min(this.emerge, 24 * dt); this.y -= d; this.emerge -= d; return; }
    if (this.kind === 'flower') return; // fixe
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const r = level.moveAndCollide(this, dt);
    if (r.hitX) this.vx = -this.vx;
    if (this.kind === 'star' && r.onGround) this.vy = -240; // étoile rebondit
  }
  draw(c, cam) {
    const img = this.kind === 'mushroom' ? ART.item.mushroom : this.kind === 'oneup' ? ART.item.oneup : this.kind === 'feather' ? ART.item.feather : this.kind === 'flower' ? ART.item.flower : ART.item.star;
    c.drawImage(img, Math.round(this.x - cam.x) - 1, Math.round(this.y - cam.y) - 2);
  }
}

export class Fireball {
  constructor(x, y, dir, owner = 0) {
    this.x = x; this.y = y; this.w = 6; this.h = 6; this.vx = 220 * dir; this.vy = 60;
    this.owner = owner; this.dead = false; this.bounces = 0; this.t = 0;
  }
  update(dt, level) {
    this.t += dt;
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const r = level.moveAndCollide(this, dt);
    if (r.onGround) { this.vy = -180; this.bounces++; }
    if (r.hitX || r.ceiling) this.dead = true;
    if (this.t > 3) this.dead = true;
  }
  draw(c, cam) {
    c.save();
    c.translate(Math.round(this.x - cam.x) + 3, Math.round(this.y - cam.y) + 3);
    c.rotate(this.t * 18);
    c.drawImage(ART.fireball, -3, -3); c.restore();
  }
}

// ---------------------------------------------------------------------------
// ENNEMIS
export class Enemy {
  constructor(x, y, type) {
    this.type = type; this.x = x; this.y = y; this.w = 14; this.h = 14;
    this.vx = -34; this.vy = 0; this.dir = -1; this.t = 0; this.dead = false; this.removed = false;
    this.state = 'walk'; this.stateT = 0; this.gravity = true;
    if (type === 'fly') { this.gravity = false; this.baseY = y; this.w = 16; this.h = 14; }
    if (type === 'shell') { this.h = 14; }
    if (type === 'plant') { this.gravity = false; this.baseY = y; this.w = 14; this.h = 16; this.vx = 0; } // plante de tuyau
    if (type === 'lob') { this.lobCd = 1.6 + Math.random(); }                                            // lanceur
  }
  // appelé quand stompé par le dessus
  stomp() {
    if (this.type === 'goon') { this.state = 'flat'; this.stateT = 0; this.vx = 0; this.flat = true; SFX.stomp(); return { killed: true, bounce: true }; }
    if (this.type === 'fly') { this.type = 'goon'; this.gravity = true; this.vx = -34; SFX.stomp(); return { killed: false, bounce: true }; }
    if (this.type === 'shell') {
      if (this.state !== 'shell') { this.state = 'shell'; this.vx = 0; this.stateT = 0; SFX.stomp(); return { killed: false, bounce: true }; }
      // déjà en carapace: relancer ou stopper
      if (Math.abs(this.vx) > 10) { this.vx = 0; SFX.stomp(); }
      else { this.vx = 150 * 1; } // sera ajusté par direction du joueur dans la scène
      return { killed: false, bounce: true, shell: true };
    }
    return { killed: true, bounce: true };
  }
  // touché par un projectile / étoile / carapace
  kill(dir = 1) { this.state = 'dead'; this.dead = true; this.vy = -200; this.vx = 40 * dir; this.flipDie = true; }

  update(dt, level, scene) {
    this.t += dt; this.stateT += dt;
    if (this.dead) { // chute de mort
      this.vy += GRAVITY * dt; this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > level.pixelH + 40) this.removed = true; return;
    }
    if (this.state === 'flat') { if (this.stateT > 0.4) this.removed = true; return; }

    if (this.type === 'fly') {
      this.x += this.vx * dt;
      this.y = this.baseY + Math.sin(this.t * 3) * 18;
      // demi-tour si mur
      if (level.solidAt(this.x + (this.vx>0?this.w+1:-1), this.y + this.h/2)) { this.vx = -this.vx; this.dir = -this.dir; }
      if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); }
      if (this.x > level.pixelW - this.w) { this.vx = -Math.abs(this.vx); }
      return;
    }

    if (this.type === 'plant') { // plante de tuyau : monte/descend
      const phase = Math.sin(this.t * 1.6);
      this.y = this.baseY - (Math.max(0, phase) * 18);
      
      // Tirer une boule de feu au sommet
      if (phase > 0.95 && !this.hasShot) {
        this.hasShot = true;
        if (scene && scene.player && scene.spawnHazard) {
          const dir = scene.player.x > this.x ? 1 : -1;
          scene.spawnHazard(new EnemyShot(this.x + this.w / 2, this.y, dir * 90, 0));
          if (typeof SFX !== 'undefined' && SFX.fire) SFX.fire();
        }
      } else if (phase < 0) {
        this.hasShot = false; // reset quand elle est cachée
      }
      return;
    }

    // lanceur : envoie un projectile en cloche vers le joueur
    if (this.type === 'lob') {
      this.lobCd -= dt;
      if (this.lobCd <= 0 && scene && scene.player && scene.spawnHazard) {
        this.lobCd = 1.8 + Math.random();
        const dir = (scene.player.x - this.x) > 0 ? 1 : -1;
        scene.spawnHazard(new EnemyShot(this.x + this.w / 2, this.y, dir * 80, -220));
      }
    }

    if (this.gravity) this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    const preVx = this.vx; // moveAndCollide met vx à 0 en cas de mur -> on garde la vitesse d'avant
    const r = level.moveAndCollide(this, dt);
    if (r.hitX) { const sp = Math.abs(preVx) || 34; this.dir = preVx > 0 ? -1 : 1; this.vx = sp * this.dir; }
    // éviter de tomber des bords (sauf carapace lancée)
    if (r.onGround && !(this.state === 'shell' && Math.abs(this.vx) > 10)) {
      const aheadX = this.vx > 0 ? this.x + this.w + 1 : this.x - 1;
      if (!level.solidAt(aheadX, this.y + this.h + 1)) { this.vx = -this.vx; this.dir = -this.dir; }
    }
    if (this.x < 0) { this.x = 0; this.vx = Math.abs(this.vx); this.dir = 1; }
    if (this.x > level.pixelW - this.w) { this.x = level.pixelW - this.w; this.vx = -Math.abs(this.vx); this.dir = -1; }
    if (this.y > level.pixelH + 40) this.removed = true;
  }

  draw(c, cam) {
    const x = Math.round(this.x - cam.x) - 1, y = Math.round(this.y - cam.y) - 2;
    if (!this.dead) shadow(c, this.x + this.w / 2 - cam.x, this.y + this.h - cam.y, this.w * 0.7, this.type === 'fly' ? 0.4 : 1);
    let img;
    if (this.type === 'fly') img = (Math.floor(this.t * 12) % 2) ? ART.fly.a : ART.fly.b;
    else if (this.type === 'plant') img = (Math.floor(this.t * 6) % 2) ? ART.plant.a : ART.plant.b;
    else if (this.type === 'lob') img = (Math.floor(this.t * 4) % 2) ? ART.lob.a : ART.lob.b;
    else if (this.type === 'spiky') img = (Math.floor(this.t * 8) % 2) ? ART.spiky.a : ART.spiky.b;
    else if (this.type === 'shell') img = this.state === 'shell' ? ART.shell.hide : ART.shell.a;
    else if (this.state === 'flat') img = ART.goon.flat;
    else img = (Math.floor(this.t * 8) % 2) ? ART.goon.a : ART.goon.b;
    if (this.dead && this.flipDie) {
      c.save(); c.translate(x + 8, y + 8); c.scale(1, -1); c.drawImage(img, -8, -8); c.restore();
    } else c.drawImage(img, x, y);
  }
}

// ---------------------------------------------------------------------------
// JOUEUR
export class Player {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y; this.w = 12; this.h = 14;
    this.vx = 0; this.vy = 0;
    this.dir = 1; this.power = 'small'; // small | big | fire
    this.onGround = false; this.coyote = 0; this.jumpBuf = 0; this.holdJump = false;
    this.invuln = 0; this.star = 0; this.dead = false; this.win = false;
    this.ducking = false; this.t = 0; this.walkT = 0;
    this.fireCd = 0; this.lives = opts.lives ?? 3; this.coins = 0; this.score = 0;
    this.skin = opts.skin || 'p1'; this.id = opts.id || 0;
    this.spawn = { x, y };
    this.bounce = 0; // étirement au saut
    this.squash = 0; // écrasement à l'atterrissage
    this.wasGround = true; this.skidding = false; this.pounding = false;
    this.enterPipe = 0;
  }

  get big() { return this.power !== 'small'; }
  setSize(big) {
    const wasBig = this.h > 14;
    this.h = big ? 26 : 14;
    if (big && !wasBig) this.y -= 12;
    if (!big && wasBig) this.y += 12;
  }

  // évite de rester encastré dans un plafond après avoir grandi
  unstick(level) {
    if (!level) return;
    let guard = 0;
    while (guard++ < 20) {
      const lx = Math.floor((this.x + 2) / TILE);
      const rx = Math.floor((this.x + this.w - 2) / TILE);
      const ty = Math.floor(this.y / TILE);
      if (level.isSolid(level.tile(lx, ty)) || level.isSolid(level.tile(rx, ty))) this.y++;
      else break;
    }
  }

  grow(kind, scene) {
    if (kind === 'mushroom') { if (this.power === 'small') { this.power = 'big'; this.setSize(true); this.unstick(scene && scene.level); SFX.power(); } else this.addScore(1000, scene); }
    else if (kind === 'flower') { const was = this.power; this.power = 'fire'; this.setSize(true); if (was === 'small') this.unstick(scene && scene.level); SFX.power(); }
    else if (kind === 'star') { this.star = 9; SFX.power(); }
    else if (kind === 'feather') { const was = this.power; this.power = 'glide'; this.setSize(true); if (was === 'small') this.unstick(scene && scene.level); SFX.power(); }
    else if (kind === 'oneup') { this.lives++; SFX.win(); if (scene) scene.addFloat(this.x, this.y - 8, '1UP', '#37c24a'); }
    this.invuln = Math.max(this.invuln, 0.2);
  }

  addScore(n, scene) { this.score += n; if (scene) scene.addFloat(this.x, this.y - 6, '+' + n); }
  addCoin(scene) { this.coins++; this.addScore(200, scene); if (this.coins >= 100) { this.coins = 0; this.lives++; SFX.win(); } }

  hurt(scene) {
    if (this.invuln > 0 || this.star > 0 || this.dead) return false;
    if (this.power !== 'small') { // grand / feu / plume -> petit
      this.power = 'small'; this.setSize(false); this.invuln = 1.6; SFX.hurt();
      return false;
    }
    this.die(scene); return true;
  }

  die(scene) {
    if (this.dead) return;
    this.dead = true; this.vy = -360; this.vx = 0; this.deathT = 0; SFX.die();
    if (scene) scene.onPlayerDeath?.(this);
  }

  jump() {
    this.vy = JUMP_VY * (this.big ? 1.06 : 1);
    this.onGround = false; this.coyote = 0; this.jumpBuf = 0; this.holdJump = true;
    this.bounce = 1; (this.big ? SFX.bigjump : SFX.jump)();
  }

  shoot(scene) {
    if (this.power !== 'fire' || this.fireCd > 0) return;
    if (scene.countFireballs?.(this.id) >= 2) return;
    this.fireCd = 0.28;
    const fb = new Fireball(this.x + (this.dir > 0 ? this.w : -4), this.y + this.h / 2, this.dir, this.id);
    scene.spawnFireball(fb); SFX.fire();
  }

  // input: {left,right,jump(held),jumpPressed,fire(pressed),down}
  update(dt, level, scene, input) {
    this.t += dt;
    this.prevFeet = this.y + this.h; // position des pieds avant déplacement (écrasement fiable)
    if (this.dead) {
      this.deathT += dt; this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
      this.y += this.vy * dt; return;
    }
    if (this.win) { // marche victorieuse
      this.vx = 40; this.x += this.vx * dt;
      this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
      level.moveAndCollide(this, dt);
      this.walkT += dt * 6; return;
    }

    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.star > 0) this.star -= dt;

    const sprint = false; // course liée au tir? on garde simple: vitesse selon maintien fire
    const wantRun = input.run;
    const maxSpeed = wantRun ? SPRINT_MAX : RUN_MAX;
    this.ducking = this.big && input.down && this.onGround;

    // écrasement piqué (slam) : Bas en l'air -> chute rapide qui écrase les ennemis
    if (!this.pounding && !this.onGround && input.downPressed && !this.win) {
      this.pounding = true; this.vx = 0; this.vy = 30; SFX.stomp();
    }
    if (this.pounding && this.onGround) { this.pounding = false; }

    let ax = 0;
    if (!this.ducking && !this.pounding) {
      if (input.left) { ax -= (this.onGround ? RUN_ACCEL : AIR_ACCEL); this.dir = -1; }
      if (input.right) { ax += (this.onGround ? RUN_ACCEL : AIR_ACCEL); this.dir = 1; }
    }
    if (ax !== 0) this.vx += ax * dt;
    else if (this.onGround) { // friction
      const f = FRICTION * dt; if (Math.abs(this.vx) <= f) this.vx = 0; else this.vx -= f * sign(this.vx);
    }
    this.vx = clamp(this.vx, -maxSpeed, maxSpeed);

    // saut (coyote + buffer)
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    if (input.jumpPressed) this.jumpBuf = JUMP_BUFFER; else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && this.coyote > 0) this.jump();
    if (!input.jump && this.vy < 0 && this.holdJump) { this.vy *= JUMP_CUT; this.holdJump = false; }
    if (!input.jump) this.holdJump = false;

    // tir
    if (input.firePressed) this.shoot(scene);

    // gravité
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
    // slam : descente rapide forcée
    if (this.pounding) { this.vy = 560; this.vx = 0; this.gliding = false; }
    // vol plané (plume): maintenir Saut en chute ralentit fortement la descente
    else {
      this.gliding = false;
      if (this.power === 'glide' && !this.onGround && this.vy > 0 && input.jump) {
        this.vy = Math.min(this.vy, 95); this.gliding = true;
      }
    }

    const fallV = this.vy;
    const wasPounding = this.pounding;
    const r = level.moveAndCollide(this, dt, { dropThrough: input.down && input.jumpPressed && !this.pounding });
    this.onGround = r.onGround;
    // atterrissage: écrasement + poussière (+ onde de choc si slam)
    if (!this.wasGround && this.onGround && fallV > 240) {
      this.squash = Math.min(1, fallV / 460);
      scene.dust?.(this.x + this.w / 2, this.y + this.h, Math.min(10, 3 + (fallV / 110) | 0));
      if (wasPounding) { this.pounding = false; this.squash = 1; scene.onPoundLand?.(this); }
    }
    this.wasGround = this.onGround;
    // dérapage: changement de direction au sol à vive allure -> poussière
    this.skidding = this.onGround && Math.abs(this.vx) > 60 && ((input.left && this.vx > 6) || (input.right && this.vx < -6));
    if (this.skidding && Math.random() < 0.4) scene.dust?.(this.x + this.w / 2 - sign(this.vx) * 4, this.y + this.h, 1);
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 6);
    if (r.ceiling && r.ceilTile) {
      const ev = level.hitBlock(r.ceilTile.tx, r.ceilTile.ty);
      if (ev) scene.onBlockHit?.(ev, this);
    }
    // ressort: rebond surpuissant si on atterrit sur une tuile 'T'
    if (this.onGround && this.vy >= 0) {
      const ft = level.tile(Math.floor((this.x + this.w / 2) / TILE), Math.floor((this.y + this.h) / TILE));
      if (ft === 'T') { this.vy = -560; this.onGround = false; this.holdJump = true; this.bounce = 1; SFX.spring(); scene.onSpring?.(this); }
    }
    if (this.bounce > 0) this.bounce = Math.max(0, this.bounce - dt * 5);

    // animation marche
    if (this.onGround && Math.abs(this.vx) > 6) this.walkT += dt * (Math.abs(this.vx) / 22);
    else this.walkT = 0;

    // dangers (pics) + chute dans le vide
    if (level.hazardAt(this)) this.hurt(scene);
    if (this.y > level.pixelH + 30) this.die(scene);

    // arrivée
    if (level.goal && this.x + this.w >= level.goal.tx * TILE + 4 && !this.win) {
      scene.onReachGoal?.(this);
    }
  }

  draw(c, cam) {
    if (this.invuln > 0 && Math.floor(this.t * 20) % 2 && !this.dead) return; // clignote
    const moving = Math.abs(this.vx) > 6;
    const H = this.heroArt || ART.hero;
    const set = this.power === 'fire'
      ? { idle: this.big ? H.fireBigIdle : H.fireSmallIdle, walk: this.big ? H.fireBigWalk : H.fireSmallWalk, walk2: this.big ? H.fireBigWalk2 : H.fireSmallWalk2, jump: H.fireJump }
      : { idle: this.big ? H.bigIdle : H.smallIdle, walk: this.big ? H.bigWalk : H.smallWalk, walk2: this.big ? H.bigWalk2 : H.smallWalk2, jump: H.jump };
    let img;
    if (this.ducking && !this.big) img = H.duck;
    else if (!this.onGround && !this.dead) img = set.jump;
    else if (moving) img = (Math.floor(this.walkT) % 2) ? set.walk : set.walk2; // vraie foulée: 2 poses opposées
    else img = set.idle;

    // ancrage aux PIEDS (corrige l'alignement des grands persos)
    const centerX = Math.round(this.x + this.w / 2 - cam.x);
    const feetY = Math.round(this.y + this.h - cam.y);

    // cape de la plume (derrière le perso)
    if (this.power === 'glide' && !this.dead) {
      const dir = this.dir, back = centerX - dir * 5;
      const spread = this.gliding ? 9 : 3, flap = Math.sin(this.t * (this.gliding ? 7 : 3)) * 2;
      const topY = feetY - 22, botY = feetY - 8, tipX = back - dir * (spread + 3);
      c.save(); c.globalAlpha = 0.95; c.fillStyle = '#46c8ff';
      c.beginPath(); c.moveTo(back, topY); c.lineTo(tipX, topY + 3 + flap); c.lineTo(tipX, botY + flap); c.lineTo(back, botY - 2); c.closePath(); c.fill();
      c.globalAlpha = 0.6; c.fillStyle = '#bfeaff'; c.fillRect(tipX, topY + 3 + flap, 2, 3); c.restore();
    }

    shadow(c, this.x + this.w / 2 - cam.x, this.y + this.h - cam.y, this.w * 0.8, this.onGround ? 1 : 0.5);

    c.save();
    if (this.star > 0) { const hue = (this.t * 600) % 360; c.globalAlpha = 0.95; c.shadowColor = `hsl(${hue},90%,60%)`; c.shadowBlur = 8; }
    // les sprites "grands" (grand/feu/plume) sont agrandis pour remplir la hitbox
    const baseY = this.big ? 1.55 : 1.0, baseX = this.big ? 1.18 : 1.0;
    const stretch = (!this.onGround && !this.dead ? 0.10 : 0);
    const sy = baseY * (1 + stretch) - this.squash * 0.22 * baseY;
    const sx = baseX * (1 - stretch) + this.squash * 0.20 * baseX;
    c.translate(centerX, feetY);
    c.scale(this.dir < 0 ? -sx : sx, sy);
    c.drawImage(img, -8, -16);
    c.restore();

    if (this.skin === 'p2') { c.fillStyle = '#37c24a'; c.fillRect(centerX - 3, feetY - (this.big ? 28 : 18), 6, 2); }
  }
}
