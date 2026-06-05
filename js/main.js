// main.js — bootstrap: canvas adaptatif, boucle, gestionnaire de scènes, menus.
import { VIEW_W, VIEW_H, Save } from './core.js';
import { Input } from './input.js';
import { buildArt } from './art.js';
import { setArt } from './entities.js';
import { resumeAudio, toggleMute, isMuted, playMusic, stopMusic, SFX } from './audio.js';
import { GameScene } from './scene_game.js';
import { VersusScene } from './scene_versus.js';
import { MiniGameScene } from './scene_minigame.js';
import { MapScene } from './scene_map.js';
import { ReplayScene } from './scene_replay.js';
import { EditorScene } from './scene_editor.js';
import { WORLDS, ARENAS, MINIGAMES } from './levels.js';
import { NetClient } from './net.js';
import { PeerClient, MultiPeerHost } from './peerclient.js';
import { ensure3D, is3DReady, renderScene, resize3D, get3DCanvas } from './render3d.js';
import { Leaderboard, fmtTime } from './leaderboard.js';
import { GhostStore } from './ghost.js';
import { Share } from './share.js';
import { parTimes, medalFor, MEDAL_EMOJI } from './medals.js';
import { ACHIEVEMENTS, bumpStat, statValue, markSet, setSize, unlockedCount } from './achievements.js';
import { AI_PRESETS } from './ai.js';

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
    this._showFps = Save.get('showFps', false);
    this.use3D = Save.get('render3d', false); // 3D OFF par défaut pour garantir la visibilité des personnages
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
    ctx.imageSmoothingEnabled = Save.get('smooth2d', false);
    canvas.style.imageRendering = Save.get('smooth2d', false) ? 'auto' : 'pixelated';
    // canvas 3D superposé exactement sur le canvas 2D
    if (this.canvas3d) {
      const left = Math.round((innerWidth - cssW) / 2), top = Math.round((innerHeight - cssH) / 2);
      const s = this.canvas3d.style;
      s.position = 'fixed'; s.left = left + 'px'; s.top = top + 'px';
      // sur mobile (pointeur grossier) on plafonne la densité 3D -> rendu plus fluide
      const dpr3d = isTouch ? Math.min(dpr, 1.5) : dpr;
      resize3D(cssW, cssH, dpr3d);
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
    if (this._showFps) this.drawFps(ctx);
    requestAnimationFrame((tt) => this.loop(tt));
  }

  // Compteur d'images/seconde (vérifier la fluidité). Compte les frames de la
  // dernière seconde glissante -> FPS réel, sans dépendre de dt.
  drawFps(c) {
    const now = performance.now();
    (this._fpsBuf = this._fpsBuf || []).push(now);
    while (this._fpsBuf.length && now - this._fpsBuf[0] > 1000) this._fpsBuf.shift();
    const fps = this._fpsBuf.length;
    c.save();
    c.font = '8px monospace'; c.textAlign = 'left';
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(3, VIEW_H - 13, 46, 11);
    c.fillStyle = fps >= 50 ? '#7CFC9A' : fps >= 30 ? '#ffd23b' : '#ff5d5d';
    c.fillText(fps + ' FPS', 6, VIEW_H - 5);
    c.restore();
  }

  fadeIn() { this.fadeAlpha = 1; }

  applySmooth2d() { const on = Save.get('smooth2d', false); canvas.style.imageRendering = on ? 'auto' : 'pixelated'; ctx.imageSmoothingEnabled = on; }

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
    // Permettre la pause en mode 'game' et 'versus' uniquement
    if (this.mode !== 'game' && this.mode !== 'versus') return;
    // Ne pas mettre en pause pendant la transition de scène (paused est déjà false)
    this.paused = !this.paused; SFX.pause?.();
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
    const botSkill = this._botSkill ?? AI_PRESETS.medium.skill;
    this._restart = () => this.startVersusBot(arenaIdx);
    this.scene = new VersusScene(this, { mode: 'bot', arenaIdx, botSkill });
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
    const medal = ['🥇', '🥈', '🥉'];
    add('🚫 Aucun fantôme', 'ghost', () => this.startSpeedrun(worldIdx, levelIdx, { none: true }));
    // top-3 LOCAL (hors-ligne) — tes meilleurs runs nommés
    const local = GhostStore.localTop(levelId);
    local.forEach((g) => add(`${medal[g.rank - 1] || '🏅'} ${escapeHtml(g.name)} · ${fmtTime(g.ms)}`, 'secondary', () => this.startSpeedrun(worldIdx, levelIdx, { localRank: g.rank })));
    if (!local.length && pb != null) add(`🔵 Ton record · ${fmtTime(pb)}`, 'secondary', () => this.startSpeedrun(worldIdx, levelIdx, {}));
    st.textContent = local.length ? 'Choisis qui affronter :' : 'Finis ce niveau pour créer des fantômes à affronter.';
    // top-3 EN LIGNE (seulement si un serveur est configuré)
    if (Leaderboard.apiBase()) {
      const list = await Leaderboard.fetchGhostList(levelId);
      list.forEach((g) => add(`🌐 ${medal[g.rank - 1] || '🏅'} ${escapeHtml(g.name)} · ${fmtTime(g.ms)}`, '', () => this.startSpeedrun(worldIdx, levelIdx, { onlineRank: g.rank })));
    }
    p.querySelector('#back').onclick = () => this.showMap('speedrun');
  }

  startSpeedrun(worldIdx = 0, levelIdx = 0, pick = {}) {
    this.clearUI(); this.mode = 'game'; this.paused = false;
    this._restart = () => this.startSpeedrun(worldIdx, levelIdx, pick);
    this.scene = new GameScene(this, worldIdx, levelIdx, null, { speedrun: true });
    this.checkOrientation();
    const levelId = `${worldIdx}-${levelIdx}`;
    if (pick.none) { this.scene.ghosts = []; return; } // course sans fantôme
    if (pick.localRank) {
      // fantôme LOCAL choisi (top-3 hors-ligne) — on l'affiche seul (doré, nommé)
      const g = GhostStore.localTopData(levelId, pick.localRank);
      this.scene.ghosts = [];
      if (g) this.scene.addGhost(g.data, { glow: '#ffd23b', label: (g.name || 'TOI').slice(0, 10) });
      return;
    }
    // fantôme d'ami chargé localement (mauve)
    const fr = GhostStore.load(`fghost.${levelId}`);
    if (fr) this.scene.addGhost(fr, { glow: '#b06ad8', label: 'AMI' });
    // fantôme en ligne choisi (par rang dans le top 3) — seulement si serveur configuré
    if (Leaderboard.apiBase()) Leaderboard.fetchGhost(levelId, pick.onlineRank || 1).then((res) => {
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
  endVersus() {
    if (this.net) { this.net.close?.(); this.net = null; }
    // Afficher un écran de résultats après un match versus
    const sc = this.scene;
    const kos = sc ? sc.kos : [0, 0];
    const winner = sc ? sc.winner : -1;
    const modeName = sc ? sc.mode : 'bot';

    // Hook tournoi : si un callback est enregistré, on l'appelle à la place du menu résultat
    if (this._onVersusEnd) {
      const cb = this._onVersusEnd;
      delete this._onVersusEnd;
      this.paused = false; this.mode = 'menu';
      this.scene?.dispose?.(); this.scene = null;
      stopMusic(); this.checkOrientation();
      cb(sc || { winner: -1, kos: [] });
      return;
    }

    const isBot = modeName === 'bot' || modeName === 'rival';
    let winLabel, winColor;
    if (winner < 0) { winLabel = 'EGALITÉ !'; winColor = '#fff'; }
    else if (isBot) { winLabel = winner === 0 ? '🏆 VICTOIRE !' : '❌ DÉFAITE'; winColor = winner === 0 ? '#ffd23b' : '#ff5d5d'; }
    else if (modeName === 'online' || modeName === 'ffa') { winLabel = winner === sc?.localId ? '🏆 VICTOIRE !' : '❌ DÉFAITE'; winColor = winner === sc?.localId ? '#ffd23b' : '#ff5d5d'; }
    else { winLabel = `JOUEUR ${winner + 1} GAGNE !`; winColor = '#ffd23b'; }
    this.paused = false; this.mode = 'menu';
    this.scene?.dispose?.(); this.scene = null;
    stopMusic(); this.checkOrientation();
    const koLine = kos.map((k, i) => `J${i+1} ${k}ko`).join(' — ');
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:28px;color:${winColor}">${winLabel}</span></div>
      <p style="font-size:18px;font-weight:900;margin:10px 0">${koLine}</p>
      <div class="menu-list">
        <button class="btn" id="retry">↻ Rejouer</button>
        <button class="btn secondary" id="others">⚔ Autre arène</button>
        <button class="btn ghost" id="menu">Menu principal</button>
      </div>
    `);
    p.querySelector('#retry').onclick = () => this._restart?.();
    p.querySelector('#others').onclick = () => this.showVersusMenu();
    p.querySelector('#menu').onclick = () => this.returnToMenu();
  }
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
        <button class="btn secondary" id="b-mini">🎮 Mini-jeux</button>
        <button class="btn secondary" id="b-edit">🛠 Créer un niveau</button>
        <button class="btn ghost" id="b-options">⚙ Options & Aide</button>
      </div>
      <p class="hint">Clavier: ◀▶ déplacer • Espace sauter • J tir • Échap pause.<br>Manette et tactile détectés automatiquement.</p>
    `);
    p.querySelector('#b-solo').onclick = () => { resumeAudio(); this.showMap('solo'); };
    p.querySelector('#b-speed').onclick = () => { resumeAudio(); this.showSpeedMenu(); };
    p.querySelector('#b-vs').onclick = () => { resumeAudio(); this.showVersusMenu(); };
    p.querySelector('#b-mini').onclick = () => { resumeAudio(); this.showMiniMenu(); };
    p.querySelector('#b-edit').onclick = () => { resumeAudio(); this.startEditor(); };
    p.querySelector('#b-options').onclick = () => this.showOptions();
  }

  showVersusMenu() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:34px">VERSUS</span><span class="sub">CHOISIS UN MODE</span></div>
      <div class="menu-list">
        <button class="btn" id="m-bot">🤖 Contre l'IA</button>
        <button class="btn" id="m-rival">🏁 Contre un Fantôme rival</button>
        <button class="btn secondary" id="m-local">🎹 Meme clavier — 2 joueurs sur cet ecran</button>
        <button class="btn secondary" id="m-p2p">📡 2–8 PC / LAN — sans serveur (P2P)</button>
        <button class="btn ghost" id="m-back">← Retour</button>
      </div>
      <p class="hint" style="margin-top:8px">
        🎹 = 1 seul ordinateur, clavier partage &nbsp;|&nbsp;
        📡 = 2 a 8 PC, lobby WebRTC sans serveur, modes 1v1 / FFA / Tournoi
      </p>
    `);
    p.querySelector('#m-bot').onclick    = () => { resumeAudio(); this.showDifficultyPicker('bot'); };
    p.querySelector('#m-rival').onclick  = () => { resumeAudio(); this.showDifficultyPicker('rival'); };
    p.querySelector('#m-local').onclick  = () => this.showLocalHelp();
    p.querySelector('#m-p2p').onclick    = () => { resumeAudio(); this.showP2PLobby(); };
    p.querySelector('#m-back').onclick   = () => this.showTitle();
  }

  // Explique les controles local avant de choisir l'arene
  showLocalHelp() {
    resumeAudio();
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:28px">🎹 MODE LOCAL</span><span class="sub">MEME CLAVIER, MEME ECRAN</span></div>
      <p class="hint">Les 2 joueurs jouent sur <b>le meme ordinateur</b> avec un clavier partage.</p>
      <table style="margin:10px auto;border-collapse:collapse;font-size:13px;text-align:center">
        <tr style="background:#1a2a3a">
          <th style="padding:6px 14px;color:#7fc6ff">JOUEUR 1</th>
          <th style="padding:6px 14px;color:#37c24a">JOUEUR 2</th>
        </tr>
        <tr><td style="padding:5px 14px">← → &nbsp; Fleches / ZQSD</td><td style="padding:5px 14px">F / H &nbsp; (gauche / droite)</td></tr>
        <tr><td>Saut : Espace / W / K</td><td>Saut : T / Y</td></tr>
        <tr><td>Feu : J / Shift / L</td><td>Feu : U</td></tr>
      </table>
      <div class="menu-list" style="margin-top:12px">
        <button class="btn" id="go">🎮 Choisir l'arene</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
    `);
    p.querySelector('#go').onclick   = () => this.showArenaSelect('local');
    p.querySelector('#back').onclick = () => this.showVersusMenu();
  }

  // ================================================================
  // TOURNOI — bracket single elimination
  // ================================================================
  // (classe interne, pas exportee)
  _mkBracket(ids) {
    let n = 1; while (n < ids.length) n *= 2;
    const pad = [...ids]; while (pad.length < n) pad.push(null);
    const rounds = []; let cur = [...pad];
    while (cur.length > 1) {
      const r = []; for (let i = 0; i < cur.length; i += 2) r.push([cur[i], cur[i+1] ?? null]);
      rounds.push(r); cur = r.map(() => null);
    }
    const obj = { players: ids, rounds, currentRound: 0, currentMatch: 0, _w: {} };
    const skipByes = () => {
      while (obj.currentRound < obj.rounds.length) {
        const pair = obj.rounds[obj.currentRound]?.[obj.currentMatch];
        if (!pair || (pair[0] != null && pair[1] != null)) break;
        obj.recordWinner(pair[0] ?? pair[1]);
      }
    };
    obj.recordWinner = (id) => {
      const key = `${obj.currentRound}_${obj.currentMatch}`;
      obj._w[key] = id;
      if (obj.currentRound + 1 < obj.rounds.length) {
        const slot = Math.floor(obj.currentMatch / 2);
        obj.rounds[obj.currentRound + 1][slot][obj.currentMatch % 2] = id;
      }
      obj.currentMatch++;
      if (obj.currentMatch >= obj.rounds[obj.currentRound].length) { obj.currentRound++; obj.currentMatch = 0; }
      skipByes();
    };
    Object.defineProperty(obj, 'currentPair', { get: () => obj.currentRound < obj.rounds.length ? obj.rounds[obj.currentRound]?.[obj.currentMatch] ?? null : null });
    Object.defineProperty(obj, 'isComplete',   { get: () => obj.currentRound >= obj.rounds.length });
    Object.defineProperty(obj, 'champion',      { get: () => obj._w[`${obj.rounds.length-1}_0`] ?? null });
    skipByes();
    return obj;
  }

  // ================================================================
  // LOBBY P2P — jusqu'a 8 joueurs
  // ================================================================
  showP2PLobby() {
    resumeAudio();
    let hostObj = null;
    let guestPeer = null;
    let slots = [];
    const MAX = 8;

    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:24px">📡 LOBBY P2P</span><span class="sub">JUSQU'A 8 JOUEURS SANS SERVEUR</span></div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn" id="tab-h" style="flex:1">🏠 Heberger</button>
        <button class="btn ghost" id="tab-g" style="flex:1">🔗 Rejoindre</button>
      </div>
      <div id="content"></div>
      <div class="status" id="st"></div>
      <div class="row" style="margin-top:8px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    const st = p.querySelector('#st');
    const content = p.querySelector('#content');

    // ---- Onglet HOTE ----
    const showHost = () => {
      p.querySelector('#tab-h').className = 'btn';
      p.querySelector('#tab-g').className = 'btn ghost';
      content.innerHTML = `
        <div id="slots" style="max-height:250px;overflow-y:auto"></div>
        <button class="btn secondary" id="add" style="width:100%;margin-top:6px">+ Ajouter un joueur (slot)</button>
        <div id="modes" style="margin-top:10px"></div>
      `;

      const renderSlots = () => {
        const sd = content.querySelector('#slots');
        if (!slots.length) { sd.innerHTML = '<p class="hint" style="text-align:center">Clique + pour generer un code par joueur.</p>'; return; }
        sd.innerHTML = slots.map((s, i) => `
          <div style="background:${s.connected?'rgba(55,194,74,0.12)':'rgba(127,198,255,0.07)'};border:1px solid ${s.connected?'#37c24a':'#334'};border-radius:7px;padding:8px;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              <b style="color:${s.connected?'#37c24a':'#7fc6ff'}">J${i+2}</b>
              <span style="font-size:11px;color:${s.connected?'#37c24a':'#888'}">${s.connected?'✓ Connecte':'En attente...'}</span>
            </div>
            ${!s.connected ? `
              <textarea id="c${s.id}" rows="2" readonly style="width:100%;font-size:9px;font-family:monospace;resize:none;background:#0a1a2a;color:#aaa;margin-bottom:4px">${s.code}</textarea>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <button class="btn ghost" id="cp${s.id}" style="padding:3px 8px;font-size:11px">📋 Copier</button>
                <input id="ai${s.id}" placeholder="Reponse de J${i+2}..." style="flex:1;min-width:100px;font-size:11px">
                <button class="btn secondary" id="ac${s.id}" style="padding:3px 8px;font-size:11px">✅</button>
              </div>
            ` : ''}
          </div>
        `).join('');
        slots.forEach(s => {
          document.getElementById(`cp${s.id}`)?.addEventListener('click', () => { navigator.clipboard?.writeText(s.code); st.textContent = 'Code J' + (slots.indexOf(s)+2) + ' copie !'; });
          const acBtn = document.getElementById(`ac${s.id}`);
          if (acBtn) acBtn.onclick = async () => {
            const ans = document.getElementById(`ai${s.id}`)?.value.trim();
            if (!ans) { st.textContent = 'Colle la reponse.'; return; }
            st.textContent = 'Connexion J' + (slots.indexOf(s)+2) + '...';
            try { await hostObj.acceptAnswer(s.id, ans); }
            catch(e) { st.textContent = 'Erreur: ' + e.message; }
          };
        });
      };

      const renderModes = () => {
        const n = hostObj ? hostObj.connectedCount : 1;
        const md = content.querySelector('#modes');
        if (!md) return;
        if (n < 2) { md.innerHTML = '<p class="hint" style="text-align:center">Connecte au moins 1 ami pour jouer.</p>'; return; }
        const ids = [0, ...(hostObj?.connectedIds || [])].slice(0, n);
        md.innerHTML = `
          <p class="hint" style="margin-bottom:6px"><b>${n} joueur${n>1?'s':''}</b> connectes</p>
          <div class="menu-list">
            <button class="btn" id="m1v1">⚔️ 1v1 (J1 vs J2)</button>
            ${n >= 3 ? `<button class="btn secondary" id="mffa">🎯 FFA ${n} joueurs (simultane)</button>` : ''}
            ${n >= 4 ? `<button class="btn secondary" id="mtour">🏆 Tournoi 1v1 progressif (${n} joueurs)</button>` : ''}
          </div>
        `;
        md.querySelector('#m1v1').onclick = () => this._p2pArenaSelect(hostObj, [0, hostObj.connectedIds[0] ?? 1], false);
        md.querySelector('#mffa')?.addEventListener('click', () => this._p2pArenaSelect(hostObj, ids, false));
        md.querySelector('#mtour')?.addEventListener('click', () => this._p2pArenaSelect(hostObj, ids, true));
      };

      hostObj = new MultiPeerHost();
      hostObj.on('peerjoin', ({ id }) => {
        const s = slots.find(s => s.id === id);
        if (s) s.connected = true;
        renderSlots(); renderModes();
      });

      content.querySelector('#add').onclick = async () => {
        if (slots.length >= MAX - 1) { st.textContent = 'Maximum ' + MAX + ' joueurs.'; return; }
        st.textContent = 'Generation du code...';
        try {
          const { id, code } = await hostObj.addSlot();
          slots.push({ id, code, connected: false });
          renderSlots(); renderModes();
          st.textContent = 'Code genere pour J' + (slots.length+1) + '. Envoie-le a ton ami.';
        } catch(e) { st.textContent = 'Erreur: ' + e.message; }
      };
      renderSlots(); renderModes();
    };

    // ---- Onglet GUEST ----
    const showGuest = () => {
      p.querySelector('#tab-h').className = 'btn ghost';
      p.querySelector('#tab-g').className = 'btn';
      content.innerHTML = `
        <p class="hint">Colle le code que l'hote t'a envoye, genere ta reponse et renvoie-la a l'hote.</p>
        <textarea id="ofin" rows="3" placeholder="Code de l'hote..." style="width:100%;font-size:9px;font-family:monospace;resize:none;background:#0a1a2a;color:#aaa"></textarea>
        <button class="btn" id="gans" style="width:100%;margin-top:6px">⚙️ Generer ma reponse</button>
        <textarea id="anout" rows="3" readonly placeholder="Ton code de reponse..." style="width:100%;font-size:9px;font-family:monospace;resize:none;background:#0a1a2a;color:#aaa;margin-top:6px"></textarea>
        <button class="btn ghost" id="cpans" style="display:none;width:100%;margin-top:4px">📋 Copier ma reponse</button>
      `;
      content.querySelector('#gans').onclick = async () => {
        const offer = content.querySelector('#ofin').value.trim();
        if (!offer) { st.textContent = "Colle le code de l'hote."; return; }
        st.textContent = 'Generation...';
        try {
          guestPeer = new PeerClient();
          const { answerCode, waitForConnection } = await guestPeer.answerOffer(offer);
          content.querySelector('#anout').value = answerCode;
          const cb = content.querySelector('#cpans');
          cb.style.display = '';
          cb.onclick = () => { navigator.clipboard?.writeText(answerCode); st.textContent = 'Copie !'; };
          st.textContent = "Envoie ce code a l'hote. En attente de connexion...";
          waitForConnection().then(() => {
            st.innerHTML = '<b style="color:#37c24a">Connecte !</b> L\'hote va lancer la partie...';
            guestPeer.on('msg', (m) => {
              const d = m.d || m;
              if (d.t === 'arena') this.startVersusP2P(guestPeer, d.guestId ?? 1, d.i, d.playerCount || 2);
              if (d.t === 'tournament_match') this.startVersusP2P(guestPeer, d.localId, d.arenaIdx, 2);
            });
          }).catch(() => { st.textContent = 'Timeout. Recommence.'; });
        } catch(e) { st.textContent = 'Code invalide: ' + e.message; }
      };
    };

    p.querySelector('#tab-h').onclick = showHost;
    p.querySelector('#tab-g').onclick = showGuest;
    p.querySelector('#back').onclick  = () => { guestPeer?.disconnect(); hostObj?.disconnect(); this.showVersusMenu(); };
    showHost();
  }

  // ---- Selection arene P2P (host annonce aux guests) ----
  _p2pArenaSelect(host, playerIds, tournament) {
    const cards = ARENAS.map((a, i) => `<div class="lvl-card" data-i="${i}"><div class="lvl-thumb" style="background:${a.bg||'#1a3a5c'}"></div><div class="lvl-name">${a.name||'Arena '+(i+1)}</div></div>`).join('');
    const n = playerIds.length;
    const label = tournament ? `Tournoi ${n}J` : n > 2 ? `FFA ${n}J` : '1v1';
    const pp = this.panel(`
      <div class="title"><span class="big">🏁 ARENE</span><span class="sub">${label}</span></div>
      <div class="grid-levels">${cards}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    pp.querySelectorAll('.lvl-card').forEach(card => {
      card.onclick = () => {
        const i = +card.dataset.i;
        if (tournament) {
          this._tournamentBracket = this._mkBracket(playerIds);
          this.showTournamentBracket(host, playerIds, i);
        } else {
          playerIds.forEach((pid, idx) => {
            if (pid === 0) return;
            host.sendTo(pid, { t: 'relay', d: { t: 'arena', i, playerCount: n, guestId: idx } });
          });
          this.startVersusP2P(host, 0, i, n);
        }
      };
    });
    pp.querySelector('#back').onclick = () => this.showP2PLobby();
  }

  // ---- Lancer une partie P2P ----
  startVersusP2P(net, localId, arenaIdx, playerCount = 2) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this._restart = () => this.startVersusP2P(net, localId, arenaIdx, playerCount);
    this.scene = new VersusScene(this, { mode: playerCount > 2 ? 'ffa' : 'online', net, localId, arenaIdx, playerCount });
    this.checkOrientation();
  }

  // ---- Bracket de tournoi ----
  showTournamentBracket(host, playerIds, arenaIdx) {
    const bracket = this._tournamentBracket;
    const lbl = (id) => id === 0 ? 'Vous' : `J${playerIds.indexOf(id)+1}`;
    const colFor = (id) => ['#7fc6ff','#37c24a','#ff8a3b','#ff5d5d','#c084fc','#f9a825','#4dd0e1','#ef9a9a'][playerIds.indexOf(id) % 8];

    const bHTML = bracket.rounds.map((round, ri) => {
      const rname = ri === bracket.rounds.length-1 ? 'FINALE' : ri === bracket.rounds.length-2 ? 'DEMI-FINALES' : `ROUND ${ri+1}`;
      const matches = round.map((pair, mi) => {
        const key = `${ri}_${mi}`;
        const winner = bracket._w[key];
        const isCur = ri === bracket.currentRound && mi === bracket.currentMatch;
        const p1 = pair[0]; const p2 = pair[1];
        return `<div style="display:inline-flex;flex-direction:column;margin:3px;padding:6px 10px;background:${isCur?'rgba(255,210,59,0.18)':'rgba(255,255,255,0.05)'};border:1px solid ${isCur?'#ffd23b':'#334'};border-radius:6px;font-size:11px;text-align:center;min-width:72px">
          <span style="color:${winner===p1?'#ffd23b':p1!=null?colFor(p1):'#444'}">${p1!=null?lbl(p1):'BYE'}</span>
          <span style="color:#555;font-size:9px">vs</span>
          <span style="color:${winner===p2?'#ffd23b':p2!=null?colFor(p2):'#444'}">${p2!=null?lbl(p2):'BYE'}</span>
          ${winner!=null?`<span style="color:#ffd23b;font-size:9px;margin-top:2px">→ ${lbl(winner)}</span>`:''}
        </div>`;
      }).join('');
      return `<div style="margin-bottom:10px"><div style="font-size:10px;color:#888;margin-bottom:3px">${rname}</div>${matches}</div>`;
    }).join('');

    const pair = bracket.currentPair;
    let matchSection = '';
    if (bracket.isComplete) {
      matchSection = `<div style="text-align:center;padding:14px;background:rgba(255,210,59,0.12);border-radius:8px">
        <div style="font-size:22px;color:#ffd23b">🏆 CHAMPION : ${lbl(bracket.champion)} 🏆</div>
      </div>`;
    } else if (pair) {
      const [p1, p2] = pair;
      matchSection = `<div style="padding:10px;background:rgba(255,210,59,0.1);border-radius:8px;text-align:center">
        <div style="font-size:12px;color:#aaa">Match suivant :</div>
        <div style="font-size:16px;margin:4px 0"><b style="color:${colFor(p1)}">${lbl(p1)}</b> <span style="color:#ffd23b">VS</span> <b style="color:${colFor(p2)}">${lbl(p2)}</b></div>
        <button class="btn" id="launch" style="margin-top:6px">⚔️ Lancer ce match</button>
      </div>`;
    }

    const pp = this.panel(`
      <div class="title"><span class="big" style="font-size:24px">🏆 TOURNOI</span></div>
      <div style="overflow-x:auto;margin:6px 0">${bHTML}</div>
      ${matchSection}
      <div class="status" id="tst" style="margin-top:6px"></div>
      <div class="row" style="margin-top:8px"><button class="btn ghost" id="tback">← Quitter tournoi</button></div>
    `);

    pp.querySelector('#tback').onclick = () => { delete this._tournamentBracket; this.showVersusMenu(); };

    if (pair && !bracket.isComplete) {
      const [p1Id, p2Id] = pair;
      pp.querySelector('#launch').onclick = () => {
        const myLocalId = p1Id === 0 ? 0 : p2Id === 0 ? 1 : -1;
        if (p1Id !== 0) host.sendTo(p1Id, { t: 'relay', d: { t: 'tournament_match', localId: 0, arenaIdx } });
        if (p2Id !== 0) host.sendTo(p2Id, { t: 'relay', d: { t: 'tournament_match', localId: 1, arenaIdx } });
        if (myLocalId >= 0) {
          this._onVersusEnd = (scene) => {
            const w = scene.winner;
            const winId = w === 0 ? p1Id : p2Id;
            bracket.recordWinner(winId);
            delete this._onVersusEnd;
            this.showTournamentBracket(host, playerIds, arenaIdx);
          };
          this.startVersusP2P(host, myLocalId, arenaIdx, 2);
        } else {
          pp.querySelector('#tst').textContent = 'Match en cours...';
          host.on('msg', (m) => {
            if (m.d?.t === 'end') {
              const w = m.d.winner; const winId = w === 0 ? p1Id : p2Id;
              bracket.recordWinner(winId);
              this.showTournamentBracket(host, playerIds, arenaIdx);
            }
          });
        }
      };
    }
  }

  // Mode P2P direct WebRTC : 2 PC sans aucun serveur (legacy 2-joueurs, garde pour compat)
  showP2P() { this.showP2PLobby(); }

  // ---- Mini-jeux : courses à la collecte contre l'IA ----
  showMiniMenu() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:34px">MINI-JEUX</span><span class="sub">COURSE CONTRE L'IA</span></div>
      <div class="menu-list">
        <button class="btn" id="coin">● Course aux pièces</button>
        <button class="btn secondary" id="star">✦ Course aux étoiles</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
      <p class="hint">Ramasse plus d'objets que l'IA avant la fin du temps.<br>L'IA fonce vers le collectible le plus proche : sois plus rapide !</p>
    `);
    p.querySelector('#coin').onclick = () => { resumeAudio(); this.showDifficultyPicker('minigame', 'coin'); };
    p.querySelector('#star').onclick = () => { resumeAudio(); this.showDifficultyPicker('minigame', 'star'); };
    p.querySelector('#back').onclick = () => this.showTitle();
  }

  // Affiche un choix de difficulté avant le versus bot ou le mini-jeu
  showDifficultyPicker(dest, kindOrMode = null) {
    const presets = [
      { key: 'easy',   ...AI_PRESETS.easy },
      { key: 'medium', ...AI_PRESETS.medium },
      { key: 'hard',   ...AI_PRESETS.hard },
      { key: 'extreme',...AI_PRESETS.extreme },
    ];
    const current = Save.get('aiDifficulty', 'medium');
    const btns = presets.map((pr) =>
      `<button class="btn ${pr.key === current ? '' : 'ghost'}" id="d-${pr.key}">${pr.emoji} ${pr.label}</button>`
    ).join('');
    const title = dest === 'minigame' ? 'MINI-JEU' : 'VERSUS IA';
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:26px">⚔️ DIFFICULTÉ</span><span class="sub">${title}</span></div>
      <p class="hint">Choisis le niveau de l’IA :</p>
      <div class="menu-list">${btns}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    presets.forEach((pr) => {
      p.querySelector(`#d-${pr.key}`).onclick = () => {
        Save.set('aiDifficulty', pr.key);
        this._botSkill = pr.skill;
        if (dest === 'minigame') this.showMiniMapSelect(kindOrMode);
        else this.showArenaSelect(dest);
      };
    });
    p.querySelector('#back').onclick = () => {
      if (dest === 'minigame') this.showMiniMenu();
      else this.showVersusMenu();
    };
  }

  showMiniMapSelect(kind) {
    const cards = MINIGAMES.map((m, i) => `<div class="lvl-card" data-i="${i}">${m.name}</div>`).join('');
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:30px">${kind === 'star' ? '✦ ÉTOILES' : '● PIÈCES'}</span><span class="sub">CHOISIS UN TERRAIN</span></div>
      <div class="grid-levels">${cards}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    p.querySelectorAll('.lvl-card').forEach((card) => { card.onclick = () => this.startMiniGame(kind, +card.dataset.i); });
    p.querySelector('#back').onclick = () => this.showMiniMenu();
  }

  startMiniGame(kind, mapIdx = 0) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    const botSkill = this._botSkill ?? AI_PRESETS.medium.skill;
    this._restart = () => this.startMiniGame(kind, mapIdx);
    this._miniReturn = () => this.showMiniMapSelect(kind);
    this.scene = new MiniGameScene(this, { kind, mapIdx, botSkill });
    this.checkOrientation();
  }

  endMiniGame() {
    const sc = this.scene ? this.scene.scores : [0, 0];
    const kind = this.scene ? this.scene.kind : 'coin';
    const winner = this.scene ? this.scene.winner : -1;
    const icon = kind === 'star' ? '✦' : '●';
    this.mode = 'menu';
    const verdict = winner < 0 ? 'ÉGALITÉ' : winner === 0 ? '🏆 VICTOIRE !' : 'DÉFAITE';
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:28px;color:${winner === 0 ? '#ffd23b' : '#7fc6ff'}">${verdict}</span></div>
      <p style="font-size:20px;font-weight:900;margin:8px 0">TOI ${icon} ${sc[0]} &nbsp;—&nbsp; ${sc[1]} ${icon} IA</p>
      <div class="menu-list" style="margin-top:10px">
        <button class="btn" id="retry">↻ Rejouer</button>
        <button class="btn secondary" id="other">🎮 Autre terrain</button>
        <button class="btn ghost" id="menu">Menu</button>
      </div>
    `);
    const ret = this._miniReturn || (() => this.showMiniMenu());
    p.querySelector('#retry').onclick = () => this._restart();
    p.querySelector('#other').onclick = () => ret();
    p.querySelector('#menu').onclick = () => this.returnToMenu();
    this.scene = null; stopMusic(); this.checkOrientation();
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
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const genCode = () => { let c = ''; for (let i = 0; i < 4; i++) c += CHARS[(Math.random() * CHARS.length) | 0]; return c; };
    const savedUrl  = Save.get('serverUrl', '');
    const savedRoom = Save.get('room', '') || genCode();
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:28px">🌐 VERSUS EN LIGNE</span></div>
      <div class="field">
        <label>TON CODE DE SALON</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="room" value="${escapeHtml(savedRoom)}"
            style="font-size:20px;font-weight:900;letter-spacing:6px;text-transform:uppercase;text-align:center;flex:1">
          <button class="btn ghost" id="newcode" style="padding:6px 10px" title="Nouveau code">🎲</button>
          <button class="btn ghost" id="copy"    style="padding:6px 10px" title="Copier le code">📋</button>
        </div>
        <small class="hint">Donne ce code a ton ami — il devra entrer le meme code.</small>
      </div>
      <div class="field">
        <label>ADRESSE DU SERVEUR (wss://…)</label>
        <input id="srv" placeholder="wss://bigmario.onrender.com" value="${escapeHtml(savedUrl)}">
        <small class="hint">Deploie le serveur gratuitement depuis GitHub (voir README) puis colle ici le lien wss://.</small>
      </div>
      <div class="status" id="st"></div>
      <div class="menu-list">
        <button class="btn" id="connect">🔌 Rejoindre / Heberger</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
    `);
    const st     = p.querySelector('#st');
    const roomIn = p.querySelector('#room');
    const srvIn  = p.querySelector('#srv');
    p.querySelector('#newcode').onclick = () => { roomIn.value = genCode(); };
    p.querySelector('#copy').onclick = () => {
      const code = roomIn.value.trim().toUpperCase();
      navigator.clipboard?.writeText(code)
        .then(() => { st.textContent = `Code copie : ${code}`; setTimeout(() => { st.textContent = ''; }, 2000); })
        .catch(() => { st.textContent = `Code : ${code}  (copie manuelle)`; });
    };
    p.querySelector('#back').onclick = () => this.showVersusMenu();
    p.querySelector('#connect').onclick = async () => {
      const u = srvIn.value.trim();
      const r = (roomIn.value.trim().toUpperCase() || genCode()).slice(0, 16);
      if (!u) { st.textContent = "Entrez l'adresse du serveur (wss://...)."; return; }
      Save.set('serverUrl', u); Save.set('room', r);
      st.textContent = 'Connexion en cours...';
      const net = new NetClient();
      try {
        const info = await net.connect(u, r);
        const roleLabel = info.role === 'host' ? 'Hote — J1 (gauche)' : 'Invite — J2 (droite)';
        st.innerHTML = `<b>${roleLabel}</b> — salon : <b>${r}</b>`;
        const localId = info.role === 'host' ? 0 : 1;
        if (info.role === 'host') {
          st.innerHTML += `<br>En attente de votre adversaire (code : <b>${r}</b>)...`;
          const proceed = () => {
            st.innerHTML += '<br>Adversaire connecte ! Selection de l\'arene...';
            setTimeout(() => this.showArenaSelect('online', net, localId), 600);
          };
          net.on('peerjoin', proceed);
          if (info.players >= 2) proceed();
        } else {
          st.innerHTML += "<br>En attente du choix d'arene de l'hote...";
          net.on('msg', (m) => { const d = m.d || m; if (d.t === 'arena') { this._coopMode = !!d.coop; this.startVersusOnline(net, localId, d.i); } });
        }
        if (info.role === 'host') this._hostNet = net;
      } catch (e) {
        st.textContent = `Connexion impossible : ${e.message || 'erreur reseau'}. Verifiez l'adresse ou jouez en Versus local.`;
      }
    };
  }



  // ---- Hors-ligne : installation PWA + état du cache + mode local ----
  showOffline() {
    const ready = typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller;
    const installable = !!this._installPrompt;
    // sur GitHub Pages, on déduit l'URL d'archive du dépôt pour proposer un téléchargement
    let ghZip = null;
    try {
      const host = location.hostname;
      if (host.endsWith('github.io')) {
        const user = host.split('.')[0];
        const repo = location.pathname.split('/').filter(Boolean)[0] || `${user}.github.io`;
        ghZip = `https://github.com/${user}/${repo}/archive/refs/heads/main.zip`;
      }
    } catch {}
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:26px">JOUER HORS-LIGNE</span></div>
      <p class="hint" style="margin-top:6px">${ready
        ? '✅ <b>Jeu prêt hors-ligne</b> : tout (y compris la 3D) est mis en cache. Coupe le réseau, ça tourne pareil.'
        : '⏳ Première mise en cache… reste connecté quelques secondes, puis reviens ici.'}</p>
      <div class="menu-list" style="margin-top:12px">
        ${installable ? '<button class="btn" id="install">📲 Installer l\'appli (écran d\'accueil)</button>' : ''}
        <button class="btn secondary" id="prepare">⤓ Préparer le hors-ligne maintenant</button>
        ${ghZip ? `<a class="btn secondary" id="dl" href="${ghZip}" download style="text-decoration:none;display:block">💾 Télécharger le jeu (.zip)</a>` : ''}
        <button class="btn ghost" id="back">← Retour</button>
      </div>
      <div class="status" id="st"></div>
      <p class="hint" style="text-align:left">
        <b>3 façons de jouer sans internet :</b><br>
        1. <b>Installer l'appli</b> (bouton ci-dessus, ou « Ajouter à l'écran d'accueil » du navigateur) puis la lancer hors-ligne.<br>
        2. <b>Garder l'onglet</b> : après une visite en ligne, le jeu se relance hors-ligne (Three.js est livré en local).<br>
        3. <b>Version fichier</b> : télécharge le dossier du jeu et lance un petit serveur local —<br>
        &nbsp;&nbsp;<span class="badge">python3 -m http.server</span> puis ouvre <span class="badge">http://localhost:8000</span><br>
        &nbsp;&nbsp;(ouvrir index.html en double-clic ne marche pas : les modules JS exigent un serveur).
      </p>
    `);
    const st = p.querySelector('#st');
    const ib = p.querySelector('#install');
    if (ib) ib.onclick = async () => { const pr = this._installPrompt; if (!pr) return; pr.prompt(); try { await pr.userChoice; } catch {} this._installPrompt = null; this.showOffline(); };
    p.querySelector('#prepare').onclick = async () => {
      st.textContent = 'Mise en cache du jeu…';
      try {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
        // réchauffe le cache en préchargeant les modules clés (dont Three.js)
        await Promise.all(['./js/vendor/three.module.js', './index.html', './js/main.js'].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
        st.innerHTML = '✅ Prêt : tu peux couper le réseau et jouer.';
      } catch { st.textContent = '⚠ Impossible de précharger ici. Recharge la page une fois en ligne.'; }
    };
    p.querySelector('#back').onclick = () => this.showOptions();
  }

  showOptions() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:30px">OPTIONS</span></div>
      <div class="menu-list">
        <button class="btn secondary" id="ach">🏆 Succès (${unlockedCount()}/${ACHIEVEMENTS.length})</button>
        <button class="btn" id="offline">📥 Jouer hors-ligne</button>
        <button class="btn secondary" id="friend">👥 Fantôme d'ami / Replay</button>
        <button class="btn secondary" id="mute">${isMuted() ? '🔇 Son: COUPÉ' : '🔊 Son: ACTIVÉ'}</button>
        <button class="btn secondary" id="render">${this.use3D ? '🧊 Rendu: 3D' : '🟦 Rendu: 2D'}${is3DReady() ? '' : ' (3D indispo.)'}</button>
        <button class="btn secondary" id="pseudo">✏ Pseudo : ${escapeHtml(Save.get('playerName', 'MOI'))}</button>
        <button class="btn secondary" id="motion">${this.reduceMotion ? '🌀 Animations: RÉDUITES' : '🌀 Animations: NORMALES'}</button>
        <button class="btn secondary" id="smooth2d">${Save.get('smooth2d', false) ? '🖼 Lissage 2D: ON' : '🖼 Lissage 2D: OFF (pixel)'}</button>
        <button class="btn secondary" id="fps">${this._showFps ? '📊 Compteur FPS: ON' : '📊 Compteur FPS: OFF'}</button>
        <button class="btn secondary" id="touch">🎮 Boutons tactiles</button>
        ${this._installPrompt ? '<button class="btn" id="install">📲 Installer l\'appli</button>' : ''}
        <button class="btn ghost" id="fs">⛶ Plein écran</button>
        <button class="btn danger" id="reset">🗑 Réinitialiser la progression</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
      <p class="hint"><b>Aide</b><br>• Saut variable : reste appuyé pour sauter plus haut.<br>• 🍄 grandir · 🔥 tir · ⭐ invincible · 🟢 1 vie · 🪶 <b>plume</b> = maintiens Saut en l'air pour <b>planer</b>.<br>• Enchaîne les écrasements en l'air pour des combos.<br>• <b>Bas en l'air = écrasement piqué</b> (broie tout, même les pics).<br>• Manette : A saut, X tir, Start pause.</p>
    `);
    p.querySelector('#ach').onclick = () => this.showAchievements();
    p.querySelector('#offline').onclick = () => this.showOffline();
    p.querySelector('#fps').onclick = (e) => { this._showFps = !this._showFps; Save.set('showFps', this._showFps); e.target.textContent = this._showFps ? '📊 Compteur FPS: ON' : '📊 Compteur FPS: OFF'; };
    p.querySelector('#friend').onclick = () => this.showFriend();
    p.querySelector('#mute').onclick = (e) => { const m = toggleMute(); Save.set('muted', m); e.target.textContent = m ? '🔇 Son: COUPÉ' : '🔊 Son: ACTIVÉ'; };
    p.querySelector('#render').onclick = (e) => { this.use3D = !this.use3D; Save.set('render3d', this.use3D); e.target.textContent = (this.use3D ? '🧊 Rendu: 3D' : '🟦 Rendu: 2D') + (is3DReady() ? '' : ' (3D indispo.)'); };
    p.querySelector('#pseudo').onclick = (e) => { const n = (prompt('Ton pseudo (nom de tes fantômes) :', Save.get('playerName', 'MOI')) || '').trim().slice(0, 12); if (n) { Save.set('playerName', n); e.target.textContent = '✏ Pseudo : ' + n; } };
    p.querySelector('#motion').onclick = (e) => { this.reduceMotion = !this.reduceMotion; Save.set('reduceMotion', this.reduceMotion); e.target.textContent = this.reduceMotion ? '🌀 Animations: RÉDUITES' : '🌀 Animations: NORMALES'; };
    p.querySelector('#smooth2d').onclick = (e) => { const v = !Save.get('smooth2d', false); Save.set('smooth2d', v); this.applySmooth2d(); e.target.textContent = v ? '🖼 Lissage 2D: ON' : '🖼 Lissage 2D: OFF (pixel)'; };
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
