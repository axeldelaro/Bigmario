// input.js — clavier + manette (Gamepad API) + tactile, multi-joueurs
// Expose des "actions" booléennes avec détection de front (justPressed).
//
// Système de compteur de presses :
// Chaque keydown (non-répété) incrémente un compteur par action.
// justPressed() consomme UNE unité du compteur → chaque toucher compte
// indépendamment de la vitesse du clavier ou du taux de rafraîchissement.

const DEFAULT_KEYS = [
  { // Joueur 1
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    jump: ['Space', 'KeyK', 'ArrowUp', 'KeyW'],
    fire: ['KeyJ', 'ShiftLeft', 'KeyL'],
    pause: ['Escape', 'KeyP'],   // Enter retiré pour éviter les conflits de menus
  },
  { // Joueur 2 (clavier partagé pour versus local)
    left: ['KeyF'],
    right: ['KeyH'],
    up: ['KeyT'],
    down: ['KeyG'],
    jump: ['KeyT', 'KeyY'],
    fire: ['KeyU'],
    pause: [],
  },
];

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'fire', 'pause'];

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = {}; // act -> bool
    this.players = [this._mkState(), this._mkState()];
    this.maps = DEFAULT_KEYS;
    // Compteur de presses : chaque keydown non-répété incrémente le compteur.
    // justPressed() décrémente d'une unité et retourne true.
    // Cela garantit que chaque pression physique compte, quelle que soit la
    // vitesse du clavier ou le taux de rafraîchissement du moniteur.
    this._pressCount = [this._mkCount(), this._mkCount()];
    this._bind();
  }

  _mkState() {
    const s = {}; ACTIONS.forEach((a) => (s[a] = { down: false, prev: false }));
    return s;
  }
  _mkCount() {
    const s = {}; ACTIONS.forEach((a) => (s[a] = 0));
    return s;
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      // Ignorer les répétitions OS — on gère l'appui continu via keys.has()
      if (e.repeat) return;
      // Incrémenter le compteur de presses pour chaque action associée
      for (let p = 0; p < this.maps.length; p++) {
        const map = this.maps[p];
        for (const act of ACTIONS) {
          if ((map[act] || []).includes(e.code)) this._pressCount[p][act]++;
        }
      }
      this.keys.add(e.code);
    }, { passive: false });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    // Boutons tactiles
    document.querySelectorAll('.tbtn').forEach((btn) => {
      const act = btn.dataset.act;
      const set = (v) => {
        this.touch[act] = v; btn.classList.toggle('pressed', v);
        if (v && navigator.vibrate) navigator.vibrate(8); // retour haptique
        // Simuler un compteur de presse pour les boutons tactiles (front montant)
        if (v) this._pressCount[0][act] = Math.max(this._pressCount[0][act], 1);
      };
      const on = (e) => { e.preventDefault(); set(true); };
      const off = (e) => { e.preventDefault(); set(false); };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off, { passive: false });
      btn.addEventListener('touchcancel', off, { passive: false });
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
      btn.addEventListener('mouseleave', off);
    });
  }

  // Lecture manette: renvoie un état d'actions ou null
  _gamepad(index) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[index];
    if (!gp) return null;
    const a = gp.axes || [];
    const b = gp.buttons || [];
    const pressed = (i) => !!(b[i] && b[i].pressed);
    const ax = a[0] || 0, ay = a[1] || 0;
    return {
      left: ax < -0.35 || pressed(14),
      right: ax > 0.35 || pressed(15),
      up: ay < -0.45 || pressed(12),
      down: ay > 0.45 || pressed(13),
      jump: pressed(0) || pressed(3),       // A / Y
      fire: pressed(2) || pressed(1) || pressed(7), // X / B / RT
      pause: pressed(9) || pressed(8),       // Start / Select
    };
  }

  // À appeler une fois par frame, avant la logique de jeu
  update() {
    for (let p = 0; p < this.players.length; p++) {
      const state = this.players[p];
      const cnt = this._pressCount[p];
      const map = this.maps[p];
      const gp = this._gamepad(p);
      for (const act of ACTIONS) {
        let down = (map[act] || []).some((code) => this.keys.has(code));
        if (gp && gp[act]) down = true;
        if (p === 0 && this.touch[act]) down = true;
        state[act].prev = state[act].down;
        state[act].down = down;

        // NOTE : on ne remet PAS cnt à 0 ici même si la touche est maintenue.
        // Raison : fire (tir) = ShiftLeft (run) + KeyJ (feu) mappés au MÊME
        // slot « fire ». Si on efface le compteur dès que ShiftLeft est tenu,
        // presser J pendant la course effacerait immédiatement son incrément →
        // la boule de feu ne partirait jamais. Le compteur est autorégulatoire :
        // il ne monte que sur keydown (non-répété) et descend sur justPressed().

        // Manette / tactile : simuler un compte de presse sur le front montant
        if (down && !state[act].prev && gp && gp[act] && cnt[act] === 0) cnt[act] = 1;
      }
    }
  }

  isDown(act, player = 0) { return this.players[player][act].down; }

  // justPressed : retourne true UNE FOIS par pression physique.
  // Consomme une unité du compteur ou détecte un front montant (manette/tactile).
  justPressed(act, player = 0) {
    const cnt = this._pressCount[player];
    if (cnt[act] > 0) {
      cnt[act]--;
      return true;
    }
    // Fallback pour manette/tactile dont le front n'est pas géré par keydown
    const s = this.players[player][act];
    return s.down && !s.prev;
  }

  hasGamepad(index = 0) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return !!pads[index];
  }
}
