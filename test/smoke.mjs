// Smoke test: stubs the browser APIs, then runs the real game scenes for many
// frames (solo + versus) to catch runtime errors without a browser.

// ---- Stubs ----
const ctxStub = new Proxy({}, {
  get(_, p) {
    if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p === 'putImageData') return () => {};
    if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (p === 'measureText') return () => ({ width: 8 });
    if (p === 'canvas') return { width: 16, height: 16 };
    return () => {};
  },
  set() { return true; },
});
function makeCanvas() {
  return { width: 16, height: 16, style: {}, getContext: () => ctxStub };
}
function makeEl() {
  return {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    set innerHTML(_) {}, get innerHTML() { return ''; },
    querySelector: () => makeEl(), querySelectorAll: () => [],
    addEventListener() {}, appendChild() {}, onclick: null,
  };
}
globalThis.document = {
  createElement: (t) => (t === 'canvas' ? makeCanvas() : makeEl()),
  getElementById: () => makeEl(),
  querySelector: () => makeEl(), querySelectorAll: () => [],
  documentElement: makeEl(), addEventListener() {},
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 800; globalThis.innerHeight = 450;
globalThis.requestAnimationFrame = () => 0;
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = '' + v) };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
class FakeParam { constructor() { this.value = 0; } setValueAtTime() {} exponentialRampToValueAtTime() {} linearRampToValueAtTime() {} }
class FakeNode { constructor() { this.gain = new FakeParam(); this.frequency = new FakeParam(); this.type = 'sine'; } connect() {} start() {} stop() {} }
globalThis.AudioContext = class {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; this.sampleRate = 44100; }
  createGain() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  resume() {}
};

// ---- Fake game host ----
import { buildArt } from '../js/art.js';
import { setArt } from '../js/entities.js';
import { GameScene } from '../js/scene_game.js';
import { VersusScene } from '../js/scene_versus.js';
import { WORLDS } from '../js/levels.js';

const art = buildArt();
setArt(art);

// Input stub with scripted, varying actions
function makeInput(script) {
  const state = {};
  return {
    _t: 0,
    isDown(act, p = 0) { return script(this._t, act, p); },
    justPressed(act, p = 0) { return script(this._t, act, p) && (this._t % 17 === 0); },
    hasGamepad() { return false; },
    update() { this._t++; },
  };
}
const moveScript = (t, act) => {
  if (act === 'right') return (t % 200) < 150;
  if (act === 'left') return (t % 200) >= 170;
  if (act === 'jump') return (t % 40) < 8;
  if (act === 'fire') return (t % 90) < 30;
  if (act === 'down') return (t % 240) > 220;
  return false;
};

let errors = 0;
function fakeGame(input) {
  return {
    input, art,
    togglePause() {}, gameOver() { this._go = true; }, gameComplete() { this._gc = true; },
    saveProgress() {}, endVersus() { this._ev = true; }, _go: false, _gc: false, _ev: false,
  };
}

function runScene(makeScene, label, frames) {
  const input = makeInput(moveScript);
  const game = fakeGame(input);
  let scene;
  try { scene = makeScene(game); }
  catch (e) { console.error('CREATE FAIL', label, e); errors++; return; }
  for (let i = 0; i < frames; i++) {
    input.update();
    try { scene.update(1 / 120); } catch (e) { console.error('UPDATE FAIL', label, 'frame', i, e); errors++; break; }
    if (i % 2 === 0) { try { scene.draw(ctxStub); } catch (e) { console.error('DRAW FAIL', label, 'frame', i, e); errors++; break; } }
  }
  console.log(`${label}: ${frames} frames ran, player at ` + (scene.player ? `x=${scene.player.x|0}` : `kos=${scene.kos}`));
}

// Solo: chaque niveau, beaucoup de frames
let li = 0;
for (let w = 0; w < WORLDS.length; w++) {
  for (let l = 0; l < WORLDS[w].levels.length; l++) {
    runScene((g) => new GameScene(g, w, l), `SOLO ${w + 1}-${l + 1}`, 1500);
  }
}
// Versus local & "online" (net stub)
const netStub = { relay() {}, on() { return this; }, close() {} };
runScene((g) => new VersusScene(g, { mode: 'local', arenaIdx: 0 }), 'VERSUS local A0', 1200);
runScene((g) => new VersusScene(g, { mode: 'local', arenaIdx: 1 }), 'VERSUS local A1', 1200);
runScene((g) => new VersusScene(g, { mode: 'online', net: netStub, localId: 0, arenaIdx: 0 }), 'VERSUS online host', 1200);
runScene((g) => new VersusScene(g, { mode: 'online', net: netStub, localId: 1, arenaIdx: 0 }), 'VERSUS online guest', 1200);

console.log(errors === 0 ? '\n✅ SMOKE TEST PASSED (no runtime errors)' : `\n❌ ${errors} error(s)`);
process.exit(errors === 0 ? 0 : 1);
