// levelbuild.js — construit les niveaux de l'aventure avec une géométrie garantie
// franchissable (trous ≤ 3 tuiles, marches/tuyaux ≤ 2-3 tuiles). Validé par le
// solveur physique (test/solve.mjs). Légende: voir js/levels.js.

function grid(W) { return Array.from({ length: 12 }, () => Array(W).fill(' ')); }
function put(g, row, col, str) { for (let i = 0; i < str.length; i++) { const ch = str[i]; if (ch !== '.') g[row][col + i] = ch; } }
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
function pipe(g, col, top = 8) { for (let r = top; r <= 9; r++) g[r][col] = r === top ? 'P' : 'p'; }
function rows(g) { return g.map((r) => r.join('')); }

function L11() {
  const W = 96, g = grid(W); floorX(g, [[26, 28], [44, 46], [70, 71]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  pipe(g, 36); pipe(g, 58, 8);
  put(g, 6, 10, '?'); put(g, 6, 12, '?'); put(g, 6, 14, '?');
  put(g, 7, 33, '====='); put(g, 5, 34, 'o o o');
  put(g, 6, 50, '?'); put(g, 7, 64, '====='); put(g, 5, 65, 'j');
  put(g, 9, 16, 'g'); put(g, 9, 40, 'g'); put(g, 9, 52, 'g'); put(g, 9, 78, 'g'); put(g, 9, 86, 'g');
  put(g, 8, 80, 'o o'); put(g, 6, 20, 'o o');
  return { name: '1-1 Premiers pas', theme: 'overworld', time: 300, map: rows(g) };
}
function L12() {
  const W = 88, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  put(g, 7, 10, '===='); put(g, 7, 24, '===='); put(g, 7, 40, '====='); put(g, 7, 58, '===='); put(g, 7, 70, '====');
  put(g, 5, 11, 'o o'); put(g, 5, 41, 'j'); put(g, 5, 71, 'o o');
  pipe(g, 30); pipe(g, 52, 8);
  put(g, 6, 18, 'B?B'); put(g, 6, 64, 'BMB');
  put(g, 9, 16, 'g'); put(g, 9, 36, 'k'); put(g, 9, 46, 'g'); put(g, 9, 62, 'k'); put(g, 9, 78, 'g');
  return { name: '1-2 Cavernes', theme: 'underground', time: 300, map: rows(g) };
}
function L13() {
  const W = 100, g = grid(W); floorX(g, [[30, 32], [50, 52], [74, 76]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  pipe(g, 22); pipe(g, 62, 8);
  put(g, 7, 12, '====='); put(g, 5, 13, 'j'); put(g, 6, 40, '?'); put(g, 6, 42, '?');
  put(g, 7, 84, '====='); put(g, 5, 85, 'o o o');
  put(g, 9, 16, 'g'); put(g, 9, 38, 'g'); put(g, 9, 58, 'k'); put(g, 9, 68, 'g'); put(g, 9, 90, 'g');
  put(g, 9, 46, 'T'); put(g, 2, 46, 'j');
  put(g, 8, 28, 'o o'); put(g, 8, 70, 'o o');
  return { name: '1-3 Collines fleuries', theme: 'overworld', time: 320, map: rows(g) };
}
function L21() {
  const W = 104, g = grid(W); floorX(g, [[28, 30], [48, 50], [70, 72], [88, 89]]);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  pipe(g, 20); pipe(g, 60, 8); pipe(g, 80);
  put(g, 6, 12, '?'); put(g, 7, 36, '====='); put(g, 5, 37, 'o o o');
  put(g, 6, 56, 'BMB'); put(g, 7, 94, '===='); put(g, 5, 95, 'j');
  put(g, 9, 16, 'g'); put(g, 9, 40, 'k'); put(g, 9, 54, 'g'); put(g, 9, 66, 'g'); put(g, 9, 84, 'k'); put(g, 9, 98, 'g');
  put(g, 9, 44, 'T'); put(g, 2, 44, 'j'); put(g, 6, 40, 'U');
  return { name: '2-1 Remparts', theme: 'overworld', time: 320, map: rows(g) };
}
function L22() {
  const W = 92, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  put(g, 7, 12, '===='); put(g, 7, 28, '===='); put(g, 7, 44, '===='); put(g, 7, 60, '===='); put(g, 7, 74, '====');
  put(g, 5, 45, 'j'); put(g, 5, 13, 'o o'); put(g, 5, 75, 'o o');
  pipe(g, 22); pipe(g, 38, 8); pipe(g, 56); pipe(g, 70, 8);
  put(g, 6, 32, 'B?B'); put(g, 6, 64, 'BMB');
  put(g, 9, 18, 'k'); put(g, 9, 34, 'g'); put(g, 9, 50, 'k'); put(g, 9, 66, 'g'); put(g, 9, 82, 'k');
  put(g, 9, 48, '^'); put(g, 9, 49, '^');
  return { name: '2-2 Château', theme: 'castle', time: 320, map: rows(g) };
}
function L23() {
  const W = 88, g = grid(W); floorH(g);
  put(g, 9, 2, 'S'); put(g, 9, W - 3, 'G');
  put(g, 7, 10, '====='); put(g, 7, 26, '====='); put(g, 7, 44, '====='); put(g, 7, 62, '=====');
  put(g, 5, 11, 'j'); put(g, 5, 45, 'o o o'); put(g, 5, 63, 'o o');
  pipe(g, 20); pipe(g, 36, 8); pipe(g, 54); pipe(g, 72, 8);
  put(g, 6, 30, 'B?B'); put(g, 6, 66, 'BUB');
  put(g, 9, 16, 'z'); put(g, 9, 32, 'g'); put(g, 9, 48, 'z'); put(g, 9, 60, 'g'); put(g, 9, 78, 'z');
  return { name: '2-3 Souterrain profond', theme: 'underground', time: 320, map: rows(g) };
}

export const BUILT = { L11: L11(), L12: L12(), L13: L13(), L21: L21(), L22: L22(), L23: L23() };
