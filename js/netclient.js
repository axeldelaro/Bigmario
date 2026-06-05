// netclient.js — Multi-joueurs via WebSocket relay (bigmario-relay sur Render).
// Fiable sur tous les réseaux (WiFi, 4G, box avec AP isolation).
// Le serveur relay est pré-réchauffé dès l'ouverture du lobby pour éviter
// le délai de démarrage à froid du plan gratuit Render (~30s).

const WS_URL = (() => {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    return 'ws://localhost:8080';
  return 'wss://bigmario.onrender.com';
})();

const HTTP_URL = WS_URL.replace('wss://', 'https://').replace('ws://', 'http://');

// ── Pré-réveil du serveur (appeler dès l'ouverture du lobby) ──────────────
export function warmupServer() {
  fetch(HTTP_URL + '/', { mode: 'no-cors' }).catch(() => {});
}

// ── Connexion WebSocket avec retry automatique ────────────────────────────
function wsConnect(onStatus) {
  return new Promise((res, rej) => {
    let attempts = 0;
    const maxAttempts = 5;
    const tryConnect = () => {
      attempts++;
      const ws = new WebSocket(WS_URL);
      const t = setTimeout(() => {
        ws.close();
        if (attempts < maxAttempts) {
          const wait = Math.min(attempts * 3, 12);
          onStatus?.(`Serveur en démarrage... tentative ${attempts}/${maxAttempts} (${wait}s)`);
          setTimeout(tryConnect, wait * 1000);
        } else {
          rej(new Error('Serveur inaccessible après ' + maxAttempts + ' tentatives. Relancez dans 1 minute.'));
        }
      }, 8000);
      ws.onopen = () => { clearTimeout(t); res(ws); };
      ws.onerror = () => {
        clearTimeout(t);
        if (attempts < maxAttempts) {
          const wait = Math.min(attempts * 3, 12);
          onStatus?.(`Serveur en démarrage... tentative ${attempts}/${maxAttempts} (${wait}s)`);
          setTimeout(tryConnect, wait * 1000);
        } else {
          rej(new Error('Serveur inaccessible. Réessayez dans 1 minute.'));
        }
      };
    };
    onStatus?.('Connexion au serveur relay...');
    tryConnect();
  });
}

// ==============================================================
// HÔTE — crée la salle, accepte jusqu'à 7 guests (total 8)
// ==============================================================
export class MultiPeerHost {
  constructor() {
    this.role         = 'host';
    this.localId      = 0;
    this.roomCode     = '';
    this.connected    = true;
    this.connectedIds = [];
    this.handlers     = {};
    this.pseudos      = new Map();
    this._ws          = null;
    this._onStatus    = null;
  }

  get connectedCount() { return this.connectedIds.length + 1; }
  on(ev, fn)   { this.handlers[ev] = fn; return this; }
  _emit(ev, d) { const h = this.handlers[ev]; if (h) h(d); }
  onStatus(fn) { this._onStatus = fn; return this; }

  async open(maxPlayers = 4, pseudo = 'Hôte') {
    this.pseudo = pseudo;
    this.pseudos.set(0, pseudo);
    this._ws = await wsConnect(this._onStatus);
    return new Promise((res, rej) => {
      this._ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'created') {
          this.roomCode = m.code;
          this._onStatus?.('');
          this._ws.onmessage = (e2) => this._onMsg(e2);
          res(m.code);
        } else if (m.t === 'error') {
          rej(new Error(m.msg));
        }
      };
      this._ws.onerror = () => rej(new Error('Erreur WebSocket hôte'));
      this._ws.onclose = () => { /* géré dans _onMsg */ };
      this._ws.send(JSON.stringify({ t: 'create', maxPlayers, pseudo }));
    });
  }

  _onMsg(ev) {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'player_joined') {
      if (!this.connectedIds.includes(m.id)) this.connectedIds.push(m.id);
      this.pseudos.set(m.id, m.pseudo || ('Joueur ' + (m.id + 1)));
      this._emit('peerjoin',      { id: m.id, total: this.connectedCount });
      this._emit('pseudo_update', { pseudos: this.pseudos });
    }
    if (m.t === 'player_left') {
      this.connectedIds = this.connectedIds.filter(x => x !== m.id);
      this.pseudos.delete(m.id);
      this._emit('peerleave', { id: m.id });
    }
    if (m.t === 'relay')      { this._emit('msg', { d: m.d, from: m.from }); }
    if (m.t === 'set_pseudo') { this.pseudos.set(m.from, m.pseudo); this._emit('pseudo_update', { pseudos: this.pseudos }); }
    if (m.t === 'room_info')  { this._emit('room_info', m); }
  }

  broadcast(obj) {
    if (this._ws?.readyState === 1) this._ws.send(JSON.stringify({ t: 'relay', d: obj }));
  }
  relay(obj) { this.broadcast(obj); }
  sendTo(id, obj) {
    if (this._ws?.readyState === 1) this._ws.send(JSON.stringify({ t: 'relay_to', to: id, d: obj }));
  }

  // Lancer la partie — envoie les IDs exacts à tous les guests
  startGame(arenaIdx, playerIds, tournament = false) {
    if (this._ws?.readyState === 1)
      this._ws.send(JSON.stringify({ t: 'start', arenaIdx, playerCount: playerIds.length, ids: playerIds, tournament }));
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
// GUEST — rejoint la salle avec le code à 4 lettres
// ==============================================================
export class PeerClient {
  constructor() {
    this.role      = 'guest';
    this.localId   = null;
    this.connected = false;
    this.handlers  = {};
    this.pseudos   = new Map();
    this._ws       = null;
    this._onStatus = null;
  }

  on(ev, fn)   { this.handlers[ev] = fn; return this; }
  _emit(ev, d) { const h = this.handlers[ev]; if (h) h(d); }
  onStatus(fn) { this._onStatus = fn; return this; }

  relay(obj) {
    if (this._ws?.readyState === 1) this._ws.send(JSON.stringify({ t: 'relay', d: obj }));
  }

  async connect(code, pseudo = 'Joueur') {
    this.pseudo = pseudo;
    this._ws = await wsConnect(this._onStatus);
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Salon introuvable ou hôte déconnecté')), 10000);
      this._ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'joined') {
          clearTimeout(to);
          this.localId   = m.id;
          this.connected = true;
          this.pseudos   = new Map();
          (m.players || []).forEach(p => this.pseudos.set(p.id, p.pseudo));
          this._onStatus?.('');
          this._ws.onmessage = (e2) => this._onMsg(e2);
          this._emit('open',     {});
          this._emit('peerjoin', {});
          res({ role: 'guest', localId: m.id });
        } else if (m.t === 'error') {
          clearTimeout(to); rej(new Error(m.msg));
        }
      };
      this._ws.onerror = () => { clearTimeout(to); rej(new Error('Erreur WebSocket guest')); };
      this._ws.onclose = () => { clearTimeout(to); rej(new Error('Connexion fermée')); };
      this._ws.send(JSON.stringify({ t: 'join', code: code.trim().toUpperCase(), pseudo }));
    });
  }

  _onMsg(ev) {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'player_joined') { this.pseudos.set(m.id, m.pseudo); this._emit('peerjoin', { id: m.id }); this._emit('pseudo_update', { pseudos: this.pseudos }); }
    if (m.t === 'player_left')   { this.pseudos.delete(m.id); this._emit('peerleave', { id: m.id }); }
    if (m.t === 'relay')         { this._emit('msg', { d: m.d, from: m.from }); }
    if (m.t === 'start')         { this._emit('msg', { d: m,   from: 0 }); }
    if (m.t === 'set_pseudo')    { this.pseudos.set(m.from, m.pseudo); this._emit('pseudo_update', { pseudos: this.pseudos }); }
    if (m.t === 'error')         { this._emit('peerleave', { id: -1, msg: m.msg }); }
  }

  disconnect() {
    try { if (this._ws) { this._ws.send(JSON.stringify({ t: 'leave' })); this._ws.close(); } } catch {}
    this._ws = null;
  }
}
