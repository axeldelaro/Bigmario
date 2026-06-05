// netclient.js — Client WebSocket pour le multijoueur Bigmario (2-8 joueurs).
// Remplace peerclient.js (PeerJS/WebRTC). Connexion directe au serveur relay.
// Même API externe que MultiPeerHost/PeerClient pour compatibilité avec main.js.

// URL du serveur relay — changée ici si vous auto-hébergez.
// La variable d'env VITE_WS_URL peut la surcharger en dev.
const WS_URL = (() => {
  // Si on tourne en local (fichier ou localhost) → essayer localhost:8080
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return 'ws://localhost:8080';
  }
  // Production : serveur Render déployé automatiquement
  return 'wss://bigmario-relay.onrender.com';
})();

function wsConnect(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { ws.close(); rej(new Error('Serveur injoignable (timeout 8s)')); }, 8000);
    ws.onopen  = () => { clearTimeout(t); res(ws); };
    ws.onerror = () => { clearTimeout(t); rej(new Error('Impossible de joindre le serveur relay')); };
  });
}

// ==============================================================
// HÔTE — crée un salon, attend les joueurs, lance la partie
// ==============================================================
export class MultiPeerHost {
  constructor() {
    this.role         = 'host';
    this.localId      = 0;
    this.roomCode     = '';
    this.connected    = true;
    this.connectedIds = [];
    this.pseudos      = new Map();
    this.handlers     = {};
    this._ws          = null;
    this.nextId       = 1; // compat API
  }

  get connectedCount() { return this.connectedIds.length + 1; } // +1 = hôte
  on(ev, fn)   { this.handlers[ev] = fn; return this; }
  _emit(ev, d) { const h = this.handlers[ev]; if (h) h(d); }

  // Ouvre un salon → résout avec le code à 4 lettres
  async open(maxPlayers = 4, pseudo = 'Hôte') {
    this._ws = await wsConnect(WS_URL);
    this.pseudos.set(0, pseudo);
    this.pseudo = pseudo;

    return new Promise((res, rej) => {
      this._ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }

        if (m.t === 'created') {
          this.roomCode = m.code;
          res(m.code);
          // rebrancher le handler général
          this._ws.onmessage = (ev2) => this._onMsg(ev2);
          return;
        }
        if (m.t === 'error') { rej(new Error(m.msg)); }
      };
      this._ws.onerror = () => rej(new Error('Erreur WebSocket'));
      this._ws.onclose = () => { /* géré dans _onMsg */ };
      this._ws.send(JSON.stringify({ t: 'create', maxPlayers, pseudo }));
    });
  }

  _onMsg(ev) {
    let m; try { m = JSON.parse(ev.data); } catch { return; }

    if (m.t === 'player_joined') {
      const id = m.id;
      if (!this.connectedIds.includes(id)) this.connectedIds.push(id);
      this.pseudos.set(id, m.pseudo || ('Joueur ' + (id + 1)));
      this._emit('peerjoin',      { id, total: this.connectedCount });
      this._emit('pseudo_update', { pseudos: this.pseudos });
    }
    if (m.t === 'player_left') {
      this.connectedIds = this.connectedIds.filter(x => x !== m.id);
      this.pseudos.delete(m.id);
      this._emit('peerleave', { id: m.id });
    }
    if (m.t === 'relay') {
      this._emit('msg', { d: m.d, from: m.from });
    }
    if (m.t === 'set_pseudo') {
      this.pseudos.set(m.from, m.pseudo);
      this._emit('pseudo_update', { pseudos: this.pseudos });
    }
  }

  // Envoyer un message à tous les guests
  broadcast(obj) {
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify({ t: 'relay', d: obj }));
  }
  relay(obj) { this.broadcast(obj); }
  sendTo(id, obj) {
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify({ t: 'relay_to', to: id, d: obj }));
  }

  // Lancer la partie depuis le lobby
  startGame(arenaIdx, botCount = 0, tournament = false) {
    if (this._ws && this._ws.readyState === 1) {
      this._ws.send(JSON.stringify({ t: 'start', arenaIdx, botCount, tournament }));
    }
  }

  // Changer la taille max du salon
  setMaxPlayers(n) {
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify({ t: 'set_max', maxPlayers: n }));
  }

  announceArena(arenaIdx, playerCount = 2) {
    this.broadcast({ t: 'arena', i: arenaIdx, playerCount, totalPlayers: this.connectedCount });
  }

  disconnect() {
    try { if (this._ws) { this._ws.send(JSON.stringify({ t: 'leave' })); this._ws.close(); } } catch {}
    this._ws = null;
  }
}

// ==============================================================
// GUEST — rejoint un salon avec le code à 4 lettres
// ==============================================================
export class PeerClient {
  constructor() {
    this.role      = 'guest';
    this.localId   = null;
    this.connected = false;
    this.handlers  = {};
    this.pseudos   = new Map();
    this._ws       = null;
  }

  on(ev, fn)   { this.handlers[ev] = fn; return this; }
  _emit(ev, d) { const h = this.handlers[ev]; if (h) h(d); }

  relay(obj) {
    if (this._ws && this._ws.readyState === 1) this._ws.send(JSON.stringify({ t: 'relay', d: obj }));
  }

  // Rejoindre la salle identifiée par code (ex : "M7K2")
  async connect(code, pseudo = 'Joueur') {
    this._ws = await wsConnect(WS_URL);
    this.pseudo = pseudo;

    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Timeout connexion au salon (10s)')), 10000);

      this._ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }

        if (m.t === 'joined') {
          clearTimeout(to);
          this.localId   = m.id;
          this.connected = true;
          // construire la map des pseudos depuis la liste reçue
          this.pseudos = new Map();
          (m.players || []).forEach(p => this.pseudos.set(p.id, p.pseudo));
          this._emit('open',     {});
          this._emit('peerjoin', {});
          res({ role: 'guest', localId: m.id });
          // rebrancher le handler général
          this._ws.onmessage = (ev2) => this._onMsg(ev2);
          return;
        }
        if (m.t === 'error') { clearTimeout(to); rej(new Error(m.msg)); }
      };

      this._ws.onerror = () => { clearTimeout(to); rej(new Error('Erreur WebSocket')); };
      this._ws.onclose = () => { clearTimeout(to); rej(new Error('Connexion fermée avant de rejoindre')); };

      this._ws.send(JSON.stringify({ t: 'join', code: code.trim().toUpperCase(), pseudo }));
    });
  }

  _onMsg(ev) {
    let m; try { m = JSON.parse(ev.data); } catch { return; }

    if (m.t === 'player_joined') {
      this.pseudos.set(m.id, m.pseudo);
      this._emit('peerjoin',      { id: m.id });
      this._emit('pseudo_update', { pseudos: this.pseudos });
    }
    if (m.t === 'player_left') {
      this.pseudos.delete(m.id);
      this._emit('peerleave', { id: m.id });
    }
    if (m.t === 'relay') {
      this._emit('msg', { d: m.d, from: m.from });
    }
    if (m.t === 'start') {
      // L'hôte lance la partie — on reçoit les paramètres
      this._emit('msg', { d: m, from: 0 });
    }
    if (m.t === 'promoted_host') {
      this.role = 'host';
      this._emit('promoted_host', {});
    }
    if (m.t === 'set_pseudo') {
      this.pseudos.set(m.from, m.pseudo);
      this._emit('pseudo_update', { pseudos: this.pseudos });
    }
    if (m.t === 'error') {
      this._emit('peerleave', { id: -1, msg: m.msg });
    }
  }

  disconnect() {
    try { if (this._ws) { this._ws.send(JSON.stringify({ t: 'leave' })); this._ws.close(); } } catch {}
    this._ws = null;
  }
}
