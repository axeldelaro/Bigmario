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

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fd6ff, 22, 52);

  // caméra orthographique inclinée -> cadrage stable + profondeur visible
  const cam = new THREE.OrthographicCamera(-VW / 2, VW / 2, VH / 2, -VH / 2, -60, 120);
  cam.position.set(0, 4.6, 15);
  cam.up.set(0, 1, 0);

  // lumières : ambiant doux + clé directionnelle (ombres) + contre-jour
  const amb = new THREE.HemisphereLight(0xfdfbff, 0x404a55, 0.85);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xfff1d0, 1.25);
  key.position.set(-7, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight(0x9fc0ff, 0.35);
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
  // matériau texturé par type de tuile + thème (réutilise l'art 2D)
  const tileMatCache = new Map();
  const tileMat = (type, theme) => {
    const k = type + '|' + theme;
    if (tileMatCache.has(k)) return tileMatCache.get(k);
    const map = tex(tileCanvas(type, theme), k);
    const emissive = (type === '?' || type === 'M' || type === 'U' || type === 'L' || type === 'W');
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0.02, emissive: emissive ? 0x222000 : 0x000000, emissiveMap: emissive ? map : null });
    tileMatCache.set(k, m); return m;
  };

  return {
    THREE, renderer, scene, cam, root, boxGeo, mat, tex, tileMat, key,
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

// ---- modèles ----
function makeHero() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.5, 0.8, 0x2f6cff, 0, 0.25, 0));      // torse (salopette)
  g.add(box(0.85, 0.55, 0.8, 0xffcb9c, 0, 0.75, 0));    // tête
  g.add(box(0.95, 0.28, 0.9, 0xe23b3b, 0, 1.02, 0));    // casquette
  g.add(box(0.12, 0.12, 0.1, 0x241b14, 0.18, 0.78, 0.42)); // oeil
  g.add(box(0.12, 0.12, 0.1, 0x241b14, -0.18, 0.78, 0.42));
  const lL = box(0.34, 0.5, 0.5, 0x241b14, -0.22, -0.25, 0); g.add(lL);
  const lR = box(0.34, 0.5, 0.5, 0x241b14, 0.22, -0.25, 0); g.add(lR);
  g.userData = { lL, lR };
  return g;
}
function makeGoon() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.7, 0.8, 0x9b5a2a, 0, 0.35, 0));
  g.add(box(0.16, 0.16, 0.1, 0xffffff, 0.2, 0.5, 0.42)); g.add(box(0.16, 0.16, 0.1, 0xffffff, -0.2, 0.5, 0.42));
  g.add(box(0.3, 0.18, 0.5, 0xf0c89a, -0.22, -0.06, 0)); g.add(box(0.3, 0.18, 0.5, 0xf0c89a, 0.22, -0.06, 0));
  return g;
}
function makeShell() { const g = new THREE.Group(); g.add(box(0.9, 0.75, 0.85, 0x37c24a, 0, 0.4, 0)); g.add(box(0.7, 0.4, 0.7, 0x1f8a30, 0, 0.45, 0.2)); return g; }
function makeFly() { const g = new THREE.Group(); g.add(box(0.7, 0.6, 0.7, 0xe2483b, 0, 0.4, 0)); const w1 = box(0.5, 0.5, 0.05, 0xffffff, -0.55, 0.55, 0); const w2 = box(0.5, 0.5, 0.05, 0xffffff, 0.55, 0.55, 0); g.add(w1); g.add(w2); g.userData = { w1, w2 }; return g; }
function makeSpiky() { const g = new THREE.Group(); g.add(box(0.85, 0.6, 0.8, 0xb06ad8, 0, 0.35, 0)); for (let i = -1; i <= 1; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), R.mat(0xe0c0ff)); s.position.set(i * 0.25, 0.75, 0); g.add(s); } return g; }
function makeBoss() {
  const g = new THREE.Group();
  g.add(box(2.4, 2.0, 2.0, 0x37c24a, 0, 1.0, 0));      // corps
  g.add(box(1.0, 0.9, 0.6, 0xffffff, 0, 1.7, 0.9));    // gueule
  g.add(box(0.3, 0.3, 0.2, 0x111111, 0.5, 2.0, 0.9)); g.add(box(0.3, 0.3, 0.2, 0x111111, -0.5, 2.0, 0.9));
  for (let i = -2; i <= 2; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4), R.mat(0xd8ffe0)); s.position.set(i * 0.5, 2.2, -0.6); g.add(s); }
  return g;
}
function makeCoin() { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 14), R.mat(0xffd23b)); m.rotation.z = Math.PI / 2; return m; }
function makeGem() { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), R.mat(0x46d8ff)); return m; }
function makeItem(hex) { const g = new THREE.Group(); g.add(box(0.7, 0.7, 0.7, hex, 0, 0.35, 0)); return g; }
function makeFire() { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), R.mat(0xff5d2e)); return m; }
function makePlat() { return box(2, 0.4, 1, 0xcaa057); }

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
      m.material = R.tileMat(ch, lvl.theme);
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
  for (const gm of scene.gems || []) place('gem', makeGem, gm.x, gm.y, gm.w, gm.h, (g) => { g.rotation.y = gm.t * 3; });
  for (const it of scene.items || []) { const hex = it.kind === 'mushroom' ? 0xff5d3b : it.kind === 'oneup' ? 0x46d84a : it.kind === 'feather' ? 0x46c8ff : it.kind === 'flower' ? 0xff5d2e : 0xffd23b; place('item', () => makeItem(0xffffff), it.x, it.y, it.w, it.h, (g) => { g.children[0].material = R.mat(hex); }); }
  for (const fb of scene.fireballs || []) place('fire', makeFire, fb.x, fb.y, fb.w, fb.h);
  for (const hz of scene.hazards || []) place('haz', () => makeFire(), hz.x, hz.y, hz.w, hz.h);

  // ennemis
  for (const e of scene.enemies || []) {
    if (e.removed) continue;
    const key = e.type;
    const fac = e.type === 'shell' ? makeShell : e.type === 'fly' ? makeFly : e.type === 'spiky' ? makeSpiky : makeGoon;
    place(key, fac, e.x, e.y, e.w, e.h, (g) => {
      g.scale.x = e.dir < 0 ? -1 : 1;
      if (e.userData && e.type === 'fly') {}
      if (g.userData.w1) { const f = Math.sin(e.t * 14) * 0.5; g.userData.w1.rotation.z = f; g.userData.w2.rotation.z = -f; }
      if (e.dead) g.rotation.z = Math.PI;
      else g.rotation.z = 0;
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
      g.scale.x = p.dir < 0 ? -1 : 1;
      const sc = p.big ? 1.25 : 1; g.scale.y = sc; g.scale.z = 1;
      // teinte feu/plume
      const torso = g.children[0];
      torso.material = R.mat(p.power === 'fire' ? 0xff5d2e : p.power === 'glide' ? 0x46c8ff : 0x2f6cff);
      // anim jambes
      const ph = Math.sin(p.walkT * 1.2) * 0.4 * (Math.abs(p.vx) > 6 ? 1 : 0);
      if (g.userData.lL) { g.userData.lL.rotation.x = ph; g.userData.lR.rotation.x = -ph; }
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
