// reach.mjs — analyse de portée : repère les blocs-bonus ('?','M','U','L','W')
// qu'aucune surface d'appui proche ne permet d'atteindre en sautant.
// Saut max ≈ 3,25 tuiles ; ressort 'T' ≈ 6,5 tuiles. Joueur ~1 tuile de haut.
import { WORLDS, ARENAS } from '../js/levels.js';

const BUMP = new Set(['?', 'M', 'U', 'L', 'W']);
const SOLID = new Set(['X', 'H', 'B', '?', 'M', 'U', 'L', 'W', 'D', 'p', 'P', 'T', 'Q']);
const SEMI = new Set(['=']);

// rangées max au-dessus d'un appui atteignables par la tête en sautant
const REACH_JUMP = 5;   // saut normal (3,25 tuiles + hauteur joueur)
const REACH_SPRING = 7; // au-dessus d'un ressort
const HWIN = 3;         // fenêtre horizontale (tuiles) de course sous le bloc

function analyze(def, tag) {
  const rows = def.map.map((r) => r.split(''));
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const at = (r, c) => (r < 0 || c < 0 || r >= H || c >= W) ? ' ' : (rows[r][c] || ' ');
  const standable = (r, c) => {
    const ch = at(r, c);
    if (!SOLID.has(ch) && !SEMI.has(ch)) return false;
    return !SOLID.has(at(r - 1, c)) && !SOLID.has(at(r - 1, c)); // tête dégagée
  };
  const springNear = (br, bc) => {
    for (let c = bc - HWIN; c <= bc + HWIN; c++) for (let r = br + 1; r < H; r++) if (at(r, c) === 'T') return true;
    return false;
  };
  const bad = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!BUMP.has(at(r, c))) continue;
    const reach = springNear(r, c) ? REACH_SPRING : REACH_JUMP;
    let ok = false;
    for (let c2 = c - HWIN; c2 <= c + HWIN && !ok; c2++) {
      for (let sr = r + 1; sr <= r + reach && sr < H; sr++) {
        if (standable(sr, c2)) { ok = true; break; }
      }
    }
    if (!ok) bad.push(`${at(r, c)}@(r${r},c${c})`);
  }
  if (bad.length) console.log(`UNREACHABLE ${tag}: ${bad.join('  ')}`);
  return bad.length;
}

let total = 0;
for (let w = 0; w < WORLDS.length; w++)
  for (let l = 0; l < WORLDS[w].levels.length; l++)
    total += analyze(WORLDS[w].levels[l], `${w + 1}-${l + 1}`);
ARENAS.forEach((a, i) => { total += analyze(a, `ARENA${i + 1}`); });
console.log(total === 0 ? '\n✅ Tous les blocs sont atteignables' : `\n❌ ${total} bloc(s) hors de portée`);
