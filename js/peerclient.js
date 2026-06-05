// peerclient.js — Mode P2P direct via WebRTC DataChannel.
// Aucun serveur requis : les deux joueurs échangent manuellement
// un court "code d'offre" et un "code de réponse" (base64 SDP+ICE).
// Même API que NetClient : connect(), relay(), on()  → branchement transparent.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Compresse SDP + candidats ICE en une chaîne courte (base64 JSON)
function encode(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=+$/, '');
}
function decode(str) {
  try { return JSON.parse(decodeURIComponent(escape(atob(str.trim().replace(/\s/g, ''))))) } catch { return null; }
}

export class PeerClient {
  constructor() {
    this.pc        = null;
    this.ch        = null;
    this.role      = null;   // 'host' | 'guest'
    this.connected = false;
    this.handlers  = {};
    this.room      = '';
    this._iceDone  = null;   // resolve() une fois les candidats ICE collectés
  }

  on(ev, fn) { this.handlers[ev] = fn; return this; }
  _emit(ev, data) { if (this.handlers[ev]) this.handlers[ev](data); }

  relay(obj) {
    if (this.ch && this.ch.readyState === 'open') {
      this.ch.send(JSON.stringify({ t: 'relay', d: obj }));
    }
  }

  _setupChannel(ch) {
    this.ch = ch;
    ch.onopen = () => {
      this.connected = true;
      this._emit('open', {});
      this._emit('peerjoin', {});
    };
    ch.onclose = () => { this._emit('peerleave', {}); };
    ch.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'relay') this._emit('msg', { d: m.d });
    };
  }

  // ---- HOST : génère un code d'offre ----
  async createOffer() {
    this.role = 'host';
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    const ch = this.pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });
    this._setupChannel(ch);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Attendre la fin de la collecte ICE (max 4 s)
    const ice = await new Promise((res) => {
      const cands = [];
      const to = setTimeout(() => res(cands), 4000);
      this.pc.onicecandidate = (e) => {
        if (e.candidate) { cands.push(e.candidate.toJSON()); }
        else { clearTimeout(to); res(cands); }
      };
    });

    return encode({ sdp: this.pc.localDescription, ice });
  }

  // ---- HOST : reçoit la réponse du guest et complète la connexion ----
  async acceptAnswer(answerCode) {
    const data = decode(answerCode);
    if (!data) throw new Error('Code invalide');
    await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    for (const c of (data.ice || [])) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    // Résolution de la promesse connect()
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout connexion')), 10000);
      const was = this.handlers['open'];
      this.handlers['open'] = (...args) => { clearTimeout(t); if (was) was(...args); res({ role: 'host', players: 2 }); };
    });
  }

  // ---- GUEST : reçoit le code d'offre, génère le code de réponse ----
  async answerOffer(offerCode) {
    this.role = 'guest';
    const data = decode(offerCode);
    if (!data) throw new Error('Code invalide');

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.ondatachannel = (e) => this._setupChannel(e.channel);

    await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    for (const c of (data.ice || [])) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    const ice = await new Promise((res) => {
      const cands = [];
      const to = setTimeout(() => res(cands), 4000);
      this.pc.onicecandidate = (e) => {
        if (e.candidate) cands.push(e.candidate.toJSON());
        else { clearTimeout(to); res(cands); }
      };
    });

    return {
      answerCode: encode({ sdp: this.pc.localDescription, ice }),
      waitForConnection: () => new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout')), 10000);
        const was = this.handlers['open'];
        this.handlers['open'] = (...a) => { clearTimeout(t); if (was) was(...a); res({ role: 'guest', players: 2 }); };
      }),
    };
  }

  disconnect() {
    try { this.ch && this.ch.close(); this.pc && this.pc.close(); } catch {}
  }
}
