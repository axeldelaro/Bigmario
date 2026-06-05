// input.js — clavier + manette (Gamepad API) + tactile, multi-joueurs
// Expose des "actions" booléennes avec détection de front (justPressed).

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
    // Latch des fronts montants : garantit que justPressed ne soit jamais
    // raté entre deux sous-steps physiques (120 Hz) même à faible FPS.
    this._latch = [this._mkLatch(), this._mkLatch()];
    this._bind();
  }

  _mkState() {
    const s = {}; ACTIONS.forEach((a) => (s[a] = { down: false, prev: false }));
    return s;
  }
  _mkLatch() {
    const s = {}; ACTIONS.forEach((a) => (s[a] = false));
    return s;
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return; // Ignorer la répétition auto de l'OS (cause principale du bug de saut)
      // Enregistrer le front montant dans le latch pour ne pas le rater
      for (let p = 0; p < this.maps.length; p++) {
        const map = this.maps[p];
        for (const act of ACTIONS) {
          if ((map[act] || []).includes(e.code)) this._latch[p][act] = true;
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
      const latch = this._latch[p];
      const map = this.maps[p];
      const gp = this._gamepad(p);
      for (const act of ACTIONS) {
        let down = (map[act] || []).some((code) => this.keys.has(code));
        if (gp && gp[act]) down = true;
        if (p === 0 && this.touch[act]) down = true;
        state[act].prev = state[act].down;
        state[act].down = down;
        // Propager le latch au front montant si la touche n'est plus détectée
        // (front court raté entre deux frames)
        if (latch[act] && !state[act].prev) state[act].down = true;
        // Effacer le latch seulement quand la touche est released
        if (!down) latch[act] = false;
      }
    }
  }

  // Réinitialise les latches après que la logique a lu les justPressed
  // (à appeler en fin de readInput pour éviter les doublons)
  flushLatches(player = 0) {
    const latch = this._latch[player];
    const state = this.players[player];
    for (const act of ACTIONS) {
      if (latch[act] && state[act].prev) latch[act] = false;
    }
  }

  isDown(act, player = 0) { return this.players[player][act].down; }
  justPressed(act, player = 0) {
    const s = this.players[player][act];
    return s.down && !s.prev;
  }
  hasGamepad(index = 0) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return !!pads[index];
  }
}
