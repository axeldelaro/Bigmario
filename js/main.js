// main.js — bootstrap: canvas adaptatif, boucle, gestionnaire de scènes, menus.
import { VIEW_W, VIEW_H, Save } from './core.js';
import { Input } from './input.js';
import { buildArt } from './art.js';
import { setArt } from './entities.js';
import { resumeAudio, toggleMute, isMuted, playMusic, stopMusic, SFX } from './audio.js';
import { GameScene } from './scene_game.js';
import { VersusScene } from './scene_versus.js';
import { MapScene } from './scene_map.js';
import { ReplayScene } from './scene_replay.js';
import { EditorScene } from './scene_editor.js';
import { WORLDS, ARENAS } from './levels.js';
import { NetClient } from './net.js';
import { ensure3D, is3DReady, renderScene, resize3D, get3DCanvas } from './render3d.js';
import { Leaderboard, fmtTime } from './leaderboard.js';
import { GhostStore } from './ghost.js';
import { Share } from './share.js';
import { parTimes, medalFor, MEDAL_EMOJI } from './medals.js';
import { ACHIEVEMENTS, bumpStat, statValue, markSet, setSize, unlockedCount } from './achievements.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const ui = document.getElementById('ui');
const touchLayer = document.getElementById('touch');
const rotateHint = document.getElementById('rotate-hint');

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class Game {
  constructor() {
    this.input = new Input();
    this.art = buildArt(); setArt(this.art);
    this.canvas = canvas;
    this.scene = null;
    this.paused = false;
    this.mode = 'menu'; // menu | game | versus | map
    this.net = null;
    this.fadeAlpha = 0; // fondu d'entrée des scènes
    this.reduceMotion = Save.get('reduceMotion', false);
    this.use3D = Save.get('render3d', true); // rendu 3D par défaut si dispo
    this.canvas3d = null;
    this._installPrompt = null;
    if (Save.get('muted', false)) toggleMute(); // restaure le réglage son
    this.resize();
    // initialisation 3D (asynchrone ; repli 2D si échec)
    ensure3D().then((ok) => {
      if (!ok) return;
      this.canvas3d = get3DCanvas();
      if (this.canvas3d) { this.canvas3d.classList.add('screen3d'); document.getElementById('game-shell').insertBefore(this.canvas3d, canvas); this.resize(); }
    });
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this._installPrompt = e; });
    // reprise audio au premier geste
    const wake = () => { resumeAudio(); };
    addEventListener('pointerdown', wake, { once: true });
    addEventListener('keydown', wake, { once: true });
    this.showTitle();
    this.last = performance.now(); this.acc = 0;
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const availW = innerWidth, availH = innerHeight;
    const scale = Math.max(1, Math.floor(Math.min(availW / VIEW_W, availH / VIEW_H) * 2) / 2);
    const cssW = Math.min(availW, VIEW_W * scale);
    const cssH = Math.min(availH, VIEW_H * scale);
    canvas.width = VIEW_W * dpr; canvas.height = VIEW_H * dpr;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // canvas 3D superposé exactement sur le canvas 2D
    if (this.canvas3d) {
      const left = Math.round((innerWidth - cssW) / 2), top = Math.round((innerHeight - cssH) / 2);
      const s = this.canvas3d.style;
      s.position = 'fixed'; s.left = left + 'px'; s.top = top + 'px';
      resize3D(cssW, cssH, dpr);
    }
    this.checkOrientation();
  }

  checkOrientation() {
    const portrait = innerHeight > innerWidth;
    const playMode = this.mode === 'game' || this.mode === 'versus' || this.mode === 'replay';
    const showHint = isTouch && portrait && playMode;
    rotateHint.classList.toggle('hidden', !showHint);
    const showTouch = isTouch && playMode && !portrait;
    touchLayer.classList.toggle('hidden', !showTouch);
    this.applyTouchSettings();
  }

  applyTouchSettings() {
    const sizes = { s: 0.82, m: 1.0, l: 1.25 };
    const sz = Save.get('touchSize', 'm');
    touchLayer.style.setProperty('--tscale', sizes[sz] || 1);
    touchLayer.style.setProperty('--topacity', String(Save.get('touchOpacity', 0.85)));
    touchLayer.classList.toggle('left-handed', Save.get('touchHand', 'right') === 'left');
  }

  // ---------- Boucle ----------
  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    this.input.update();
    if (this.paused) {
      if (this.input.justPressed('pause', 0)) this.togglePause();
      this.acc = 0;
    } else if (this.scene && this.mode !== 'menu') {
      // pas fixe pour la physique
      this.acc += dt;
      const step = 1 / 120; let n = 0;
      while (this.acc >= step && n < 8) { this.scene.update(step); this.acc -= step; n++; }
    } else { this.acc = 0; }
    // rendu
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    const want3D = this.use3D && is3DReady() && this.scene && this.scene.drawWorld &&
      (this.mode === 'game' || this.mode === 'versus');
    if (want3D) {
      const ok = renderScene(this.scene);
      this.set3DVisible(ok);
      if (ok) this.scene.drawOverlay ? this.scene.drawOverlay(ctx) : this.scene.draw(ctx);
      else this.scene.draw(ctx); // repli 2D définitif
    } else {
      this.set3DVisible(false);
      if (this.scene) this.scene.draw(ctx);
      else this.drawMenuBackdrop();
    }
    if (this.paused) this.drawPauseOverlay();
    if (this.fadeAlpha > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fadeAlpha})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      this.fadeAlpha = Math.max(0, this.fadeAlpha - dt / 0.3);
    }
    requestAnimationFrame((tt) => this.loop(tt));
  }

  fadeIn() { this.fadeAlpha = 1; }

  set3DVisible(on) {
    if (!this.canvas3d || this._3dOn === on) return;
    this._3dOn = on;
    this.canvas3d.style.display = on ? 'block' : 'none';
    document.body.classList.toggle('threeD', on);
  }

  // décor animé derrière les menus
  drawMenuBackdrop() {
    const t = performance.now() / 1000;
    let g; try { g = ctx.createLinearGradient(0, 0, 0, VIEW_H); } catch { g = null; }
    if (g) { g.addColorStop(0, '#3a1f6e'); g.addColorStop(0.6, '#241252'); g.addColorStop(1, '#120a26'); ctx.fillStyle = g; }
    else ctx.fillStyle = '#1a1030';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // étoiles scintillantes
    for (let i = 0; i < 50; i++) {
      const x = (i * 71) % VIEW_W, y = (i * 37) % (VIEW_H - 40);
      ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + i));
      ctx.fillStyle = i % 5 === 0 ? '#ffd23b' : '#fff';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
    // collines
    ctx.fillStyle = '#2a1a55';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(i * 80 + 20, VIEW_H + 6, 40, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#3a2575';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(i * 90 + 60, VIEW_H + 12, 30, Math.PI, 0); ctx.fill(); }
    // héros qui salue (petit sprite qui sautille)
    const hop = Math.max(0, Math.sin(t * 2.5)) * 6;
    const img = this.art.hero.smallIdle;
    if (img) ctx.drawImage(img, 24, VIEW_H - 30 - hop);
  }

  drawPauseOverlay() {
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1;
  }

  togglePause() {
    if (this.mode !== 'game' && this.mode !== 'versus') return;
    this.paused = !this.paused; SFX.pause();
    if (this.paused) this.showPausePanel();
    else { ui.classList.add('hidden'); ui.innerHTML = ''; }
  }

  showPausePanel() {
    const canRestart = !!this._restart;
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:32px">PAUSE</span></div>
      <div class="menu-list">
        <button class="btn" id="resume">▶ Reprendre</button>
        ${canRestart ? '<button class="btn secondary" id="restart">↻ Recommencer</button>' : ''}
        <button class="btn ghost" id="mute2"></button>
        <button class="btn ghost" id="pmenu">Menu principal</button>
      </div>`);
    p.querySelector('#resume').onclick = () => this.togglePause();
    if (canRestart) p.querySelector('#restart').onclick = () => { this.paused = false; ui.classList.add('hidden'); this._restart(); };
    const mb = p.querySelector('#mute2');
    const setLbl = () => (mb.textContent = isMuted() ? '🔇 Son: COUPÉ' : '🔊 Son: ON');
    setLbl();
    mb.onclick = () => { const m = toggleMute(); Save.set('muted', m); setLbl(); };
    p.querySelector('#pmenu').onclick = () => { this.paused = false; this.returnToMenu(); };
  }

  // ---------- Transitions ----------
  startSolo(worldIdx = 0, levelIdx = 0) {
    this.clearUI(); this.mode = 'game'; this.paused = false;
    this._restart = () => this.startSolo(worldIdx, levelIdx);
    this.scene = new GameScene(this, worldIdx, levelIdx);
    this.checkOrientation();
  }
  startVersusLocal(arenaIdx = 0) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this._restart = () => this.startVersusLocal(arenaIdx);
    this.scene = new VersusScene(this, { mode: 'local', arenaIdx });
    this.checkOrientation();
  }
  startVersusBot(arenaIdx = 0) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this._restart = () => this.startVersusBot(arenaIdx);
    this.scene = new VersusScene(this, { mode: 'bot', arenaIdx });
    this.checkOrientation();
  }
  startVersusRival(arenaIdx = 0) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this._restart = () => this.startVersusRival(arenaIdx);
    this.scene = new VersusScene(this, { mode: 'rival', arenaIdx });
    this.checkOrientation();
  }
  showMap(mode = 'solo') {
    this.clearUI(); this.mode = 'map'; this.paused = false; resumeAudio();
    this.scene = new MapScene(this, mode); playMusic('overworld');
    this.checkOrientation();
  }
  // ---- Éditeur de niveaux ----
  startEditor() {
    this.clearUI(); this.mode = 'editor'; this.paused = false; resumeAudio();
    this._restart = () => this.startEditor();
    this.scene = new EditorScene(this); stopMusic();
    this.checkOrientation();
  }
  startCustom(def) {
    this.clearUI(); this.mode = 'game'; this.paused = false;
    this._customDef = def; this._restart = () => this.startCustom(def);
    this.scene = new GameScene(this, 0, 0, null, { customDef: def });
    this.checkOrientation();
  }
  onCustomClear() {
    this.mode = 'menu';
    const p = this.panel(`<div class="title"><span class="big" style="font-size:30px;color:#ffd23b">NIVEAU RÉUSSI !</span></div>
      <div class="menu-list"><button class="btn" id="rep">↻ Rejouer</button><button class="btn secondary" id="ed">🛠 Éditeur</button><button class="btn ghost" id="menu">Menu</button></div>`);
    p.querySelector('#rep').onclick = () => this.startCustom(this._customDef);
    p.querySelector('#ed').onclick = () => this.startEditor();
    p.querySelector('#menu').onclick = () => this.returnToMenu();
  }
  // Choix du fantôme à affronter (top-3 en ligne + ton record), avant la course
  async showGhostPick(worldIdx, levelIdx) {
    const levelId = `${worldIdx}-${levelIdx}`;
    const pb = Leaderboard.getLocalBest(levelId);
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:24px">FANTÔME À AFFRONTER</span><span class="sub">${worldIdx + 1}-${levelIdx + 1}</span></div>
      <div class="status" id="st">Chargement du top 3…</div>
      <div class="menu-list" id="opts"></div>
      <div class="row" style="margin-top:10px"><button class="btn ghost" id="back">← Retour</button></div>`);
    const opts = p.querySelector('#opts'), st = p.querySelector('#st');
    const add = (label, cls, cb) => { const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.innerHTML = label; b.onclick = cb; opts.appendChild(b); };
    add('🚫 Aucun fantôme', 'ghost', () => this.startSpeedrun(worldIdx, levelIdx, { none: true }));
    if (pb != null) add(`🔵 Ton record · ${fmtTime(pb)}`, 'secondary', () => this.startSpeedrun(worldIdx, levelIdx, {}));
    const list = await Leaderboard.fetchGhostList(levelId);
    st.textContent = list.length ? 'Choisis qui affronter :' : (Leaderboard.apiBase() ? 'Aucun fantôme en ligne pour ce niveau.' : 'Serveur non configuré (fantômes en ligne indispo).');
    const medal = ['🥇', '🥈', '🥉'];
    list.forEach((g) => add(`${medal[g.rank - 1] || '🏅'} ${escapeHtml(g.name)} · ${fmtTime(g.ms)}`, '', () => this.startSpeedrun(worldIdx, levelIdx, { onlineRank: g.rank, onlineName: g.name })));
    p.querySelector('#back').onclick = () => this.showMap('speedrun');
  }

  startSpeedrun(worldIdx = 0, levelIdx = 0, pick = {}) {
    this.clearUI(); this.mode = 'game'; this.paused = false;
    this._restart = () => this.startSpeedrun(worldIdx, levelIdx, pick);
    this.scene = new GameScene(this, worldIdx, levelIdx, null, { speedrun: true });
    this.checkOrientation();
    const levelId = `${worldIdx}-${levelIdx}`;
    if (pick.none) { this.scene.ghosts = []; return; } // course sans fantôme
    // fantôme d'ami chargé localement (mauve)
    const fr = GhostStore.load(`fghost.${levelId}`);
    if (fr) this.scene.addGhost(fr, { glow: '#b06ad8', label: 'AMI' });
    // fantôme en ligne choisi (par rang dans le top 3) — défaut: le record (#1)
    Leaderboard.fetchGhost(levelId, pick.onlineRank || 1).then((res) => {
      const s = this.scene;
      if (res && res.data && s && s.speedrun && s.worldIdx === worldIdx && s.levelIdx === levelIdx) {
        s.addGhost(res.data, { glow: '#ffd23b', label: (res.name || 'WR').slice(0, 8) });
      }
    });
  }

  // ---- Marathon : les 9 niveaux à la suite, un seul chrono ----
  startMarathon() {
    this.clearUI(); this.mode = 'game'; this.paused = false;
    this._restart = () => this.startMarathon();
    this.scene = new GameScene(this, 0, 0, null, { marathon: true });
    this.checkOrientation();
  }
  onMarathonFinish(ms) {
    this.mode = 'menu';
    const levelId = 'marathon';
    const improved = Leaderboard.setLocalBest(levelId, ms);
    const pb = Leaderboard.getLocalBest(levelId);
    const name = Save.get('playerName', '');
    const online = !!Leaderboard.apiBase();
    if (improved) this.stat('record');
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:24px;color:#ffd23b">MARATHON FINI !</span></div>
      <p style="font-size:22px;font-weight:900;margin:6px 0">${fmtTime(ms)}</p>
      <p class="hint">${improved ? '🏆 Nouveau record perso !' : 'Record perso : ' + fmtTime(pb)}</p>
      ${online ? `<div class="field"><label>TON PSEUDO (classement en ligne)</label><input id="pname" maxlength="12" value="${name}" placeholder="JOUEUR"></div>
      <div class="row" style="margin-top:8px"><button class="btn" id="submit">📤 Envoyer mon temps</button></div>` :
        `<p class="hint">Configure un serveur pour le classement en ligne.</p>`}
      <div class="status" id="st"></div>
      <div id="board" style="margin-top:8px"></div>
      <div class="menu-list" style="margin-top:12px">
        <button class="btn" id="retry">↻ Rejouer</button>
        <button class="btn ghost" id="menu">Menu</button>
      </div>
    `);
    const st = p.querySelector('#st'); const board = p.querySelector('#board');
    const render = (scores) => {
      if (!scores || !scores.length) { board.innerHTML = ''; return; }
      board.innerHTML = '<p class="hint" style="margin-bottom:4px">CLASSEMENT MARATHON</p>' +
        scores.slice(0, 10).map((s, i) => `<div style="display:flex;justify-content:space-between;font:12px monospace;padding:2px 8px;${(s.name===name)?'color:#46d8ff':''}"><span>${i + 1}. ${escapeHtml(s.name)}</span><span>${fmtTime(s.ms)}</span></div>`).join('');
    };
    if (online) {
      Leaderboard.fetchTop(levelId).then(render);
      p.querySelector('#submit').onclick = async () => {
        const nm = p.querySelector('#pname').value.trim() || 'JOUEUR'; Save.set('playerName', nm); st.textContent = 'Envoi…';
        const r = await Leaderboard.submit(levelId, nm, ms);
        st.textContent = r ? `✓ Envoyé ! Nº ${r.rank}${r.total ? '/' + r.total : ''}` : '❌ Échec.';
        render(r && r.scores ? r.scores : await Leaderboard.fetchTop(levelId));
      };
    }
    p.querySelector('#retry').onclick = () => this.startMarathon();
    p.querySelector('#menu').onclick = () => this.returnToMenu();
    this.checkOrientation();
  }

  // chooser du mode contre-la-montre
  showSpeedMenu() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:30px">CONTRE-LA-MONTRE</span></div>
      <div class="menu-list">
        <button class="btn" id="bylevel">⏱ Niveau par niveau</button>
        <button class="btn" id="marathon">🏁 Marathon (9 niveaux)</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
      <p class="hint">Niveau par niveau : fantômes, médailles, classements.<br>Marathon : les 9 niveaux d'affilée, un seul chrono.</p>
    `);
    p.querySelector('#bylevel').onclick = () => this.showMap('speedrun');
    p.querySelector('#marathon').onclick = () => this.startMarathon();
    p.querySelector('#back').onclick = () => this.showTitle();
  }

  // ---- Replay ----
  watchReplay(payload, returnTo) {
    this.clearUI(); this.mode = 'replay'; this.paused = false;
    this._replayReturn = returnTo || (() => this.showMap('speedrun'));
    this.scene = new ReplayScene(this, payload);
    this.checkOrientation();
  }
  endReplay() { const rt = this._replayReturn; this._replayReturn = null; this.scene = null; this.mode = 'menu'; (rt || (() => this.showTitle()))(); }

  // ---- Stats / succès ----
  stat(kind, id) {
    if (kind === 'clear') return markSet('cleared', id);
    if (kind === 'boss') return bumpStat('boss', 1);
    if (kind === 'gems') return bumpStat('gems', id || 1);
    if (kind === 'record') return bumpStat('records', 1);
    if (kind === 'gold') return bumpStat('gold', 1);
    if (kind === 'vwin') return bumpStat('vwin', 1);
  }
  startVersusOnline(net, localId, arenaIdx) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this.net = net;
    this.scene = new VersusScene(this, { mode: 'online', coop: !!this._coopMode, net, localId, arenaIdx });
    this.checkOrientation();
  }

  saveProgress(world, level) { const u = Save.get('unlocked', 0); if (world > u) Save.set('unlocked', world); }
  getGems(key) { return Save.get(key, 0); }
  setGems(key, n) { Save.set(key, n); }
  gameOver(score) { this.bestScore(score); setTimeout(() => this.showGameOver(score), 1800); }
  gameComplete(score) { this.bestScore(score); this.showComplete(score); }
  bestScore(s) { if (s > Save.get('best', 0)) Save.set('best', s); }
  endVersus() { if (this.net) { this.net.close(); this.net = null; } this.returnToMenu(); }
  returnToMenu() {
    this.paused = false; this.mode = 'menu';
    this.scene?.dispose?.(); this.scene = null;
    if (this.net) { this.net.close(); this.net = null; }
    stopMusic(); this.checkOrientation(); this.fadeIn(); this.showTitle();
    if (this._pauseKeyHandler) { removeEventListener('keydown', this._pauseKeyHandler); this._pauseKeyHandler = null; }
  }

  // Appelé par GameScene quand un contre-la-montre est terminé
  onSpeedrunFinish(worldIdx, levelIdx, ms, ghostData) {
    this.mode = 'menu'; // gèle la scène (reste affichée en fond)
    const levelId = `${worldIdx}-${levelIdx}`;
    const improved = Leaderboard.setLocalBest(levelId, ms);
    if (improved && ghostData && ghostData.f && ghostData.f.length) GhostStore.save(levelId, ghostData);
    const pb = Leaderboard.getLocalBest(levelId);
    const name = Save.get('playerName', '');
    const online = !!Leaderboard.apiBase();
    // médaille selon le temps de référence du niveau
    const par = parTimes(WORLDS[worldIdx].levels[levelIdx]);
    const medal = medalFor(ms, par);
    if (improved) this.stat('record');
    if (medal === 'gold') this.stat('gold');
    const medalLine = medal
      ? `<p style="font-size:14px;margin:2px 0">${MEDAL_EMOJI[medal]} Médaille ${medal === 'gold' ? "d'or" : medal === 'silver' ? "d'argent" : 'de bronze'}</p>`
      : `<p class="hint">Bronze à ${fmtTime(par.bronze)} · Or à ${fmtTime(par.gold)}</p>`;
    const payload = { kind: 'level', w: worldIdx, l: levelIdx, name: name || 'JOUEUR', ms, ghost: GhostStore.load(levelId) || ghostData };
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:26px;color:#46d8ff">TEMPS</span></div>
      <p style="font-size:22px;font-weight:900;margin:6px 0">${fmtTime(ms)}</p>
      ${medalLine}
      <p class="hint">${improved ? '🏆 Nouveau record perso ! 👻 fantôme enregistré' : 'Record perso : ' + fmtTime(pb)}</p>
      ${online ? `<div class="field"><label>TON PSEUDO (classement en ligne)</label><input id="pname" maxlength="12" value="${name}" placeholder="JOUEUR"></div>
      <div class="row" style="margin-top:8px"><button class="btn" id="submit">📤 Envoyer mon temps</button></div>` :
        `<p class="hint">Configure un serveur (Versus en ligne) pour activer le classement en ligne.</p>`}
      <div class="status" id="st"></div>
      <div id="board" style="margin-top:8px"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn secondary" id="replay">▶ Revoir le replay</button>
        <button class="btn secondary" id="share">🔗 Partager</button>
      </div>
      <div class="status" id="shareSt"></div>
      <div class="menu-list" style="margin-top:10px">
        <button class="btn" id="retry">↻ Rejouer</button>
        <button class="btn secondary" id="map">🗺 Carte</button>
        <button class="btn ghost" id="menu">Menu</button>
      </div>
    `);
    const st = p.querySelector('#st');
    const board = p.querySelector('#board');
    const renderBoard = (scores) => {
      if (!scores) { board.innerHTML = ''; return; }
      if (scores.length === 0) { board.innerHTML = '<p class="hint">Sois le premier au classement !</p>'; return; }
      board.innerHTML = '<p class="hint" style="margin-bottom:4px">CLASSEMENT EN LIGNE</p>' +
        scores.slice(0, 10).map((s, i) => `<div style="display:flex;justify-content:space-between;font:12px monospace;padding:2px 8px;${(s.name===name)?'color:#46d8ff':''}"><span>${i + 1}. ${escapeHtml(s.name)}</span><span>${fmtTime(s.ms)}</span></div>`).join('');
    };
    if (online) {
      st.textContent = 'Chargement du classement…';
      Leaderboard.fetchTop(levelId).then((s) => { st.textContent = ''; renderBoard(s); });
      p.querySelector('#submit').onclick = async () => {
        const nm = p.querySelector('#pname').value.trim() || 'JOUEUR';
        Save.set('playerName', nm); st.textContent = 'Envoi…';
        const pbGhost = GhostStore.load(levelId) || ghostData;
        const r = await Leaderboard.submit(levelId, nm, ms, pbGhost);
        st.textContent = r ? `✓ Envoyé ! Tu es Nº ${r.rank}${r.total ? '/' + r.total : ''}` : '❌ Échec de l’envoi.';
        renderBoard(r && r.scores ? r.scores : await Leaderboard.fetchTop(levelId));
      };
    }
    const shareSt = p.querySelector('#shareSt');
    p.querySelector('#replay').onclick = () => this.watchReplay(payload, () => this.onSpeedrunFinishReopen(worldIdx, levelIdx, ms, ghostData));
    p.querySelector('#share').onclick = async () => {
      shareSt.textContent = 'Préparation…';
      let txt = '';
      if (online) { const code = await Share.upload(payload); if (code) txt = 'Code à partager : ' + code + '  '; }
      Share.download(payload, `bigmario_${levelId}_${Math.round(ms)}.bmr`);
      shareSt.textContent = (txt || 'Replay téléchargé. ') + '(fichier .bmr)';
    };
    p.querySelector('#retry').onclick = () => this.startSpeedrun(worldIdx, levelIdx);
    p.querySelector('#map').onclick = () => this.showMap('speedrun');
    p.querySelector('#menu').onclick = () => this.returnToMenu();
    this.checkOrientation();
  }
  // Réaffiche l'écran de fin après un replay (sans recompter le record)
  onSpeedrunFinishReopen(worldIdx, levelIdx, ms, ghostData) { this.onSpeedrunFinish(worldIdx, levelIdx, ms, ghostData); }

  // ---------- UI helpers ----------
  clearUI() { this.scene?.dispose?.(); ui.classList.add('hidden'); ui.innerHTML = ''; this.fadeIn(); }
  panel(html) {
    ui.classList.remove('hidden');
    ui.innerHTML = `<div class="panel">${html}</div>`;
    return ui.querySelector('.panel');
  }

  showTitle() {
    const p = this.panel(`
      <div class="title"><span class="big">BIGMARIO</span><span class="sub">PLATEFORME RÉTRO</span></div>
      <div class="menu-list">
        <button class="btn" id="b-solo">🗺 Aventure</button>
        <button class="btn" id="b-speed">⏱ Contre-la-montre</button>
        <button class="btn secondary" id="b-vs">⚔ Versus</button>
        <button class="btn secondary" id="b-edit">🛠 Créer un niveau</button>
        <button class="btn ghost" id="b-options">⚙ Options & Aide</button>
      </div>
      <p class="hint">Clavier: ◀▶ déplacer • Espace sauter • J tir • Échap pause.<br>Manette et tactile détectés automatiquement.</p>
    `);
    p.querySelector('#b-solo').onclick = () => { resumeAudio(); this.showMap('solo'); };
    p.querySelector('#b-speed').onclick = () => { resumeAudio(); this.showSpeedMenu(); };
    p.querySelector('#b-vs').onclick = () => { resumeAudio(); this.showVersusMenu(); };
    p.querySelector('#b-edit').onclick = () => { resumeAudio(); this.startEditor(); };
    p.querySelector('#b-options').onclick = () => this.showOptions();
  }

  showVersusMenu() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:34px">VERSUS</span><span class="sub">CHOISIS UN MODE</span></div>
      <div class="menu-list">
        <button class="btn" id="m-bot">🤖 Contre l'IA</button>
        <button class="btn" id="m-rival">🏁 Contre un Fantôme rival</button>
        <button class="btn secondary" id="m-local">👥 Local (2 joueurs)</button>
        <button class="btn secondary" id="m-online">🌐 En ligne</button>
        <button class="btn secondary" id="m-coop">🤝 Co-op en ligne</button>
        <button class="btn ghost" id="m-back">← Retour</button>
      </div>
    `);
    this._coopMode = false;
    p.querySelector('#m-bot').onclick = () => this.showArenaSelect('bot');
    p.querySelector('#m-rival').onclick = () => this.showArenaSelect('rival');
    p.querySelector('#m-local').onclick = () => this.showArenaSelect('local');
    p.querySelector('#m-online').onclick = () => this.showOnline();
    p.querySelector('#m-coop').onclick = () => { this._coopMode = true; this.showOnline(); };
    p.querySelector('#m-back').onclick = () => this.showTitle();
  }

  showWorldSelect() {
    const unlocked = Save.get('unlocked', 0);
    let cards = '';
    WORLDS.forEach((w, wi) => w.levels.forEach((l, li) => {
      const locked = wi > unlocked;
      const g = this.getGems(`gems.${wi}-${li}`);
      const gemTxt = !locked && g > 0 ? ` ◆${g}` : '';
      cards += `<div class="lvl-card" data-w="${wi}" data-l="${li}" ${locked ? 'data-lock="1"' : ''} style="${locked ? 'opacity:.45' : ''}">
        ${wi + 1}-${li + 1}<small>${locked ? '🔒' : l.name.replace(/^[0-9-]+\s*/, '') + gemTxt}</small></div>`;
    }));
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:34px">AVENTURE</span></div>
      <p class="hint">Choisis un niveau. Best: ${Save.get('best', 0)}</p>
      <div class="grid-levels">${cards}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    p.querySelectorAll('.lvl-card').forEach((card) => {
      if (card.dataset.lock) return;
      card.onclick = () => this.startSolo(+card.dataset.w, +card.dataset.l);
    });
    p.querySelector('#back').onclick = () => this.showTitle();
  }

  showArenaSelect(mode, net, localId) {
    let cards = ARENAS.map((a, i) => {
      const hasGhost = mode === 'rival' && GhostStore.has(`vghost.${i}`);
      return `<div class="lvl-card" data-i="${i}">${a.name}<small>${a.theme}${hasGhost ? ' 👻' : ''}</small></div>`;
    }).join('');
    const sub = mode === 'online' ? 'EN LIGNE' : mode === 'bot' ? "CONTRE L'IA" : mode === 'rival' ? 'FANTÔME RIVAL' : 'LOCAL — 2 JOUEURS';
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:34px">VERSUS</span><span class="sub">${sub}</span></div>
      <p class="hint">${mode === 'local'
        ? 'J1: ◀▶ + Espace + J. J2: F/H + T + U. (ou 2 manettes)'
        : mode === 'bot'
        ? 'Affronte le bot. Premier à 5 KO ou meilleur score au temps.'
        : mode === 'rival'
        ? "Affronte le fantôme d'un match précédent (👻). Sans fantôme, c'est l'IA — ton match en crée un !"
        : 'Premier à 5 KO ou meilleur score à la fin du temps.'}</p>
      <div class="grid-levels">${cards}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    p.querySelectorAll('.lvl-card').forEach((card) => {
      card.onclick = () => {
        const i = +card.dataset.i;
        if (mode === 'online') this.startVersusOnline(net, localId, i);
        else if (mode === 'bot') this.startVersusBot(i);
        else if (mode === 'rival') this.startVersusRival(i);
        else this.startVersusLocal(i);
      };
    });
    p.querySelector('#back').onclick = () => (mode === 'online' ? this.showOnline() : this.showVersusMenu());
  }

  showOnline() {
    const url = Save.get('serverUrl', '');
    const room = Save.get('room', 'arene1');
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:30px">VERSUS EN LIGNE</span></div>
      <div class="field"><label>ADRESSE DU SERVEUR (wss://...)</label>
        <input id="srv" placeholder="wss://mon-serveur.onrender.com" value="${url}"></div>
      <div class="field"><label>CODE DE SALON (partage-le à ton ami)</label>
        <input id="room" value="${room}"></div>
      <div class="status" id="st"></div>
      <div class="menu-list">
        <button class="btn" id="connect">🔌 Rejoindre le salon</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
      <p class="hint">Besoin d'un serveur gratuit ? Voir <span class="badge">README</span> : déploiement en 1 clic sur Render. Sans serveur, joue en <b>Versus local</b>.</p>
    `);
    const st = p.querySelector('#st');
    p.querySelector('#back').onclick = () => this.showVersusMenu();
    p.querySelector('#connect').onclick = async () => {
      const u = p.querySelector('#srv').value.trim();
      const r = p.querySelector('#room').value.trim() || 'arene1';
      if (!u) { st.textContent = '⚠ Entre l’adresse du serveur.'; return; }
      Save.set('room', r);
      st.textContent = 'Connexion…';
      const net = new NetClient();
      try {
        const info = await net.connect(u, r);
        st.innerHTML = `Connecté en tant que <b>${info.role === 'host' ? 'Hôte (J1)' : 'Invité (J2)'}</b>.`;
        const localId = info.role === 'host' ? 0 : 1;
        if (info.role === 'host') {
          st.innerHTML += '<br>En attente de l’adversaire…';
          net.on('peerjoin', () => { st.innerHTML += '<br>Adversaire connecté ! Choix de l’arène…'; setTimeout(() => this.showArenaSelect('online', net, localId), 600); });
          // si déjà 2 joueurs présents
          if (info.players >= 2) this.showArenaSelect('online', net, localId);
        } else {
          // invité: attend que l'hôte choisisse l'arène
          st.innerHTML += '<br>En attente du choix de l’hôte…';
          net.on('msg', (m) => { const d = m.d || m; if (d.t === 'arena') { this._coopMode = !!d.coop; this.startVersusOnline(net, localId, d.i); } });
        }
        // l'hôte annonce l'arène via showArenaSelect (on patche startVersusOnline pour host)
        if (info.role === 'host') this._hostNet = net;
      } catch (e) {
        st.textContent = '❌ ' + (e.message || 'Connexion impossible') + ' — vérifie l’adresse, ou joue en Versus local.';
      }
    };
  }

  showOptions() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:30px">OPTIONS</span></div>
      <div class="menu-list">
        <button class="btn secondary" id="ach">🏆 Succès (${unlockedCount()}/${ACHIEVEMENTS.length})</button>
        <button class="btn secondary" id="friend">👥 Fantôme d'ami / Replay</button>
        <button class="btn secondary" id="mute">${isMuted() ? '🔇 Son: COUPÉ' : '🔊 Son: ACTIVÉ'}</button>
        <button class="btn secondary" id="render">${this.use3D ? '🧊 Rendu: 3D' : '🟦 Rendu: 2D'}${is3DReady() ? '' : ' (3D indispo.)'}</button>
        <button class="btn secondary" id="motion">${this.reduceMotion ? '🌀 Animations: RÉDUITES' : '🌀 Animations: NORMALES'}</button>
        <button class="btn secondary" id="touch">🎮 Boutons tactiles</button>
        ${this._installPrompt ? '<button class="btn" id="install">📲 Installer l\'appli</button>' : ''}
        <button class="btn ghost" id="fs">⛶ Plein écran</button>
        <button class="btn danger" id="reset">🗑 Réinitialiser la progression</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
      <p class="hint"><b>Aide</b><br>• Saut variable : reste appuyé pour sauter plus haut.<br>• 🍄 grandir · 🔥 tir · ⭐ invincible · 🟢 1 vie · 🪶 <b>plume</b> = maintiens Saut en l'air pour <b>planer</b>.<br>• Enchaîne les écrasements en l'air pour des combos.<br>• <b>Bas en l'air = écrasement piqué</b> (broie tout, même les pics).<br>• Manette : A saut, X tir, Start pause.</p>
    `);
    p.querySelector('#ach').onclick = () => this.showAchievements();
    p.querySelector('#friend').onclick = () => this.showFriend();
    p.querySelector('#mute').onclick = (e) => { const m = toggleMute(); Save.set('muted', m); e.target.textContent = m ? '🔇 Son: COUPÉ' : '🔊 Son: ACTIVÉ'; };
    p.querySelector('#render').onclick = (e) => { this.use3D = !this.use3D; Save.set('render3d', this.use3D); e.target.textContent = (this.use3D ? '🧊 Rendu: 3D' : '🟦 Rendu: 2D') + (is3DReady() ? '' : ' (3D indispo.)'); };
    p.querySelector('#motion').onclick = (e) => { this.reduceMotion = !this.reduceMotion; Save.set('reduceMotion', this.reduceMotion); e.target.textContent = this.reduceMotion ? '🌀 Animations: RÉDUITES' : '🌀 Animations: NORMALES'; };
    p.querySelector('#touch').onclick = () => this.showTouchSettings();
    const ib = p.querySelector('#install');
    if (ib) ib.onclick = async () => { const pr = this._installPrompt; if (!pr) return; pr.prompt(); try { await pr.userChoice; } catch {} this._installPrompt = null; this.showOptions(); };
    p.querySelector('#fs').onclick = () => { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); };
    p.querySelector('#reset').onclick = () => { Save.set('unlocked', 0); Save.set('best', 0); this.showOptions(); };
    p.querySelector('#back').onclick = () => this.showTitle();
  }

  showTouchSettings() {
    const sizeLbl = { s: 'PETITE', m: 'MOYENNE', l: 'GRANDE' };
    const op = Math.round(Save.get('touchOpacity', 0.85) * 100);
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:24px">BOUTONS TACTILES</span></div>
      <p class="hint">Personnalise les commandes à l'écran (mobile, mode paysage). Un aperçu s'affiche en bas.</p>
      <div class="menu-list">
        <button class="btn secondary" id="size">Taille : ${sizeLbl[Save.get('touchSize', 'm')]}</button>
        <button class="btn secondary" id="op">Opacité : ${op}%</button>
        <button class="btn secondary" id="hand">Disposition : ${Save.get('touchHand', 'right') === 'left' ? 'GAUCHER' : 'DROITIER'}</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
      <p class="hint" id="prev"></p>
    `);
    // aperçu : on affiche temporairement les boutons tactiles
    const prevOn = !touchLayer.classList.contains('hidden');
    touchLayer.classList.remove('hidden');
    this.applyTouchSettings();
    const refresh = () => { this.applyTouchSettings(); this.showTouchSettings(); };
    p.querySelector('#size').onclick = () => { const o = ['s', 'm', 'l']; const i = o.indexOf(Save.get('touchSize', 'm')); Save.set('touchSize', o[(i + 1) % 3]); refresh(); };
    p.querySelector('#op').onclick = () => { let v = Save.get('touchOpacity', 0.85) + 0.15; if (v > 1.01) v = 0.4; Save.set('touchOpacity', Math.round(v * 100) / 100); refresh(); };
    p.querySelector('#hand').onclick = () => { Save.set('touchHand', Save.get('touchHand', 'right') === 'left' ? 'right' : 'left'); refresh(); };
    p.querySelector('#back').onclick = () => { if (!prevOn) touchLayer.classList.add('hidden'); this.showOptions(); };
  }

  showAchievements() {
    const rows = ACHIEVEMENTS.map((a) => {
      let on = false; try { on = a.check(); } catch {}
      return `<div style="display:flex;gap:8px;align-items:center;text-align:left;padding:4px 6px;${on ? '' : 'opacity:.45'}">
        <span style="font-size:18px">${on ? '🏆' : '🔒'}</span>
        <span><b style="font-size:12px">${a.name}</b><br><span class="hint" style="margin:0">${a.desc}</span></span></div>`;
    }).join('');
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:28px">SUCCÈS</span><span class="sub">${unlockedCount()}/${ACHIEVEMENTS.length} DÉBLOQUÉS</span></div>
      <div style="max-height:46vh;overflow:auto;margin-top:8px">${rows}</div>
      <div class="menu-list" style="margin-top:12px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    p.querySelector('#back').onclick = () => this.showOptions();
  }

  showFriend() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:24px">FANTÔME D'AMI / REPLAY</span></div>
      <p class="hint">Charge le fantôme d'un ami via un <b>code</b> (serveur requis) ou un <b>fichier .bmr</b>.</p>
      <div class="field"><label>CODE DE PARTAGE</label><input id="code" maxlength="8" placeholder="EX: AB12CD" style="text-transform:uppercase"></div>
      <div class="row" style="margin-top:8px">
        <button class="btn" id="load">📥 Charger le code</button>
        <button class="btn secondary" id="file">📂 Importer .bmr</button>
      </div>
      <input id="fileInput" type="file" accept=".bmr,application/json" style="display:none">
      <div class="status" id="st"></div>
      <div class="menu-list" style="margin-top:12px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    const st = p.querySelector('#st');
    const use = (payload) => {
      if (!payload || !payload.ghost) { st.textContent = '❌ Replay invalide.'; return; }
      this._loadedShare = payload;
      const where = payload.kind === 'arena' ? `Arène ${(payload.arena | 0) + 1}` : `Niveau ${(payload.w | 0) + 1}-${(payload.l | 0) + 1}`;
      st.innerHTML = `Chargé : <b>${escapeHtml(payload.name || 'JOUEUR')}</b> · ${where} · ${fmtTime(payload.ms || 0)}`;
      // boutons d'action
      const act = document.createElement('div'); act.className = 'row'; act.style.marginTop = '8px';
      act.innerHTML = `<button class="btn" id="watch">▶ Revoir</button>${payload.kind !== 'arena' ? '<button class="btn secondary" id="race">🏁 Courir contre</button>' : ''}`;
      st.appendChild(act);
      act.querySelector('#watch').onclick = () => this.watchReplay(payload, () => this.showFriend());
      const raceBtn = act.querySelector('#race');
      if (raceBtn) raceBtn.onclick = () => {
        GhostStore.save(`fghost.${payload.w}-${payload.l}`, payload.ghost);
        this.startSpeedrun(payload.w | 0, payload.l | 0);
      };
    };
    p.querySelector('#load').onclick = async () => {
      const code = p.querySelector('#code').value.trim().toUpperCase();
      if (!code) { st.textContent = '⚠ Entre un code.'; return; }
      if (!Leaderboard.apiBase()) { st.textContent = '⚠ Configure d’abord un serveur (Versus en ligne).'; return; }
      st.textContent = 'Recherche…';
      const s = await Share.fetch(code);
      if (s) use(s); else st.textContent = '❌ Code introuvable.';
    };
    const fileInput = p.querySelector('#fileInput');
    p.querySelector('#file').onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const f = fileInput.files && fileInput.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { const d = Share.parse(String(rd.result)); if (d) use(d); else st.textContent = '❌ Fichier invalide.'; };
      rd.readAsText(f);
    };
    p.querySelector('#back').onclick = () => this.showOptions();
  }

  showGameOver(score) {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:38px;color:#ff5d5d">GAME OVER</span></div>
      <p class="hint">Score: ${score} • Best: ${Save.get('best', 0)}</p>
      <div class="menu-list"><button class="btn" id="retry">↻ Réessayer</button>
      <button class="btn ghost" id="menu">Menu</button></div>
    `);
    p.querySelector('#retry').onclick = () => this.showWorldSelect();
    p.querySelector('#menu').onclick = () => this.showTitle();
    this.mode = 'menu'; this.scene = null; stopMusic(); this.checkOrientation();
  }
  showComplete(score) {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:30px;color:#ffd23b">BRAVO !</span><span class="sub">TU AS FINI L'AVENTURE</span></div>
      <p class="hint">Score final: ${score}</p>
      <div class="menu-list"><button class="btn" id="menu">Menu principal</button></div>
    `);
    p.querySelector('#menu').onclick = () => this.showTitle();
    this.mode = 'menu'; this.scene = null; stopMusic(); this.checkOrientation();
  }
}

// patch: quand l'hôte choisit l'arène en ligne, l'annoncer à l'invité (+ flag coop)
const _origStartOnline = Game.prototype.startVersusOnline;
Game.prototype.startVersusOnline = function (net, localId, arenaIdx) {
  if (localId === 0 && net) net.relay({ t: 'arena', i: arenaIdx, coop: !!this._coopMode });
  _origStartOnline.call(this, net, localId, arenaIdx);
};

window.addEventListener('load', () => {
  window.GAME = new Game();
  // PWA: installation + jeu hors-ligne
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
