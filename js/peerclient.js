// peerclient.js — P2P multi-joueurs via PeerJS (codes 4 chars, signaling automatique).
// PeerJS gère WebRTC + ICE + relais via son serveur cloud gratuit.
// Codes courts, lisibles, pas de SDP à copier-coller.
// window.Peer est chargé via le CDN unpkg dans index.html.

const PREFIX = 'bigmario-';  // préfixe pour les IDs PeerJS

// Génère un code lisible de 4 caractères (pas de O/0/I/1 ambigus)
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ2345679';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ==============================================================
// HOTE : crée une salle, accepte N connexions guests
// ==============================================================
export class MultiPeerHost {
  constructor() {
    this.role        = 'host';
    this.localId     = 0;
    this.roomCode    = '';         // attribué dans open()
    this._peer       = null;
    this._conns      = new Map(); // guestId -> DataConnection
    this.connectedIds = [];
    this.handlers    = {};
    this.pseudos     = new Map(); // id -> pseudo
    this.connected   = true;
    this.nextId      = 1;
  }

  get connectedCount() { return this._conns.size + 1; } // +1 = hôte
  on(ev, fn)  { this.handlers[ev] = fn; return this; }
  _emit(ev, d){ const h = this.handlers[ev]; if (h) h(d); }

  // Ouvre la salle → résout avec le code (ex: "M7K2")
  open() {
    return new Promise((res, rej) => {
      const tryCode = (code) => {
        this.roomCode = code;
        const p = new window.Peer(PREFIX + code, {
          debug: 0
        });
        this._peer = p;
        p.on('open',  ()  => res(code));
        p.on('error', (e) => {
          if (e.type === 'unavailable-id') { p.destroy(); tryCode(genCode()); }
          else rej(new Error(e.type + ': ' + (e.message || '')));
        });
        p.on('connection', (conn) => this._accept(conn));
      };
      if (!window.Peer) { rej(new Error('PeerJS non chargé')); return; }
      tryCode(genCode());
    });
  }

  _accept(conn) {
    const id = this.nextId++;
    conn.on('open', () => {
      this._conns.set(id, conn);
      if (!this.connectedIds.includes(id)) this.connectedIds.push(id);
      this.pseudos.set(0, this.pseudo || 'Hôte');
      // Informer le guest de son ID dans la salle
      conn.send({ t: 'hello', id, total: this.connectedCount, pseudo: this.pseudo || 'Hôte', pseudos: Array.from(this.pseudos.entries()) });
      this._emit('peerjoin', { id, total: this.connectedCount });
    });
    conn.on('data', (m) => {
      if (m.t === 'relay') {
        // Relayer à tous les autres guests
        const out = { t: 'relay', d: m.d, from: id };
        for (const [pid, c] of this._conns)
          if (pid !== id && c.open) c.send(out);
        this._emit('msg', { d: m.d, from: id });
      } else if (m.t === 'set_pseudo') {
        this.pseudos.set(id, m.pseudo || 'Joueur ' + id);
        const out = { t: 'set_pseudo', from: id, pseudo: m.pseudo };
        for (const [pid, c] of this._conns)
          if (pid !== id && c.open) c.send(out);
        this._emit('pseudo_update', { pseudos: this.pseudos });
      }
    });
    conn.on('close', () => {
      this._conns.delete(id);
      this.connectedIds = this.connectedIds.filter(x => x !== id);
      this._emit('peerleave', { id });
    });
    conn.on('error', (e) => console.warn('[PeerHost] erreur conn:', e));
  }

  sendTo(id, msg) {
    const c = this._conns.get(id);
    if (c) c.send(msg);
  }
  broadcast(msg, excl = -1) {
    for (const [id, c] of this._conns)
      if (id !== excl) c.send(msg);
  }
  relay(obj)   { this.broadcast({ t: 'relay', d: obj }); }
  announceArena(arenaIdx, playerCount = 2) {
    this.broadcast({ t: 'relay', d: { t: 'arena', i: arenaIdx, playerCount, totalPlayers: this.connectedCount } });
  }
  disconnect() { try { this._peer?.destroy(); } catch {} this._conns.clear(); }
}

// ==============================================================
// GUEST : se connecte à l'hôte avec le code de salle
// ==============================================================
export class PeerClient {
  constructor() {
    this.role      = 'guest';
    this.localId   = null;
    this.connected = false;
    this.handlers  = {};
    this.pseudos   = new Map();
    this._peer     = null;
    this._conn     = null;
  }

  on(ev, fn)  { this.handlers[ev] = fn; return this; }
  _emit(ev, d){ const h = this.handlers[ev]; if (h) h(d); }

  relay(obj) {
    if (this._conn) this._conn.send({ t: 'relay', d: obj });
  }

  // Se connecte à la salle identifiée par "code" (ex: "M7K2")
  connect(code) {
    if (!window.Peer) return Promise.reject(new Error('PeerJS non chargé'));
    return new Promise((res, rej) => {
      this._peer = new window.Peer({
        debug: 0
      });
      const to = setTimeout(() => rej(new Error('Connexion timeout (15s)')), 15000);
      this._peer.on('error', (err) => {
        clearTimeout(to);
        rej(new Error(err.type + ': ' + (err.message || '')));
      });
      this._peer.on('open', () => {
        const hostId = PREFIX + code.trim().toUpperCase();
        this._conn = this._peer.connect(hostId, { reliable: true, serialization: 'json' });
        this._conn.on('data', (m) => {
          if (m.t === 'hello') {
            clearTimeout(to);
            this.localId  = m.id;
            this.connected = true;
            this.pseudos = new Map(m.pseudos || []);
            this.pseudos.set(0, m.pseudo || 'Hôte');
            this._conn.send({ t: 'set_pseudo', pseudo: this.pseudo || 'Guest' });
            this._emit('open',     {});
            this._emit('peerjoin', {});
            res({ role: 'guest', localId: m.id });
          } else if (m.t === 'relay') {
            this._emit('msg', { d: m.d, from: m.from });
          } else if (m.t === 'set_pseudo') {
            this.pseudos.set(m.from, m.pseudo);
            this._emit('pseudo_update', { pseudos: this.pseudos });
          }
        });
        this._conn.on('error', (err) => {
          clearTimeout(to);
          rej(new Error('Erreur de connexion: ' + err.message));
        });
        this._conn.on('close', () => this._emit('peerleave', {}));
      });
      this._peer.on('error', (e) => { clearTimeout(to); rej(new Error(String(e.type || e))); });
    });
  }

  disconnect() { try { this._peer?.destroy(); } catch {} }
}
