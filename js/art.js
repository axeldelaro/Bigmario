// art.js — génération procédurale de sprites pixel-art originaux (aucun asset externe).
// Chaque sprite est dessiné depuis une grille de caractères + une palette,
// puis mis en cache dans un <canvas> hors-écran.

const cache = new Map();

// Dessine une grille "rows" (tableau de strings) avec une palette {char: '#rrggbb'}.
function makeSprite(key, rows, pal, px = 1) {
  if (cache.has(key)) return cache.get(key);
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w * px; cv.height = h * px;
  const c = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const col = pal[ch];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x * px, y * px, px, px);
    }
  }
  cache.set(key, cv);
  return cv;
}

// Renvoie une version teintée (remplace la couleur principale) pour le joueur 2 / variations.
export function tinted(srcCanvas, key, from, to) {
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = srcCanvas.width; cv.height = srcCanvas.height;
  const c = cv.getContext('2d');
  c.drawImage(srcCanvas, 0, 0);
  const img = c.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  const f = hexRGB(from), t = hexRGB(to);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i+3] === 0) continue;
    // tolérance de teinte
    if (Math.abs(d[i]-f[0]) < 40 && Math.abs(d[i+1]-f[1]) < 40 && Math.abs(d[i+2]-f[2]) < 40) {
      d[i] = t[0]; d[i+1] = t[1]; d[i+2] = t[2];
    }
  }
  c.putImageData(img, 0, 0);
  cache.set(key, cv);
  return cv;
}
function hexRGB(h){ const n = parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }

// ---------------------------------------------------------------------------
// PALETTES
const P_HERO = {
  '.': null, 'k': '#241b14', 's': '#ffcb9c', 'h': '#e23b3b', 'H': '#a31d1d',
  'b': '#2f6cff', 'B': '#1c3fb0', 'y': '#ffcf3b', 'w': '#ffffff', 'e': '#1a1a2a',
  'o': '#ff9b3b',
};
const P_FIRE = { ...P_HERO, 'h': '#ffffff', 'H': '#dddddd', 'b': '#ff5d2e', 'B': '#c23010' };

// HÉROS — "Bolt", petit personnage à casquette (16x16). Designs originaux.
const HERO_SMALL_1 = [
  '.....kkkk.......',
  '....khhhhk......',
  '....khHHHk......',
  '....kssssk......',
  '...ksskssk......',
  '...ksskssk......',
  '....ksssk.......',
  '...kbbBbbk......',
  '..kbbyBybbK.....',
  '..kbbyBybbk.....',
  '..ksbbBbbsk.....',
  '..kss.k.ssk.....',
  '...k...k........',
  '..ksk.ksk.......',
  '..kkk.kkk.......',
  '................',
];
const HERO_SMALL_2 = [
  '.....kkkk.......',
  '....khhhhk......',
  '....khHHHk......',
  '....kssssk......',
  '...ksskssk......',
  '...ksskssk......',
  '....ksssk.......',
  '...kbbBbbk......',
  '..kbbyBybbk.....',
  '..kbbyBybbk.....',
  '...ksbBbsk......',
  '...kss.ssk......',
  '....k..k........',
  '...ksk.ksk......',
  '...kkk.kkk......',
  '................',
];
// 2e pose de course (petit) — foulée opposée, jambes bien écartées
const HERO_SMALL_2b = [
  '.....kkkk.......',
  '....khhhhk......',
  '....khHHHk......',
  '....kssssk......',
  '...ksskssk......',
  '...ksskssk......',
  '....ksssk.......',
  '...kbbBbbk......',
  '..kbbyBybbk.....',
  '..kbbyBybbk.....',
  '...ksbBbsk......',
  '..kss.k.ssk.....',
  '..k.....k.......',
  '.ksk.....ksk....',
  '.kk........kk...',
  '................',
];
const HERO_BIG_1 = [
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khHHHHk.....',
  '....kssssssk....',
  '...kssksskssk...',
  '...kssksskssk...',
  '....ksssssk.....',
  '....kksssk......',
  '...kbbBBbbk.....',
  '..kbbyBBybbk....',
  '..kbbyBBybbk....',
  '.kssbbBBbbsk....',
  '.kss.kkkk.ssk...',
  '..k..ksk......',
  '....kskksk......',
  '....kk.kkk......',
];
const HERO_BIG_2 = [
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khHHHHk.....',
  '....kssssssk....',
  '...kssksskssk...',
  '...kssksskssk...',
  '....ksssssk.....',
  '....kksssk......',
  '...kbbBBbbk.....',
  '..kbbyBBybbk....',
  '...kbyBBybk.....',
  '...kbbBBbbk.....',
  '..kss.kk.ssk....',
  '..ksk....ksk...',
  '..kkk....kkk....',
  '................',
];
// 2e pose de course (grand) — foulée opposée
const HERO_BIG_2b = [
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khHHHHk.....',
  '....kssssssk....',
  '...kssksskssk...',
  '...kssksskssk...',
  '....ksssssk.....',
  '....kksssk......',
  '...kbbBBbbk.....',
  '..kbbyBBybbk....',
  '...kbyBBybk.....',
  '...kbbBBbbk.....',
  '..kss.kk.ssk....',
  '.ksk......ksk...',
  '.kk........kk...',
  '................',
];
const HERO_JUMP = [
  '.....kkkkk......',
  '....khhhhhk.....',
  '....khHHHHk.....',
  '...kkssssssk....',
  '..kssksskssk....',
  '..kssksskssk....',
  '...ksssssk......',
  '..ykbbBBbbky....',
  '..ykbyBBybky....',
  '...kbbBBbbk.....',
  '...kbbBBbbk.....',
  '...kss..ssk.....',
  '..ksk....ksk....',
  '..kk......kk....',
  '................',
  '................',
];
const HERO_DUCK = [
  '................',
  '................',
  '.....kkkkk......',
  '....khhhhhk.....',
  '....kssssssk....',
  '...kssksskssk...',
  '....ksssssk.....',
  '...kbbBBbbk.....',
  '..kbbyBBybbk....',
  '..kbbBBBBbbk....',
  '..kssbBBbssk....',
  '..kkk....kkk....',
  '................',
  '................',
  '................',
  '................',
];

// ENNEMIS
const P_GOON = { '.': null, 'k': '#1a1006', 'b': '#9b5a2a', 'B': '#6e3c18', 'w': '#fff', 'e': '#1a1a1a', 'm': '#f0c89a' };
const GOON_1 = [
  '................',
  '....kkkkkk......',
  '...kbbbbbbk.....',
  '..kbBbbbbBbk....',
  '..kbbbbbbbbk....',
  '..kbwbkkbwbk....',
  '..kbwekewbk.....',
  '..kbbbbbbbk.....',
  '..kbmmmmmbk.....',
  '..kbmkkkkmbk....',
  '..kbmmmmmmbk....',
  '...kBbbbbBk.....',
  '....kbb.bbk.....',
  '...kkk...kkk....',
  '...kk.....kk....',
  '................',
];
const GOON_2 = [
  '................',
  '....kkkkkk......',
  '...kbbbbbbk.....',
  '..kbBbbbbBbk....',
  '..kbbbbbbbbk....',
  '..kbwbkkbwbk....',
  '..kbwekewbk.....',
  '..kbbbbbbbk.....',
  '..kbmmmmmbk.....',
  '..kbmkkkkmbk....',
  '..kbmmmmmmbk....',
  '...kBbbbbBk.....',
  '...kbb...bbk....',
  '..kkk.....kkk...',
  '..kk.......kk...',
  '................',
];
const GOON_FLAT = [
  '................','................','................','................',
  '................','................','....kkkkkk......','...kbbbbbbk.....',
  '..kbwbkkbwbk....','..kbmmmmmmbk....','..kbmkkkkmbk....','.kbbbbbbbbbbk...',
  '.kkkkkkkkkkkk...','................','................','................',
];
const P_SHELL = { '.': null, 'k': '#0c2a14', 'g': '#37c24a', 'G': '#1f8a30', 's': '#d8ffe0', 'w': '#fff', 'e': '#102', 'y': '#ffd23b' };
const SHELL_1 = [
  '................',
  '.....kkkkk......',
  '....kgGGGgk.....',
  '...kgwkekwgk....',
  '...kgGGGGGgk....',
  '..kkggGGGggkk...',
  '..kGsGsGsGsGk...',
  '..kgGsGsGsGgk...',
  '..kGsGsGsGsGk...',
  '..kgGGGGGGGgk...',
  '..kkGGGGGGGkk...',
  '...kk.....kk....',
  '..kyk.....kyk...',
  '..kk.......kk...',
  '................',
  '................',
];
const SHELL_HIDE = [
  '................','................','................',
  '....kkkkkkk.....','...kGGsGsGGk....','..kGsGsGsGsGk...',
  '..kgGsGsGsGgk...','..kGsGsGsGsGk...','..kgGGGGGGGgk...',
  '..kkGGGGGGGkk...','...kkkkkkkkk....','................',
  '................','................','................','................',
];
const P_FLY = { '.': null, 'k': '#231a06', 'r': '#e2483b', 'R': '#a3261d', 'w': '#fff', 'e': '#111', 'm': '#ffd07a' };
const FLY_1 = [
  '..ww.......ww...',
  '.wwww.....wwww..',
  'wwwwww...wwwwww.',
  '.www....kkk..ww.',
  '......kRRRRRk...',
  '.....kRrrrrRk...',
  '.....krwkkwrk...',
  '.....krwekewk...',
  '.....kRrrrrrk...',
  '.....kmmmmmk....',
  '.....kmkkkmk....',
  '......kRRRk.....',
  '......kr.rk.....',
  '.....kk...kk....',
  '................',
  '................',
];
const FLY_2 = [
  '....ww...ww.....',
  '...wwww.wwww....',
  '....ww...ww.....',
  '......kkkk......',
  '.....kRRRRRk....',
  '.....kRrrrrRk...',
  '.....krwkkwrk...',
  '.....krwekewk...',
  '.....kRrrrrrk...',
  '.....kmmmmmk....',
  '.....kmkkkmk....',
  '......kRRRk.....',
  '......kr.rk.....',
  '.....kk...kk....',
  '................',
  '................',
];
// PLANTE DE TUYAU (bouton à dents) — instompable
const P_PLANT = { '.': null, 'k': '#0c3a16', 'g': '#46c24a', 'G': '#2a8a30', 'w': '#fff', 'r': '#e23b3b', 's': '#9be0a0' };
const PLANT_1 = [
  '....kkkkkk......', '...kggGGggk.....', '..kgGwrrwGgk....', '..kGwrrrrwGk....',
  '..kgwrwwrwgk....', '..kGwrrrrwGk....', '..kggGGGGggk....', '...kkggggkk.....',
  '....kgGGgk......', '...kgGggGgk.....', '..kgG.gg.Ggk....', '...k..gg..k.....',
  '......gg........', '......gg........', '................', '................',
];
const PLANT_2 = [
  '....kkkkkk......', '...kggGGggk.....', '..kgGGGGGGgk....', '..kGGwwwwGGk....',
  '..kgGwkkwGgk....', '..kGGwwwwGGk....', '..kggGGGGggk....', '...kkggggkk.....',
  '....kgGGgk......', '...kgGggGgk.....', '..kgG.gg.Ggk....', '...k..gg..k.....',
  '......gg........', '......gg........', '................', '................',
];
// LANCEUR (créature à fronde)
const P_LOB = { '.': null, 'k': '#241430', 'b': '#7a4ad0', 'B': '#5a2fa0', 'w': '#fff', 'e': '#120', 'y': '#ffd23b', 'm': '#e0c0ff' };
const LOB_1 = [
  '................', '....kkkkkk......', '...kbbBBbbk.....', '..kbBbbbbBbk....',
  '..kbwbkkbwbk....', '..kbwekewbbk....', '..kbBbbbbBbk....', '..kbbmyymbbk....',
  '..kbbmmmmbbk....', '...kBbbbbBk.....', '...kbb..bbk.....', '..kkk....kkk....',
  '..kk......kk....', '................', '................', '................',
];
const LOB_2 = [
  '......yy........', '....kkkkkk......', '...kbbBBbbk.....', '..kbBbbbbBbk....',
  '..kbwbkkbwbk....', '..kbwekewbbk....', '..kbBbbbbBbk....', '..kbbmyymbbk....',
  '..kbbmmmmbbk....', '...kBbbbbBk.....', '...kbb..bbk.....', '...kk....kk.....',
  '..kk........kk..', '................', '................', '................',
];

// OBJETS
const P_ITEM = { '.': null, 'k': '#3a1d06', 'r': '#ff5d3b', 'R': '#c12d12', 'w': '#fff', 'm': '#ffe2b0', 's': '#ffd23b', 'g': '#37c24a', 'o': '#ff9b3b', 'p': '#ff7bd5', 'P': '#c23a9a' };
const P_ONEUP = { ...P_ITEM, 'r': '#46d84a', 'R': '#1f8a30' }; // champignon 1UP (vert)
const P_FEATHER = { '.': null, 'k': '#1f4a6a', 'w': '#ffffff', 'c': '#9be0ff', 'C': '#46c8ff', 'y': '#ffd23b' };
const FEATHER = [
  '......kk........',
  '.....kwwk.......',
  '....kwwwck......',
  '...kwwwccCk.....',
  '..kwwwcccCk.....',
  '..kwwcccCCk.....',
  '.kwwcccCCk......',
  '.kwccccCCk......',
  '.kwcccCCk.......',
  '..kccCCk........',
  '...kkCk.........',
  '....kyk.........',
  '....kyk.........',
  '....kkk.........',
  '................',
  '................',
];
const MUSHROOM = [
  '................',
  '.....kkkkk......',
  '...kkrrrrrkk....',
  '..krrwwwrrRk....',
  '..krwwwwwrRk....',
  '.krrwwrrrrrRk...',
  '.krrrrrwwwrRk...',
  '.krwwwrrrrRRk...',
  '..kRRRRRRRRk....',
  '...kmmmmmk......',
  '..kmmkmmkmmk....',
  '..kmmmmmmmmk....',
  '...kmkkkmk......',
  '....kkkkk.......',
  '................',
  '................',
];
const FLOWER = [
  '......kkk.......',
  '.....koook......',
  '....korrrok.....',
  '...korwwwrok....',
  '...korwswwrok...',
  '...korwwwrok....',
  '....korrrok.....',
  '.....koook......',
  '......kgk.......',
  '.....kggk.......',
  '....kggkgk......',
  '...kgkggkgk.....',
  '....kkkgkkk.....',
  '......kgk.......',
  '......kkk.......',
  '................',
];
const STAR = [
  '.......k........',
  '......kwk.......',
  '......ksk.......',
  '.....kswsk......',
  'kkkkkswswskkkk..',
  '.kswswswswswsk..',
  '..ksswswswssk...',
  '...kswswswsk....',
  '...kswsswswsk...',
  '..kswsk.kswsk...',
  '..kssk...kssk...',
  '..kk.......kk...',
  '................',
  '................',
  '................',
  '................',
];
const COIN_1 = [
  '....kkkk....','...ksssk...','..kssYssk..','.kssYYYssk.',
  '.kssYkYssk.','.kssYkYssk.','.kssYYYssk.','.kssYkYssk.',
  '..kssYssk..','...ksssk...','....kkkk....','...........',
];
const COIN_2 = [
  '.....kk.....','.....ssk....','....kssk....','....kYsk....',
  '....kYsk....','....kYsk....','....kYsk....','....kYsk....',
  '....kssk....','.....ssk....','.....kk.....','...........',
];
const P_COIN = { '.': null, 'k': '#7a5a00', 's': '#ffe26b', 'Y': '#c79400' };

const P_PROJ = { '.': null, 'r': '#ff5d2e', 'y': '#ffd23b', 'w': '#fff' };
const FIREBALL = [
  '..ww..','.wyyw.','wyrryw','wyrryw','.wyyw.','..ww..',
];

// GEMME (collectible caché)
const P_GEM = { '.': null, 'k': '#0a2a4a', 'c': '#46d8ff', 'C': '#1f9fd8', 'w': '#eaffff' };
const GEM_1 = [
  '................','......kk........','.....kCCk.......','....kCccCk......',
  '...kCcwwcCk.....','..kCcwwwwcCk....','..kCcwwwwcCk....','...kCcwwcCk.....',
  '....kCccCk......','.....kCCk.......','......kk........','................',
  '................','................','................','................',
];
const GEM_2 = [
  '................','......kk........','.....kCCk.......','....kCwcCk......',
  '...kCwccCk......','..kCwcccCCk.....','..kCwcccCCk.....','...kCwccCk......',
  '....kCwcCk......','.....kCCk.......','......kk........','................',
  '................','................','................','................',
];

// ENNEMI À PICS (instompable)
const P_SPIKE = { '.': null, 'k': '#1a1024', 'p': '#b06ad8', 'P': '#7a3aa0', 'w': '#fff', 'e': '#120', 's': '#e0c0ff' };
const SPIKY_1 = [
  '...s..s..s..s...','..k..k..k..k....','...kkkkkkkk.....','..kpPpPpPpPk....',
  '..kpwkpkpwpk....','..kpwekepwpk....','..kpPpPpPpPk....','..kppppppppk....',
  '...kpPpPpPk.....','....kp..pk......','...kk....kk.....','..kk......kk....',
  '................','................','................','................',
];
const SPIKY_2 = [
  '...s..s..s..s...','..k..k..k..k....','...kkkkkkkk.....','..kpPpPpPpPk....',
  '..kpwkpkpwpk....','..kpwekepwpk....','..kpPpPpPpPk....','..kppppppppk....',
  '...kpPpPpPk.....','....kp..pk......','...kk....kk.....','...kk....kk.....',
  '..kk........kk..','................','................','................',
];

// BOSS (grande créature — 32x28)
const P_BOSS = { '.': null, 'k': '#241006', 'g': '#46b84a', 'G': '#2a7e30', 'd': '#1c5a22', 'w': '#fff', 'e': '#200', 'y': '#ffd23b', 'r': '#e2483b', 'h': '#9b5a2a' };
function bossFrame(mouthOpen) {
  return [
    '......yy..............yy.......',
    '.....ykky............ykky......',
    '......kk....kkkkkk....kk.......',
    '..........kgGGGGGgk...........',
    '.........kgGGGGGGGgk..........',
    '........kgGGddddGGGgk.........',
    '.......kgGwwkGGkwwGGgk........',
    '.......kgGwekGGkewGGgk........',
    '......kgGGGGGGGGGGGGGgk.......',
    '.....kgGGGGGGGGGGGGGGGgk......',
    '.....kgGG' + (mouthOpen ? 'krrrrrk' : 'kkkkkkk') + 'GGGgk......',
    '.....kgGG' + (mouthOpen ? 'rwwwwwr' : 'wwwwwww') + 'GGGgk......',
    '.....kgGG' + (mouthOpen ? 'krrrrrk' : 'kkkkkkk') + 'GGGgk......',
    '......kgGGGGGGGGGGGGGgk.......',
    '.......kdGGGGGGGGGGGdk........',
    '........kddGGGGGGddk..........',
    '.........kkddddddkk...........',
    '........kg.k....k.gk..........',
    '.......khk.kk..kk.khk.........',
    '.......kk...kk.k...kk.........',
    '......................',
  ];
}
const BOSS_1 = bossFrame(true);
const BOSS_2 = bossFrame(false);

// ---------------------------------------------------------------------------
// SKINS — variantes de couleur du héros
// ---------------------------------------------------------------------------
export const SKIN_LIST = [
  { id: 'bolt',    name: 'Bolt',     color: '#2f6cff' },
  { id: 'flame',   name: 'Flamme',   color: '#e23b3b' },
  { id: 'emerald', name: 'Émeraude', color: '#37c24a' },
  { id: 'shadow',  name: 'Ombre',    color: '#2a2a3a' },
  { id: 'royal',   name: 'Royal',    color: '#9a3ad0' },
  { id: 'sun',     name: 'Soleil',   color: '#ff9b3b' },
  { id: 'glacier', name: 'Glacier',  color: '#46c8ff' },
  { id: 'sakura',  name: 'Sakura',   color: '#ff7bd5' },
];

// Toutes les clés de sprite du héros à teinter
const HERO_KEYS = [
  'smallIdle', 'smallWalk', 'smallWalk2',
  'bigIdle', 'bigWalk', 'bigWalk2',
  'jump', 'duck',
];
const FIRE_KEYS = [
  'fireBigIdle', 'fireBigWalk', 'fireBigWalk2', 'fireJump',
  'fireSmallIdle', 'fireSmallWalk', 'fireSmallWalk2',
];

const BASE_BLUE     = '#2f6cff';  // couleur 'b' dans P_HERO
const BASE_FIRE_RED = '#ff5d2e';  // couleur 'b' dans P_FIRE

/**
 * Construit les packs de skins en récolorant les sprites du héros.
 * @param {object} A — l'objet renvoyé par buildArt()
 * @returns {object} skinSets — { bolt: A.hero, flame: {...}, ... }
 */
export function buildSkins(A) {
  const skinSets = {};
  for (const skin of SKIN_LIST) {
    if (skin.id === 'bolt') {
      // Le skin par défaut : pas de tint, on réutilise les sprites originaux
      skinSets.bolt = A.hero;
      continue;
    }
    const s = {};
    // Sprites normaux (costume bleu → nouvelle couleur)
    for (const k of HERO_KEYS) {
      s[k] = tinted(A.hero[k], `skin_${skin.id}_${k}`, BASE_BLUE, skin.color);
    }
    // Sprites fire (costume orange → nouvelle couleur, pour garder la cohérence)
    for (const k of FIRE_KEYS) {
      s[k] = tinted(A.hero[k], `skin_${skin.id}_${k}`, BASE_FIRE_RED, skin.color);
    }
    skinSets[skin.id] = s;
  }
  return skinSets;
}

export function buildArt() {
  const A = {};
  A.hero = {
    smallIdle: makeSprite('h_si', HERO_SMALL_1, P_HERO),
    smallWalk: makeSprite('h_sw', HERO_SMALL_2, P_HERO),
    smallWalk2: makeSprite('h_sw2', HERO_SMALL_2b, P_HERO),
    bigIdle: makeSprite('h_bi', HERO_BIG_1, P_HERO),
    bigWalk: makeSprite('h_bw', HERO_BIG_2, P_HERO),
    bigWalk2: makeSprite('h_bw2', HERO_BIG_2b, P_HERO),
    jump: makeSprite('h_j', HERO_JUMP, P_HERO),
    duck: makeSprite('h_d', HERO_DUCK, P_HERO),
    fireBigIdle: makeSprite('h_fbi', HERO_BIG_1, P_FIRE),
    fireBigWalk: makeSprite('h_fbw', HERO_BIG_2, P_FIRE),
    fireBigWalk2: makeSprite('h_fbw2', HERO_BIG_2b, P_FIRE),
    fireJump: makeSprite('h_fj', HERO_JUMP, P_FIRE),
    fireSmallIdle: makeSprite('h_fsi', HERO_SMALL_1, P_FIRE),
    fireSmallWalk: makeSprite('h_fsw', HERO_SMALL_2, P_FIRE),
    fireSmallWalk2: makeSprite('h_fsw2', HERO_SMALL_2b, P_FIRE),
  };
  // Construire les skins (doit être fait après A.hero)
  A.skins = buildSkins(A);
  A.goon = { a: makeSprite('g1', GOON_1, P_GOON), b: makeSprite('g2', GOON_2, P_GOON), flat: makeSprite('gf', GOON_FLAT, P_GOON) };
  A.shell = { a: makeSprite('s1', SHELL_1, P_SHELL), hide: makeSprite('sh', SHELL_HIDE, P_SHELL) };
  A.fly = { a: makeSprite('f1', FLY_1, P_FLY), b: makeSprite('f2', FLY_2, P_FLY) };
  A.plant = { a: makeSprite('pl1', PLANT_1, P_PLANT), b: makeSprite('pl2', PLANT_2, P_PLANT) };
  A.lob = { a: makeSprite('lo1', LOB_1, P_LOB), b: makeSprite('lo2', LOB_2, P_LOB) };
  A.item = {
    mushroom: makeSprite('mush', MUSHROOM, P_ITEM),
    oneup: makeSprite('oneup', MUSHROOM, P_ONEUP),
    feather: makeSprite('feather', FEATHER, P_FEATHER),
    flower: makeSprite('flow', FLOWER, P_ITEM),
    star: makeSprite('star', STAR, P_ITEM),
  };
  A.coin = { a: makeSprite('c1', COIN_1, P_COIN), b: makeSprite('c2', COIN_2, P_COIN) };
  A.fireball = makeSprite('fb', FIREBALL, P_PROJ);
  A.gem = { a: makeSprite('gem1', GEM_1, P_GEM), b: makeSprite('gem2', GEM_2, P_GEM) };
  A.spiky = { a: makeSprite('spk1', SPIKY_1, P_SPIKE), b: makeSprite('spk2', SPIKY_2, P_SPIKE) };
  A.boss = { a: makeSprite('boss1', BOSS_1, P_BOSS), b: makeSprite('boss2', BOSS_2, P_BOSS) };
  return A;
}

// ---------------------------------------------------------------------------
// TUILES — dessinées dynamiquement selon thème (sur un atlas 16x16 mis en cache)
const tileCache = new Map();
export function tileCanvas(type, theme) {
  const key = type + '|' + theme;
  if (tileCache.has(key)) return tileCache.get(key);
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  const c = cv.getContext('2d');
  drawTile(c, type, theme);
  tileCache.set(key, cv);
  return cv;
}

const THEME_COL = {
  overworld: { ground: '#b6622d', groundDark: '#7c3f17', groundTop: '#3fa24a', brick: '#c8623a', brickDark: '#8a3b1f', solid: '#9aa0b0' },
  underground:{ ground: '#3a5a8a', groundDark: '#22365a', groundTop: '#4fa0c8', brick: '#5566a0', brickDark: '#33406a', solid: '#7a86a8' },
  castle: { ground: '#7a7a86', groundDark: '#4a4a55', groundTop: '#9a9aa8', brick: '#8a6a6a', brickDark: '#5a4040', solid: '#9a9aa8' },
};

function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

function drawTile(c, type, theme) {
  const T = THEME_COL[theme] || THEME_COL.overworld;
  switch (type) {
    case 'X': // sol
      px(c,0,0,16,16,T.ground); px(c,0,0,16,4,T.groundTop);
      px(c,0,4,16,1,'#00000033');
      px(c,1,6,3,3,T.groundDark); px(c,8,9,3,3,T.groundDark); px(c,12,5,2,2,T.groundDark);
      px(c,0,15,16,1,'#00000055');
      break;
    case 'H': // bloc dur
      px(c,0,0,16,16,T.solid); px(c,0,0,16,2,'#ffffff44'); px(c,0,14,16,2,'#00000055');
      px(c,2,2,12,12,'#ffffff18'); px(c,2,2,12,1,'#ffffff55'); px(c,2,13,12,1,'#00000055');
      break;
    case 'B': // brique cassable
      px(c,0,0,16,16,T.brickDark);
      for (let i=0;i<2;i++) for (let j=0;j<4;j++){
        const ox=(j%2)*8 - (i? 4:0); px(c,((ox)+16)%16,i*8,7,7,T.brick);
        px(c,(((ox)+16)%16),i*8,7,1,'#ffffff33');
      }
      break;
    case '?': // bloc mystère
    case 'M':
    case 'U':
    case 'Q':
      px(c,0,0,16,16,'#caa12a'); px(c,0,0,16,16,'#caa12a');
      px(c,1,1,14,14,'#ffcf3b'); px(c,1,1,14,2,'#ffe79a'); px(c,1,13,14,2,'#a3760f');
      px(c,2,2,2,2,'#fff'); px(c,12,2,2,2,'#fff'); px(c,2,12,2,2,'#fff'); px(c,12,12,2,2,'#fff');
      // point d'interrogation
      px(c,6,4,4,2,'#7a4a00'); px(c,9,5,1,3,'#7a4a00'); px(c,7,7,2,2,'#7a4a00'); px(c,7,10,2,2,'#7a4a00');
      break;
    case 'L': // bloc 1UP (vert)
      px(c,0,0,16,16,'#1f8a30');
      px(c,1,1,14,14,'#46d84a'); px(c,1,1,14,2,'#9bf0a0'); px(c,1,13,14,2,'#1f8a30');
      px(c,2,2,2,2,'#fff'); px(c,12,2,2,2,'#fff'); px(c,2,12,2,2,'#fff'); px(c,12,12,2,2,'#fff');
      px(c,6,5,1,6,'#0c4a18'); px(c,7,5,2,2,'#0c4a18'); px(c,9,5,1,6,'#0c4a18'); // motif "1"
      break;
    case 'W': // bloc plume (vol plané)
      px(c,0,0,16,16,'#1f6a9a');
      px(c,1,1,14,14,'#46c8ff'); px(c,1,1,14,2,'#bfeaff'); px(c,1,13,14,2,'#1f6a9a');
      px(c,2,2,2,2,'#fff'); px(c,12,2,2,2,'#fff'); px(c,2,12,2,2,'#fff'); px(c,12,12,2,2,'#fff');
      // petite aile blanche
      px(c,5,6,6,1,'#fff'); px(c,6,7,5,1,'#eaffff'); px(c,7,8,4,1,'#fff'); px(c,8,9,3,1,'#eaffff');
      break;
    case 'D': // bloc mystère épuisé
      px(c,0,0,16,16,'#9a7a3a'); px(c,1,1,14,14,'#7a5a2a'); px(c,1,1,14,2,'#a98a4a');
      break;
    case 'p': case 'P': // tuyau (corps / tête) — vert
      px(c,0,0,16,16,'#1f8a30');
      if (type==='P'){ px(c,-1,0,18,5,'#37c24a'); px(c,1,1,14,3,'#7fe88a'); }
      else { px(c,1,0,14,16,'#37c24a'); px(c,2,0,3,16,'#7fe88a'); }
      px(c,11,0,2,16,'#1f8a30');
      break;
    case 'Q': // tuyau-warp (tête, descendre dedans) — violet brillant
      px(c,0,0,16,16,'#5a1f8a');
      px(c,-1,0,18,5,'#9a4ad0'); px(c,1,1,14,3,'#d89bf0');
      px(c,11,0,2,16,'#5a1f8a');
      px(c,6,7,4,2,'#ffd23b'); px(c,7,9,2,3,'#ffd23b'); // flèche bas
      break;
    case '^': // pics
      px(c,0,8,16,8,'#555');
      c.fillStyle='#cfd6e0';
      for (let i=0;i<4;i++){ c.beginPath(); c.moveTo(i*4,16); c.lineTo(i*4+2,5); c.lineTo(i*4+4,16); c.closePath(); c.fill(); }
      break;
    case '=': // plateforme (passe-au-travers, solide dessus)
      px(c,0,0,16,6,'#caa057'); px(c,0,0,16,2,'#e8c889'); px(c,0,5,16,1,'#7a5a2a');
      break;
    case 'G': // mât d'arrivée (col)
      px(c,7,0,2,16,'#cfd6e0'); px(c,8,0,1,16,'#9aa0b0');
      break;
    case 'T': // ressort / trampoline
      px(c,2,11,12,5,'#9aa0b0'); px(c,2,11,12,1,'#cfd6e0');
      px(c,3,5,10,2,'#ff5d5d'); px(c,3,8,10,2,'#ff7b7b');
      px(c,4,4,8,2,'#ffd23b'); px(c,3,3,10,2,'#cfd6e0'); px(c,3,3,10,1,'#fff');
      break;
    case 'C': // checkpoint éteint
      px(c,7,0,2,16,'#7a6a4a'); px(c,9,2,6,4,'#9aa0b0');
      break;
    case 'c': // checkpoint activé (lumineux)
      px(c,7,0,2,16,'#cfd6e0'); px(c,9,2,6,5,'#46d8ff'); px(c,9,2,6,1,'#eaffff');
      break;
    default: break;
  }
}
