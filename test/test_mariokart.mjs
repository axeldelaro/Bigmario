// test_mariokart.mjs — Testeur V4 — IA par capteurs de route + barrières
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
  createElement: () => makeEl(), getElementById: () => makeEl(),
  querySelector: () => makeEl(), querySelectorAll: () => [],
  documentElement: makeEl(), addEventListener() {}, removeEventListener() {},
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.Image = class { constructor() { this.width=16; this.height=16; setTimeout(() => this.onload?.(), 1); }};

globalThis.SKIN_LIST = [
  {name:'Bolt',color:'#2f6cff'},{name:'Flamme',color:'#e23b3b'},{name:'Émeraude',color:'#37c24a'},
  {name:'Ombre',color:'#2a2a3a'},{name:'Royal',color:'#9a3ad0'},{name:'Soleil',color:'#ff9b3b'},
  {name:'Glacier',color:'#46c8ff'},{name:'Sakura',color:'#ff7bd5'},
];
globalThis.VIEW_W = 384; globalThis.VIEW_H = 216;

const mariokartJS = fs.readFileSync(path.resolve('./js/scene_mariokart.js'), 'utf8');
const sceneCode = mariokartJS
  .replace(/^import.*$/gm, '')
  .replace(/export class MarioKartScene/, 'globalThis.MarioKartScene = class MarioKartScene');
eval(sceneCode);

const mockGame = {
  input: { isDown: () => false, justPressed: () => false },
  playSound: () => {}, switchScene: () => {}, clearUI: () => {},
  returnToMenu: () => {}, panel: () => makeEl(),
};

console.log('╔══════════════════════════════════════╗');
console.log('║   TEST MARIO KART V4 — BARRIÈRES     ║');
console.log('╚══════════════════════════════════════╝\n');

const dt = 1/60;
let totalFails = 0;
const scene = new globalThis.MarioKartScene(mockGame);

for (let trackIdx = 0; trackIdx < 7; trackIdx++) {
  scene.selectedTrack = trackIdx;
  scene.selectedSkin = 0;
  scene.initRace();

  const trackName = scene.track.name;
  let outOfMap = 0, onGrass = 0, totalSamples = 0;

  for (let frame = 0; frame < 1200; frame++) {
    scene.update(dt);
    for (let k = 1; k < scene.karts.length; k++) {
      const kart = scene.karts[k];
      const tx = Math.floor(kart.x / 12), tz = Math.floor(kart.z / 12);
      totalSamples++;
      if (tx < 0 || tx >= scene.track.w || tz < 0 || tz >= scene.track.h) outOfMap++;
      else if (scene.track.data[tz * scene.track.w + tx] === 0) onGrass++;
    }
  }

  const grassPct = ((onGrass / totalSamples) * 100).toFixed(1);
  // Avec les barrières, il ne devrait y avoir quasiment aucune herbe
  const ok = outOfMap === 0 && parseFloat(grassPct) < 15;

  console.log(`${ok ? '✅' : '❌'} Circuit ${trackIdx + 1}: "${trackName}"`);
  console.log(`   Hors carte: ${outOfMap}  |  Sur herbe: ${grassPct}%  |  Échantillons: ${totalSamples}`);

  for (const kart of scene.karts) {
    const tag = kart.isPlayer ? 'JOUEUR' : `IA ${kart.id}`;
    console.log(`   [${tag}] pos=(${kart.x.toFixed(1)}, ${kart.z.toFixed(1)}) v=${kart.speed.toFixed(1)} lap=${kart.lap}`);
  }
  console.log('');
  if (!ok) totalFails++;
}

console.log('════════════════════════════════════════');
if (totalFails === 0) {
  console.log('✅ TOUS LES CIRCUITS VALIDÉS AVEC BARRIÈRES !');
  process.exit(0);
} else {
  console.log(`❌ ${totalFails} circuit(s) en échec.`);
  process.exit(1);
}
