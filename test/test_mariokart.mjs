// test_mariokart.mjs — Testeur headless pour la physique et l'IA de scene_mariokart.js
import fs from 'fs';
import path from 'path';

// ── Stubs navigateur ──
const ctxStub = new Proxy({}, {
  get(_, p) {
    if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p === 'putImageData') return () => {};
    if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p === 'measureText') return () => ({ width: 8 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p === 'canvas') return { width: 384, height: 216 };
    return () => {};
  },
  set() { return true; },
});

function makeEl() {
  return new Proxy({}, {
    get(_, p) {
      if (p === 'width' || p === 'height') return 384;
      if (p === 'style') return {};
      if (p === 'getContext') return () => ctxStub;
      if (p === 'querySelector' || p === 'getElementById') return () => makeEl();
      if (p === 'querySelectorAll') return () => [];
      if (p === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 384, height: 216 });
      if (p === 'addEventListener' || p === 'removeEventListener' || p === 'appendChild' || p === 'remove') return () => {};
      if (p === 'classList') return { add(){}, remove(){}, toggle(){}, contains: () => false };
      if (typeof p === 'string' && p.startsWith('on')) return null;
      return () => makeEl();
    },
    set() { return true; },
  });
}

globalThis.document = {
  createElement: () => makeEl(),
  getElementById: () => makeEl(),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  documentElement: makeEl(),
  addEventListener() {},
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.Image = class { constructor() { this.width = 16; this.height = 16; setTimeout(() => this.onload && this.onload(), 1); }};

// Mocks globaux
globalThis.SKIN_LIST = [
  { name: 'Bolt', color: '#2f6cff' },
  { name: 'Flamme', color: '#e23b3b' },
  { name: 'Émeraude', color: '#37c24a' },
  { name: 'Ombre', color: '#2a2a3a' },
  { name: 'Royal', color: '#9a3ad0' },
  { name: 'Soleil', color: '#ff9b3b' },
  { name: 'Glacier', color: '#46c8ff' },
  { name: 'Sakura', color: '#ff7bd5' },
];
globalThis.TILE_SIZE = 12;
globalThis.VIEW_W = 384;
globalThis.VIEW_H = 216;

// ── Charger et évaluer scene_mariokart.js ──
const mariokartJS = fs.readFileSync(path.resolve('./js/scene_mariokart.js'), 'utf8');
const sceneCode = mariokartJS
  .replace(/^import.*$/gm, '')
  .replace(/export class MarioKartScene/, 'globalThis.MarioKartScene = class MarioKartScene');

eval(sceneCode);

const mockGame = {
  input: { isDown: () => false },
  playSound: () => {},
  switchScene: () => {},
  clearUI: () => {},
  returnToMenu: () => {},
  panel: () => makeEl(),
  net: { state: 'idle', connect(){}, on(){}, relay(){} },
};

// ══════════════════════════════════════
//  TESTS
// ══════════════════════════════════════
console.log('╔══════════════════════════════════════╗');
console.log('║   TEST MARIO KART — PHYSIQUE & IA    ║');
console.log('╚══════════════════════════════════════╝\n');

const dt = 1 / 60;
let totalFails = 0;

// Test chaque circuit
const scene = new globalThis.MarioKartScene(mockGame);

// Access private TRACKS via the scene
// We need to test each track
for (let trackIdx = 0; trackIdx < 7; trackIdx++) {
  scene.selectedTrack = trackIdx;
  scene.selectedSkin = 0;
  scene.initRace();

  const trackName = scene.track.name;
  let outOfMap = 0;
  let onGrass = 0;
  let totalSamples = 0;

  // Simuler 900 frames (15 secondes de course)
  for (let frame = 0; frame < 900; frame++) {
    scene.update(dt);

    // Vérifier la position de chaque IA
    for (let k = 1; k < scene.karts.length; k++) {
      const kart = scene.karts[k];
      const tx = Math.floor(kart.x / 12);
      const tz = Math.floor(kart.z / 12);
      totalSamples++;

      if (tx < 0 || tx >= scene.track.w || tz < 0 || tz >= scene.track.h) {
        outOfMap++;
      } else {
        const tile = scene.track.data[tz * scene.track.w + tx];
        if (tile === 0) onGrass++;
      }
    }
  }

  const grassPct = ((onGrass / totalSamples) * 100).toFixed(1);
  const ok = outOfMap === 0 && parseFloat(grassPct) < 45;

  console.log(`${ok ? '✅' : '❌'} Circuit ${trackIdx + 1}: "${trackName}"`);
  console.log(`   Hors carte: ${outOfMap}  |  Sur herbe: ${grassPct}%  |  Échantillons: ${totalSamples}`);

  // Positions finales
  for (const kart of scene.karts) {
    const tag = kart.isPlayer ? 'JOUEUR' : `IA ${kart.id}`;
    console.log(`   [${tag}] pos=(${kart.x.toFixed(1)}, ${kart.z.toFixed(1)}) vitesse=${kart.speed.toFixed(1)} angle=${kart.angle.toFixed(2)}`);
  }
  console.log('');

  if (!ok) totalFails++;
}

console.log('════════════════════════════════════════');
if (totalFails === 0) {
  console.log('✅ TOUS LES CIRCUITS VALIDÉS !');
  process.exit(0);
} else {
  console.log(`❌ ${totalFails} circuit(s) en échec.`);
  process.exit(1);
}
