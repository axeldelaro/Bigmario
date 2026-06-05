// Smoke test: stubs the browser APIs, then runs the real game scenes for many
// frames (solo + versus) to catch runtime errors without a browser.

// ---- Stubs ----
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
    width: 16, height: 16, style: {}, getContext: () => ctxStub,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 192 }),
  };
}
function makeEl() {
  return {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    set innerHTML(_) {}, get innerHTML() { return ''; },
    querySelector: () => makeEl(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, onclick: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 192 }),
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
import { MiniGameScene } from '../js/scene_minigame.js';
import { MapScene } from '../js/scene_map.js';
import { ReplayScene } from '../js/scene_replay.js';
import { parTimes, medalFor } from '../js/medals.js';
import { ACHIEVEMENTS, unlockedCount, markSet } from '../js/achievements.js';
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
  const gemStore = {};
  return {
    input, art, canvas: makeCanvas(),
    togglePause() {}, gameOver() { this._go = true; }, gameComplete() { this._gc = true; },
    saveProgress() {}, endVersus() { this._ev = true; }, endMiniGame() { this._emg = true; },
    getGems(k) { return gemStore[k] || 0; }, setGems(k, n) { gemStore[k] = n; },
    startSolo() { this._solo = true; }, startSpeedrun() { this._sr = true; }, showGhostPick() { this._gp = true; },
    startMarathon() { this._mar = true; }, onMarathonFinish() { this._marfin = true; },
    returnToMenu() { this._menu = true; }, onSpeedrunFinish() { this._fin = true; },
    watchReplay() { this._rep = true; }, endReplay() { this._endrep = true; },
    startCustom() { this._custom = true; }, onCustomClear() { this._cc = true; },
    stat() {}, fadeIn() {}, reduceMotion: false,
    _go: false, _gc: false, _ev: false,
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
  console.log(`${label}: ${frames} frames ran, ` + (scene.player ? `player at x=${scene.player.x|0}` : scene.scores ? `scores=${scene.scores}` : `kos=${scene.kos}`));
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
runScene((g) => new VersusScene(g, { mode: 'local', arenaIdx: 2 }), 'VERSUS local A2', 1200);
runScene((g) => new VersusScene(g, { mode: 'bot', arenaIdx: 0 }), 'VERSUS vs IA A0', 1500);
runScene((g) => new VersusScene(g, { mode: 'bot', arenaIdx: 2 }), 'VERSUS vs IA A2', 1500);
runScene((g) => new VersusScene(g, { mode: 'online', net: netStub, localId: 0, arenaIdx: 0 }), 'VERSUS online host', 1200);
runScene((g) => new VersusScene(g, { mode: 'online', net: netStub, localId: 1, arenaIdx: 0 }), 'VERSUS online guest', 1200);

// Mini-jeux : course aux pièces et aux étoiles, sur les 3 terrains, vs IA
runScene((g) => new MiniGameScene(g, { kind: 'coin', mapIdx: 0 }), 'MINI coin M0', 1200);
runScene((g) => new MiniGameScene(g, { kind: 'coin', mapIdx: 1 }), 'MINI coin M1', 1200);
runScene((g) => new MiniGameScene(g, { kind: 'star', mapIdx: 2 }), 'MINI star M2', 1200);

// Carte du monde (solo + speedrun) et contre-la-montre
runScene((g) => new MapScene(g, 'solo'), 'MAP solo', 600);
runScene((g) => new MapScene(g, 'speedrun'), 'MAP speedrun', 600);
runScene((g) => new GameScene(g, 0, 0, null, { speedrun: true }), 'SPEEDRUN 1-1', 1500);
runScene((g) => new GameScene(g, 2, 2, null, { speedrun: true }), 'SPEEDRUN 3-3 boss', 1500);
runScene((g) => new GameScene(g, 0, 0, null, { marathon: true }), 'MARATHON', 2000);

// Fantôme: enregistrer -> sauver -> rejouer
import { GhostRecorder, GhostPlayer, GhostStore } from '../js/ghost.js';
{
  const rec = new GhostRecorder();
  const fakePlayer = { x: 0, y: 100, vx: 50, dir: 1, onGround: true, power: 'big', big: true };
  for (let t = 0; t < 200; t++) { fakePlayer.x += 1; rec.update(1 / 120, fakePlayer, t * (1000 / 120)); }
  const data = rec.data();
  GhostStore.save('0-0', data);
  const g = new GhostPlayer(GhostStore.load('0-0'));
  const pose = g.poseAt(300);
  console.log(`GHOST: ${g.n} samples, valid=${g.valid}, poseAt(300ms)=`, pose ? `x=${pose.x|0} dir=${pose.dir} power=${pose.power}` : 'null');
  if (!g.valid || !pose) { console.error('GHOST FAIL'); errors++; }
  // rejouer un speedrun avec fantôme chargé (exerce drawGhost)
  runScene((gg) => new GameScene(gg, 0, 0, null, { speedrun: true }), 'SPEEDRUN 1-1 +ghost', 800);
  // multi-fantômes: ajouter un 2e fantôme (WR) en cours de scène
  {
    const game = fakeGame(makeInput(moveScript));
    const sc = new GameScene(game, 0, 0, null, { speedrun: true });
    sc.addGhost(GhostStore.load('0-0'), { glow: '#ffd23b', label: 'WR TEST' });
    let ok = sc.ghosts.length >= 1;
    for (let i = 0; i < 600; i++) { game.input.update(); sc.update(1 / 120); if (i % 2 === 0) sc.draw(ctxStub); }
    console.log(`MULTI-GHOST: ${sc.ghosts.length} fantôme(s)`); if (!ok) errors++;
  }
  // fantôme rival en versus: seed un vghost d'arène puis lance le mode rival
  {
    const rec2 = new GhostRecorder();
    const fp = { x: 40, y: 90, vx: 30, dir: -1, onGround: true, power: 'big', big: true };
    for (let t = 0; t < 400; t++) { fp.x += (t % 80 < 40 ? 1 : -1); rec2.update(1 / 120, fp, t * (1000 / 120)); }
    GhostStore.save('vghost.0', rec2.data());
  }
  runScene((g) => new VersusScene(g, { mode: 'rival', arenaIdx: 0 }), 'VERSUS rival (ghost)', 1500);
  // rival sans fantôme -> repli IA (arène 1)
  runScene((g) => new VersusScene(g, { mode: 'rival', arenaIdx: 1 }), 'VERSUS rival (fallback IA)', 1200);
  // co-op en ligne (additif, pas de combat)
  runScene((g) => new VersusScene(g, { mode: 'online', coop: true, net: netStub, localId: 0, arenaIdx: 0 }), 'COOP online host', 1000);
  runScene((g) => new VersusScene(g, { mode: 'local', coop: true, arenaIdx: 0 }), 'COOP local', 1000);
  // éditeur de niveaux
  { const { EditorScene } = await import('../js/scene_editor.js');
    const game = fakeGame(makeInput(moveScript));
    const ed = new EditorScene(game);
    for (let i = 0; i < 60; i++) { game.input.update(); ed.update(1 / 120); ed.draw(ctxStub); }
    ed.dispose();
    console.log('EDITOR ran, level def width=', ed.def().map[0].length);
  }

  // Replay viewer (niveau + arène)
  {
    const game = fakeGame(makeInput(moveScript));
    const rs = new ReplayScene(game, { kind: 'level', w: 0, l: 0, name: 'TEST', ms: 30000, ghost: GhostStore.load('0-0') });
    for (let i = 0; i < 800; i++) { game.input.update(); rs.update(1 / 120); if (i % 2 === 0) rs.draw(ctxStub); }
    console.log('REPLAY level ran, t=', rs.t | 0);
    const ra = new ReplayScene(game, { kind: 'arena', arena: 0, name: 'R', ms: 20000, ghost: GhostStore.load('vghost.0') });
    for (let i = 0; i < 400; i++) { game.input.update(); ra.update(1 / 120); ra.draw(ctxStub); }
    console.log('REPLAY arena ran, t=', ra.t | 0);
  }
  // Médailles + succès
  {
    const par = parTimes(WORLDS[0].levels[0]);
    const m = medalFor(par.gold - 1, par);
    console.log('MEDALS: gold@', par.gold, '-> medal=', m);
    if (m !== 'gold') { console.error('MEDAL FAIL'); errors++; }
    markSet('cleared', '0-0');
    console.log('ACHIEVEMENTS:', unlockedCount(), '/', ACHIEVEMENTS.length, 'unlocked');
  }
}

console.log(errors === 0 ? '\n✅ SMOKE TEST PASSED (no runtime errors)' : `\n❌ ${errors} error(s)`);
process.exit(errors === 0 ? 0 : 1);
