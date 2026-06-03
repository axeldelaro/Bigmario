// net.js — client WebSocket pour le versus en ligne.
// Le serveur (voir /server) relaie les messages entre les 2 joueurs d'un "salon".
// Protocole texte JSON. Repli propre si le serveur est injoignable.

import { Save } from './core.js';

export const DEFAULT_SERVER = Save.get('serverUrl', '');

export class NetClient {
  constructor() {
    this.ws = null; this.room = null; this.role = null; // 'host' | 'guest'
    this.connected = false; this.peerReady = false;
    this.handlers = {}; this.url = '';
  }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  _emit(ev, data) { if (this.handlers[ev]) this.handlers[ev](data); }

  connect(url, room) {
    this.url = url; this.room = room;
    return new Promise((resolve, reject) => {
      let settled = false;
      try { this.ws = new WebSocket(url); }
      catch (e) { return reject(e); }
      const to = setTimeout(() => { if (!settled) { settled = true; try { this.ws.close(); } catch {} reject(new Error('timeout')); } }, 8000);

      this.ws.onopen = () => {
        this.connected = true;
        this.send({ t: 'join', room });
      };
      this.ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'joined') {
          this.role = m.role; settled = true; clearTimeout(to);
          Save.set('serverUrl', url);
          resolve({ role: m.role, players: m.players });
          this._emit('joined', m);
        } else if (m.t === 'peer') {
          this.peerReady = m.present;
          this._emit(m.present ? 'peerjoin' : 'peerleave', m);
        } else if (m.t === 'full') {
          settled = true; clearTimeout(to); reject(new Error('salon plein'));
        } else {
          this._emit('msg', m);
        }
      };
      this.ws.onerror = () => { if (!settled) { settled = true; clearTimeout(to); reject(new Error('connexion impossible')); } };
      this.ws.onclose = () => { this.connected = false; this._emit('close'); };
    });
  }

  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  relay(obj) { this.send({ t: 'relay', d: obj }); } // serveur renvoie le payload tel quel au pair
  close() { try { this.ws && this.ws.close(); } catch {} this.connected = false; }
}
