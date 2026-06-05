// netclient.js — Multi-joueurs P2P via PeerJS (topologie étoile, 2-8 joueurs).
// L'hôte est le hub central : chaque guest s'y connecte individuellement.
// PeerJS gère le signaling WebRTC (cloud gratuit) ; les données passent ensuite
// en direct P2P sur le réseau local → faible latence, aucun serveur à configurer.
//
// window.Peer est chargé via le CDN PeerJS dans index.html.

const PREFIX = 'bigmario-'; // préfixe pour éviter les collisions d'ID PeerJS

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ2345679'; // sans O/0/I/1 ambigus
  return Array.from({ length: 4 }, () => chars[Math.random() * chars.length | 0]).join('');
}

// ==============================================================
// HÔTE — crée la salle, accepte jusqu'à 7 guests (total 8)
// ==============================================================
export class MultiPeerHost {
  constructor() {
    this.role         = 'host';
    this.localId      = 0;
    this.roomCode     = '';
    this._peer        = null;
    this._conns       = new Map();   // guestId → DataConnection
    this.connectedIds = [];
    this.handlers     = {};
    this.pseudos      = new Map();   // id → pseudo
    this.connected    = true;
    this.nextId       = 1;
    // IDs des joueurs pour la partie en cours (fixé au lancement)
    this._gameIds     = null;
  }

  get connectedCount() { return this._conns.size + 1; } // +1 = hôte
  on(ev, fn)   { this.handlers[ev] = fn; return this; }
  _emit(ev, d) { const h = this.handlers[ev]; if (h) h(d); }

  // Ouvre la salle → résout avec le code à 4 lettres
  open(maxPlayers = 8, pseudo = 'Hôte') {
    this.pseudo = pseudo;
    this.pseudos.set(0, pseudo);
    return new Promise((res, rej) => {
      if (!window.Peer) { rej(new Error('PeerJS non chargé — vérifiez la connexion internet')); return; }
      const tryCode = (code) => {
        this.roomCode = code;
        const p = new window.Peer(PREFIX + code);
        this._peer = p;
        p.on('open',  ()  => res(code));
        p.on('error', (e) => {
          if (e.type === 'unavailable-id') { p.destroy(); tryCode(genCode()); }
          else rej(new Error(e.type + (e.message ? ': ' + e.message : '')));
        });
        p.on('connection', (conn) => this._accept(conn));
      };
      tryCode(genCode());
    });
  }

  _accept(conn) {
    // IMPORTANT : allouer l'ID ici, pas dans 'open', pour éviter les doublons
    const id = this.nextId++;

    conn.on('open', () => {
      this._conns.set(id, conn);
      if (!this.connectedIds.includes(id)) this.connectedIds.push(id);

      // 1. Envoyer au guest : son ID + liste des pseudos actuels de tout le salon
      conn.send({
        t: 'hello',
        id,
        pseudo:  this.pseudo || 'Hôte',
        pseudos: Array.from(this.pseudos.entries()),
      });

      // 2. Annoncer aux autres guests qu'un nouveau joueur vient de rejoindre
      //    (on utilise un pseudo provisoire ; le vrai arrivera via set_pseudo)
      const joinMsg = { t: 'set_pseudo', from: id, pseudo: 'Joueur ' + (id + 1) };
      for (const [pid, c] of this._conns)
        if (pid !== id && c.open) c.send(joinMsg);

      this._emit('peerjoin', { id, total: this.connectedCount });
    });

    conn.on('data', (m) => {
      if (m.t === 'relay') {
        // Relayer à tous les autres guests + émettre localement
        const out = { t: 'relay', d: m.d, from: id };
        for (const [pid, c] of this._conns)
          if (pid !== id && c.open) c.send(out);
        this._emit('msg', { d: m.d, from: id });

      } else if (m.t === 'set_pseudo') {
        // Màj du pseudo du guest + propagation à tout le monde
        this.pseudos.set(id, m.pseudo || 'Joueur ' + (id + 1));
        const out = { t: 'set_pseudo', from: id, pseudo: this.pseudos.get(id) };
        for (const [pid, c] of this._conns)
          if (c.open) c.send(out);     // inclure le guest lui-même pour confirmation
        this._emit('pseudo_update', { pseudos: this.pseudos });
      }
    });

    conn.on('close', () => {
      this._conns.delete(id);
      this.connectedIds = this.connectedIds.filter(x => x !== id);
      this.pseudos.delete(id);
      this._emit('peerleave', { id });
    });
    conn.on('error', (e) => console.warn('[Host] conn error id=' + id + ':', e));
  }

  sendTo(id, msg) {
    const c = this._conns.get(id);
    if (c && c.open) c.send(msg);
  }
  broadcast(msg, excl = -1) {
    for (const [id, c] of this._conns)
      if (id !== excl && c.open) c.send(msg);
  }
  relay(obj) { this.broadcast({ t: 'relay', d: obj }); }

  // Annoncer le lancement de partie à tous les guests.
  // playerIds est le tableau COMPLET déjà construit par main.js (humains + bots).
  startGame(arenaIdx, playerIds, tournament = false) {
    this._gameIds = playerIds;
    const msg = { t: 'relay', d: { t: 'start', arenaIdx, playerCount: playerIds.length, ids: playerIds, tournament } };
    this.broadcast(msg);
  }

  announceArena(arenaIdx, playerCount = 2) {
    this.broadcast({ t: 'relay', d: { t: 'arena', i: arenaIdx, playerCount, totalPlayers: this.connectedCount } });
  }

  disconnect() {
    try { this._peer?.destroy(); } catch {}
    this._conns.clear();
  }
}

// ==============================================================
// GUEST — rejoint la salle de l'hôte avec le code à 4 lettres
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

  on(ev, fn)   { this.handlers[ev] = fn; return this; }
  _emit(ev, d) { const h = this.handlers[ev]; if (h) h(d); }

  relay(obj) {
    if (this._conn && this._conn.open) this._conn.send({ t: 'relay', d: obj });
  }

  connect(code, pseudo = 'Joueur') {
    if (!window.Peer) return Promise.reject(new Error('PeerJS non chargé — vérifiez la connexion internet'));
    this.pseudo = pseudo;
    return new Promise((res, rej) => {
      this._peer = new window.Peer();
      const to = setTimeout(() => rej(new Error('Timeout : hôte introuvable (code incorrect ou hôte parti)')), 15000);

      this._peer.on('error', (err) => {
        clearTimeout(to);
        rej(new Error(err.type + (err.message ? ': ' + err.message : '')));
      });

      this._peer.on('open', () => {
        const hostId = PREFIX + code.trim().toUpperCase();
        this._conn = this._peer.connect(hostId);

        // Envoyer le pseudo uniquement APRÈS avoir reçu 'hello'
        // pour s'assurer que l'hôte nous a bien enregistrés avant.

        this._conn.on('data', (m) => {
          if (m.t === 'hello') {
            clearTimeout(to);
            this.localId   = m.id;
            this.connected = true;
            // Reconstituer la map des pseudos depuis la liste de l'hôte
            this.pseudos = new Map(m.pseudos || []);
            this.pseudos.set(0, m.pseudo || 'Hôte');
            this.pseudos.set(m.id, pseudo);
            // Maintenant qu'on est enregistrés, envoyer notre pseudo à l'hôte
            this._conn.send({ t: 'set_pseudo', pseudo });
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

        this._conn.on('close', () => {
          this.connected = false;
          this._emit('peerleave', {});
        });
        this._conn.on('error', (err) => {
          clearTimeout(to);
          rej(new Error('Connexion refusée : ' + (err.message || err.type)));
        });
      });
    });
  }

  disconnect() {
    try { this._peer?.destroy(); } catch {}
    this._conn = null;
  }
}
