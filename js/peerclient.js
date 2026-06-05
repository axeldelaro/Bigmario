// peerclient.js — P2P multi-joueurs via WebRTC DataChannel, sans serveur.
// Signalement manuel par copier-coller de codes SDP+ICE (base64).
//
// MultiPeerHost : hôte qui gère jusqu'à 7 connexions (8 joueurs au total)
// PeerClient    : guest qui se connecte à l'hôte (1 seule connexion)

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function enc(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=+$/, '');
}
function dec(str) {
  try { return JSON.parse(decodeURIComponent(escape(atob(str.trim().replace(/\s/g, ''))))) }
  catch { return null; }
}
function gatherICE(pc) {
  return new Promise(res => {
    const cands = [];
    const t = setTimeout(() => res(cands), 5000);
    pc.onicecandidate = e => {
      if (e.candidate) cands.push(e.candidate.toJSON());
      else { clearTimeout(t); res(cands); }
    };
  });
}

// ================================================================
// HOTE : gère N-1 connexions WebRTC (une par guest)
// ================================================================
export class MultiPeerHost {
  constructor() {
    this.role     = 'host';
    this.localId  = 0;
    this.nextId   = 1;
    this._pcs     = new Map();   // guestId -> RTCPeerConnection
    this._chs     = new Map();   // guestId -> RTCDataChannel (ouvert)
    this.connectedIds = [];      // IDs des guests connectés
    this.handlers = {};
  }

  on(ev, fn) { this.handlers[ev] = fn; return this; }
  _emit(ev, d) { const h = this.handlers[ev]; if (h) h(d); }

  get connected()      { return true; }
  get connectedCount() { return this._chs.size + 1; } // +1 = hôte

  // ---- Créer un slot pour un nouveau guest → renvoie son code d'offre ----
  async addSlot() {
    const id = this.nextId++;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const ch = pc.createDataChannel('g', { ordered: false, maxRetransmits: 2 });
    this._pcs.set(id, pc);

    ch.onopen = () => {
      this._chs.set(id, ch);
      if (!this.connectedIds.includes(id)) this.connectedIds.push(id);
      this._emit('peerjoin', { id, total: this.connectedCount });
    };
    ch.onclose = () => {
      this._chs.delete(id);
      this.connectedIds = this.connectedIds.filter(x => x !== id);
      this._emit('peerleave', { id });
    };
    ch.onmessage = ({ data }) => {
      try {
        const m = JSON.parse(data);
        if (m.t === 'relay') {
          // Relayer à tous les autres guests (y compris entre guests)
          const out = JSON.stringify({ t: 'relay', d: m.d, from: id });
          for (const [pid, c] of this._chs)
            if (pid !== id && c.readyState === 'open') c.send(out);
          this._emit('msg', { d: m.d, from: id });
        }
      } catch {}
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const ice = await gatherICE(pc);
    return { id, code: enc({ sdp: pc.localDescription, ice }) };
  }

  // ---- Accepter la réponse d'un guest ----
  async acceptAnswer(id, code) {
    const data = dec(code);
    if (!data) throw new Error('Code invalide');
    const pc = this._pcs.get(id);
    if (!pc) throw new Error('Slot introuvable');
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    for (const c of (data.ice || []))
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    // Attendre que le canal soit ouvert (max 10 s)
    return new Promise((res, rej) => {
      if (this._chs.has(id)) { res(); return; }
      const t = setTimeout(() => rej(new Error('timeout')), 10000);
      const prev = this.handlers['peerjoin'];
      this.handlers['peerjoin'] = (info) => {
        if (prev) prev(info);
        if (info.id === id) { clearTimeout(t); res(); }
      };
    });
  }

  // ---- Envoi ciblé / diffusion ----
  sendTo(id, msg)           { const ch = this._chs.get(id); if (ch?.readyState === 'open') ch.send(JSON.stringify(msg)); }
  broadcast(msg, excl = -1) { const s = JSON.stringify(msg); for (const [id, ch] of this._chs) if (id !== excl && ch.readyState === 'open') ch.send(s); }
  relay(obj)                { this.broadcast({ t: 'relay', d: obj }); }          // compat NetClient

  // Annonce l'arène à tous les guests → ils lancent le jeu
  announceArena(arenaIdx, coop = false, playerCount = 2) {
    this.broadcast({ t: 'relay', d: { t: 'arena', i: arenaIdx, coop, playerCount, totalPlayers: this.connectedCount } });
  }

  disconnect() {
    for (const [, ch] of this._chs) try { ch.close(); } catch {}
    for (const [, pc] of this._pcs) try { pc.close(); } catch {}
    this._chs.clear(); this._pcs.clear(); this.connectedIds = [];
  }
}

// ================================================================
// GUEST : se connecte à l'hôte via un code d'offre/réponse
// ================================================================
export class PeerClient {
  constructor() {
    this.pc = null; this.ch = null;
    this.role = 'guest'; this.localId = null;
    this.connected = false;
    this.handlers = {};
  }

  on(ev, fn) { this.handlers[ev] = fn; return this; }
  _emit(ev, d) { const h = this.handlers[ev]; if (h) h(d); }

  relay(obj) {
    if (this.ch?.readyState === 'open') this.ch.send(JSON.stringify({ t: 'relay', d: obj }));
  }

  _setupChannel(ch) {
    this.ch = ch;
    ch.onopen    = () => { this.connected = true; this._emit('open', {}); this._emit('peerjoin', {}); };
    ch.onclose   = () => this._emit('peerleave', {});
    ch.onmessage = ({ data }) => {
      try { const m = JSON.parse(data); if (m.t === 'relay') this._emit('msg', { d: m.d, from: m.from }); }
      catch {}
    };
  }

  // Renvoie { answerCode, waitForConnection }
  async answerOffer(offerCode) {
    const data = dec(offerCode);
    if (!data) throw new Error('Code invalide');
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc.ondatachannel = e => this._setupChannel(e.channel);
    await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    for (const c of (data.ice || []))
      try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    const ice = await gatherICE(this.pc);
    const answerCode = enc({ sdp: this.pc.localDescription, ice });
    const waitForConnection = () => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), 12000);
      const was = this.handlers['open'];
      this.handlers['open'] = (...a) => {
        clearTimeout(t);
        if (was) was(...a);
        res({ role: 'guest', players: 2 });
      };
    });
    return { answerCode, waitForConnection };
  }

  disconnect() { try { this.ch?.close(); this.pc?.close(); } catch {} }
}
