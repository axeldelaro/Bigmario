// main.js — bootstrap: canvas adaptatif, boucle, gestionnaire de scènes, menus.
import { VIEW_W, VIEW_H, Save } from './core.js';
import { Input } from './input.js';
import { buildArt } from './art.js';
import { setArt } from './entities.js';
import { resumeAudio, toggleMute, isMuted, playMusic, stopMusic, SFX } from './audio.js';
import { GameScene } from './scene_game.js';
import { VersusScene } from './scene_versus.js';
import { WORLDS, ARENAS } from './levels.js';
import { NetClient } from './net.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const ui = document.getElementById('ui');
const touchLayer = document.getElementById('touch');
const rotateHint = document.getElementById('rotate-hint');

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

class Game {
  constructor() {
    this.input = new Input();
    this.art = buildArt(); setArt(this.art);
    this.scene = null;
    this.paused = false;
    this.mode = 'menu'; // menu | game | versus
    this.net = null;
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
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
    this.checkOrientation();
  }

  checkOrientation() {
    const portrait = innerHeight > innerWidth;
    const showHint = isTouch && portrait && this.mode !== 'menu';
    rotateHint.classList.toggle('hidden', !showHint);
    const showTouch = isTouch && this.mode !== 'menu' && !portrait;
    touchLayer.classList.toggle('hidden', !showTouch);
    // bouton tir masqué si petit perso (toujours visible, c'est ok)
  }

  // ---------- Boucle ----------
  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    this.input.update();
    if (this.scene && !this.paused && this.mode !== 'menu') {
      // pas fixe pour la physique
      this.acc += dt;
      const step = 1 / 120; let n = 0;
      while (this.acc >= step && n < 8) { this.scene.update(step); this.acc -= step; n++; }
    } else { this.acc = 0; }
    // rendu
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (this.scene) this.scene.draw(ctx);
    else { ctx.fillStyle = '#120a26'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.paused) this.drawPauseOverlay();
    requestAnimationFrame((tt) => this.loop(tt));
  }

  drawPauseOverlay() {
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = '16px monospace'; ctx.textAlign = 'center';
    ctx.fillText('PAUSE', VIEW_W / 2, VIEW_H / 2 - 4);
    ctx.font = '8px monospace';
    ctx.fillText('Échap/Start: reprendre  •  M: menu', VIEW_W / 2, VIEW_H / 2 + 12);
    ctx.textAlign = 'left';
    if (this.input.justPressed('pause', 0)) this.togglePause();
  }

  togglePause() {
    if (this.mode === 'menu') return;
    this.paused = !this.paused; SFX.pause();
    if (this.paused) { this._pauseKeyHandler = (e) => { if (e.code === 'KeyM') this.returnToMenu(); }; addEventListener('keydown', this._pauseKeyHandler); }
    else if (this._pauseKeyHandler) { removeEventListener('keydown', this._pauseKeyHandler); this._pauseKeyHandler = null; }
  }

  // ---------- Transitions ----------
  startSolo(worldIdx = 0, levelIdx = 0) {
    this.clearUI(); this.mode = 'game'; this.paused = false;
    this.scene = new GameScene(this, worldIdx, levelIdx);
    this.checkOrientation();
  }
  startVersusLocal(arenaIdx = 0) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this.scene = new VersusScene(this, { mode: 'local', arenaIdx });
    this.checkOrientation();
  }
  startVersusOnline(net, localId, arenaIdx) {
    this.clearUI(); this.mode = 'versus'; this.paused = false;
    this.net = net;
    this.scene = new VersusScene(this, { mode: 'online', net, localId, arenaIdx });
    this.checkOrientation();
  }

  saveProgress(world, level) { const u = Save.get('unlocked', 0); if (world > u) Save.set('unlocked', world); }
  gameOver(score) { this.bestScore(score); setTimeout(() => this.showGameOver(score), 1800); }
  gameComplete(score) { this.bestScore(score); this.showComplete(score); }
  bestScore(s) { if (s > Save.get('best', 0)) Save.set('best', s); }
  endVersus() { if (this.net) { this.net.close(); this.net = null; } this.returnToMenu(); }
  returnToMenu() {
    this.paused = false; this.mode = 'menu'; this.scene = null;
    if (this.net) { this.net.close(); this.net = null; }
    stopMusic(); this.checkOrientation(); this.showTitle();
    if (this._pauseKeyHandler) { removeEventListener('keydown', this._pauseKeyHandler); this._pauseKeyHandler = null; }
  }

  // ---------- UI helpers ----------
  clearUI() { ui.classList.add('hidden'); ui.innerHTML = ''; }
  panel(html) {
    ui.classList.remove('hidden');
    ui.innerHTML = `<div class="panel">${html}</div>`;
    return ui.querySelector('.panel');
  }

  showTitle() {
    const p = this.panel(`
      <div class="title"><span class="big">BIGMARIO</span><span class="sub">PLATEFORME RÉTRO</span></div>
      <div class="menu-list">
        <button class="btn" id="b-solo">▶ Aventure (Solo)</button>
        <button class="btn secondary" id="b-vs-local">⚔ Versus local (2 joueurs)</button>
        <button class="btn secondary" id="b-vs-online">🌐 Versus en ligne</button>
        <button class="btn ghost" id="b-options">⚙ Options & Aide</button>
      </div>
      <p class="hint">Clavier: ◀▶ déplacer • Espace sauter • J tir • Échap pause.<br>Manette et tactile détectés automatiquement.</p>
    `);
    p.querySelector('#b-solo').onclick = () => { resumeAudio(); this.showWorldSelect(); };
    p.querySelector('#b-vs-local').onclick = () => { resumeAudio(); this.showArenaSelect('local'); };
    p.querySelector('#b-vs-online').onclick = () => { resumeAudio(); this.showOnline(); };
    p.querySelector('#b-options').onclick = () => this.showOptions();
  }

  showWorldSelect() {
    const unlocked = Save.get('unlocked', 0);
    let cards = '';
    WORLDS.forEach((w, wi) => w.levels.forEach((l, li) => {
      const locked = wi > unlocked;
      cards += `<div class="lvl-card" data-w="${wi}" data-l="${li}" ${locked ? 'data-lock="1"' : ''} style="${locked ? 'opacity:.45' : ''}">
        ${wi + 1}-${li + 1}<small>${locked ? '🔒' : l.name.replace(/^[0-9-]+\s*/, '')}</small></div>`;
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
    let cards = ARENAS.map((a, i) => `<div class="lvl-card" data-i="${i}">${a.name}<small>${a.theme}</small></div>`).join('');
    const p = this.panel(`
      <div class="title"><span class="big" style="font-size:34px">VERSUS</span><span class="sub">${mode === 'online' ? 'EN LIGNE' : 'LOCAL — 2 JOUEURS'}</span></div>
      <p class="hint">${mode === 'local'
        ? 'J1: ◀▶ + Espace + J. J2: F/H + T + U. (ou 2 manettes)'
        : 'Premier à 5 KO ou meilleur score à la fin du temps.'}</p>
      <div class="grid-levels">${cards}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="back">← Retour</button></div>
    `);
    p.querySelectorAll('.lvl-card').forEach((card) => {
      card.onclick = () => {
        const i = +card.dataset.i;
        if (mode === 'online') this.startVersusOnline(net, localId, i);
        else this.startVersusLocal(i);
      };
    });
    p.querySelector('#back').onclick = () => (mode === 'online' ? this.showOnline() : this.showTitle());
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
    p.querySelector('#back').onclick = () => this.showTitle();
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
          net.on('msg', (m) => { const d = m.d || m; if (d.t === 'arena') this.startVersusOnline(net, localId, d.i); });
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
        <button class="btn secondary" id="mute">${isMuted() ? '🔇 Son: COUPÉ' : '🔊 Son: ACTIVÉ'}</button>
        <button class="btn ghost" id="fs">⛶ Plein écran</button>
        <button class="btn danger" id="reset">🗑 Réinitialiser la progression</button>
        <button class="btn ghost" id="back">← Retour</button>
      </div>
      <p class="hint"><b>Aide</b><br>• Saut variable : reste appuyé pour sauter plus haut.<br>• Champignon = grandir, Fleur = tir, Étoile = invincible.<br>• Saute sur les ennemis pour les vaincre.<br>• Manette : A saut, X tir, Start pause.</p>
    `);
    p.querySelector('#mute').onclick = (e) => { const m = toggleMute(); e.target.textContent = m ? '🔇 Son: COUPÉ' : '🔊 Son: ACTIVÉ'; };
    p.querySelector('#fs').onclick = () => { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); };
    p.querySelector('#reset').onclick = () => { Save.set('unlocked', 0); Save.set('best', 0); this.showOptions(); };
    p.querySelector('#back').onclick = () => this.showTitle();
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

// patch: quand l'hôte choisit l'arène en ligne, l'annoncer à l'invité
const _origStartOnline = Game.prototype.startVersusOnline;
Game.prototype.startVersusOnline = function (net, localId, arenaIdx) {
  if (localId === 0 && net) net.relay({ t: 'arena', i: arenaIdx });
  _origStartOnline.call(this, net, localId, arenaIdx);
};

window.addEventListener('load', () => { window.GAME = new Game(); });
