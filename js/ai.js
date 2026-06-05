// ai.js — "cerveau" de bot réutilisable pour le versus et les mini-jeux.
// Il pilote un Player via le MÊME format d'input que l'humain. Il sait :
//  • se diriger vers une cible (point à ramasser) ou un adversaire,
//  • sauter par-dessus murs, trous et pour atteindre une cible en hauteur,
//  • bondir sur la tête de l'adversaire et l'écraser (slam) en versus,
//  • esquiver les projectiles, se débloquer quand il est coincé.
// Saut max ≈ 3,25 tuiles : les sauts tiennent compte de cette portée réelle.
import { TILE } from './core.js';

export class BotBrain {
  constructor(opts = {}) {
    this.skill = opts.skill ?? 0.9;       // 0..1 : agressivité / précision
    this.jumpCd = 0; this.fireCd = 0; this.holdJumpT = 0;
    this.stuckT = 0; this.lastX = null; this.panicDir = 0; this.panicT = 0;
    this.slamLatch = false;
  }

  // ctx: { me, level, target?:{x,y}, opponent?:Player, threats?:[{x,y,vx}], collect?:bool }
  think(dt, ctx) {
    const me = ctx.me, level = ctx.level;
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.holdJumpT = Math.max(0, this.holdJumpT - dt);
    this.panicT = Math.max(0, this.panicT - dt);

    // --- cible ---
    let tx, ty;
    if (ctx.target) { tx = ctx.target.x; ty = ctx.target.y; }
    else if (ctx.opponent) { tx = ctx.opponent.x + ctx.opponent.w / 2; ty = ctx.opponent.y; }
    else { tx = me.x + me.w / 2; ty = me.y; }
    const cx = me.x + me.w / 2;
    let dx = tx - cx;
    if (this.panicT > 0) dx = this.panicDir * 100; // débloquage : on force une direction
    const adx = Math.abs(dx);
    const wantRight = dx > 5, wantLeft = dx < -5;
    const want = wantRight ? 1 : wantLeft ? -1 : (me.dir || 1);

    // --- capteurs ---
    const sx = want > 0 ? me.x + me.w + 3 : me.x - 3;
    const groundAt = (px, reach = 3) => { for (let d = 0; d <= reach; d++) if (level.solidAt(px, me.y + me.h + 3 + d * TILE)) return true; return false; };
    const wallAhead = level.solidAt(sx, me.y + me.h - 5) || level.solidAt(sx, me.y + 6);
    const gapAhead = me.onGround && !groundAt(sx) && !groundAt(sx + want * 8);
    const targetAbove = (me.y - ty) > TILE * 0.8;

    // --- anti-blocage ---
    if (this.lastX == null) this.lastX = me.x;
    if (want !== 0 && Math.abs(me.x - this.lastX) < 0.5) this.stuckT += dt; else this.stuckT = 0;
    this.lastX = me.x;
    if (this.stuckT > 0.7 && this.panicT <= 0) { this.panicT = 0.5; this.panicDir = -want || 1; }

    let jumpPressed = false, slam = false, firePressed = false;
    const canJump = me.onGround && this.jumpCd <= 0;

    if (canJump) {
      if (wallAhead) { jumpPressed = true; this.holdJumpT = 0.42; }
      else if (gapAhead) { jumpPressed = true; this.holdJumpT = 0.5; }            // franchir le vide
      else if (targetAbove && adx < TILE * 2.2) { jumpPressed = true; this.holdJumpT = 0.46; } // atteindre en hauteur
      else if (this.stuckT > 0.35) { jumpPressed = true; this.holdJumpT = 0.45; }
    }

    // --- combat (versus) ---
    if (ctx.opponent && !ctx.collect) {
      const o = ctx.opponent;
      const odx = (o.x + o.w / 2) - cx, aodx = Math.abs(odx), ody = o.y - me.y;
      // bondir pour retomber sur sa tête quand on est proche et à sa hauteur/dessous
      if (canJump && !jumpPressed && aodx < TILE * 2.6 && o.y >= me.y - 8) { jumpPressed = true; this.holdJumpT = 0.4; this.jumpCd = 0.35; }
      // écrasement piqué quand on est au-dessus de lui et qu'on descend
      if (!me.onGround && me.vy > 15 && aodx < TILE * 0.95 && ody > 6 && !me.pounding) slam = true;
      // tir si aligné et tourné vers lui
      if (me.power === 'fire' && this.fireCd <= 0 && Math.abs(ody) < 22 && aodx < TILE * 9 && (odx > 0) === (me.dir > 0)) {
        firePressed = true; this.fireCd = (0.45 + Math.random() * 0.4) * (2 - this.skill);
      }
    }

    // --- esquive de projectiles ---
    if (ctx.threats && canJump && !jumpPressed) {
      for (const t of ctx.threats) {
        const tdx = t.x - cx;
        const approaching = Math.abs(t.vx || 0) < 5 || (t.vx || 0) * (tdx > 0 ? 1 : -1) < 0;
        if (Math.abs(tdx) < TILE * 3.2 && Math.abs(t.y - (me.y + me.h / 2)) < TILE * 1.6 && approaching) {
          jumpPressed = true; this.holdJumpT = 0.4; break;
        }
      }
    }

    if (jumpPressed) this.jumpCd = Math.max(this.jumpCd, 0.18);
    const jumpHeld = this.holdJumpT > 0;

    // slam -> downPressed une seule frame
    let downPressed = false;
    if (slam && !this.slamLatch) { downPressed = true; this.slamLatch = true; }
    if (me.onGround) this.slamLatch = false;

    // courir (sprint) quand la cible est loin et le chemin dégagé
    const run = adx > TILE * 5 && !gapAhead;

    return {
      left: this.panicT > 0 ? this.panicDir < 0 : wantLeft,
      right: this.panicT > 0 ? this.panicDir > 0 : wantRight,
      down: false, downPressed,
      jump: jumpPressed || jumpHeld, jumpPressed,
      fire: firePressed, firePressed, run,
    };
  }
}
