// main.js — bootstrap: canvas adaptatif, boucle, gestionnaire de scènes, menus.
import { VIEW_W, VIEW_H, Save } from './core.js';
import { Input } from './input.js';
import { buildArt, SKIN_LIST } from './art.js';
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
import { PeerClient, MultiPeerHost, warmupServer } from './netclient.js';
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
    // --- Skin system ---
    this._currentSkinId = Save.get('bigmario_skin', 'bolt');
    // Vérifier que le skin sauvegardé existe, sinon fallback
    if (!this.art.skins[this._currentSkinId]) this._currentSkinId = 'bolt';
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
    const difficulty = Save.get('aiDifficulty', 'medium');
    this._botSkill = AI_PRESETS[difficulty]?.skill ?? AI_PRESETS.medium.skill;
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
    const playMode = this.mode === 'game' || this.mode === 'versus' || this.mode === 'replay' || this.mode === 'mariokart';
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
    const skinSet = this.art.skins[this._currentSkinId] || this.art.hero;
    const img = skinSet.smallIdle;
    if (img) ctx.drawImage(img, 24, VIEW_H - 30 - hop);
  }

  drawPauseOverlay() {
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1;
  }

  togglePause() {
    // Permettre la pause dans tous les modes de jeu (sauf le menu lui-même)
    if (!this.mode || this.mode === 'menu') return;
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
  startLevel(worldIdx, levelIdx, ghostMode = false, startPlaying = true) {
    const lDef = WORLDS[worldIdx].levels[levelIdx];
    const lid = `${worldIdx}-${levelIdx}`;
    
    // Générer un fantôme STAFF si aucun n'existe pour ce niveau
    if (!GhostStore.has(lid) && GhostStore._topRaw(lid).length === 0) {
      this.generateStaffGhost(lDef, lid);
    }
    
    this.startMiniGame(lDef);
  }
  startSolo(worldIdx = 0, levelIdx = 0) {
    this.clearUI(); this.mode = 'game'; this.paused = false;
    this._restart = () => this.startSolo(worldIdx, levelIdx);
    this.scene = new GameScene(this, worldIdx, levelIdx);
    this.checkOrientation();
  }
  startVersusLocal(arenaIdx = 0, playerCount = 2, ids = null) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this._restart = () => this.startVersusLocal(arenaIdx, playerCount, ids);
    const botSkill = this._botSkill ?? AI_PRESETS.medium.skill;
    this.scene = new VersusScene(this, { mode: 'local', arenaIdx, playerCount, ids, botSkill });
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
      this.scene?.unbindNet?.();
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
    // Si une mise à jour du SW attendait, recharger maintenant
    if (window._swPendingUpdate) { window._swPendingUpdate = false; window.location.reload(); }
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

  generateStaffGhost(levelDef, levelId) {
    // Importation dynamique de BotBrain, Player, Level pour la simulation
    import('./ai.js').then(AI => {
      import('./entities.js').then(ENT => {
        import('./level.js').then(LVL => {
          import('./ghost.js').then(GH => {
            const level = new LVL.Level(levelDef);
            const player = new ENT.Player(level.start.x, level.start.y, { skin: 'bolt', id: 0 });
            const bot = new AI.BotBrain({ skill: 1.0 }); // EXTREME skill
            const ghostRec = new GH.GhostRecorder();
            let ms = 0;
            // Boucle de simulation rapide (max 120 sec de jeu)
            const sceneMock = { addFloat:()=>{}, burst:()=>{}, spawnHazard:()=>{}, level: level, player: player, addShake:()=>{} };
            while (ms < 120000 && !player.win && !player.dead && player.y < level.pixelH + 100) {
              const inputs = bot.think(1/60, { me: player, level: level });
              player.update(1/60, level, inputs, sceneMock);
              ghostRec.update(1/60, player, ms);
              // Vérifier si la cible est atteinte
              const gx = level.goal.x, gy = level.goal.y;
              if (player.x + player.w >= gx - 16 && player.x <= gx + 24 && player.y + player.h >= gy && player.y <= gy + 64) {
                 player.win = true;
              }
              // Si boss, il faudrait le simuler aussi, mais on saute cette partie (les boss prennent trop de temps à simuler sans boucle complète)
              if (levelDef.name.includes("boss") || levelDef.name.includes("Boss")) return; // skip staff ghost for boss
              ms += 1000/60;
            }
            if (player.win) {
               GH.GhostStore.addLocalTop(levelId, "BOT STAFF", ms, ghostRec.data());
               GH.GhostStore.save(levelId, ghostRec.data()); // default ghost
            }
          });
        });
      });
    });
  }

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
        <button class="btn secondary" id="b-mk" style="background:linear-gradient(to bottom, #d02020, #a01010); border-color:#fff;">🏎 Mario Kart</button>
        <button class="btn secondary" id="b-edit">🛠 Créer un niveau</button>
        <button class="btn ghost" id="b-options">⚙ Options & Aide</button>
      </div>
      <p class="hint">Clavier: ◀▶ déplacer • Espace sauter • J tir • Échap pause.<br>Manette et tactile détectés automatiquement.</p>
    `);
    p.querySelector('#b-solo').onclick = () => { resumeAudio(); this.showMap('solo'); };
    p.querySelector('#b-speed').onclick = () => { resumeAudio(); this.showSpeedMenu(); };
    p.querySelector('#b-vs').onclick = () => { resumeAudio(); this.showVersusMenu(); };
    p.querySelector('#b-mini').onclick = () => { resumeAudio(); this.showMiniMenu(); };
    p.querySelector('#b-mk').onclick = () => { resumeAudio(); this.startMarioKart(); };
    p.querySelector('#b-edit').onclick = () => { resumeAudio(); this.startEditor(); };
    p.querySelector('#b-options').onclick = () => this.showOptionsMenu();
  }

  showVersusMenu() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:32px">VERSUS</span></div>
      <div class="menu-list">
        <button class="btn" id="m-local">🎮 Local : Mode Libre</button>
        <button class="btn secondary" id="m-local-tourney">🏆 Local : Championnat</button>
        <button class="btn" id="m-p2p" style="margin-top:10px">📡 En Ligne (Code) : Mode Libre</button>
        <button class="btn secondary" id="m-p2p-tourney">🏆 En Ligne (Code) : Championnat</button>
        <button class="btn ghost" id="m-back" style="margin-top:15px">← Retour</button>
      </div>
      <p class="hint" style="margin-top:8px">
        🎮 = Multijoueur sur ce PC (Clavier/Manettes) &nbsp;|&nbsp;
        📡 = Multijoueur P2P via code (2-8 Joueurs)
      </p>
    `);
    p.querySelector('#m-local').onclick  = () => { resumeAudio(); this.showLocalHelp(); };
    p.querySelector('#m-local-tourney').onclick  = () => { resumeAudio(); this.showLocalTournamentSetup(); };
    p.querySelector('#m-p2p').onclick    = () => { resumeAudio(); this.showP2PLobby(false); };
    p.querySelector('#m-p2p-tourney').onclick = () => { resumeAudio(); this.showP2PLobby(true); };
    p.querySelector('#m-back').onclick   = () => this.showTitle();
  }

  showLocalHelp() {
    resumeAudio();
    const curDiff = Save.get('aiDifficulty', 'medium');
    const diffLabels = { easy: '😊 Facile', medium: '⚔️ Normal', hard: '🔥 Difficile', extreme: '💀 Extrême' };
    const diffKeys = ['easy', 'medium', 'hard', 'extreme'];
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:28px">🎮 MODE LOCAL FFA</span><span class="sub">SUR CE PC</span></div>
      <p class="hint">Jusqu'à 4 combattants dans l'arène.</p>
      <div style="display:flex; justify-content:center; gap: 15px; margin: 10px 0;">
        <label>Humains: <select id="h-count"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label>
        <label>Bots (IA): <select id="b-count"><option selected>0</option><option>1</option><option>2</option><option>3</option></select></label>
      </div>
      <div style="display:flex; justify-content:center; align-items:center; gap: 8px; margin: 8px 0;">
        <span style="color:#aaa">Niveau IA :</span>
        <button class="btn ghost" id="diff-btn" style="font-size:14px; padding:2px 12px;">${diffLabels[curDiff]}</button>
      </div>
      <div class="row" style="margin-top:16px">
        <button class="btn ghost" id="back">← Retour</button>
        <button class="btn" id="go">Choisir l'arène →</button>
      </div>
    `);
    let diffIdx = diffKeys.indexOf(curDiff);
    if (diffIdx < 0) diffIdx = 1;
    const diffBtn = p.querySelector('#diff-btn');
    diffBtn.onclick = () => {
      diffIdx = (diffIdx + 1) % diffKeys.length;
      const key = diffKeys[diffIdx];
      Save.set('aiDifficulty', key);
      this._botSkill = AI_PRESETS[key].skill;
      diffBtn.textContent = diffLabels[key];
    };
    p.querySelector('#go').onclick = () => {
      const h = +p.querySelector('#h-count').value;
      const b = +p.querySelector('#b-count').value;
      const total = h + b;
      if (total < 2 || total > 4) { alert("Le total doit être entre 2 et 4."); return; }
      this._botSkill = AI_PRESETS[diffKeys[diffIdx]].skill;
      const ids = [];
      for (let i=0; i<h; i++) ids.push(i);
      for (let i=0; i<b; i++) ids.push('AI_' + i);
      this.showArenaSelect('local', null, null, total, ids);
    };
    p.querySelector('#back').onclick = () => this.showVersusMenu();
  }

  showLocalTournamentSetup() {
    resumeAudio();
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:28px">🏆 TOURNOI LOCAL</span><span class="sub">SUR CE PC</span></div>
      <p class="hint">Un bracket d'élimination s'affichera. Total max: 8.</p>
      <div style="display:flex; justify-content:center; gap: 15px; margin: 10px 0;">
        <label>Humains: <select id="h-count-t"><option>1</option><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option><option>7</option><option>8</option></select></label>
        <label>Bots (IA): <select id="b-count-t"><option selected>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option><option>7</option></select></label>
      </div>
      <div class="row" style="margin-top:16px">
        <button class="btn ghost" id="back">← Retour</button>
        <button class="btn" id="go">Générer le Tournoi →</button>
      </div>
    `);
    p.querySelector('#go').onclick = () => {
      const h = +p.querySelector('#h-count-t').value;
      const b = +p.querySelector('#b-count-t').value;
      const total = h + b;
      if (total < 3 || total > 8) { alert("Le total doit être entre 3 et 8 pour un tournoi intéressant."); return; }
      const ids = [];
      for (let i=0; i<h; i++) ids.push(i);
      for (let i=0; i<b; i++) ids.push('AI_' + i);
      this.showArenaSelect('tourney_local', null, null, total, ids);
    };
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
    const obj = { players: ids, rounds, currentRound: 0, _w: {} };
    
    obj.recordWinner = (id, mi) => {
      const key = `${obj.currentRound}_${mi}`;
      if (obj._w[key] !== undefined) return;
      obj._w[key] = id;
      if (obj.currentRound + 1 < obj.rounds.length) {
        const slot = Math.floor(mi / 2);
        obj.rounds[obj.currentRound + 1][slot][mi % 2] = id;
      }
      const roundComplete = obj.rounds[obj.currentRound].every((pair, i) => obj._w[`${obj.currentRound}_${i}`] !== undefined);
      if (roundComplete) { obj.currentRound++; skipByes(); }
    };
    
    const skipByes = () => {
      while (obj.currentRound < obj.rounds.length) {
        let hasBye = false;
        const byes = [];
        obj.rounds[obj.currentRound].forEach((pair, mi) => {
          if ((pair[0] == null || pair[1] == null) && obj._w[`${obj.currentRound}_${mi}`] === undefined) byes.push({id: pair[0] ?? pair[1], mi});
        });
        if (byes.length === 0) break;
        byes.forEach(b => { obj.recordWinner(b.id, b.mi); hasBye = true; });
        if (!hasBye) break;
      }
    };
    
    Object.defineProperty(obj, 'currentMatches', { get: () => obj.currentRound < obj.rounds.length ? obj.rounds[obj.currentRound] : [] });
    Object.defineProperty(obj, 'isComplete',   { get: () => obj.currentRound >= obj.rounds.length });
    Object.defineProperty(obj, 'champion',      { get: () => obj._w[`${obj.rounds.length-1}_0`] ?? null });
    skipByes();
    return obj;
  }

  // ================================================================
  // LOBBY EN LIGNE — WebSocket relay, 2-8 joueurs
  // ================================================================
  showP2PLobby(tournament = false) {
    resumeAudio();
    warmupServer(); // réveille le serveur Render en arrière-plan dès l'ouverture
    let hostObj   = null;
    let guestPeer = null;

    const modeName = tournament ? '🏆 CHAMPIONNAT EN LIGNE' : '📡 MODE LIBRE EN LIGNE';
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:22px">${modeName}</span><span class="sub">SALON • CODE • 2-8 JOUEURS</span></div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn" id="tab-h" style="flex:1">🏠 Héberger</button>
        <button class="btn ghost" id="tab-g" style="flex:1">🔗 Rejoindre</button>
      </div>
      <div id="content"></div>
      <div class="status" id="st"></div>
      <div class="row" style="margin-top:8px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    const st      = p.querySelector('#st');
    const content = p.querySelector('#content');

    const cleanUp = () => {
      if (hostObj)   { hostObj.disconnect();   hostObj   = null; }
      if (guestPeer) { guestPeer.disconnect(); guestPeer = null; }
    };

    // ───────────────────────── ONGLET HÔTE ─────────────────────────
    const showHost = () => {
      cleanUp();
      p.querySelector('#tab-h').className = 'btn';
      p.querySelector('#tab-g').className = 'btn ghost';
      content.innerHTML = `
        <div style="background:rgba(255,255,255,0.04);border:1px solid #334;border-radius:8px;padding:14px">
          <p class="hint" style="margin-bottom:10px">Configure ton salon puis clique sur Créer.</p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:10px;font-size:13px">
            <label>Pseudo hôte: <input id="h-pseudo" placeholder="Hôte" maxlength="16"
              style="width:90px;padding:3px 6px;background:#1a1030;border:1px solid #556;border-radius:4px;color:#fff"></label>
            <label>Joueurs max: <select id="h-max">
              <option value="2">2</option><option value="3">3</option><option value="4" selected>4</option>
              <option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option>
            </select></label>
          </div>
          <button class="btn" id="create-room" style="width:100%">🎮 Créer le salon</button>
          <div id="room-info" style="display:none;margin-top:12px;text-align:center">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px">Code à partager</div>
            <div id="room-code-display" style="font-size:38px;font-weight:900;color:#ffd23b;letter-spacing:6px;margin:4px 0">----</div>
            <button class="btn ghost" id="cp-code" style="padding:4px 12px;font-size:12px">📋 Copier le code</button>
          </div>
        </div>
        <div id="player-list-section" style="display:none;margin-top:12px">
          <div style="font-size:12px;color:#7fc6ff;font-weight:bold;margin-bottom:6px">
            Joueurs connectés : <span id="player-count">1</span>/<span id="player-max">4</span>
          </div>
          <div id="players-box" style="display:flex;flex-direction:column;gap:5px"></div>
          <div id="host-actions" style="margin-top:12px">
            <label style="font-size:12px">Ajouter des Bots (IA):
              <select id="p2p-bots"><option selected>0</option><option>1</option><option>2</option>
              <option>3</option><option>4</option><option>5</option><option>6</option><option>7</option></select>
            </label>
            <button class="btn ${tournament ? 'secondary' : ''}" id="start-btn" style="width:100%;margin-top:10px">
              ${tournament ? '🏆 Démarrer le Tournoi' : '⚔️ Démarrer la Partie'}
            </button>
            <p class="hint" style="margin-top:6px">Tu peux démarrer même si le salon n'est pas plein.</p>
          </div>
        </div>
      `;

      const createBtn  = content.querySelector('#create-room');
      const roomInfo   = content.querySelector('#room-info');
      const codeDisp   = content.querySelector('#room-code-display');
      const cpBtn      = content.querySelector('#cp-code');
      const listSec    = content.querySelector('#player-list-section');
      const countDisp  = content.querySelector('#player-count');
      const maxDisp    = content.querySelector('#player-max');
      const box        = content.querySelector('#players-box');
      const hostActs   = content.querySelector('#host-actions');

      const updatePlayerList = () => {
        if (!hostObj) return;
        const n = hostObj.connectedCount;
        countDisp.textContent = n;
        const hPseudo = escapeHtml(hostObj.pseudo || 'Hôte');
        let html = `<div style="padding:6px 10px;background:rgba(55,194,74,0.12);border:1px solid #37c24a;border-radius:6px;font-size:13px">👑 <b>${hPseudo}</b> <span style="color:#37c24a;font-size:11px">Hôte</span></div>`;
        hostObj.connectedIds.forEach((pid) => {
          const pName = escapeHtml(hostObj.pseudos?.get(pid) || ('Joueur ' + (pid + 1)));
          html += `<div style="padding:6px 10px;background:rgba(127,198,255,0.08);border:1px solid #334;border-radius:6px;font-size:13px">👤 <b>${pName}</b></div>`;
        });
        box.innerHTML = html;
      };

      createBtn.onclick = async () => {
        createBtn.disabled = true;
        const maxP   = parseInt(content.querySelector('#h-max').value, 10);
        const pseudo = content.querySelector('#h-pseudo').value.trim() || 'Hôte';
        st.textContent = 'Connexion au serveur...';
        try {
          hostObj = new MultiPeerHost();
          hostObj.pseudo = pseudo;
          hostObj.pseudos.set(0, pseudo);
          hostObj.onStatus((msg) => { st.textContent = msg; });
          const code = await hostObj.open(maxP, pseudo);
          st.textContent = '';
          createBtn.style.display = 'none';
          content.querySelector('#h-pseudo').style.display = 'none';
          content.querySelector('#h-max').parentElement.style.display = 'none';
          roomInfo.style.display = 'block';
          codeDisp.textContent   = code;
          listSec.style.display  = 'block';
          maxDisp.textContent    = maxP;
          updatePlayerList();

          cpBtn.onclick = () => {
            navigator.clipboard?.writeText(code);
            cpBtn.textContent = '✅ Copié !';
            setTimeout(() => { cpBtn.textContent = '📋 Copier le code'; }, 2000);
          };

          hostObj.on('peerjoin', () => { updatePlayerList(); st.textContent = ''; });
          hostObj.on('peerleave', () => { updatePlayerList(); });
          hostObj.on('pseudo_update', () => { updatePlayerList(); });

          hostActs.querySelector('#start-btn').onclick = () => {
            const bots = parseInt(hostActs.querySelector('#p2p-bots').value, 10);
            const ids  = [0, ...hostObj.connectedIds];
            for (let i = 0; i < bots; i++) ids.push('AI_' + i);
            if (!tournament && ids.length > 4) { st.textContent = 'FFA limité à 4 joueurs (bots inclus).'; return; }
            if (ids.length > 8) { st.textContent = 'Maximum 8 joueurs (bots inclus).'; return; }
            this._p2pArenaSelect(hostObj, ids, tournament);
          };

        } catch (err) {
          st.textContent = 'Erreur : ' + err.message;
          createBtn.disabled = false;
        }
      };
    };

    // ───────────────────────── ONGLET GUEST ────────────────────────
    const showGuest = () => {
      cleanUp();
      p.querySelector('#tab-h').className = 'btn ghost';
      p.querySelector('#tab-g').className = 'btn';
      const urlCode = new URLSearchParams(window.location.search).get('room') || '';
      content.innerHTML = `
        <div style="background:rgba(255,255,255,0.04);border:1px solid #334;border-radius:8px;padding:14px;text-align:center">
          <p class="hint" style="margin-bottom:10px">Entre le code à 4 lettres fourni par l'hôte.</p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">
            <input id="g-pseudo" placeholder="Ton pseudo" maxlength="16"
              style="width:110px;padding:4px 8px;background:#1a1030;border:1px solid #556;border-radius:4px;color:#fff;font-size:13px">
            <input id="room-code-input" placeholder="CODE" maxlength="4" value="${escapeHtml(urlCode.toUpperCase())}"
              style="width:90px;font-size:24px;text-align:center;text-transform:uppercase;font-weight:900;letter-spacing:3px;background:#1a1030;border:1px solid #556;border-radius:4px;color:#ffd23b">
          </div>
          <button class="btn" id="join-room" style="width:100%">🔌 Rejoindre</button>
        </div>
        <div id="guest-players-box" style="margin-top:12px;display:flex;flex-direction:column;gap:5px"></div>
      `;

      const joinBtn = content.querySelector('#join-room');
      const input   = content.querySelector('#room-code-input');
      const gBox    = content.querySelector('#guest-players-box');
      let myId = null;

      const renderPlayers = () => {
        if (!guestPeer) return;
        let html = '<div style="font-size:12px;color:#7fc6ff;font-weight:bold;margin-bottom:6px">Joueurs dans le salon :</div>';
        guestPeer.pseudos.forEach((pseudo, pid) => {
          const pName  = escapeHtml(pseudo);
          const isMe   = pid === myId;
          const isHost = pid === 0;
          const icon   = isHost ? '👑' : '👤';
          const bg     = isMe ? 'rgba(255,210,59,0.12)' : 'rgba(127,198,255,0.08)';
          const border = isMe ? '#ffd23b' : '#334';
          html += `<div style="padding:6px 10px;background:${bg};border:1px solid ${border};border-radius:6px;font-size:13px">${icon} <b>${pName}</b>${isMe?' <span style="color:#ffd23b;font-size:11px">(Toi)</span>':isHost?' <span style="color:#37c24a;font-size:11px">Hôte</span>':''}</div>`;
        });
        gBox.innerHTML = html;
      };

      joinBtn.onclick = async () => {
        const code   = input.value.trim().toUpperCase();
        const pseudo = content.querySelector('#g-pseudo').value.trim() || 'Joueur';
        if (code.length !== 4) { st.textContent = 'Le code doit faire 4 lettres.'; return; }
        joinBtn.disabled = true;
        st.textContent = `Connexion au salon ${code}...`;
        try {
          guestPeer = new PeerClient();
          guestPeer.pseudo = pseudo;
          guestPeer.onStatus((msg) => { st.textContent = msg; });
          const info = await guestPeer.connect(code, pseudo);
          myId = info.localId;
          st.innerHTML = `<b style="color:#37c24a">✅ Connecté !</b> En attente du lancement par l'hôte...`;
          joinBtn.style.display = 'none';
          input.style.display   = 'none';
          content.querySelector('#g-pseudo').style.display = 'none';
          renderPlayers();

          guestPeer.on('peerjoin',      renderPlayers);
          guestPeer.on('peerleave',     renderPlayers);
          guestPeer.on('pseudo_update', renderPlayers);

          guestPeer.on('msg', (m) => {
            const d = m.d || m;
            // Lancement de partie envoyé via server 'start'
            if (d.t === 'start') {
              if (d.tournament) {
                this._tournamentBracket = this._mkBracket(d.ids);
                this.showTournamentBracket(guestPeer, d.ids, d.arenaIdx);
              } else {
                this.startVersusP2P(guestPeer, myId, d.arenaIdx || 0, d.playerCount || 2, d.ids || [0, myId]);
              }
            }
            if (d.t === 'arena') {
              this.startVersusP2P(guestPeer, myId, d.i, d.playerCount || 2, d.ids || [0, myId]);
            }
            if (d.t === 'tournament_sync') {
              if (this._tournamentBracket) this._tournamentBracket._w = d.w;
              this.showTournamentBracket(guestPeer, d.ids, d.arenaIdx);
            }
            if (d.t === 'tournament_round') {
              const match = d.matches.find(m => m.p1Id === myId || m.p2Id === myId);
              if (match) {
                this._onVersusEnd = (scene) => { delete this._onVersusEnd; this.showTournamentBracket(guestPeer, d.ids, d.arenaIdx); };
                this.startVersusP2P(guestPeer, match.p1Id === myId ? 0 : 1, d.arenaIdx, 2, [match.p1Id, match.p2Id]);
              } else {
                const st = document.getElementById('tst');
                if (st) st.textContent = 'Matchs en cours...';
              }
            }
          });

        } catch (err) {
          st.textContent = 'Erreur : ' + err.message;
          joinBtn.disabled = false;
        }
      };
    };

    p.querySelector('#tab-h').onclick = showHost;
    p.querySelector('#tab-g').onclick = showGuest;
    p.querySelector('#back').onclick  = () => { cleanUp(); this.showVersusMenu(); };

    // Auto basculer en guest si ?room= dans l'URL
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    if (urlRoom && urlRoom.length === 4) showGuest(); else showHost();
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
          // Annoncer le lancement à tous les guests avec les IDs exacts
          if (host.startGame) host.startGame(i, playerIds, true);
          this.showTournamentBracket(host, playerIds, i);
        } else {
          // Annoncer l'arène à tous les guests avec les IDs exacts
          if (host.startGame) host.startGame(i, playerIds, false);
          this.startVersusP2P(host, 0, i, n, playerIds);
        }
      };
    });
    pp.querySelector('#back').onclick = () => this.showP2PLobby(tournament);
  }

  // ---- Lancer une partie P2P ----
  startVersusP2P(net, localId, arenaIdx, playerCount = 2, ids = null) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this._restart = () => this.startVersusP2P(net, localId, arenaIdx, playerCount, ids);
    this.scene = new VersusScene(this, { mode: playerCount > 2 ? 'ffa' : 'online', net, localId, arenaIdx, playerCount, ids });
    this.checkOrientation();
  }

  // ---- Bracket de tournoi ----
  showTournamentBracket(mode, playerIds, arenaIdx) {
    const bracket = this._tournamentBracket;
    const host = (mode === 'local' || mode === 'tourney_local') ? null : mode;
    const lbl = (id) => {
      if (typeof id === 'string' && id.startsWith('AI')) return 'IA';
      if (host && host.pseudos && host.pseudos.has(id)) return escapeHtml(host.pseudos.get(id));
      return id === 0 ? 'Vous' : `J${playerIds.indexOf(id)+1}`;
    };
    const colFor = (id) => ['#7fc6ff','#37c24a','#ff8a3b','#ff5d5d','#c084fc','#f9a825','#4dd0e1','#ef9a9a'][playerIds.indexOf(id) % 8];

    const bHTML = bracket.rounds.map((round, ri) => {
      const rname = ri === bracket.rounds.length-1 ? 'FINALE' : ri === bracket.rounds.length-2 ? 'DEMI-FINALES' : `ROUND ${ri+1}`;
      const roundMatches = round.map((pair, mi) => {
        const key = `${ri}_${mi}`;
        const winner = bracket._w[key];
        const isCur = ri === bracket.currentRound;
        const p1 = pair[0]; const p2 = pair[1];
        return `<div style="display:inline-flex;flex-direction:column;margin:3px;padding:6px 10px;background:${isCur?'rgba(255,210,59,0.18)':'rgba(255,255,255,0.05)'};border:1px solid ${isCur?'#ffd23b':'#334'};border-radius:6px;font-size:11px;text-align:center;min-width:72px">
          <span style="color:${winner===p1?'#ffd23b':p1!=null?colFor(p1):'#444'}">${p1!=null?lbl(p1):'BYE'}</span>
          <span style="color:#555;font-size:9px">vs</span>
          <span style="color:${winner===p2?'#ffd23b':p2!=null?colFor(p2):'#444'}">${p2!=null?lbl(p2):'BYE'}</span>
          ${winner!=null?`<span style="color:#ffd23b;font-size:9px;margin-top:2px">→ ${lbl(winner)}</span>`:''}
        </div>`;
      }).join('');
      return `<div style="margin-bottom:10px"><div style="font-size:10px;color:#888;margin-bottom:3px">${rname}</div>${roundMatches}</div>`;
    }).join('');

    const activeMatches = bracket.currentMatches.map((pair, mi) => ({ p1: pair[0], p2: pair[1], mi }))
       .filter(m => bracket._w[`${bracket.currentRound}_${m.mi}`] === undefined && m.p1 != null && m.p2 != null);

    let matchSection = '';
    const isHost = !host || host.role === 'host';
    if (bracket.isComplete) {
      matchSection = `<div style="text-align:center;padding:14px;background:rgba(255,210,59,0.12);border-radius:8px">
        <div style="font-size:22px;color:#ffd23b">🏆 CHAMPION : ${lbl(bracket.champion)} 🏆</div>
      </div>`;
    } else if (activeMatches.length > 0) {
      const txt = activeMatches.map(m => `<b style="color:${colFor(m.p1)}">${lbl(m.p1)}</b> <span style="color:#ffd23b">VS</span> <b style="color:${colFor(m.p2)}">${lbl(m.p2)}</b>`).join('<br>');
      const btnState = bracket._playing ? `<div style="font-size:12px;color:#888;margin-top:6px">Manche en cours...</div>` :
                       (isHost ? `<button class="btn" id="launch" style="margin-top:6px">⚔️ Lancer la manche en simultané</button>` : `<div style="font-size:12px;color:#888;margin-top:6px">En attente de l'hôte...</div>`);
      matchSection = `<div style="padding:10px;background:rgba(255,210,59,0.1);border-radius:8px;text-align:center">
        <div style="font-size:12px;color:#aaa">Manche suivante (${activeMatches.length} match(s)) :</div>
        <div style="font-size:16px;margin:4px 0">${txt}</div>
        ${btnState}
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

    if (activeMatches.length > 0 && !bracket.isComplete && isHost && !bracket._playing) {
      pp.querySelector('#launch').onclick = () => {
        if (mode === 'local') {
          const m = activeMatches[0];
          this._onVersusEnd = (scene) => {
            const winId = scene.winner === 0 ? m.p1 : m.p2;
            bracket.recordWinner(winId, m.mi);
            this.showTournamentBracket('local', playerIds, arenaIdx);
          };
          this.startVersusLocal(arenaIdx, 2);
        } else {
          // Lancement d'un match de tournoi en ligne (hôte) avec gestion des matchs simultanés
          const roundData = [];
          let hostBusy = false;
          for (const m of activeMatches) {
            const needsHost = (m.p1 === 0 || m.p2 === 0 || String(m.p1).startsWith('AI') || String(m.p2).startsWith('AI'));
            if (needsHost) {
              if (hostBusy) continue; // L'hôte ne peut simuler qu'une seule instance de VersusScene à la fois
              hostBusy = true;
            }
            roundData.push({ p1Id: m.p1, p2Id: m.p2, mi: m.mi });
          }

          let matchesFinished = 0;
          bracket._playing = true;
          host.broadcast({ t: 'tournament_round', matches: roundData, arenaIdx, ids: playerIds });
          
          const myMatch = roundData.find(m => m.p1Id === 0 || m.p2Id === 0 || String(m.p1Id).startsWith('AI') || String(m.p2Id).startsWith('AI'));
          
          const checkRoundComplete = () => {
             if (matchesFinished >= roundData.length) {
                bracket._playing = false;
                host.off('msg', onMatchEnd);
                host.broadcast({ t: 'tournament_sync', w: bracket._w, arenaIdx, ids: playerIds });
                this.showTournamentBracket(host, playerIds, arenaIdx);
             }
          };
          
          const onMatchEnd = (m) => {
            const d = m.d || m;
            if (d.t === 'end') {
              const senderId = m.from ?? (d.from ?? 0);
              const match = roundData.find(rm => rm.p1Id === senderId || rm.p2Id === senderId);
              if (match && bracket._w[`${bracket.currentRound}_${match.mi}`] === undefined) {
                const winId = d.winner === 0 ? match.p1Id : match.p2Id;
                bracket.recordWinner(winId, match.mi);
                matchesFinished++;
                checkRoundComplete();
              }
            }
          };
          host.on('msg', onMatchEnd);

          if (myMatch) {
            this._onVersusEnd = (scene) => {
              const winId = scene.winner === 0 ? myMatch.p1Id : myMatch.p2Id;
              bracket.recordWinner(winId, myMatch.mi);
              matchesFinished++;
              delete this._onVersusEnd;
              if (matchesFinished < roundData.length) {
                 this.clearUI();
                 this.showTournamentBracket(host, playerIds, arenaIdx);
              } else {
                 checkRoundComplete();
              }
            };
            const myLocalId = myMatch.p1Id === 0 ? 0 : myMatch.p2Id === 0 ? 1 : -1;
            this.startVersusP2P(host, myLocalId, arenaIdx, 2, [myMatch.p1Id, myMatch.p2Id]);
          } else {
            pp.querySelector('#tst').textContent = 'Match(s) en cours...';
            this.showTournamentBracket(host, playerIds, arenaIdx); // re-render pour masquer le bouton launch
          }
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

  startMarioKart() {
    this.clearUI();
    this.mode = 'mariokart';
    this.paused = false;
    // We will lazily load and create the MarioKartScene
    import('./scene_mariokart.js').then(module => {
      this.scene = new module.MarioKartScene(this);
    }).catch(e => {
      console.error("Mario Kart mode non disponible", e);
      alert("Erreur de chargement du mode Mario Kart.");
      this.returnToMenu();
    });
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

  showArenaSelect(mode, net, localId, playerCount = 2, ids = null) {
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
        else if (mode === 'tourney_local') {
          const tIds = ids || Array.from({length: Math.max(2, playerCount)}, (_, k) => k);
          this._tournamentBracket = this._mkBracket(tIds);
          this.showTournamentBracket('local', tIds, i);
        }
        else this.startVersusLocal(i, Math.max(2, playerCount), ids);
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
    p.querySelector('#back').onclick = () => this.showOptionsMenu();
  }

  showSkinMenu() {
    let html = '<div class="title"><span class="big" style="font-size:30px">COSTUMES</span></div><div class="menu-list" style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-bottom:20px;">';
    for (const skin of SKIN_LIST) {
      const active = this._currentSkinId === skin.id;
      html += `<div class="skin-card" data-id="${skin.id}" style="width:100px; padding:10px; border:3px solid ${active ? '#ffd23b' : '#333'}; border-radius:8px; background:#111; cursor:pointer; text-align:center;">
        <div style="width:40px; height:40px; margin:0 auto 10px; background-color:${skin.color}; border-radius:50%; border:2px solid #fff;"></div>
        <div style="font-size:14px; color:${active ? '#ffd23b' : '#fff'}">${escapeHtml(skin.name)}</div>
      </div>`;
    }
    html += '</div><div class="menu-list"><button class="btn ghost" id="back">← Retour</button></div>';
    
    const p = this.panel(html);
    const cards = p.querySelectorAll('.skin-card');
    cards.forEach(c => {
      c.onclick = () => {
        this._currentSkinId = c.dataset.id;
        Save.set('bigmario_skin', this._currentSkinId);
        this.showOptionsMenu();
      };
    });
    p.querySelector('#back').onclick = () => this.showOptionsMenu();
  }

  showOptionsMenu() {
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:30px">OPTIONS</span></div>
      <div class="menu-list">
        <button class="btn" id="skins">🎨 Costumes</button>
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
    p.querySelector('#skins').onclick = () => this.showSkinMenu();
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
    if (ib) ib.onclick = async () => { const pr = this._installPrompt; if (!pr) return; pr.prompt(); try { await pr.userChoice; } catch {} this._installPrompt = null; this.showOptionsMenu(); };
    p.querySelector('#fs').onclick = () => { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); };
    p.querySelector('#reset').onclick = () => { Save.set('unlocked', 0); Save.set('best', 0); this.showOptionsMenu(); };
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
    p.querySelector('#back').onclick = () => { if (!prevOn) touchLayer.classList.add('hidden'); this.showOptionsMenu(); };
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
    p.querySelector('#back').onclick = () => this.showOptionsMenu();
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
    p.querySelector('#back').onclick = () => this.showOptionsMenu();
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
  // PWA: installation + jeu hors-ligne + rechargement auto (uniquement sur le menu)
  if ('serviceWorker' in navigator) {
    let swReady = false; // true après le premier contrôle du SW (évite le reload au chargement initial)

    // Écouter les messages du SW (mise à jour dispo → recharger si on est au menu)
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'SW_UPDATED' && swReady) {
        console.log('[BigMario] Nouvelle version:', e.data.version);
        // Recharger seulement si on est au menu, sinon attendre
        if (!window.GAME || !window.GAME.mode || window.GAME.mode === 'menu') {
          window.location.reload();
        } else {
          // Marquer qu'une mise à jour est dispo — on rechargera au retour menu
          window._swPendingUpdate = true;
        }
      }
    });

    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // Le SW actuel est prêt
      setTimeout(() => { swReady = true; }, 3000); // ignorer les events des 3 premières secondes

      // Vérifier les mises à jour régulièrement (toutes les 60s)
      setInterval(() => reg.update().catch(() => {}), 60000);
    }).catch(() => {});
  }
});
