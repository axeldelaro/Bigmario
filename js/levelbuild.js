// levelbuild.js — construit les niveaux de l'aventure (mondes 1-2) avec une
// géométrie GARANTIE franchissable (validée par test/solve.mjs) ET du relief :
// reliefs/plateaux, escaliers, doubles parcours, colonnes décoratives, ressorts.
// Légende: voir js/levels.js.

function grid(W) { return Array.from({ length: 12 }, () => Array(W).fill(' ')); }
function put(g, row, col, str) { for (let i = 0; i < str.length; i++) { const ch = str[i]; if (ch !== '.') g[row][col + i] = ch; } }
function box(g, x0, x1, r0, r1, ch) { for (let r = r0; r <= r1; r++) for (let x = x0; x <= x1; x++) g[r][x] = ch; }
function rows(g) { return g.map((r) => r.join('')); }
function floorX(g, pits = []) {
  const W = g[0].length;
  for (let x = 0; x < W; x++) { g[10][x] = 'X'; g[11][x] = 'X'; }
  for (const [a, b] of pits) for (let x = a; x <= b; x++) { g[10][x] = ' '; g[11][x] = ' '; }
}
function floorH(g) {
  const W = g[0].length;
  for (let x = 0; x < W; x++) { g[0][x] = 'H'; g[10][x] = 'H'; g[11][x] = 'H'; }
  for (let y = 0; y < 12; y++) { g[y][0] = 'H'; g[y][W - 1] = 'H'; }
}
// tuyau 2 tuiles de large (P = tête, p = corps), reposant sur le sol (row 9)
function pipe(g, col, top = 8) {
  for (let dx = 0; dx < 2; dx++) for (let r = top; r <= 9; r++) g[r][col + dx] = (r === top ? 'P' : 'p');
}
// plateau de sol surélevé (le perso grimpe ; marche ≤ 3 tuiles)
function mesa(g, x0, x1, top) { box(g, x0, x1, top, 11, 'X'); }
// escalier de blocs durs montant (dir=1) ou descendant (dir=-1)
function stairs(g, x, baseTop, steps, dir = 1) {
  for (let i = 0; i < steps; i++) { const col = x + i * dir; box(g, col, col, baseTop - i, 9, 'H'); }
}
function plat(g, r, x, len) { for (let i = 0; i < len; i++) g[r][x + i] = '='; }
function coins(g, r, x, n) { for (let i = 0; i < n; i++) g[r][x + i * 2] = 'o'; }

// =================== MONDE 1 ===================
function L11() { // 1-1 Premiers pas — intro douce, un parcours haut bonus
  const W = 110, g = grid(W); floorX(g, [[36, 38], [64, 66], [92, 93]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // section blocs
  put(g, 6, 8, '?'); put(g, 6, 10, '?'); put(g, 6, 12, '?'); coins(g, 5, 8, 3);
  // plateau surélevé avec ennemis + escalier
  mesa(g, 18, 28, 8); put(g, 7, 20, 'g'); put(g, 7, 24, 'g'); coins(g, 6, 30, 2);
  // tuyaux de hauteurs variées
  pipe(g, 44, 7); pipe(g, 54, 8);
  // parcours haut bonus (plateformes) au-dessus d'un trou
  plat(g, 5, 40, 5); plat(g, 4, 48, 4); put(g, 3, 49, 'j'); plat(g, 5, 58, 4);
  // ressort + gemme haute
  put(g, 9, 72, 'T'); put(g, 2, 72, 'j');
  put(g, 7, 78, '====='); coins(g, 6, 79, 3);
  // bloc 1UP caché en hauteur
  put(g, 4, 86, 'L');
  // ennemis sol
  put(g, 9, 16, 'g'); put(g, 9, 50, 'g'); put(g, 9, 76, 'g'); put(g, 9, 100, 'g'); put(g, 9, 104, 'k');
  return { name: '1-1 Premiers pas', theme: 'overworld', time: 320, map: rows(g) };
}
function L12() { // 1-2 Cavernes — vertical, deux niveaux, plafonds
  const W = 96, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // plafonds bas (blocs durs) forçant à descendre
  box(g, 12, 18, 1, 4, 'H'); box(g, 40, 46, 1, 4, 'H'); box(g, 68, 74, 1, 4, 'H');
  // étage supérieur (route bonus) : plateformes + gemmes
  plat(g, 4, 22, 6); put(g, 3, 24, 'j'); plat(g, 4, 50, 6); coins(g, 3, 51, 3); plat(g, 4, 78, 6); put(g, 3, 80, 'j');
  // étage bas : plateformes intermédiaires
  plat(g, 7, 10, 4); plat(g, 7, 30, 5); plat(g, 7, 56, 5); plat(g, 7, 82, 4);
  put(g, 5, 11, 'o o'); put(g, 5, 57, 'o o');
  pipe(g, 26, 7); pipe(g, 62, 8);
  put(g, 6, 35, 'B?B'); put(g, 6, 70, 'BMB');
  // ennemis
  put(g, 9, 16, 'g'); put(g, 9, 34, 'k'); put(g, 9, 50, 'g'); put(g, 9, 64, 'k'); put(g, 9, 84, 'g');
  put(g, 6, 31, 'k'); put(g, 6, 57, 'k'); // sur plateformes
  return { name: '1-2 Cavernes', theme: 'underground', time: 320, map: rows(g) };
}
function L13() { // 1-3 Collines fleuries — reliefs en escalier, ressorts, plumes
  const W = 112, g = grid(W); floorX(g, [[34, 36], [58, 60], [86, 88]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // collines (mesas successives de hauteurs variées)
  mesa(g, 10, 16, 9); mesa(g, 17, 23, 8); mesa(g, 24, 30, 7);
  put(g, 6, 26, 'g'); coins(g, 6, 12, 2);
  stairs(g, 40, 9, 3, 1); // petit escalier
  // bloc plume (nouveau power-up) bien visible
  put(g, 5, 46, 'W');
  pipe(g, 52, 7);
  // parcours haut : plateformes + gemme
  plat(g, 4, 62, 5); put(g, 3, 64, 'j'); plat(g, 5, 72, 4);
  // ressort vers gemme très haute
  put(g, 9, 78, 'T'); put(g, 2, 78, 'j');
  mesa(g, 92, 100, 8); put(g, 7, 95, 'k');
  put(g, 6, 100, '?'); put(g, 6, 102, '?');
  // ennemis
  put(g, 9, 20, 'g'); put(g, 9, 44, 'g'); put(g, 9, 54, 'k'); put(g, 9, 68, 'g'); put(g, 9, 104, 'g');
  return { name: '1-3 Collines fleuries', theme: 'overworld', time: 340, map: rows(g) };
}

// =================== MONDE 2 ===================
function L21() { // 2-1 Remparts — escaliers montants/descendants, route haute (étoile)
  const W = 116, g = grid(W); floorX(g, [[40, 42], [70, 72], [98, 100]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // grand escalier montant puis plateau puis descendant (remparts)
  stairs(g, 8, 9, 4, 1); mesa(g, 12, 22, 6); put(g, 5, 16, 'g'); put(g, 5, 19, 'g');
  stairs(g, 26, 6, 4, 1); // remonte plus haut -> route haute
  plat(g, 3, 30, 8); put(g, 2, 33, 'U'); coins(g, 2, 38, 2); // étoile en haut
  pipe(g, 48, 7); pipe(g, 60, 8);
  put(g, 6, 52, 'BMB');
  // pont de plateformes au-dessus d'un trou
  plat(g, 7, 66, 3); plat(g, 6, 74, 3); plat(g, 7, 82, 3); put(g, 5, 75, 'j');
  put(g, 9, 90, 'T'); put(g, 2, 90, 'j');
  mesa(g, 104, 110, 8); put(g, 7, 107, 'k');
  // ennemis
  put(g, 9, 36, 'g'); put(g, 9, 46, 'k'); put(g, 9, 58, 'g'); put(g, 9, 88, 'g'); put(g, 9, 112, 'g');
  put(g, 5, 14, 'L'); // 1UP sur le rempart
  return { name: '2-1 Remparts', theme: 'overworld', time: 340, map: rows(g) };
}
function L22() { // 2-2 Château — pics, colonnes, plateformes mobiles
  const W = 100, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // piliers décoratifs suspendus au plafond (n'obstruent pas le sol)
  box(g, 16, 17, 1, 4, 'H'); box(g, 38, 39, 1, 5, 'H'); box(g, 64, 65, 1, 4, 'H');
  // pics au sol (sol solide -> à enjamber)
  put(g, 9, 24, '^^'); put(g, 9, 50, '^^'); put(g, 9, 76, '^^');
  // plateformes pour franchir les pics
  plat(g, 7, 22, 4); plat(g, 7, 48, 5); plat(g, 6, 74, 5);
  // étage haut bonus
  plat(g, 4, 30, 6); put(g, 3, 32, 'j'); plat(g, 4, 80, 6); coins(g, 3, 81, 3);
  put(g, 6, 34, 'B?B'); put(g, 6, 68, 'BMB');
  pipe(g, 44, 7); pipe(g, 58, 8);
  // ennemis
  put(g, 9, 12, 'k'); put(g, 9, 34, 'g'); put(g, 9, 56, 'k'); put(g, 9, 70, 'g'); put(g, 9, 88, 'k');
  put(g, 6, 49, 'g'); // sur plateforme
  return { name: '2-2 Château', theme: 'castle', time: 340, map: rows(g) };
}
function L23() { // 2-3 Souterrain profond — deux routes, puits, plumes & étoile
  const W = 100, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // plafonds (puits verticaux)
  box(g, 14, 20, 1, 3, 'H'); box(g, 46, 52, 1, 3, 'H'); box(g, 76, 82, 1, 3, 'H');
  // route haute
  plat(g, 4, 24, 6); put(g, 3, 26, 'j'); plat(g, 4, 56, 6); put(g, 3, 58, 'W'); plat(g, 4, 86, 5);
  // route basse (plateformes)
  plat(g, 7, 10, 4); plat(g, 7, 30, 5); plat(g, 7, 58, 5); plat(g, 7, 84, 4);
  put(g, 5, 11, 'o o'); put(g, 5, 85, 'o o');
  pipe(g, 26, 7); pipe(g, 40, 8); pipe(g, 66, 7);
  put(g, 6, 34, 'B?B'); put(g, 6, 70, 'BUB');
  // ennemis (dont à pics)
  put(g, 9, 16, 'z'); put(g, 9, 36, 'g'); put(g, 9, 50, 'z'); put(g, 9, 62, 'g'); put(g, 9, 90, 'z');
  put(g, 6, 31, 'k'); put(g, 6, 59, 'k');
  return { name: '2-3 Souterrain profond', theme: 'underground', time: 340, map: rows(g) };
}

// =================== MONDE 3 ===================
function L31() { // 3-1 Cimes venteuses — pics, escaliers, ressorts, plume
  const W = 116, g = grid(W); floorX(g, [[40, 42], [68, 70], [96, 98]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  stairs(g, 10, 9, 3, 1); mesa(g, 13, 22, 7); put(g, 6, 16, 'g'); put(g, 6, 20, 'g'); coins(g, 5, 15, 3);
  mesa(g, 23, 30, 9);
  put(g, 9, 34, 'T'); put(g, 2, 34, 'j');
  plat(g, 5, 44, 5); put(g, 4, 46, 'W');
  put(g, 8, 52, 'C');
  stairs(g, 56, 9, 2, 1); mesa(g, 58, 66, 8); put(g, 7, 62, 'k'); put(g, 5, 60, 'n');
  plat(g, 4, 72, 5); put(g, 3, 74, 'j');
  put(g, 9, 80, 'T'); put(g, 2, 80, 'j'); put(g, 8, 86, 'o o');
  stairs(g, 100, 9, 3, 1); mesa(g, 103, 110, 7); put(g, 6, 106, 'g');
  put(g, 9, 38, 'g'); put(g, 9, 50, 'k'); put(g, 9, 78, 'g'); put(g, 9, 112, 'g');
  return { name: '3-1 Cimes venteuses', theme: 'overworld', time: 340, map: rows(g) };
}
function L32() { // 3-2 Pont des cieux — piliers-ponts, plateformes mobiles, plume
  const W = 116, g = grid(W); floorX(g, [[24, 26], [44, 46], [64, 66], [84, 86], [104, 105]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  mesa(g, 12, 18, 8); coins(g, 5, 13, 3);
  plat(g, 4, 28, 4); plat(g, 4, 36, 4); put(g, 3, 30, 'j');
  put(g, 9, 30, 'T'); put(g, 2, 30, 'j');
  mesa(g, 48, 56, 8); put(g, 7, 52, 'k'); put(g, 5, 50, 'm');
  put(g, 8, 40, 'C');
  put(g, 5, 60, 'W');
  plat(g, 4, 68, 4); plat(g, 4, 76, 4); put(g, 3, 78, 'j');
  mesa(g, 88, 96, 8); put(g, 7, 92, 'g'); put(g, 5, 90, 'n');
  put(g, 6, 100, '?'); put(g, 6, 102, '?');
  put(g, 9, 36, 'g'); put(g, 9, 58, 'k'); put(g, 9, 80, 'g'); put(g, 9, 110, 'g');
  return { name: '3-2 Pont des cieux', theme: 'overworld', time: 340, map: rows(g) };
}
function L33() { // 3-3 Antre du Gardien — combat de boss avec plateformes d'esquive
  const W = 52, g = grid(W); floorH(g);
  put(g, 9, 2, 'S');
  plat(g, 5, 8, 5); plat(g, 5, 38, 5); plat(g, 7, 22, 6);
  put(g, 3, 10, 'M'); put(g, 3, 40, 'W');
  put(g, 6, 24, 'j'); put(g, 6, 27, 'j');
  coins(g, 8, 14, 3); coins(g, 8, 32, 3);
  put(g, 9, 26, 'O');
  return { name: '3-3 Antre du Gardien', theme: 'castle', time: 220, map: rows(g) };
}

export const BUILT = {
  L11: L11(), L12: L12(), L13: L13(), L21: L21(), L22: L22(), L23: L23(),
  L31: L31(), L32: L32(), L33: L33(),
};
