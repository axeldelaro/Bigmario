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
  pipe(g, 44, 8); pipe(g, 54, 8);
  // parcours haut bonus (plateformes) au-dessus d'un trou
  plat(g, 5, 40, 5); plat(g, 4, 48, 4); put(g, 3, 49, 'j'); plat(g, 5, 58, 4);
  // ressort + gemme haute
  put(g, 9, 72, 'T'); put(g, 2, 72, 'j');
  put(g, 7, 78, '====='); coins(g, 6, 79, 3);
  // bloc 1UP caché en hauteur — plateforme d'appui pour l'atteindre au saut
  plat(g, 7, 84, 4); put(g, 4, 86, 'L');
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
  pipe(g, 26, 8); pipe(g, 62, 8);
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
  pipe(g, 52, 8); put(g, 7, 52, 'v'); // plante de tuyau
  // tuyau-warp -> petite salle secrète en hauteur (pièces)
  put(g, 8, 48, 'Q'); put(g, 9, 48, 'p'); put(g, 2, 48, 'q'); coins(g, 1, 46, 3);
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
  pipe(g, 48, 8); pipe(g, 60, 8);
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
  pipe(g, 44, 8); pipe(g, 58, 8); put(g, 7, 44, 'v'); // plante de tuyau
  // ennemis (dont un lanceur)
  put(g, 9, 12, 'k'); put(g, 9, 34, 't'); put(g, 9, 56, 'k'); put(g, 9, 70, 'g'); put(g, 9, 88, 'k');
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
  pipe(g, 26, 8); pipe(g, 40, 8); pipe(g, 66, 8);
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
  // Plateformes principales (row 5) accessibles depuis les marches latérales
  plat(g, 5, 8, 5); plat(g, 5, 38, 5); plat(g, 7, 22, 6);
  // Marches d'accès aux plateformes hautes (row 5) depuis le sol
  // Gauche : marches en row 8 et 6 pour atteindre row 5
  plat(g, 7, 5, 3); plat(g, 6, 6, 2);
  // Droite : marches symétriques
  plat(g, 7, 44, 3); plat(g, 6, 44, 2);
  // Blocs power-up (row 3) : atteignables depuis les plateformes row 5 en sautant
  put(g, 3, 10, 'M'); put(g, 3, 40, 'W');
  // Petite plateforme centrale pour casser les blocs
  put(g, 4, 24, 'j'); put(g, 4, 27, 'j');
  coins(g, 8, 14, 3); coins(g, 8, 32, 3);
  put(g, 9, 26, 'O');
  return { name: '3-3 Antre du Gardien', theme: 'castle', time: 220, map: rows(g) };
}

// =================== MONDE 4 ===================
function L41() { // 4-1 Bourrasques — relief intense, ressorts, double route
  const W = 124, g = grid(W); floorX(g, [[38, 40], [62, 64], [88, 90], [110, 112]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  stairs(g, 8, 9, 3, 1); mesa(g, 11, 18, 7); put(g, 6, 14, 'g'); coins(g, 5, 12, 3);
  mesa(g, 19, 26, 8); put(g, 7, 22, 'k');
  put(g, 9, 30, 'T'); put(g, 2, 30, 'j');           // ressort -> gemme haute
  put(g, 5, 34, 'W');                               // plume
  plat(g, 5, 44, 5); put(g, 4, 46, 'j'); plat(g, 4, 52, 4); // pont haut bonus
  pipe(g, 56, 8);
  put(g, 8, 70, 'C');                               // checkpoint
  stairs(g, 72, 9, 2, 1); mesa(g, 74, 82, 8); put(g, 7, 78, 'k'); put(g, 5, 76, 'n');
  plat(g, 4, 94, 5); put(g, 3, 96, 'j'); put(g, 9, 100, 'T'); put(g, 2, 100, 'j');
  put(g, 6, 104, '?'); put(g, 6, 106, '?');
  put(g, 9, 36, 'g'); put(g, 9, 48, 'z'); put(g, 9, 60, 'g'); put(g, 9, 86, 'z'); put(g, 9, 108, 'g'); put(g, 9, 118, 'k');
  return { name: '4-1 Bourrasques', theme: 'overworld', time: 360, map: rows(g) };
}
function L42() { // 4-2 Donjon — château exigeant, pics, colonnes, deux routes
  const W = 112, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  box(g, 18, 19, 1, 5, 'H'); box(g, 44, 45, 1, 5, 'H'); box(g, 72, 73, 1, 5, 'H'); // piliers suspendus
  put(g, 9, 26, '^^'); put(g, 9, 52, '^^'); put(g, 9, 80, '^^');                   // pics au sol
  plat(g, 7, 24, 4); plat(g, 7, 50, 5); plat(g, 6, 78, 5);                          // passerelles
  plat(g, 4, 32, 6); put(g, 3, 34, 'j'); plat(g, 4, 86, 6); coins(g, 3, 87, 3);     // route haute
  put(g, 6, 36, 'B?B'); put(g, 6, 66, 'BMB'); put(g, 5, 58, 'W');
  pipe(g, 40, 8); pipe(g, 62, 8); put(g, 7, 40, 'v'); put(g, 7, 62, 'v'); // plantes de tuyau
  put(g, 8, 56, 'C');
  put(g, 9, 14, 'k'); put(g, 9, 36, 't'); put(g, 9, 58, 'k'); put(g, 9, 70, 'z'); put(g, 9, 96, 't');
  put(g, 6, 51, 'g');
  return { name: '4-2 Donjon', theme: 'castle', time: 360, map: rows(g) };
}
function L43() { // 4-3 Gardien Suprême — boss en grande arène
  const W = 60, g = grid(W); floorH(g);
  put(g, 9, 2, 'S');
  // Plateformes d'esquive (row 5) avec accès par marches latérales
  plat(g, 5, 8, 5); plat(g, 5, 46, 5); plat(g, 6, 26, 8);
  // Marches d'accès gauche
  plat(g, 7, 4, 4); plat(g, 6, 5, 3);
  // Marches d'accès droite
  plat(g, 7, 51, 4); plat(g, 6, 51, 3);
  // Plateformes hautes (row 3) pour power-ups
  plat(g, 3, 18, 5); plat(g, 3, 36, 5);
  put(g, 3, 10, 'M'); put(g, 3, 48, 'W'); put(g, 2, 20, 'U'); // feu, plume, étoile
  // Ressort pour accès aux plateformes hautes (décalé du boss)
  put(g, 9, 28, 'T');
  put(g, 5, 28, 'j'); put(g, 5, 31, 'j');
  coins(g, 8, 14, 3); coins(g, 8, 40, 3);
  put(g, 9, 30, 'O');
  return { name: '4-3 Gardien Suprême', theme: 'castle', time: 240, map: rows(g) };
}

// =================== MONDE 5 — CAVERNES DE CRISTAL ===================
function L51() { // 5-1 Vallée de cristal — overworld franchissable (modèle 1-1/3-1)
  const W = 118, g = grid(W); floorX(g, [[30, 32], [58, 60], [90, 92]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  put(g, 6, 8, '?'); put(g, 6, 10, 'M'); put(g, 6, 12, '?'); coins(g, 5, 8, 3);
  mesa(g, 16, 24, 8); put(g, 7, 19, 'g'); put(g, 7, 22, 'g'); coins(g, 6, 26, 2);
  pipe(g, 38, 8); pipe(g, 48, 8);
  plat(g, 5, 40, 5); put(g, 4, 42, 'j'); plat(g, 4, 50, 4);
  put(g, 9, 66, 'T'); put(g, 2, 66, 'j');
  put(g, 7, 72, '====='); coins(g, 6, 73, 3);
  mesa(g, 96, 104, 8); put(g, 7, 100, 'k');
  put(g, 6, 108, '?'); put(g, 6, 110, 'W');
  put(g, 9, 20, 'g'); put(g, 9, 54, 'g'); put(g, 9, 80, 'g'); put(g, 9, 106, 'g');
  return { name: '5-1 Vallée de cristal', theme: 'overworld', time: 340, map: rows(g) };
}
function L52() { // 5-2 Galeries oubliées — souterrain à deux routes (modèle 1-2/2-3)
  const W = 100, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  box(g, 14, 20, 1, 4, 'H'); box(g, 44, 50, 1, 4, 'H'); box(g, 72, 78, 1, 4, 'H');
  plat(g, 4, 24, 6); put(g, 3, 26, 'j'); plat(g, 4, 54, 6); coins(g, 3, 55, 3); plat(g, 4, 82, 6); put(g, 3, 84, 'W');
  plat(g, 7, 10, 4); plat(g, 7, 32, 5); plat(g, 7, 60, 5); plat(g, 7, 86, 4);
  pipe(g, 28, 8); pipe(g, 66, 8);
  put(g, 6, 36, 'B?B'); put(g, 6, 70, 'BMB');
  put(g, 9, 16, 'g'); put(g, 9, 40, 'k'); put(g, 9, 56, 'g'); put(g, 9, 90, 'g');
  put(g, 6, 33, 'k'); put(g, 6, 61, 'k');
  return { name: '5-2 Galeries oubliées', theme: 'underground', time: 340, map: rows(g) };
}
function L53() { // 5-3 Cœur du Cristal — combat de boss (modèle 3-3/4-3)
  const W = 52, g = grid(W); floorH(g);
  put(g, 9, 2, 'S');
  plat(g, 5, 8, 5); plat(g, 5, 38, 5); plat(g, 7, 22, 6);
  // Marches d'accès gauche et droite
  plat(g, 7, 5, 3); plat(g, 6, 6, 2);
  plat(g, 7, 44, 3); plat(g, 6, 44, 2);
  put(g, 3, 10, 'M'); put(g, 3, 40, 'W'); put(g, 2, 24, 'U');
  // Ressort central
  put(g, 9, 25, 'T');
  put(g, 6, 24, 'j'); put(g, 6, 27, 'j');
  coins(g, 8, 14, 3); coins(g, 8, 32, 3);
  put(g, 9, 26, 'O');
  return { name: '5-3 Cœur du Cristal', theme: 'castle', time: 240, map: rows(g) };
}

// =================== MONDE 6 — JUNGLE TROPICALE ===================
function L61() { // 6-1 Canopée — plateformes hautes, lianes (plat mobiles vert), plantes de tuyau
  const W = 120, g = grid(W); floorX(g, [[32, 34], [56, 58], [82, 84], [104, 106]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // canopée basse — plateformes traversables
  plat(g, 6, 8, 5); coins(g, 5, 9, 3); put(g, 5, 14, 'W');
  // lianes (plateformes mobiles verticales)
  put(g, 4, 18, 'n'); put(g, 4, 22, 'n');
  mesa(g, 24, 30, 8); put(g, 7, 27, 'g');
  // tuyaux avec plantes
  pipe(g, 38, 8); put(g, 7, 38, 'v'); pipe(g, 46, 7); put(g, 6, 46, 'v');
  // canopée haute — parcours bonus
  plat(g, 4, 40, 5); put(g, 3, 42, 'j'); plat(g, 3, 48, 4); put(g, 2, 50, 'j');
  put(g, 8, 52, 'C');
  // lianes intermédiaires au-dessus du trou
  put(g, 5, 54, 'n'); put(g, 5, 60, 'n');
  plat(g, 6, 62, 5); put(g, 5, 64, 'M');
  mesa(g, 68, 76, 8); put(g, 7, 72, 'k'); coins(g, 6, 70, 3);
  // section lianes denses
  put(g, 4, 78, 'n'); put(g, 4, 86, 'n'); put(g, 4, 90, 'n');
  plat(g, 6, 86, 5); put(g, 5, 88, 'j');
  pipe(g, 94, 8); put(g, 7, 94, 'v');
  mesa(g, 108, 114, 8); put(g, 7, 111, 'g');
  put(g, 6, 110, '?'); put(g, 6, 112, '?');
  // ennemis au sol
  put(g, 9, 16, 'g'); put(g, 9, 44, 'g'); put(g, 9, 66, 'k'); put(g, 9, 80, 'g'); put(g, 9, 100, 'g'); put(g, 9, 116, 'k');
  return { name: '6-1 Canopée', theme: 'overworld', time: 360, map: rows(g) };
}
function L62() { // 6-2 Grottes humides — cascades (semi-solides), volants
  const W = 110, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // plafonds bas simulant grottes
  box(g, 14, 20, 1, 4, 'H'); box(g, 42, 48, 1, 4, 'H'); box(g, 70, 76, 1, 4, 'H');
  // cascades (plateformes semi-solides en colonne)
  plat(g, 3, 24, 3); plat(g, 5, 24, 3); plat(g, 7, 24, 3);
  plat(g, 3, 52, 3); plat(g, 5, 52, 3); plat(g, 7, 52, 3);
  plat(g, 3, 80, 3); plat(g, 5, 80, 3); plat(g, 7, 80, 3);
  // route haute bonus
  plat(g, 4, 30, 6); put(g, 3, 32, 'j'); plat(g, 4, 58, 6); put(g, 3, 60, 'W');
  plat(g, 4, 86, 5); put(g, 3, 88, 'j');
  // route basse
  plat(g, 7, 10, 4); plat(g, 7, 34, 5); plat(g, 7, 62, 5); plat(g, 7, 90, 4);
  put(g, 5, 11, 'o o'); put(g, 5, 63, 'o o');
  pipe(g, 28, 8); pipe(g, 66, 8);
  put(g, 6, 38, 'BMB'); put(g, 6, 96, 'B?B');
  put(g, 8, 50, 'C');
  // volants (f) — ennemis principaux
  put(g, 5, 18, 'f'); put(g, 5, 40, 'f'); put(g, 5, 56, 'f'); put(g, 5, 78, 'f'); put(g, 5, 100, 'f');
  // ennemis au sol
  put(g, 9, 16, 'g'); put(g, 9, 36, 'k'); put(g, 9, 60, 'g'); put(g, 9, 84, 'k'); put(g, 9, 104, 'g');
  return { name: '6-2 Grottes humides', theme: 'underground', time: 360, map: rows(g) };
}
function L63() { // 6-3 Roi de la Jungle — boss avec 2 niveaux de plateformes + ressort
  const W = 56, g = grid(W); floorH(g);
  put(g, 9, 2, 'S');
  // Niveau bas (row 7) — large plateforme d'esquive
  plat(g, 7, 8, 6); plat(g, 7, 40, 6);
  // Niveau haut (row 5) — plateformes latérales
  plat(g, 5, 6, 5); plat(g, 5, 44, 5);
  // Marches d'accès gauche
  plat(g, 8, 4, 3); plat(g, 6, 5, 2);
  // Marches d'accès droite
  plat(g, 8, 48, 3); plat(g, 6, 48, 2);
  // Plateforme centrale haute
  plat(g, 4, 22, 10);
  // Ressort central
  put(g, 9, 27, 'T');
  // Power-ups
  put(g, 3, 10, 'M'); put(g, 3, 44, 'W');
  put(g, 3, 26, 'j'); put(g, 3, 28, 'j');
  coins(g, 8, 16, 3); coins(g, 8, 34, 3);
  put(g, 9, 28, 'O');
  return { name: '6-3 Roi de la Jungle', theme: 'castle', time: 230, map: rows(g) };
}

// =================== MONDE 7 — PICS GLACÉS ===================
function L71() { // 7-1 Ascension glacée — montagne, escaliers, mesas, pics, ressorts
  const W = 124, g = grid(W); floorX(g, [[36, 38], [62, 64], [92, 94], [112, 114]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // pics fréquents au sol
  put(g, 9, 12, '^^'); put(g, 9, 28, '^^'); put(g, 9, 50, '^^'); put(g, 9, 76, '^^'); put(g, 9, 100, '^^');
  // plateformes pour franchir les pics
  plat(g, 7, 10, 4); plat(g, 7, 26, 4); plat(g, 7, 48, 4);
  // escaliers et mesas progressifs
  stairs(g, 8, 9, 3, 1); mesa(g, 11, 18, 7); put(g, 6, 14, 'g'); coins(g, 5, 12, 3);
  mesa(g, 20, 26, 8); put(g, 7, 23, 'k');
  put(g, 5, 32, 'M');
  // ressort vers gemme
  put(g, 9, 42, 'T'); put(g, 2, 42, 'j');
  stairs(g, 44, 9, 2, 1); mesa(g, 46, 54, 8); put(g, 7, 50, 'g'); coins(g, 6, 48, 3);
  put(g, 8, 58, 'C');
  // grande montagne
  stairs(g, 66, 9, 3, 1); mesa(g, 69, 78, 7); put(g, 6, 73, 'k'); put(g, 5, 71, 'W');
  plat(g, 4, 74, 5); put(g, 3, 76, 'j');
  plat(g, 7, 74, 4);
  // ressort vers gemme haute
  put(g, 9, 84, 'T'); put(g, 2, 84, 'j');
  mesa(g, 96, 104, 8); put(g, 7, 100, 'g');
  put(g, 6, 106, '?'); put(g, 6, 108, 'L');
  // ennemis
  put(g, 9, 30, 'g'); put(g, 9, 56, 'k'); put(g, 9, 80, 'g'); put(g, 9, 88, 'z'); put(g, 9, 110, 'g'); put(g, 9, 118, 'k');
  return { name: '7-1 Ascension glacée', theme: 'overworld', time: 360, map: rows(g) };
}
function L72() { // 7-2 Château glacé — colonnes, pics, 2 routes, plantes et lanceurs
  const W = 116, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // colonnes suspendues
  box(g, 18, 19, 1, 5, 'H'); box(g, 42, 43, 1, 5, 'H'); box(g, 68, 69, 1, 5, 'H'); box(g, 92, 93, 1, 4, 'H');
  // pics au sol (danger route basse)
  put(g, 9, 24, '^^^'); put(g, 9, 50, '^^^'); put(g, 9, 76, '^^^');
  // passerelles pour franchir les pics
  plat(g, 7, 22, 5); plat(g, 7, 48, 6); plat(g, 6, 74, 6);
  // route haute bonus
  plat(g, 4, 28, 6); put(g, 3, 30, 'j'); put(g, 3, 32, 'W');
  plat(g, 4, 56, 6); coins(g, 3, 57, 3);
  plat(g, 4, 82, 6); put(g, 3, 84, 'j');
  // tuyaux avec plantes
  pipe(g, 36, 8); put(g, 7, 36, 'v'); pipe(g, 62, 8); put(g, 7, 62, 'v');
  put(g, 6, 46, 'B?B'); put(g, 6, 88, 'BMB');
  put(g, 8, 54, 'C');
  // lanceurs
  put(g, 9, 32, 't'); put(g, 9, 70, 't');
  // ennemis
  put(g, 9, 14, 'k'); put(g, 9, 40, 'g'); put(g, 9, 58, 'z'); put(g, 9, 80, 'k'); put(g, 9, 96, 'g'); put(g, 9, 108, 'k');
  put(g, 6, 49, 'g'); put(g, 6, 75, 'k');
  return { name: '7-2 Château glacé', theme: 'castle', time: 360, map: rows(g) };
}
function L73() { // 7-3 Titan des Glaces — grande arène avec 3 niveaux de plateformes
  const W = 58, g = grid(W); floorH(g);
  put(g, 9, 2, 'S');
  // Niveau 1 (row 7) — plateformes basses
  plat(g, 7, 6, 5); plat(g, 7, 24, 8); plat(g, 7, 46, 5);
  // Niveau 2 (row 5) — plateformes intermédiaires
  plat(g, 5, 10, 5); plat(g, 5, 42, 5);
  // Niveau 3 (row 3) — plateformes hautes
  plat(g, 3, 18, 6); plat(g, 3, 34, 6);
  // Marches d'accès gauche
  plat(g, 8, 3, 3); plat(g, 6, 8, 3);
  // Marches d'accès droite
  plat(g, 8, 50, 3); plat(g, 6, 47, 3);
  // Power-ups
  put(g, 2, 20, 'M'); put(g, 2, 36, 'Q'); put(g, 4, 28, 'W');
  // Gemmes
  put(g, 2, 28, 'j'); put(g, 4, 14, 'j'); put(g, 4, 42, 'j');
  coins(g, 8, 14, 3); coins(g, 8, 38, 3);
  put(g, 9, 29, 'O');
  return { name: '7-3 Titan des Glaces', theme: 'castle', time: 240, map: rows(g) };
}

// =================== MONDE 8 — NOYAU FINAL ===================
function L81() { // 8-1 Corridor infernal — parcours avec tous les ennemis
  const W = 130, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // colonnes suspendues
  box(g, 16, 17, 1, 4, 'H'); box(g, 38, 39, 1, 5, 'H'); box(g, 62, 63, 1, 4, 'H');
  box(g, 86, 87, 1, 5, 'H'); box(g, 108, 109, 1, 4, 'H');
  // pics au sol
  put(g, 9, 22, '^^^'); put(g, 9, 48, '^^'); put(g, 9, 72, '^^^'); put(g, 9, 96, '^^');
  // passerelles
  plat(g, 7, 20, 5); plat(g, 7, 46, 5); plat(g, 6, 70, 6); plat(g, 7, 94, 5);
  // route haute
  plat(g, 4, 26, 6); put(g, 3, 28, 'j'); plat(g, 4, 54, 6); put(g, 3, 56, 'W');
  plat(g, 4, 78, 6); put(g, 3, 80, 'U'); plat(g, 4, 100, 5); coins(g, 3, 101, 3);
  // tuyaux avec plantes
  pipe(g, 34, 8); put(g, 7, 34, 'v'); pipe(g, 58, 8); put(g, 7, 58, 'v');
  pipe(g, 82, 8); put(g, 7, 82, 'v');
  put(g, 6, 42, 'BMB'); put(g, 6, 90, 'B?B');
  // checkpoints
  put(g, 8, 44, 'C'); put(g, 8, 88, 'C');
  // lanceurs
  put(g, 9, 30, 't'); put(g, 9, 66, 't'); put(g, 9, 104, 't');
  // volants
  put(g, 5, 40, 'f'); put(g, 5, 68, 'f'); put(g, 5, 98, 'f');
  // ennemis au sol — tous types
  put(g, 9, 12, 'k'); put(g, 9, 36, 'z'); put(g, 9, 52, 'g'); put(g, 9, 76, 'z'); put(g, 9, 92, 'k');
  put(g, 9, 112, 'g'); put(g, 9, 120, 'z'); put(g, 9, 124, 'k');
  put(g, 6, 47, 'g'); put(g, 6, 71, 'k');
  return { name: '8-1 Corridor infernal', theme: 'castle', time: 380, map: rows(g) };
}
function L82() { // 8-2 Labyrinthe des abysses — 3 routes, plafonds bas, checkpoints
  const W = 120, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  // plafonds bas créant des couloirs
  box(g, 12, 20, 1, 3, 'H'); box(g, 36, 44, 1, 3, 'H'); box(g, 60, 68, 1, 3, 'H'); box(g, 84, 92, 1, 3, 'H');
  // murs intérieurs créant le labyrinthe (partiels, franchissables)
  box(g, 24, 25, 5, 8, 'H'); box(g, 50, 51, 4, 7, 'H'); box(g, 76, 77, 5, 8, 'H');
  // route haute (la plus rewarding)
  plat(g, 4, 22, 3); plat(g, 4, 28, 6); put(g, 3, 30, 'j'); put(g, 3, 32, 'W');
  plat(g, 4, 46, 4); plat(g, 4, 54, 6); put(g, 3, 56, 'U'); coins(g, 3, 57, 2);
  plat(g, 4, 74, 3); plat(g, 4, 80, 6); put(g, 3, 82, 'j');
  plat(g, 4, 96, 6); put(g, 3, 98, 'L');
  // route moyenne
  plat(g, 6, 14, 4); plat(g, 6, 28, 5); plat(g, 6, 54, 5); plat(g, 6, 80, 5); plat(g, 6, 96, 4);
  put(g, 5, 15, 'o o'); put(g, 5, 55, 'o o'); put(g, 5, 81, 'o o');
  // route basse — dangereuse
  plat(g, 8, 10, 4); plat(g, 8, 30, 5); plat(g, 8, 56, 5); plat(g, 8, 82, 5); plat(g, 8, 100, 4);
  // tuyaux
  pipe(g, 32, 8); pipe(g, 70, 8);
  put(g, 6, 40, 'BMB'); put(g, 6, 88, 'B?B');
  // checkpoints
  put(g, 8, 38, 'C'); put(g, 8, 72, 'C'); put(g, 8, 104, 'C');
  // volants et pics-ennemis
  put(g, 5, 20, 'f'); put(g, 5, 48, 'f'); put(g, 5, 72, 'f'); put(g, 5, 94, 'f');
  // ennemis au sol
  put(g, 9, 18, 'z'); put(g, 9, 34, 'k'); put(g, 9, 52, 'z'); put(g, 9, 66, 'g'); put(g, 9, 80, 'z'); put(g, 9, 98, 'k'); put(g, 9, 112, 'z');
  put(g, 5, 29, 'k'); put(g, 5, 81, 'k');
  return { name: '8-2 Labyrinthe des abysses', theme: 'underground', time: 380, map: rows(g) };
}
function L83() { // 8-3 Noyau — boss FINAL, la plus grande arène
  const W = 64, g = grid(W); floorH(g);
  put(g, 9, 2, 'S');
  // Niveau 1 (row 7) — plateformes basses larges
  plat(g, 7, 6, 6); plat(g, 7, 20, 10); plat(g, 7, 36, 10); plat(g, 7, 52, 6);
  // Niveau 2 (row 5) — plateformes intermédiaires
  plat(g, 5, 8, 5); plat(g, 5, 26, 6); plat(g, 5, 38, 6); plat(g, 5, 50, 5);
  // Niveau 3 (row 3) — plateformes hautes
  plat(g, 3, 14, 5); plat(g, 3, 28, 8); plat(g, 3, 44, 5);
  // Marches d'accès gauche
  plat(g, 8, 3, 3); plat(g, 6, 6, 3);
  // Marches d'accès droite
  plat(g, 8, 56, 3); plat(g, 6, 54, 3);
  // Ressorts pour accès plateformes hautes
  put(g, 9, 18, 'T'); put(g, 9, 44, 'T');
  // Power-ups généreux (boss final)
  put(g, 2, 16, 'M'); put(g, 2, 30, 'U'); put(g, 2, 34, 'Q'); put(g, 2, 46, 'W');
  put(g, 4, 10, 'L');
  // Gemmes
  put(g, 2, 24, 'j'); put(g, 2, 40, 'j'); put(g, 4, 32, 'j');
  coins(g, 8, 14, 4); coins(g, 8, 40, 4);
  put(g, 9, 32, 'O');
  return { name: '8-3 Noyau', theme: 'castle', time: 240, map: rows(g) };
}

// =================== MINI-JEUX (courses de collecte vs IA) ===================
// Chaque disposition place le collectible donné (`ch` = 'o' pièces | 'j' étoiles).
// Géométrie navigable par l'IA : trous ≤ 3, marches ≤ 3, ressorts pour le haut.
function scatter(g, ch, pts) { for (const [r, x, n] of pts) for (let i = 0; i < n; i++) g[r][x + i * 2] = ch; }
function miniA(ch) { // Jardin suspendu (overworld)
  const W = 46, g = grid(W); floorX(g, [[14, 16], [30, 32]]);
  mesa(g, 6, 11, 8); plat(g, 6, 18, 5); plat(g, 5, 24, 4); mesa(g, 36, 42, 8);
  put(g, 9, 21, 'T');
  scatter(g, ch, [[7, 4, 3], [5, 7, 2], [8, 18, 3], [4, 24, 3], [3, 20, 2], [8, 34, 2], [6, 38, 3], [7, 12, 2]]);
  g[9][2] = '1'; g[9][W - 3] = '2';
  return { name: 'Jardin suspendu', theme: 'overworld', time: 70, map: rows(g) };
}
function miniB(ch) { // Galerie scintillante (souterrain)
  const W = 48, g = grid(W); floorH(g);
  plat(g, 7, 8, 5); plat(g, 5, 16, 5); plat(g, 7, 26, 5); plat(g, 5, 34, 5);
  put(g, 9, 13, 'T'); put(g, 9, 31, 'T');
  scatter(g, ch, [[8, 4, 3], [6, 17, 3], [4, 17, 2], [8, 27, 3], [4, 35, 3], [8, 40, 3], [6, 9, 2], [3, 24, 2]]);
  g[9][2] = '1'; g[9][W - 3] = '2';
  return { name: 'Galerie scintillante', theme: 'underground', time: 75, map: rows(g) };
}
function miniC(ch) { // Terrasses du donjon (castle)
  const W = 50, g = grid(W); floorX(g, [[18, 20], [34, 36]]);
  stairs(g, 6, 9, 3, 1); mesa(g, 9, 14, 7); plat(g, 5, 24, 6); mesa(g, 40, 46, 8);
  put(g, 9, 30, 'T');
  scatter(g, ch, [[8, 3, 3], [6, 10, 2], [4, 25, 3], [8, 23, 2], [2, 28, 2], [7, 42, 3], [5, 45, 2], [8, 14, 2]]);
  g[9][2] = '1'; g[9][W - 3] = '2';
  return { name: 'Terrasses du donjon', theme: 'castle', time: 75, map: rows(g) };
}
// méta exposée aux menus ; chaque entrée sait se construire pour pièces ou étoiles
export const MINIGAMES = [
  { name: 'Jardin suspendu', build: miniA },
  { name: 'Galerie scintillante', build: miniB },
  { name: 'Terrasses du donjon', build: miniC },
];

// =================== ARÈNES VERSUS (20 tuiles = 1 écran exact, murs de contour) ===================
function arena(name, theme, decorate) {
  const W = 20, g = grid(W);
  for (let y = 0; y < 12; y++) { g[y][0] = 'X'; g[y][W - 1] = 'X'; } // murs latéraux (contours)
  for (let x = 0; x < W; x++) { g[10][x] = 'X'; g[11][x] = 'X'; }    // sol
  decorate(g);
  return { name, theme, time: 99, map: rows(g) };
}
function A1() {
  return arena('Arène Duo', 'overworld', (g) => {
    plat(g, 7, 2, 5); plat(g, 7, 13, 5); plat(g, 4, 7, 6);
    put(g, 5, 9, 'M'); put(g, 5, 10, 'M'); put(g, 3, 9, '?'); put(g, 3, 10, '?');
    coins(g, 8, 5, 2); coins(g, 8, 13, 2);
    g[9][3] = '1'; g[9][16] = '2';
  });
}
function A2() {
  return arena('Tours', 'castle', (g) => {
    plat(g, 8, 2, 4); plat(g, 8, 14, 4); plat(g, 5, 2, 4); plat(g, 5, 14, 4); plat(g, 6, 8, 4);
    put(g, 3, 9, 'M'); put(g, 3, 10, 'U'); coins(g, 4, 8, 4);
    g[9][3] = '1'; g[9][16] = '2';
  });
}
function A3() {
  return arena('Ressorts', 'overworld', (g) => {
    plat(g, 6, 8, 4); plat(g, 8, 3, 4); plat(g, 8, 13, 4); put(g, 9, 6, 'T'); put(g, 9, 13, 'T');
    put(g, 3, 9, 'M'); put(g, 3, 10, 'M'); coins(g, 5, 8, 4);
    g[9][2] = '1'; g[9][17] = '2';
  });
}
function A4() { // Jungle — overworld, plateformes asymétriques
  return arena('Jungle', 'overworld', (g) => {
    plat(g, 7, 2, 4); plat(g, 5, 5, 3); plat(g, 8, 10, 4); plat(g, 6, 14, 4);
    plat(g, 4, 8, 4);
    put(g, 3, 9, 'M'); put(g, 3, 10, 'W'); put(g, 5, 15, '?');
    coins(g, 8, 3, 2); coins(g, 7, 14, 2);
    g[9][2] = '1'; g[9][17] = '2';
  });
}
function A5() { // Pics de glace — castle, ressorts et pics
  return arena('Pics de glace', 'castle', (g) => {
    plat(g, 7, 3, 4); plat(g, 7, 13, 4); plat(g, 5, 7, 6);
    put(g, 9, 6, '^'); put(g, 9, 13, '^');
    put(g, 9, 4, 'T'); put(g, 9, 15, 'T');
    put(g, 3, 9, 'M'); put(g, 3, 10, 'U');
    coins(g, 4, 7, 3); coins(g, 8, 4, 2); coins(g, 8, 14, 2);
    g[9][2] = '1'; g[9][17] = '2';
  });
}
export const ARENAS = [A1(), A2(), A3(), A4(), A5()];

export const BUILT = {
  L11: L11(), L12: L12(), L13: L13(), L21: L21(), L22: L22(), L23: L23(),
  L31: L31(), L32: L32(), L33: L33(),
  L41: L41(), L42: L42(), L43: L43(),
  L51: L51(), L52: L52(), L53: L53(),
  L61: L61(), L62: L62(), L63: L63(),
  L71: L71(), L72: L72(), L73: L73(),
  L81: L81(), L82: L82(), L83: L83(),
};
