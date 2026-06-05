// solve.mjs — validateur physique headless.
// Un "auto-joueur" utilise le VRAI moteur (Player + Level + collisions) : il court
// vers la droite et saute automatiquement au-dessus des murs et des trous.
// Si l'auto-joueur atteint l'arrivée, le niveau est garanti franchissable.
import { TILE, VIEW_W } from '../js/core.js';
import { Level } from '../js/level.js';
import { Player } from '../js/entities.js';
import { WORLDS } from '../js/levels.js';

// scène minimale (les entités appellent ces méthodes)
function fakeScene(level) {
  return {
    level, won: false, dead: false,
    onReachGoal() { this.won = true; },
    onPlayerDeath() { this.dead = true; },
    onBlockHit() {}, onSpring() {}, dust() {}, burst() {}, addFloat() {},
    addCombo() {}, spawnFireball() {}, countFireballs() { return 0; },
    stat() {}, level_: level,
  };
}

// auto-joueur : détecte murs et trous devant, saute en gardant l'appui
function solveLevel(def, opts = {}) {
  const level = new Level(def);
  const scene = fakeScene(level);
  const ps = level.playerStart;
  const p = new Player(ps.x, ps.y, { lives: 1 });
  if (opts.big) { p.power = 'big'; p.setSize(true); }
  const goalX = level.goal ? level.goal.tx * TILE : level.pixelW - 48;
  const dt = 1 / 120;
  let jumpHold = 0, lastX = p.x, stuckT = 0, maxX = p.x;
  const maxSteps = 120 * 90; // 90 s
  const solidBelow = (px, py, depth = 4) => {
    for (let d = 0; d <= depth; d++) if (level.solidAt(px, py + d * TILE)) return true;
    return false;
  };
  for (let step = 0; step < maxSteps; step++) {
    // capteurs
    const footY = p.y + p.h - 2;
    const frontX = p.x + p.w + 2;
    const wallAhead = level.solidAt(frontX, p.y + p.h - 4) || level.solidAt(frontX, p.y + 4);
    // trou : pas de sol dans les ~2 prochaines tuiles devant les pieds
    const gapNear = p.onGround && !solidBelow(p.x + p.w + 6, p.y + p.h + 2, 3) && !solidBelow(p.x + p.w + 14, p.y + p.h + 2, 3);
    // pic devant (hazard) -> sauter
    const spikeAhead = level.hazardAt({ x: p.x + p.w + 1, y: p.y, w: 6, h: p.h });

    let wantJump = false;
    if (p.onGround && (wallAhead || gapNear || spikeAhead)) { wantJump = true; jumpHold = 0.5; }
    if (jumpHold > 0) { wantJump = true; jumpHold -= dt; }

    const input = {
      left: false, right: true, down: false,
      jump: wantJump, jumpPressed: wantJump && p.onGround,
      fire: !!opts.sprint, firePressed: false, run: !!opts.sprint,
    };
    p.update(dt, level, scene, input);

    if (scene.won) return { ok: true, x: p.x | 0, t: (step * dt).toFixed(1) };
    if (scene.dead || p.dead) return { ok: false, reason: 'mort', x: p.x | 0, t: (step * dt).toFixed(1) };
    // arrivée (niveaux boss : pas de drapeau)
    if (p.x + p.w >= goalX - 2) return { ok: true, x: p.x | 0, t: (step * dt).toFixed(1), boss: !level.goal };

    // détection de blocage
    maxX = Math.max(maxX, p.x);
    if (p.x <= lastX + 0.2) stuckT += dt; else stuckT = 0;
    lastX = p.x;
    if (stuckT > 3) return { ok: false, reason: 'bloqué', x: p.x | 0, maxX: maxX | 0 };
  }
  return { ok: false, reason: 'timeout', x: p.x | 0, maxX: maxX | 0 };
}

let fails = 0;
for (let w = 0; w < WORLDS.length; w++) {
  for (let l = 0; l < WORLDS[w].levels.length; l++) {
    const def = WORLDS[w].levels[l];
    // PROFIL HUMAIN : petit perso, course normale (PAS de sprint) -> doit passer.
    // Empêche les niveaux franchissables uniquement avec un timing/sprint parfait.
    const r = solveLevel(def, {});
    const tag = `${w + 1}-${l + 1}`;
    if (r.ok) console.log(`PASS ${tag}  (x=${r.x}, t=${r.t}s${r.boss ? ', boss' : ''})`);
    else { console.log(`FAIL ${tag}  -> ${r.reason} à x=${r.x}${r.maxX != null ? ' (maxX=' + r.maxX + ')' : ''}`); fails++; }
  }
}
console.log(fails === 0 ? '\n✅ TOUS LES NIVEAUX SONT FRANCHISSABLES' : `\n❌ ${fails} niveau(x) à corriger`);
process.exit(fails === 0 ? 0 : 1);
