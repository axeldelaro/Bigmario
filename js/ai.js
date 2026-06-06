// ai.js — "cerveau" de bot réutilisable pour le versus et les mini-jeux.
// Il pilote un Player via le MÊME format d'input que l'humain. Il sait :
//  • se diriger vers une cible (point à ramasser) ou un adversaire,
//  • sauter par-dessus murs, trous et pour atteindre une cible en hauteur,
//  • bondir sur la tête de l'adversaire et l'écraser (slam) en versus,
//  • esquiver les projectiles, se débloquer quand il est coincé.
// Saut max ≈ 3,25 tuiles : les sauts tiennent compte de cette portée réelle.
import { TILE } from './core.js';

// Presets de difficulté prédéfinis
export const AI_PRESETS = {
  easy:    { skill: 0.20, label: 'FACILE',   emoji: '😊' },
  medium:  { skill: 0.55, label: 'MOYEN',    emoji: '😐' },
  hard:    { skill: 0.85, label: 'DIFFICILE', emoji: '😤' },
  extreme: { skill: 1.00, label: 'EXTRÊME',  emoji: '💀' },
};

export class BotBrain {
  constructor(opts = {}) {
    this.skill = opts.skill ?? 0.9;       // 0..1 : agressivité / précision

    // Paramètres dérivés du skill
    // reactionDelay : délai avant de réagir à un obstacle (faible skill = lent)
    this.reactionDelay = (1 - this.skill) * 0.35;
    // errorRate : probabilité de rater un saut ou de faire une pause inattendue
    this.errorRate = (1 - this.skill) * 0.55;
    // jumpAccuracy : marge tolérance pour déclencher un saut vers cible haute
    this.jumpAccuracy = TILE * (0.6 + (1 - this.skill) * 2.4);
    // speedMult : facteur de vitesse de déplacement
    this.speedMult = 0.3 + this.skill * 0.7;

    this.jumpCd = 0; this.fireCd = 0; this.holdJumpT = 0;
    this.stuckT = 0; this.lastX = null; this.panicDir = 0; this.panicT = 0;
    this.slamLatch = false;
    // temporisateurs pour les erreurs et pauses simulées
    this._pauseT = 0;
    this._reactionT = 0;
  }

  // ctx: { me, level, target?:{x,y}, opponent?:Player, threats?:[{x,y,vx}], collect?:bool }
  think(dt, ctx) {
    const me = ctx.me, level = ctx.level;
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.holdJumpT = Math.max(0, this.holdJumpT - dt);
    this.panicT = Math.max(0, this.panicT - dt);
    this._reactionT = Math.max(0, this._reactionT - dt);

    // --- Pause involontaire (simulation d'hésitation aux niveaux faibles) ---
    this._pauseT = Math.max(0, this._pauseT - dt);
    if (this._pauseT <= 0 && Math.random() < dt * this.errorRate * 0.6) {
      this._pauseT = (0.15 + Math.random() * 0.35) * (1 - this.skill);
    }
    if (this._pauseT > 0) {
      // pendant une pause, on lâche tout sauf le saut tenu
      return {
        left: false, right: false, down: false, downPressed: false,
        jump: this.holdJumpT > 0, jumpPressed: false,
        fire: false, firePressed: false, run: false,
      };
    }

    // --- cible prioritaire (items puis target) ---
    let tx, ty, tItem = false;
    
    // Si pas en versus direct, on cherche un item proche
    if (!ctx.opponent && ctx.items && ctx.items.length > 0 && this.skill > 0.6) {
      let bestIt = null, bestDist = 9999;
      for (const it of ctx.items) {
        if (it.dead) continue;
        const d = Math.hypot((it.x - cx), (it.y - me.y));
        if (d < bestDist && d < TILE * 15) { bestDist = d; bestIt = it; }
      }
      if (bestIt) { tx = bestIt.x + bestIt.w/2; ty = bestIt.y; tItem = true; }
    }

    if (tx === undefined) {
      if (ctx.target) { tx = ctx.target.x; ty = ctx.target.y; }
      else if (ctx.opponent) { tx = ctx.opponent.x + ctx.opponent.w / 2; ty = ctx.opponent.y; }
      else { tx = me.x + me.w / 2; ty = me.y; }
    }
    const cx = me.x + me.w / 2;
    let dx = tx - cx;
    if (this.panicT > 0) dx = this.panicDir * 100; // débloquage : on force une direction

    // Erreur de ciblage aux niveaux faibles (décalage aléatoire)
    if (this.errorRate > 0 && this._reactionT <= 0) {
      dx += (Math.random() - 0.5) * this.errorRate * TILE * 1.8;
      this._reactionT = this.reactionDelay;
    }

    const adx = Math.abs(dx);
    const wantRight = dx > 5, wantLeft = dx < -5;
    const want = wantRight ? 1 : wantLeft ? -1 : (me.dir || 1);

    // --- capteurs ---
    const dirFactor = want || me.dir || 1;
    const sx = dirFactor > 0 ? me.x + me.w + 3 : me.x - 3;
    const groundAt = (px, reach = 5) => { for (let d = 0; d <= reach; d++) if (level.solidAt(px, me.y + me.h + 3 + d * TILE)) return true; return false; };
    const wallAhead = level.solidAt(sx, me.y + me.h - 5) || level.solidAt(sx, me.y + 6);
    
    // Lookahead plus intelligent (gap ahead)
    const speedX = Math.abs(me.vx) / 100; // plus on va vite, plus on regarde loin
    const lookDist = 8 + speedX * 8;
    const gapAhead = me.onGround && !groundAt(sx) && !groundAt(sx + dirFactor * lookDist);
    const targetAbove = (me.y - ty) > TILE * 0.8;

    // --- anti-blocage ---
    if (this.lastX == null) this.lastX = me.x;
    if (want !== 0 && Math.abs(me.x - this.lastX) < 0.5) this.stuckT += dt; else this.stuckT = 0;
    this.lastX = me.x;
    if (this.stuckT > 0.7 && this.panicT <= 0) { this.panicT = 0.5; this.panicDir = -want || 1; }

    let jumpPressed = false, slam = false, firePressed = false;
    const canJump = me.onGround && this.jumpCd <= 0;

    // Erreur de saut (le bot rate certains sauts aux niveaux faibles)
    const jumpBlocked = Math.random() < this.errorRate * 0.3;

    if (canJump && !jumpBlocked) {
      if (wallAhead) { jumpPressed = true; this.holdJumpT = 0.42 * (0.7 + this.skill * 0.3); }
      else if (gapAhead) { jumpPressed = true; this.holdJumpT = 0.5 * (0.7 + this.skill * 0.3); }
      else if (targetAbove && adx < this.jumpAccuracy) { jumpPressed = true; this.holdJumpT = 0.46 * (0.7 + this.skill * 0.3); }
      else if (this.stuckT > 0.35) { jumpPressed = true; this.holdJumpT = 0.45; }
    }

    // --- combat (versus) ---
    if (ctx.opponent && !ctx.collect) {
      const o = ctx.opponent;
      const odx = (o.x + o.w / 2) - cx, aodx = Math.abs(odx), ody = o.y - me.y;
      // bondir pour retomber sur sa tête quand on est proche et à sa hauteur/dessous
      const attackRange = TILE * (1.5 + this.skill * 1.1);
      if (canJump && !jumpPressed && !jumpBlocked && aodx < attackRange && o.y >= me.y - 8) {
        jumpPressed = true; this.holdJumpT = 0.4; this.jumpCd = 0.35 / this.skill;
      }
      // écrasement piqué quand on est au-dessus de lui et qu'on descend
      if (!me.onGround && me.vy > 15 && aodx < TILE * 0.95 && ody > 6 && !me.pounding) slam = true;
      // tir si aligné et tourné vers lui
      if (me.power === 'fire' && this.fireCd <= 0 && Math.abs(ody) < 22 && aodx < TILE * 9 && (odx > 0) === (me.dir > 0)) {
        firePressed = true; this.fireCd = (0.45 + Math.random() * 0.4) * (2 - this.skill);
      }
    }

    // --- esquive de projectiles (seulement si skill suffisant) ---
    if (ctx.threats && canJump && !jumpPressed && this.skill > 0.3) {
      for (const t of ctx.threats) {
        const tdx = t.x - cx;
        const approaching = Math.abs(t.vx || 0) < 5 || (t.vx || 0) * (tdx > 0 ? 1 : -1) < 0;
        const detectionRange = TILE * (2 + this.skill * 1.2);
        if (Math.abs(tdx) < detectionRange && Math.abs(t.y - (me.y + me.h / 2)) < TILE * 1.6 && approaching) {
          if (!jumpBlocked) { jumpPressed = true; this.holdJumpT = 0.4; }
          break;
        }
      }
    }

    if (jumpPressed) this.jumpCd = Math.max(this.jumpCd, 0.18);
    const jumpHeld = this.holdJumpT > 0;

    // slam -> downPressed une seule frame
    let downPressed = false;
    if (slam && !this.slamLatch) { downPressed = true; this.slamLatch = true; }
    if (me.onGround) this.slamLatch = false;

    // courir (sprint) quand la cible est loin et le chemin dégagé — réduit selon skill
    // En extrême, le bot sprinte beaucoup plus.
    const runThreshold = TILE * (2 + (1 - this.skill) * 5);
    const run = adx > runThreshold && !gapAhead && !wallAhead && (this.skill > 0.4);

    // Ralentir le bot aux niveaux faibles : ignorer les directives de droite/gauche par moments
    const moveBlocked = Math.random() < this.errorRate * 0.15;

    return {
      left:  moveBlocked ? false : (this.panicT > 0 ? this.panicDir < 0 : wantLeft),
      right: moveBlocked ? false : (this.panicT > 0 ? this.panicDir > 0 : wantRight),
      down: false, downPressed,
      jump: jumpPressed || jumpHeld, jumpPressed,
      fire: firePressed, firePressed, run,
    };
  }
}
