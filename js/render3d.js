// render3d.js — rendu 3D (WebGL/Three.js) du monde de jeu, piloté par la
// simulation 2D existante (style 2.5D). Chargé dynamiquement ; en cas d'échec
// (pas de réseau / WebGL indisponible), l'appelant retombe sur le rendu 2D.
import { TILE, VIEW_W, VIEW_H } from './core.js';
import { tileCanvas } from './art.js';

// Three.js est livré EN LOCAL (js/vendor/) pour un fonctionnement 100% hors-ligne.
// On tente d'abord la copie locale ; repli sur le CDN si elle manque (ex. dev).
const THREE_LOCAL = new URL('./vendor/three.module.js', import.meta.url).href;
const THREE_CDN = 'https://unpkg.com/three@0.160.0/build/three.module.js';
let THREE = null;
let R = null;          // état du renderer
let failed = false;
let _errCount = 0;      // compteur d'erreurs consécutives (seuil = 5)

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
    // CDN d'abord (comportement d'origine qui fonctionne) ; copie locale en
    // repli, ce qui permet quand même la 3D hors-ligne.
    try { THREE = await import(/* @vite-ignore */ THREE_CDN); }
    catch { THREE = await import(/* @vite-ignore */ THREE_LOCAL); }
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
  key.shadow.mapSize.set(1024, 1024); // équilibre qualité/perf (mobile)
  key.shadow.radius = 3;
  const sc = key.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.5);
  fill.position.set(8, 6, 6); scene.add(fill);

  const root = new THREE.Group(); scene.add(root);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1.15);
  const matCache = new Map();
  const mat = (hex) => { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0.06, envMapIntensity: 0.7 })); return matCache.get(hex); };
  // matériau lisse (perso) — plus doux et légèrement brillant
  const smoothCache = new Map();
  const smooth = (hex, rough = 0.45, metal = 0.05) => { const k = hex + ':' + rough; if (!smoothCache.has(k)) smoothCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, envMapIntensity: 0.9 })); return smoothCache.get(k); };
  // éclairage d'environnement (IBL) à partir du ciel -> réflexions douces
  let pmrem = null; try { pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader && pmrem.compileEquirectangularShader(); } catch {}

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
    THREE, renderer, scene, cam, root, boxGeo, mat, smooth, tex, tileMats, key, pmrem,
    pools: { tile: [], ti: 0, ent: new Map() },
    models: {}, skyCache: new Map(), envCache: {},
  };
}

// environnement IBL généré depuis le ciel du thème (réflexions/ambiance douces)
function updateEnv(theme) {
  if (!R.pmrem) return;
  if (!(theme in R.envCache)) {
    try {
      const tex = skyTexture(theme); tex.mapping = THREE.EquirectangularReflectionMapping;
      R.envCache[theme] = R.pmrem.fromEquirectangular(tex).texture;
    } catch { R.envCache[theme] = null; }
  }
  R.scene.environment = R.envCache[theme] || null;
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

// décor 3D d'arrière-plan (parallaxe), construit une fois par thème
function buildBg(theme) {
  const g = new THREE.Group();
  const M = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 1, metalness: 0 });
  if (theme === 'overworld') {
    for (let i = -3; i < 5; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(4 + (i % 2 ? 1.2 : 0), 6.5, 5), M(0x6f8fc0)); m.position.set(i * 7, 1.2, 0); g.add(m); const sn = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2, 5), M(0xffffff)); sn.position.set(i * 7, 4.2, 0.1); g.add(sn); }
    for (let i = -2; i < 4; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 7), M(0xffffff)); c.scale.set(2.2, 0.8, 0.4); c.position.set(i * 10 + 3, 8, 3); g.add(c); }
  } else if (theme === 'underground') {
    for (let i = -3; i < 5; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 4), M(0x223a5a)); m.position.set(i * 6, 9, 0); m.rotation.z = Math.PI; g.add(m); const m2 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 4), M(0x1a2e48)); m2.position.set(i * 6 + 3, -0.5, 0); g.add(m2); }
  } else {
    for (let i = -3; i < 5; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(3.2, 10, 1), M(0x3a2630)); m.position.set(i * 5, 3.5, 0); g.add(m); const cap = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.8, 1.4), M(0x523644)); cap.position.set(i * 5, 8.6, 0); g.add(cap); }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
function updateBg3D(theme, cx, cy) {
  R.bgCache = R.bgCache || {};
  if (!R.bgCache[theme]) { R.bgCache[theme] = buildBg(theme); R.scene.add(R.bgCache[theme]); }
  for (const k in R.bgCache) R.bgCache[k].visible = (k === theme);
  R.bgCache[theme].position.set(cx * 0.55, cy * 0.3 - 2, -24); // parallaxe + loin derrière
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
    case 'plant_head': R_(0, 0, 16, 16, '#46c24a'); for (let i = 0; i < 30; i++) R_(rnd(0, 16), rnd(0, 16), 0.4, rnd(1, 2), pick('#2a8a30', '#9be0a0')); R_(4, 6, 8, 4, '#fff'); R_(4, 6, 8, 1, '#e23b3b'); for (let i = 0; i < 4; i++) R_(4.5 + i * 2, 6, 0.6, 4, '#e23b3b'); eyes('#0c3a16'); break;
    case 'lob_body': R_(0, 0, 16, 16, '#7a4ad0'); R_(0, 11, 16, 5, '#5a2fa0'); speck(18, '#9a6ae0'); eyes('#120'); R_(5, 11, 6, 3, '#e0c0ff'); break;
    case 'lob_face': R_(0, 0, 16, 16, '#7a4ad0'); for (let i = 0; i < 16; i++) R_(rnd(1, 15), rnd(1, 10), 0.5, rnd(1, 2), '#5a2fa0'); eyes('#120'); R_(5, 11, 6, 2, '#e0c0ff'); break;
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
// membre lisse articulé (capsule qui pend sous le pivot)
function smoothLimb(px, py, r, len, hex) {
  const piv = new THREE.Group(); piv.position.set(px, py, 0);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), R.smooth(hex, 0.5));
  m.position.y = -(len / 2 + r * 0.4); m.castShadow = true; piv.add(m);
  return piv;
}
function makeHero() {
  const g = new THREE.Group();
  const S = R.smooth;
  // torse arrondi (salopette)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.34, 6, 16), S(0x2f6cff, 0.5)); torso.position.y = 0.4; torso.scale.set(1, 1, 0.86); torso.castShadow = true; g.add(torso);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.7), S(0x1c3fb0, 0.5)); strap.position.set(0, 0.42, 0.18); g.add(strap);
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), S(0xffd23b, 0.25, 0.4)); btn.position.set(0, 0.58, 0.34); g.add(btn);
  // tête (sphère)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 22, 18), S(0xffcb9c, 0.7)); head.position.y = 0.98; head.scale.set(1, 1.06, 0.96); head.castShadow = true; g.add(head);
  const eye = (x) => { const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), S(0xffffff, 0.25)); w.position.set(x, 1.02, 0.3); w.scale.set(1, 1.2, 0.6); g.add(w); const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), S(0x241b14, 0.2)); p.position.set(x, 1.02, 0.38); g.add(p); };
  eye(0.15); eye(-0.15);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), S(0xe8a878, 0.6)); nose.position.set(0, 0.94, 0.4); g.add(nose);
  // casquette : demi-sphère + visière
  const cap = new THREE.Group(); cap.position.y = 1.2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14, 0, 6.2832, 0, Math.PI / 2), S(0xe23b3b, 0.45)); dome.castShadow = true; cap.add(dome);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 18, 1, false, 0, Math.PI), S(0xc12d12, 0.45)); brim.position.set(0, 0.02, 0.22); cap.add(brim);
  g.add(cap);
  const lL = smoothLimb(-0.19, 0.06, 0.14, 0.34, 0x241b14);
  const lR = smoothLimb(0.19, 0.06, 0.14, 0.34, 0x241b14);
  const aL = smoothLimb(-0.44, 0.52, 0.11, 0.34, 0xffcb9c);
  const aR = smoothLimb(0.44, 0.52, 0.11, 0.34, 0xffcb9c);
  g.add(lL, lR, aL, aR);
  g.userData = { torso, head, cap, lL, lR, aL, aR };
  return g;
}
// silhouette de fantôme translucide (matériau propre -> ne touche pas le joueur)
function makeGhostModel() {
  const mat = new THREE.MeshBasicMaterial({ color: 0x46d8ff, transparent: true, opacity: 0.4, depthWrite: false });
  const g = new THREE.Group();
  const part = (w, h, d, x, y, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, 0); parent.add(m); return m; };
  part(0.95, 0.55, 0.85, 0, 0.28, g);    // torse
  part(0.9, 0.62, 0.84, 0, 0.82, g);     // tête
  part(1.0, 0.3, 0.96, 0, 1.12, g);      // casquette
  const lL = new THREE.Group(); lL.position.set(-0.22, 0, 0); part(0.36, 0.5, 0.52, 0, -0.25, lL); g.add(lL);
  const lR = new THREE.Group(); lR.position.set(0.22, 0, 0); part(0.36, 0.5, 0.52, 0, -0.25, lR); g.add(lR);
  g.userData = { mat, lL, lR };
  return g;
}
// paire d'yeux arrondis (blanc + pupille) tournés vers +Z
function eyes3d(g, y, z, sep = 0.16, r = 0.1) {
  const S = R.smooth;
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), S(0xffffff, 0.25));
    w.position.set(sx * sep, y, z); w.scale.set(1, 1.2, 0.6); g.add(w);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 10, 10), S(0x201810, 0.2));
    pu.position.set(sx * sep, y, z + r * 0.6); g.add(pu);
  }
}
function makeGoon() {
  const g = new THREE.Group();
  const S = R.smooth;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.3, 6, 16), S(0x9b5a2a, 0.55)); body.position.y = 0.45; body.scale.set(1, 1, 0.9); body.castShadow = true; g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), S(0xf0c89a, 0.6)); belly.position.set(0, 0.34, 0.26); belly.scale.set(1, 1.05, 0.5); g.add(belly);
  eyes3d(g, 0.66, 0.34, 0.16, 0.1);
  for (const sx of [-1, 1]) { const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.16, 4, 10), S(0x5a3a1a, 0.5)); foot.rotation.z = Math.PI / 2; foot.position.set(sx * 0.22, 0.02, 0.05); foot.castShadow = true; g.add(foot); }
  return g;
}
function makeShell() {
  const g = new THREE.Group();
  const S = R.smooth;
  const skin = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), S(0xd8ffe0, 0.6)); skin.position.y = 0.32; skin.scale.set(1, 0.8, 0.95); g.add(skin);
  eyes3d(g, 0.46, 0.34, 0.15, 0.09);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12, 0, 6.3, 0, Math.PI * 0.62), S(0x37c24a, 0.4)); dome.scale.set(1, 1.15, 1); dome.position.y = 0.42; dome.castShadow = true; g.add(dome);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.07, 10, 22), S(0x0c5a1c, 0.45)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.42; g.add(rim);
  return g;
}
function makeFly() {
  const g = new THREE.Group();
  const S = R.smooth;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 14), S(0xe2483b, 0.5)); body.position.y = 0.42; body.scale.set(1, 1.05, 0.95); body.castShadow = true; g.add(body);
  eyes3d(g, 0.55, 0.32, 0.15, 0.1);
  const wingGeo = new THREE.SphereGeometry(0.3, 12, 10); wingGeo.scale(1, 1.3, 0.12);
  const w1 = new THREE.Mesh(wingGeo, S(0xffffff, 0.3)); w1.position.set(-0.4, 0.62, -0.05);
  const w2 = new THREE.Mesh(wingGeo, S(0xffffff, 0.3)); w2.position.set(0.4, 0.62, -0.05);
  g.add(w1); g.add(w2); g.userData = { w1, w2 }; return g;
}
function makeSpiky() {
  const g = new THREE.Group();
  const S = R.smooth;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), S(0xb06ad8, 0.5)); body.position.y = 0.38; body.scale.set(1, 0.9, 0.95); body.castShadow = true; g.add(body);
  eyes3d(g, 0.42, 0.34, 0.15, 0.09);
  for (let i = -1; i <= 1; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 8), S(0xe0c0ff, 0.4)); s.castShadow = true; s.position.set(i * 0.24, 0.74, 0); g.add(s); }
  return g;
}
function makePlant() {
  const g = new THREE.Group();
  const S = R.smooth;
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 10), S(0x2a8a30, 0.55)); stem.position.y = 0.18; g.add(stem);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 14), S(0x46c24a, 0.5)); head.position.y = 0.6; head.castShadow = true; g.add(head);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 10, 20), S(0xe23b3b, 0.45)); lip.rotation.x = Math.PI / 2.3; lip.position.set(0, 0.58, 0.28); g.add(lip);
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), S(0xffffff, 0.3)); t.position.set(Math.cos(a) * 0.27, 0.58, 0.28 + Math.sin(a) * 0.06); t.rotation.z = a; g.add(t); }
  eyes3d(g, 0.78, 0.34, 0.14, 0.09);
  return g;
}
function makeLob() {
  const g = new THREE.Group();
  const S = R.smooth;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.26, 6, 16), S(0x7a4ad0, 0.5)); body.position.y = 0.44; body.scale.set(1, 1, 0.92); body.castShadow = true; g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), S(0xe0c0ff, 0.55)); belly.position.set(0, 0.34, 0.26); belly.scale.set(1, 1, 0.5); g.add(belly);
  eyes3d(g, 0.6, 0.32, 0.15, 0.1);
  for (const sx of [-1, 1]) { const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.16, 4, 10), S(0x4a2a90, 0.5)); foot.rotation.z = Math.PI / 2; foot.position.set(sx * 0.22, 0.02, 0.05); foot.castShadow = true; g.add(foot); }
  return g;
}
function makeBoss() {
  const g = new THREE.Group();
  const S = R.smooth;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 22, 18), S(0x37c24a, 0.45)); body.position.y = 1.2; body.scale.set(1, 1.05, 0.95); body.castShadow = true; g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 14), S(0xeafff0, 0.55)); belly.position.set(0, 0.95, 0.65); belly.scale.set(1, 1.1, 0.5); g.add(belly);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10, 0, 6.3, 0, Math.PI / 1.6), S(0x5a1010, 0.5)); mouth.rotation.x = Math.PI; mouth.position.set(0, 1.85, 0.95); g.add(mouth);
  const eGeo = new THREE.SphereGeometry(0.24, 12, 12);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(eGeo, new THREE.MeshStandardMaterial({ color: 0xffe24a, emissive: 0xff3000, emissiveIntensity: 0.6, roughness: 0.3 })); e.position.set(sx * 0.5, 2.15, 0.85); g.add(e); const pu = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), S(0x200, 0.2)); pu.position.set(sx * 0.5, 2.15, 1.05); g.add(pu); }
  for (let i = -2; i <= 2; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 8), S(0xeafff0, 0.4)); s.castShadow = true; s.position.set(i * 0.5, 2.35, -0.5); g.add(s); }
  return g;
}
function makeCoin() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0xffd23b, roughness: 0.18, metalness: 0.85, emissive: 0x4a3200, emissiveIntensity: 0.3 }));
  m.rotation.x = Math.PI / 2; m.castShadow = true; g.add(m); return g;
}
function makeGem() { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.36), new THREE.MeshStandardMaterial({ color: 0x46d8ff, roughness: 0.1, metalness: 0.35, emissive: 0x0a3a55, emissiveIntensity: 0.6 })); m.castShadow = true; return m; }
function makeItem(kind) { const g = new THREE.Group(); g.add(makeItemMesh(kind)); return g; }
function mushroomModel(capHex) {
  const S = R.smooth, g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 12, 0, 6.3, 0, Math.PI / 1.7), S(capHex, 0.4)); cap.position.y = 0.4; cap.scale.set(1, 0.9, 1); cap.castShadow = true; g.add(cap);
  for (const p of [[0.18, 0.5, 0.32], [-0.22, 0.46, 0.2], [0.05, 0.62, -0.1]]) { const d = new THREE.Mesh(new THREE.SphereGeometry(p[2] * 0.4, 10, 8), S(0xffffff, 0.35)); d.position.set(p[0], p[1], 0.32); d.scale.z = 0.4; g.add(d); }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.42, 16), S(0xffe2b0, 0.55)); stem.position.y = 0.2; stem.castShadow = true; g.add(stem);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), S(0x241b14, 0.2)); e.position.set(sx * 0.1, 0.22, 0.27); g.add(e); }
  return g;
}
function makeItemMesh(kind) {
  const S = R.smooth;
  if (kind === 'mushroom') return mushroomModel(0xff5d3b);
  if (kind === 'oneup') return mushroomModel(0x46d84a);
  if (kind === 'flower') {
    const g = new THREE.Group();
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), S(0xffd23b, 0.4)); center.position.y = 0.42; g.add(center);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const pet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), S(i % 2 ? 0xff5d2e : 0xffd23b, 0.4)); pet.position.set(Math.cos(a) * 0.26, 0.42, Math.sin(a) * 0.26); pet.scale.set(1, 0.6, 1); pet.castShadow = true; g.add(pet); }
    const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), S(0x37c24a, 0.5)); stem.position.y = 0.15; g.add(stem);
    return g;
  }
  if (kind === 'feather') {
    const g = new THREE.Group();
    const quill = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.55, 4, 10), S(0xffd23b, 0.4)); quill.position.y = 0.4; quill.rotation.z = 0.12; g.add(quill);
    const vane = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), S(0x46c8ff, 0.35)); vane.position.set(0.05, 0.46, 0); vane.scale.set(0.55, 1.25, 0.18); vane.rotation.z = 0.12; vane.castShadow = true; g.add(vane);
    return g;
  }
  // star
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: 0xffd23b, roughness: 0.25, metalness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.5 }));
  core.position.y = 0.4; core.castShadow = true; g.add(core);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), S(0x241b14, 0.2)); e.position.set(sx * 0.1, 0.44, 0.28); g.add(e); }
  return g;
}
function makeFire() { const m = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), new THREE.MeshStandardMaterial({ color: 0xff7b2e, emissive: 0xff4000, emissiveIntensity: 0.8, roughness: 0.4 })); m.castShadow = true; return m; }
function makePlat() { return texBox(2, 0.42, 1, 'wood', 'wood'); }

// ---- rendu d'une scène de jeu ----
export function renderScene(scene) {
  if (!R) return false;
  try {
    drawScene(scene);
    _errCount = 0; // réinitialiser le compteur en cas de succès
    return true;
  } catch (e) {
    _errCount++;
    console.warn(`Erreur rendu 3D (${_errCount}/5) -> repli 2D :`, e && e.message);
    if (_errCount >= 5) {
      // Après 5 erreurs consécutives seulement on désactive définitivement la 3D
      failed = true; R = null;
      console.warn('3D désactivée définitivement après trop d’erreurs.');
    }
    return false;
  }
}

function drawScene(scene) {
  const lvl = scene.level, cam = scene.cam;
  // ciel + brouillard selon thème
  R.scene.background = skyTexture(lvl.theme);
  updateEnv(lvl.theme);
  R.scene.fog.color.setHex(THEME_FOG[lvl.theme] ?? 0x9fd6ff);

  // caméra suit le centre de vue
  const cx = U(cam.x) + VW / 2;
  const cy = -(U(cam.y) + VH / 2);
  updateBg3D(lvl.theme, cx, cy);
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
    const fac = e.type === 'shell' ? makeShell : e.type === 'fly' ? makeFly : e.type === 'spiky' ? makeSpiky : e.type === 'plant' ? makePlant : e.type === 'lob' ? makeLob : makeGoon;
    place(key, fac, e.x, e.y, e.w, e.h, (g) => {
      g.scale.x = e.dir < 0 ? -1 : 1; g.rotation.set(0, 0, 0);
      if (e.dead) { g.rotation.z = Math.PI; return; }
      if (e.type === 'fly') { if (g.userData.w1) { const f = 0.4 + Math.sin(e.t * 16) * 0.6; g.userData.w1.rotation.z = f; g.userData.w2.rotation.z = -f; } g.position.y += Math.sin(e.t * 4) * 0.06; }
      else if (e.type === 'plant') { g.rotation.z = Math.sin(e.t * 4) * 0.1; }
      else if (e.type === 'lob') { g.rotation.z = Math.sin(e.t * 7) * 0.1; }
      else if (e.type === 'shell' && e.state === 'shell' && Math.abs(e.vx) > 10) { g.rotation.x = e.t * 9 * (e.vx > 0 ? 1 : -1); } // carapace qui roule
      else { g.rotation.z = Math.sin(e.t * 9) * 0.13; g.position.y += Math.abs(Math.sin(e.t * 9)) * 0.04; } // dandinement
    });
  }

  // boss
  if (scene.boss && !scene.boss.removed) {
    const b = scene.boss;
    place('boss', makeBoss, b.x, b.y, b.w, b.h, (g) => { g.scale.x = b.dir < 0 ? -1 : 1; g.visible = !(b.flash > 0 && Math.floor(b.t * 30) % 2); });
  }

  // fantômes (translucides) — synchronisés sur le chrono du run
  // Utilise runMs (solo speedrun) ou matchMs (versus) selon ce qui est dispo
  const runTime = scene.runMs ?? scene.matchMs ?? 0;
  (scene.ghosts || []).forEach((gh, gi) => {
    const pose = gh.g.poseAt(runTime);
    if (!pose) return;
    const g = entGroup('ghost' + gi, makeGhostModel);
    const big = pose.power >= 1, h = big ? 26 : 14;
    g.position.set(U(pose.x + 6), -(U(pose.y + h / 2)), 0.25); // même repère que le héros
    g.scale.set((pose.dir < 0 ? -1 : 1), big ? 1.25 : 1, 1);
    try { g.userData.mat.color.set(gh.glow || '#46d8ff'); g.userData.mat.opacity = 0.32 + 0.12 * Math.sin(runTime / 200 + gi); } catch {}
    const ph = runTime / 90, amp = pose.moving ? 0.6 : 0;
    g.userData.lL.rotation.z = Math.sin(ph) * amp; g.userData.lR.rotation.z = -Math.sin(ph) * amp;
  });

  // joueur(s)
  const players = scene.players ? scene.players : (scene.player ? [scene.player] : []);
  players.forEach((p, idx) => {
    if (!p) return;
    const g = place('hero' + idx, makeHero, p.x, p.y, p.w, p.h, (g) => {
      const ud = g.userData;
      if (ud.torso) ud.torso.material = R.smooth(p.power === 'fire' ? 0xff5d2e : p.power === 'glide' ? 0x46c8ff : 0x2f6cff, 0.5);
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
