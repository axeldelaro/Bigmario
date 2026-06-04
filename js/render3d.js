// render3d.js — rendu 3D (WebGL/Three.js) du monde de jeu, piloté par la
// simulation 2D existante (style 2.5D). Chargé dynamiquement ; en cas d'échec
// (pas de réseau / WebGL indisponible), l'appelant retombe sur le rendu 2D.
import { TILE, VIEW_W, VIEW_H } from './core.js';
import { tileCanvas } from './art.js';

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
let THREE = null;
let R = null;          // état du renderer
let failed = false;

const U = (px) => px / TILE;            // pixels -> unités (1 tuile = 1 unité)
const VW = VIEW_W / TILE;               // largeur visible en unités (20)
const VH = VIEW_H / TILE;               // hauteur visible (12)

const THEME_SKY = { overworld: 0x7ec8ff, underground: 0x0b1830, castle: 0x1a0f14 };
const THEME_FOG = { overworld: 0x9fd6ff, underground: 0x0b1830, castle: 0x140a10 };

// couleurs des tuiles (top, side)
const TILE_COL = {
  X: { top: 0x4fbe57, side: 0xb6622d },
  H: { top: 0xb0b6c4, side: 0x8a8f9c },
  B: { top: 0xd07a4a, side: 0x9a4a26 },
  '?': { top: 0xffd23b, side: 0xc9961f }, M: { top: 0xffd23b, side: 0xc9961f }, U: { top: 0xffd23b, side: 0xc9961f },
  L: { top: 0x46d84a, side: 0x1f8a30 }, W: { top: 0x46c8ff, side: 0x1f6a9a }, D: { top: 0x9a7a3a, side: 0x6a4a1f },
  p: { top: 0x37c24a, side: 0x1f8a30 }, P: { top: 0x7fe88a, side: 0x1f8a30 },
  T: { top: 0xff5d5d, side: 0x9aa0b0 }, '=': { top: 0xe8c889, side: 0x7a5a2a },
};

// ---------------------------------------------------------------------------
// Textures 3D détaillées (canvas 64px), générées par code. Bien plus riches
// qu'un simple mapping des 16px du 2D. Dessous=dessus=côté selon le type.
const TEX3D = new Map();
const GP = {
  overworld: { gT: '#62cf5b', gL: '#9bf07e', gD: '#3a9a44', gS: '#2c7a36', d: '#b06a32', dD: '#7c451c', dL: '#cd8c52', pe: '#5e3614', stone: '#9aa0b0' },
  underground: { gT: '#56b6cf', gL: '#8fe3f0', gD: '#2a6f86', gS: '#1d4f63', d: '#3a5a8a', dD: '#22365a', dL: '#5a86b8', pe: '#172642', stone: '#6c79a8' },
  castle: { gT: '#a6a6b4', gL: '#c8c8d4', gD: '#70707e', gS: '#54545f', d: '#7a7a86', dD: '#4a4a55', dL: '#9a9aa8', pe: '#3a3a44', stone: '#8a6f6f' },
};
function tex3D(type, face, theme) {
  const k = type + '|' + face + '|' + theme;
  if (TEX3D.has(k)) return TEX3D.get(k);
  const S = 64, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  drawFace(cv.getContext('2d'), S, type, face, theme);
  TEX3D.set(k, cv); return cv;
}
function drawFace(c, S, type, face, theme) {
  const u = S / 16, P = GP[theme] || GP.overworld;
  const R_ = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); };
  const dot = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x * u, y * u, r * u, 0, 7); c.fill(); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (...a) => a[(Math.random() * a.length) | 0];

  const grass = () => { R_(0, 0, 16, 16, P.gD); for (let i = 0; i < 90; i++) R_(rnd(0, 16), rnd(0, 16), 0.4, rnd(0.8, 2.2), pick(P.gT, P.gL, P.gT)); for (let i = 0; i < 30; i++) dot(rnd(0, 16), rnd(0, 16), 0.25, P.gS); };
  const dirt = (fringe) => {
    R_(0, 0, 16, 16, P.d);
    for (let i = 0; i < 40; i++) dot(rnd(1, 15), rnd(fringe ? 4 : 1, 15), rnd(0.4, 1.1), pick(P.dD, P.dL, P.pe));
    for (let i = 0; i < 6; i++) { const x = rnd(2, 14); c.strokeStyle = P.dD; c.lineWidth = u * 0.4; c.beginPath(); c.moveTo(x * u, rnd(4, 8) * u); c.lineTo((x + rnd(-2, 2)) * u, rnd(10, 15) * u); c.stroke(); }
    if (fringe) { R_(0, 0, 16, 2.6, P.gD); for (let i = 0; i < 26; i++) R_(rnd(0, 16), 1.5, 0.5, rnd(1, 2.4), pick(P.gT, P.gL)); }
  };
  const stone = (dim) => {
    const s = dim ? '#6a5f5f' : P.stone;
    R_(0, 0, 16, 16, s);
    R_(0, 0, 16, 1, '#ffffff55'); R_(0, 0, 1, 16, '#ffffff44'); R_(0, 15, 16, 1, '#00000066'); R_(15, 0, 1, 16, '#00000055');
    for (let i = 0; i < 26; i++) dot(rnd(2, 14), rnd(2, 14), 0.3, pick('#ffffff33', '#00000033'));
    [[2.4, 2.4], [13.6, 2.4], [2.4, 13.6], [13.6, 13.6]].forEach(([x, y]) => { dot(x, y, 0.9, '#00000055'); dot(x - 0.25, y - 0.25, 0.5, '#ffffff66'); });
  };
  const brick = () => {
    R_(0, 0, 16, 16, '#5a2f18');
    for (let r = 0; r < 4; r++) { const off = (r % 2) ? -4 : 0; for (let bx = -8; bx < 16; bx += 8) { const x = bx + off + 0.5, y = r * 4 + 0.5, w = 7, h = 3; R_(x, y, w, h, pick('#c8623a', '#bd5a33', '#cf6b42')); R_(x, y, w, 0.7, '#e08a5e'); R_(x, y + h - 0.7, w, 0.7, '#8a3b1f'); } }
  };
  const qblock = (faceCol, edge, sym) => {
    R_(0, 0, 16, 16, edge); R_(1, 1, 14, 14, faceCol);
    R_(1, 1, 14, 1.2, '#ffffff66'); R_(1, 13.8, 14, 1.2, '#00000055');
    [[2.6, 2.6], [13.4, 2.6], [2.6, 13.4], [13.4, 13.4]].forEach(p => dot(p[0], p[1], 0.7, '#ffffffcc'));
    c.fillStyle = '#00000088'; c.font = 'bold ' + (9 * u) + 'px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (sym) c.fillText(sym, 8 * u, 9 * u);
  };
  const pipe = (head) => {
    R_(0, 0, 16, 16, '#1f8a30');
    for (let x = 1; x < 15; x += 2) R_(x, 0, 1.4, 16, x % 4 === 1 ? '#46d058' : '#2aa23e');
    R_(2, 0, 2.4, 16, '#7fe88a'); R_(0, 0, 1, 16, '#0c5a1c'); R_(15, 0, 1, 16, '#0c5a1c');
    if (head) { R_(-1, 0, 18, 4, '#37c24a'); R_(-1, 0, 18, 1.4, '#9bf0a0'); R_(-1, 3.2, 18, 0.8, '#0c5a1c'); }
  };
  const plank = () => {
    R_(0, 0, 16, 16, '#caa057'); R_(0, 0, 16, 1, '#e8c889');
    R_(0, 5.3, 16, 0.6, '#7a5a2a'); R_(0, 10.6, 16, 0.6, '#7a5a2a');
    for (let i = 0; i < 26; i++) R_(rnd(0, 15), rnd(0, 16), rnd(1, 3), 0.4, '#a8843f');
    [[2, 2.6], [14, 2.6], [2, 13.4], [14, 13.4]].forEach(p => dot(p[0], p[1], 0.5, '#5a4020'));
  };
  const spring = () => { R_(0, 0, 16, 16, '#3a4250'); R_(2, 11, 12, 5, '#9aa0b0'); R_(2, 11, 12, 1, '#cfd6e0'); R_(3, 4.5, 10, 2, '#ff5d5d'); R_(3, 7.5, 10, 2, '#ff7b7b'); R_(4, 2.5, 8, 2, '#ffd23b'); R_(4, 2.5, 8, 0.8, '#fff2a0'); };

  switch (type) {
    case 'X': (face === 'top') ? grass() : dirt(true); break;
    case 'H': stone(false); break;
    case 'D': stone(true); break;
    case 'B': brick(); break;
    case '?': case 'M': qblock('#ffcf3b', '#a3760f', '?'); break;
    case 'U': qblock('#ffcf3b', '#a3760f', '★'); break;
    case 'L': qblock('#46d84a', '#1f7a2c', '1'); break;
    case 'W': qblock('#46c8ff', '#1f6a9a', '✦'); break;
    case 'p': pipe(false); break;
    case 'P': pipe(true); break;
    case 'T': spring(); break;
    case '=': plank(); break;
    default: R_(0, 0, 16, 16, '#888');
  }
}

export async function ensure3D() {
  if (R) return true;
  if (failed) return false;
  try {
    THREE = await import(/* @vite-ignore */ THREE_URL);
    R = buildRenderer();
    return true;
  } catch (e) {
    console.warn('3D indisponible, repli 2D :', e && e.message);
    failed = true;
    return false;
  }
}
export function is3DReady() { return !!R; }
export function get3DCanvas() { return R ? R.renderer.domElement : null; }

function buildRenderer() {
  const canvas = document.createElement('canvas');
  canvas.id = 'screen3d';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setClearColor(0x7ec8ff, 1);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // rendu plus réaliste : tone mapping cinématique
  if (THREE.ACESFilmicToneMapping) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3; }

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fd6ff, 22, 52);

  // caméra orthographique inclinée -> cadrage stable + profondeur visible
  const cam = new THREE.OrthographicCamera(-VW / 2, VW / 2, VH / 2, -VH / 2, -60, 120);
  cam.position.set(0, 4.6, 15);
  cam.up.set(0, 1, 0);

  // lumières (compensées pour l'ACES) : ambiant + clé directionnelle (ombres douces) + contre-jour
  const amb = new THREE.HemisphereLight(0xfdfbff, 0x44505e, 1.15);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xfff1d0, 2.0);
  key.position.set(-7, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  const sc = key.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.5);
  fill.position.set(8, 6, 6); scene.add(fill);

  const root = new THREE.Group(); scene.add(root);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1.15);
  const matCache = new Map();
  const mat = (hex) => { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, metalness: 0.05 })); return matCache.get(hex); };

  // sprite (canvas pixel-art) -> texture nette
  const texCache = new Map();
  const tex = (canvasEl, key2) => {
    if (texCache.has(key2)) return texCache.get(key2);
    const t = new THREE.CanvasTexture(canvasEl);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4; texCache.set(key2, t); return t;
  };
  // matériaux par FACE (dessus / côtés) avec textures 3D détaillées
  const tileMatCache = new Map();
  const faceMat = (type, face, theme) => {
    const map = tex(tex3D(type, face, theme), 'm:' + type + face + theme);
    const emissive = (type === '?' || type === 'M' || type === 'U' || type === 'L' || type === 'W');
    return new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.04, emissive: emissive ? 0x332a00 : 0x000000, emissiveMap: emissive ? map : null, emissiveIntensity: emissive ? 0.35 : 1 });
  };
  const tileMats = (type, theme) => {
    const k = type + '|' + theme;
    if (tileMatCache.has(k)) return tileMatCache.get(k);
    const side = faceMat(type, 'side', theme), top = faceMat(type, 'top', theme);
    const arr = [side, side, top, side, side, side]; // +x,-x,+y(top),-y,+z,-z
    tileMatCache.set(k, arr); return arr;
  };

  return {
    THREE, renderer, scene, cam, root, boxGeo, mat, tex, tileMats, key,
    pools: { tile: [], ti: 0, ent: new Map() },
    models: {}, skyCache: new Map(),
  };
}

// texture de ciel en dégradé (par thème) pour le fond 3D
function skyTexture(theme) {
  if (R.skyCache.has(theme)) return R.skyCache.get(theme);
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256;
  const c = cv.getContext('2d'); const g = c.createLinearGradient(0, 0, 0, 256);
  if (theme === 'underground') { g.addColorStop(0, '#10325a'); g.addColorStop(1, '#03060f'); }
  else if (theme === 'castle') { g.addColorStop(0, '#3a1622'); g.addColorStop(1, '#0a0508'); }
  else { g.addColorStop(0, '#5aa8ff'); g.addColorStop(0.55, '#9fd6ff'); g.addColorStop(1, '#dff0ff'); }
  c.fillStyle = g; c.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(cv); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  R.skyCache.set(theme, t); return t;
}

// ---- pools ----
function tileMesh() {
  const m = new THREE.Mesh(R.boxGeo, R.mat(0xffffff));
  m.castShadow = true; m.receiveShadow = true;
  R.root.add(m); R.pools.tile.push(m); return m;
}
function getTile() {
  const p = R.pools.tile;
  const m = p[R.pools.ti] || tileMesh();
  R.pools.ti++; m.visible = true; return m;
}

// groupe d'entité réutilisable, créé par catégorie
function entGroup(key, factory) {
  let bucket = R.pools.ent.get(key);
  if (!bucket) { bucket = { list: [], i: 0 }; R.pools.ent.set(key, bucket); }
  let g = bucket.list[bucket.i];
  if (!g) { g = factory(); R.root.add(g); bucket.list.push(g); }
  bucket.i++; g.visible = true; return g;
}

function box(w, h, d, hex, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), R.mat(hex));
  m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, y, z); return m;
}

// ---- textures d'entités (canvas 48px) ----
const ETEX = new Map();
function entCanvas(name) {
  if (ETEX.has(name)) return ETEX.get(name);
  const S = 48, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  drawEnt(cv.getContext('2d'), S, name); ETEX.set(name, cv); return cv;
}
function drawEnt(c, S, name) {
  const u = S / 16;
  const R_ = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); };
  const dot = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x * u, y * u, r * u, 0, 7); c.fill(); };
  const rnd = (a, b) => a + Math.random() * (b - a), pick = (...a) => a[(Math.random() * a.length) | 0];
  const speck = (n, col, x0 = 0, y0 = 0, x1 = 16, y1 = 16) => { for (let i = 0; i < n; i++) dot(rnd(x0, x1), rnd(y0, y1), rnd(0.25, 0.7), col); };
  const bevel = () => { R_(0, 0, 16, 1, '#ffffff33'); R_(0, 15, 16, 1, '#00000040'); };
  const eyes = (col = '#241b14') => { dot(5.4, 7, 1.5, '#fff'); dot(10.6, 7, 1.5, '#fff'); dot(5.6, 7.2, 0.75, col); dot(10.8, 7.2, 0.75, col); };
  switch (name) {
    case 'skin': R_(0, 0, 16, 16, '#ffcb9c'); speck(18, '#f0b488'); bevel(); break;
    case 'face':
      R_(0, 0, 16, 16, '#ffcb9c');
      c.strokeStyle = '#5a3a22'; c.lineWidth = u * 1.1; c.beginPath(); c.moveTo(3.4 * u, 5 * u); c.lineTo(7 * u, 5.4 * u); c.moveTo(9 * u, 5.4 * u); c.lineTo(12.6 * u, 5 * u); c.stroke(); // sourcils
      eyes(); R_(7.4, 8.4, 1.2, 1.6, '#e8a878'); // nez
      c.strokeStyle = '#7a3a2a'; c.lineWidth = u * 0.9; c.beginPath(); c.arc(8 * u, 11 * u, 2.2 * u, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); // sourire
      dot(3.4, 10.2, 1, '#ffb0a0'); dot(12.6, 10.2, 1, '#ffb0a0'); break; // joues
    case 'cap': R_(0, 0, 16, 16, '#e23b3b'); R_(0, 0, 16, 4, '#f25a5a'); R_(0, 11, 16, 5, '#a31d1d'); dot(8, 5.5, 2, '#fff'); c.fillStyle = '#e23b3b'; c.font = 'bold ' + (4 * u) + 'px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('B', 8 * u, 5.6 * u); bevel(); break;
    case 'shoe': R_(0, 0, 16, 16, '#3a2410'); R_(0, 11, 16, 5, '#241608'); R_(0, 10.5, 16, 1, '#5a3a1a'); bevel(); break;
    case 'overalls': case 'overalls_fire': case 'overalls_glide': {
      const base = name === 'overalls_fire' ? '#ff5d2e' : name === 'overalls_glide' ? '#3aa0e0' : '#2f6cff';
      const dk = name === 'overalls_fire' ? '#c23010' : name === 'overalls_glide' ? '#1f6aa0' : '#1c3fb0';
      R_(0, 0, 16, 16, base); R_(6, 0, 4, 16, dk); // bavette centrale
      dot(8, 3, 1.1, '#ffcf3b'); dot(8, 3, 0.5, '#a3760f'); // bouton
      R_(2, 2, 1.4, 12, dk); R_(12.6, 2, 1.4, 12, dk); // bretelles
      for (let y = 1; y < 16; y += 2) { R_(4.6, y, 0.4, 1, '#ffffff44'); R_(11, y, 0.4, 1, '#ffffff44'); } // coutures
      R_(4, 10, 8, 4, dk); R_(5, 11, 6, 0.5, '#00000044'); bevel(); break;
    }
    case 'fur': R_(0, 0, 16, 16, '#9b5a2a'); for (let i = 0; i < 50; i++) R_(rnd(0, 16), rnd(0, 16), 0.4, rnd(1, 2.4), pick('#7c451c', '#b06a32', '#8a4f22')); bevel(); break;
    case 'goon_face':
      R_(0, 0, 16, 16, '#9b5a2a'); for (let i = 0; i < 30; i++) R_(rnd(0, 16), rnd(0, 16), 0.4, rnd(1, 2), pick('#7c451c', '#b06a32'));
      c.strokeStyle = '#3a2410'; c.lineWidth = u * 1.3; c.beginPath(); c.moveTo(2.6 * u, 5.4 * u); c.lineTo(6.4 * u, 6.6 * u); c.moveTo(9.6 * u, 6.6 * u); c.lineTo(13.4 * u, 5.4 * u); c.stroke();
      eyes('#1a1006'); R_(2, 10, 12, 5, '#f0c89a'); R_(2, 10, 12, 1, '#d8a878'); for (let i = 0; i < 5; i++) R_(3 + i * 2.4, 10, 0.5, 5, '#3a2410'); break; // dents
    case 'shell_top':
      R_(0, 0, 16, 16, '#37c24a');
      c.strokeStyle = '#1f8a30'; c.lineWidth = u * 0.8;
      for (let yy = 2; yy < 16; yy += 4) for (let xx = 2; xx < 16; xx += 4) { c.beginPath(); c.arc((xx + (yy % 8 === 2 ? 0 : 2)) * u, yy * u, 2 * u, 0, 6.3); c.stroke(); }
      R_(0, 0, 16, 2, '#7fe88a'); R_(0, 14, 16, 2, '#0c5a1c'); break;
    case 'shell_skin': R_(0, 0, 16, 16, '#d8ffe0'); speck(14, '#9be0a8'); break;
    case 'fly_body': R_(0, 0, 16, 16, '#e2483b'); R_(0, 11, 16, 5, '#a3261d'); for (let i = 0; i < 18; i++) R_(rnd(1, 15), rnd(1, 11), 0.5, rnd(1, 2), '#c2382c'); eyes('#200'); break;
    case 'wing': { const g = c.createLinearGradient(0, 0, S, 0); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfe0ff'); c.fillStyle = g; c.fillRect(0, 0, S, S); c.strokeStyle = '#b0c4e8'; c.lineWidth = u * 0.5; for (let i = 2; i < 16; i += 3) { c.beginPath(); c.moveTo(0, i * u); c.lineTo(S, (i - 2) * u); c.stroke(); } break; }
    case 'spiky_body': R_(0, 0, 16, 16, '#b06ad8'); R_(0, 11, 16, 5, '#7a3aa0'); speck(20, '#9a52c8'); eyes('#1a0a24'); R_(4, 11, 8, 4, '#e0c0ff'); for (let i = 0; i < 4; i++) R_(4.5 + i * 2, 11, 0.5, 4, '#7a3aa0'); break;
    case 'boss_body':
      R_(0, 0, 16, 16, '#37c24a');
      c.strokeStyle = '#1f8a30'; c.lineWidth = u * 0.7; for (let yy = 1; yy < 16; yy += 3) for (let xx = 1; xx < 16; xx += 3) { c.beginPath(); c.arc((xx + (yy % 6 === 1 ? 0 : 1.5)) * u, yy * u, 1.5 * u, 0, 6.3); c.stroke(); }
      R_(0, 0, 16, 2, '#7fe88a'); R_(0, 13, 16, 3, '#0c5a1c'); break;
    case 'boss_face':
      R_(0, 0, 16, 16, '#fff'); R_(0, 0, 16, 5, '#e8a878'); // lèvre
      R_(1, 5, 14, 3, '#ffffff'); for (let i = 0; i < 6; i++) { R_(1 + i * 2.3, 5, 0.5, 3, '#cdd'); } // dents
      R_(2, 9, 12, 5, '#5a1010'); break; // gorge
    case 'mush_cap': R_(0, 0, 16, 16, '#c12d12'); R_(0, 0, 16, 8, '#ff5d3b'); R_(0, 7, 16, 1, '#ffffff66'); for (const p of [[4, 3.5, 2], [11, 4, 1.6], [8, 6, 1.3]]) { dot(p[0], p[1], p[2], '#fff'); } bevel(); break;
    case 'mush_stem': R_(0, 0, 16, 16, '#ffe2b0'); R_(0, 11, 16, 5, '#e8c890'); dot(5, 8, 1, '#241b14'); dot(11, 8, 1, '#241b14'); break;
    case 'oneup_cap': R_(0, 0, 16, 16, '#1f8a30'); R_(0, 0, 16, 8, '#46d84a'); for (const p of [[4, 3.5, 2], [11, 4, 1.6], [8, 6, 1.3]]) dot(p[0], p[1], p[2], '#fff'); bevel(); break;
    case 'item_flower': R_(0, 0, 16, 16, '#37c24a'); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; dot(8 + Math.cos(a) * 4, 8 + Math.sin(a) * 4, 2.2, i % 2 ? '#ff5d2e' : '#ffd23b'); } dot(8, 8, 2, '#fff'); dot(8, 8, 1, '#ffd23b'); break;
    case 'item_star': { R_(0, 0, 16, 16, '#caa12a'); c.fillStyle = '#ffd23b'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 3 : 7); c.lineTo((8 + Math.cos(a) * r) * u, (8 + Math.sin(a) * r) * u); } c.closePath(); c.fill(); dot(6, 8, 0.9, '#241b14'); dot(10, 8, 0.9, '#241b14'); break; }
    case 'item_feather': { const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#fff'); g.addColorStop(1, '#46c8ff'); c.fillStyle = g; c.fillRect(0, 0, S, S); R_(7.4, 1, 1.2, 14, '#ffd23b'); c.strokeStyle = '#1f6a9a'; c.lineWidth = u * 0.4; for (let i = 2; i < 15; i += 2) { c.beginPath(); c.moveTo(8 * u, i * u); c.lineTo((8 + (i % 4 ? 4 : -4)) * u, (i - 2) * u); c.stroke(); } break; }
    case 'coin_face': { const g = c.createRadialGradient(S * 0.4, S * 0.35, 2, S * 0.5, S * 0.5, S * 0.6); g.addColorStop(0, '#fff7c0'); g.addColorStop(0.5, '#ffd23b'); g.addColorStop(1, '#c9961f'); c.fillStyle = g; c.beginPath(); c.arc(8 * u, 8 * u, 7 * u, 0, 6.3); c.fill(); c.strokeStyle = '#a3760f'; c.lineWidth = u * 0.8; c.beginPath(); c.arc(8 * u, 8 * u, 5 * u, 0, 6.3); c.stroke(); c.fillStyle = '#a3760f'; c.font = 'bold ' + (7 * u) + 'px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', 8 * u, 8.4 * u); R_(4, 3, 1, 4, '#ffffffaa'); break; }
    case 'coin_edge': R_(0, 0, 16, 16, '#c9961f'); break;
    case 'wood': R_(0, 0, 16, 16, '#caa057'); R_(0, 0, 16, 1, '#e8c889'); R_(0, 7.6, 16, 0.6, '#7a5a2a'); for (let i = 0; i < 22; i++) R_(rnd(0, 15), rnd(0, 16), rnd(1, 3), 0.4, '#a8843f'); break;
    default: R_(0, 0, 16, 16, '#888');
  }
}
function texMat(name, opts = {}) {
  R._em = R._em || new Map();
  const key = name + (opts.glow ? '#g' : '');
  if (R._em.has(key)) return R._em.get(key);
  const map = R.tex(entCanvas(name), 'et:' + key);
  const m = new THREE.MeshStandardMaterial({ map, roughness: opts.rough ?? 0.62, metalness: opts.metal ?? 0.05, emissive: opts.glow ? (opts.glow) : 0x000000, emissiveMap: opts.glow ? map : null, emissiveIntensity: opts.gi ?? 0.4 });
  R._em.set(key, m); return m;
}
function texBox(w, h, d, all, front, x = 0, y = 0, z = 0) {
  const a = texMat(all);
  const mats = front ? [a, a, a, a, texMat(front), a] : a;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); return m;
}

// membre articulé : pivot (hanche/épaule) avec le membre qui pend en dessous
function limb(px, py, w, h, d, tx) {
  const piv = new THREE.Group(); piv.position.set(px, py, 0);
  piv.add(texBox(w, h, d, tx, null, 0, -h / 2, 0));
  return piv;
}
// ---- modèles texturés ----
function makeHero() {
  const g = new THREE.Group();
  const torso = texBox(0.95, 0.55, 0.85, 'overalls', 'overalls', 0, 0.28, 0); g.add(torso);
  const head = texBox(0.9, 0.62, 0.84, 'skin', 'face', 0, 0.82, 0); g.add(head);
  const cap = texBox(1.0, 0.3, 0.96, 'cap', 'cap', 0, 1.12, 0); g.add(cap);
  const lL = limb(-0.22, 0.0, 0.36, 0.5, 0.52, 'shoe');
  const lR = limb(0.22, 0.0, 0.36, 0.5, 0.52, 'shoe');
  const aL = limb(-0.56, 0.55, 0.22, 0.42, 0.5, 'skin');
  const aR = limb(0.56, 0.55, 0.22, 0.42, 0.5, 'skin');
  g.add(lL, lR, aL, aR);
  g.userData = { torso, head, cap, lL, lR, aL, aR };
  return g;
}
function makeGoon() {
  const g = new THREE.Group();
  g.add(texBox(0.95, 0.78, 0.85, 'fur', 'goon_face', 0, 0.4, 0));
  g.add(texBox(0.3, 0.18, 0.5, 'shoe', null, -0.24, -0.05, 0));
  g.add(texBox(0.3, 0.18, 0.5, 'shoe', null, 0.24, -0.05, 0));
  return g;
}
function makeShell() {
  const g = new THREE.Group();
  g.add(texBox(0.9, 0.5, 0.85, 'shell_skin', null, 0, 0.28, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, 6.3, 0, Math.PI / 2), texMat('shell_top'));
  dome.scale.set(1, 1.1, 1); dome.position.y = 0.5; dome.castShadow = true; g.add(dome);
  return g;
}
function makeFly() {
  const g = new THREE.Group();
  g.add(texBox(0.72, 0.62, 0.72, 'fly_body', 'fly_body', 0, 0.42, 0));
  const w1 = texBox(0.55, 0.55, 0.06, 'wing', null, -0.55, 0.6, 0);
  const w2 = texBox(0.55, 0.55, 0.06, 'wing', null, 0.55, 0.6, 0);
  g.add(w1); g.add(w2); g.userData = { w1, w2 }; return g;
}
function makeSpiky() {
  const g = new THREE.Group();
  g.add(texBox(0.88, 0.62, 0.82, 'spiky_body', 'spiky_body', 0, 0.36, 0));
  for (let i = -1; i <= 1; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 5), R.mat(0xe0c0ff)); s.castShadow = true; s.position.set(i * 0.26, 0.78, 0); g.add(s); }
  return g;
}
function makeBoss() {
  const g = new THREE.Group();
  g.add(texBox(2.5, 2.1, 2.1, 'boss_body', 'boss_body', 0, 1.05, 0));
  g.add(texBox(1.1, 1.0, 0.6, 'boss_face', 'boss_face', 0, 1.7, 0.95));
  const eL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), texMat('fly_body', { glow: 0xff3000, gi: 0.6 }));
  eL.position.set(0.55, 2.1, 0.9); g.add(eL);
  const eR = eL.clone(); eR.position.x = -0.55; g.add(eR);
  for (let i = -2; i <= 2; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.66, 5), R.mat(0xeafff0)); s.castShadow = true; s.position.set(i * 0.52, 2.25, -0.6); g.add(s); }
  return g;
}
function makeCoin() { return texBox(0.62, 0.62, 0.14, 'coin_edge', 'coin_face'); }
function makeGem() { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.36), new THREE.MeshStandardMaterial({ color: 0x46d8ff, roughness: 0.1, metalness: 0.35, emissive: 0x0a3a55, emissiveIntensity: 0.6 })); m.castShadow = true; return m; }
function makeItem(kind) { const g = new THREE.Group(); g.add(makeItemMesh(kind)); return g; }
function makeItemMesh(kind) {
  if (kind === 'mushroom') { const g = new THREE.Group(); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8, 0, 6.3, 0, Math.PI / 2), texMat('mush_cap')); cap.position.y = 0.42; cap.castShadow = true; g.add(cap); g.add(texBox(0.5, 0.45, 0.5, 'mush_stem', 'mush_stem', 0, 0.18, 0)); return g; }
  if (kind === 'oneup') { const g = new THREE.Group(); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8, 0, 6.3, 0, Math.PI / 2), texMat('oneup_cap')); cap.position.y = 0.42; cap.castShadow = true; g.add(cap); g.add(texBox(0.5, 0.45, 0.5, 'mush_stem', 'mush_stem', 0, 0.18, 0)); return g; }
  if (kind === 'flower') return texBox(0.72, 0.72, 0.2, 'item_flower', 'item_flower', 0, 0.36, 0);
  if (kind === 'feather') return texBox(0.7, 0.78, 0.18, 'item_feather', 'item_feather', 0, 0.36, 0);
  return texBox(0.72, 0.72, 0.2, 'item_star', 'item_star', 0, 0.36, 0); // star
}
function makeFire() { const m = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), new THREE.MeshStandardMaterial({ color: 0xff7b2e, emissive: 0xff4000, emissiveIntensity: 0.8, roughness: 0.4 })); m.castShadow = true; return m; }
function makePlat() { return texBox(2, 0.42, 1, 'wood', 'wood'); }

// ---- rendu d'une scène de jeu ----
export function renderScene(scene) {
  if (!R) return false;
  try { drawScene(scene); return true; }
  catch (e) { console.warn('Erreur rendu 3D -> repli 2D :', e && e.message); failed = true; R = null; return false; }
}

function drawScene(scene) {
  const lvl = scene.level, cam = scene.cam;
  // ciel + brouillard selon thème
  R.scene.background = skyTexture(lvl.theme);
  R.scene.fog.color.setHex(THEME_FOG[lvl.theme] ?? 0x9fd6ff);

  // caméra suit le centre de vue
  const cx = U(cam.x) + VW / 2;
  const cy = -(U(cam.y) + VH / 2);
  R.cam.position.set(cx, cy + 4.6, 15);
  R.cam.lookAt(cx, cy, 0);
  // la lumière (ombres) suit la zone visible
  R.key.position.set(cx - 7, cy + 14, 9);
  R.key.target.position.set(cx, cy, 0);
  R.key.target.updateMatrixWorld();

  // ---- tuiles visibles ----
  R.pools.ti = 0;
  const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
  const tx1 = Math.min(lvl.w - 1, Math.floor((cam.x + VIEW_W) / TILE) + 1);
  const ty0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
  const ty1 = Math.min(lvl.h - 1, Math.floor((cam.y + VIEW_H) / TILE) + 1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const ch = lvl.rows[ty][tx];
      if (ch === ' ' || ch === 'G' || ch === 'C' || ch === 'c') continue;
      if (!TILE_COL[ch]) continue; // type connu
      const m = getTile();
      m.material = R.tileMats(ch, lvl.theme);
      m.position.set(tx + 0.5, -(ty + 0.5), 0);
      // plateformes fines vs blocs pleins
      if (ch === '=') m.scale.set(1, 0.38, 0.9); else m.scale.set(1, 1, 1);
    }
  }
  // drapeau d'arrivée (mât)
  if (lvl.goal) { const m = getTile(); m.material = R.mat(0xeeeeee); m.position.set(lvl.goal.tx + 0.5, -(lvl.h - 6), 0); m.scale.set(0.1, 8, 0.1); }
  for (let i = R.pools.ti; i < R.pools.tile.length; i++) R.pools.tile[i].visible = false;

  // reset compteurs d'entités
  for (const b of R.pools.ent.values()) b.i = 0;

  const place = (key, factory, px, py, w, h, cb) => {
    const g = entGroup(key, factory);
    g.position.set(U(px + w / 2), -(U(py + h / 2)), 0.2);
    if (cb) cb(g);
    return g;
  };

  // plateformes mobiles
  for (const pf of scene.platforms || []) place('plat', makePlat, pf.x, pf.y, pf.w, pf.h);

  // pièces / gemmes / objets
  for (const co of scene.coins || []) place('coin', makeCoin, co.x, co.y, co.w, co.h, (g) => { g.rotation.y = co.t * 6; });
  for (const gm of scene.gems || []) place('gem', makeGem, gm.x, gm.y, gm.w, gm.h, (g) => { g.rotation.y = gm.t * 2.5; g.rotation.x = 0.2; });
  for (const it of scene.items || []) place('item_' + it.kind, () => makeItem(it.kind), it.x, it.y, it.w, it.h, (g) => { g.rotation.y = (it.t || 0) * 1.5; });
  for (const fb of scene.fireballs || []) place('fire', makeFire, fb.x, fb.y, fb.w, fb.h);
  for (const hz of scene.hazards || []) place('haz', () => makeFire(), hz.x, hz.y, hz.w, hz.h);

  // ennemis
  for (const e of scene.enemies || []) {
    if (e.removed) continue;
    const key = e.type;
    const fac = e.type === 'shell' ? makeShell : e.type === 'fly' ? makeFly : e.type === 'spiky' ? makeSpiky : makeGoon;
    place(key, fac, e.x, e.y, e.w, e.h, (g) => {
      g.scale.x = e.dir < 0 ? -1 : 1; g.rotation.set(0, 0, 0);
      if (e.dead) { g.rotation.z = Math.PI; return; }
      if (e.type === 'fly') { if (g.userData.w1) { const f = 0.4 + Math.sin(e.t * 16) * 0.6; g.userData.w1.rotation.z = f; g.userData.w2.rotation.z = -f; } g.position.y += Math.sin(e.t * 4) * 0.06; }
      else if (e.type === 'shell' && e.state === 'shell' && Math.abs(e.vx) > 10) { g.rotation.x = e.t * 9 * (e.vx > 0 ? 1 : -1); } // carapace qui roule
      else { g.rotation.z = Math.sin(e.t * 9) * 0.13; g.position.y += Math.abs(Math.sin(e.t * 9)) * 0.04; } // dandinement
    });
  }

  // boss
  if (scene.boss && !scene.boss.removed) {
    const b = scene.boss;
    place('boss', makeBoss, b.x, b.y, b.w, b.h, (g) => { g.scale.x = b.dir < 0 ? -1 : 1; g.visible = !(b.flash > 0 && Math.floor(b.t * 30) % 2); });
  }

  // joueur(s)
  const players = scene.players ? scene.players : (scene.player ? [scene.player] : []);
  players.forEach((p, idx) => {
    if (!p) return;
    const g = place('hero' + idx, makeHero, p.x, p.y, p.w, p.h, (g) => {
      const ud = g.userData;
      if (ud.torso) ud.torso.material = texMat(p.power === 'fire' ? 'overalls_fire' : p.power === 'glide' ? 'overalls_glide' : 'overalls');
      const moving = Math.abs(p.vx) > 8 && p.onGround;
      const sp = Math.min(Math.abs(p.vx) / 110, 1);
      // squash & stretch + taille
      const big = p.big ? 1.25 : 1;
      const stretch = (!p.onGround && !p.dead && !p.pounding) ? 0.12 : 0;
      const sq = p.squash || 0;
      const sx = (1 - stretch * 0.5 + sq * 0.18) * (p.ducking ? 1.12 : 1);
      const sy = big * (1 + stretch - sq * 0.22) * (p.ducking ? 0.6 : 1);
      g.scale.set((p.dir < 0 ? -1 : 1) * sx, sy, 1);
      g.rotation.z = 0;
      const L = ud.lL, R = ud.lR, AL = ud.aL, AR = ud.aR;
      // IMPORTANT : le pas se fait autour de l'axe Z (visible de profil), pas X.
      L.rotation.set(0, 0, 0); R.rotation.set(0, 0, 0); AL.rotation.set(0, 0, 0); AR.rotation.set(0, 0, 0);
      if (!p.onGround && !p.dead) { // saut / chute / plané / slam
        if (p.pounding) { L.rotation.z = 0.1; R.rotation.z = -0.1; AL.rotation.z = 2.7; AR.rotation.z = -2.7; }
        else if (p.gliding) { L.rotation.z = 0.5; R.rotation.z = -0.5; AL.rotation.z = 1.4; AR.rotation.z = -1.4; }
        else { L.rotation.z = 0.55; R.rotation.z = -0.35; AL.rotation.z = -0.6; AR.rotation.z = 0.6; } // course en l'air
        ud.head.rotation.z = 0;
      } else if (moving) { // course : grandes foulées
        const ph = p.walkT * 1.5, amp = 0.5 + 0.7 * sp, s = Math.sin(ph);
        L.rotation.z = s * amp; R.rotation.z = -s * amp;                 // jambes opposées
        AL.rotation.z = -s * amp * 0.8; AR.rotation.z = s * amp * 0.8;   // bras opposés aux jambes
        g.position.y += Math.abs(Math.cos(ph)) * 0.07 * sp;             // bob (haut quand jambes croisées)
        g.rotation.z = -0.14 * sp * (p.dir >= 0 ? 1 : -1);               // se penche dans la course
        ud.head.rotation.z = 0.06 * sp * (p.dir >= 0 ? 1 : -1);
      } else { // repos : respiration légère
        const br = Math.sin(p.t * 2.2);
        AL.rotation.z = -0.06 + br * 0.04; AR.rotation.z = 0.06 - br * 0.04;
        g.position.y += br * 0.015;
      }
      g.visible = !(p.invuln > 0 && Math.floor(p.t * 20) % 2 && !p.dead);
    });
  });

  // masquer les surplus d'entités
  for (const b of R.pools.ent.values()) for (let i = b.i; i < b.list.length; i++) b.list[i].visible = false;

  R.renderer.render(R.scene, R.cam);
}

export function resize3D(cssW, cssH, dpr) {
  if (!R) return;
  R.renderer.setPixelRatio(Math.min(dpr, 2));
  R.renderer.setSize(cssW, cssH, false);
  R.renderer.domElement.style.width = cssW + 'px';
  R.renderer.domElement.style.height = cssH + 'px';
}
