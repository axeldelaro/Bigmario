// Testeur headless pour valider la physique et l'IA de scene_mariokart.js
import fs from 'fs';
import path from 'path';

// Stubs environnementaux
const ctxStub = new Proxy({}, {
  get(_, p) {
    if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p === 'putImageData') return () => {};
    if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p === 'measureText') return () => ({ width: 8 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p === 'canvas') return { width: 16, height: 16 };
    return () => {};
  },
  set() { return true; },
});

function makeCanvas() {
  return {
    width: 384, height: 216, style: {}, getContext: () => ctxStub,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 384, height: 216 }),
  };
}

globalThis.document = {
  createElement: (t) => makeCanvas(),
  getElementById: () => makeCanvas(),
  querySelector: () => makeCanvas(),
  documentElement: makeCanvas(),
  addEventListener() {},
};

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.Image = class { constructor() { this.width=16; this.height=16; setTimeout(() => this.onload && this.onload(), 10); } };

// Mock NetClient
globalThis.NetClient = class {
  constructor() { this.state = 'idle'; }
  connect() {}
  on() {}
  relay() {}
};

globalThis.SKIN_LIST = [{name: 'Bolt'}];
globalThis.TILE_SIZE = 12;
globalThis.ART = {
  get(id) { return { w: 16, h: 16 }; }
};

// Imports
// We need to read main.js and scene_mariokart.js because they are browser scripts
const mainJS = fs.readFileSync(path.resolve('./js/main.js'), 'utf8');
const mariokartJS = fs.readFileSync(path.resolve('./js/scene_mariokart.js'), 'utf8');

// We evaluate them in global scope
// Note: ES modules require a bit of hackery if they use import/export
// but since main.js doesn't use export, we can just eval it.
// Actually, scene_mariokart.js might export MarioKartScene.
// Let's just create a mock Game class and instantiate MarioKartScene directly.

const sceneCode = mariokartJS
  .replace(/^import.*$/gm, '')
  .replace(/export class MarioKartScene/, 'globalThis.MarioKartScene = class MarioKartScene');

// Load levels
import { WORLDS } from '../js/levels.js';

eval(sceneCode);

const mockGame = {
  input: { isDown: () => false },
  playSound: () => {},
  switchScene: () => {},
  panel: () => ({ 
    querySelector: () => ({ style: {} }), 
    querySelectorAll: () => [],
    onclick: null 
  }),
  net: new NetClient()
};

const scene = new MarioKartScene(mockGame);

// Load circuit 0 (Plage)
scene.initRace(0);

console.log("--- TEST PHYSIQUE ET IA MARIO KART ---");
let frames = 0;
const dt = 1/60;

// On fait avancer le jeu de 600 frames (10 secondes)
let outOfBounds = 0;
for (let i = 0; i < 600; i++) {
  scene.update(dt);
  frames++;
  
  // Vérification de la position des IAs
  for (let k = 1; k < scene.karts.length; k++) {
     const kart = scene.karts[k];
     const tx = Math.floor(kart.x / 12);
     const tz = Math.floor(kart.z / 12);
     
     // Si l'IA est complètement en dehors de la carte
     if (tx < 0 || tx >= scene.track.w || tz < 0 || tz >= scene.track.h) {
         outOfBounds++;
     }
  }
}

console.log(`✓ 600 frames simulées avec succès.`);
console.log(`Positions finales des Karts :`);
scene.karts.forEach(k => {
   const tx = Math.floor(k.x / 12);
   const tz = Math.floor(k.z / 12);
   let tile = 0;
   if (tx>=0 && tx<scene.track.w && tz>=0 && tz<scene.track.h) tile = scene.track.data[tz*scene.track.w + tx];
   console.log(`[${k.isPlayer ? 'JOUEUR' : 'IA ' + k.id}] x:${k.x.toFixed(1)} z:${k.z.toFixed(1)} vitesse:${k.speed.toFixed(1)} tuile_sol:${tile}`);
});

if (outOfBounds > 0) {
  console.log(`❌ ECHEC : Les IAs sont sorties de la carte ${outOfBounds} fois !`);
  process.exit(1);
} else {
  console.log(`✅ SUCCES : Aucune IA n'est sortie de la carte.`);
}
