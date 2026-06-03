// share.js — partage de replays/fantômes : par code court (serveur) ou par fichier .bmr.
import { Leaderboard } from './leaderboard.js';

export const Share = {
  // payload = {kind:'level'|'arena', w, l, arena, name, ms, ghost:{dt,f}}
  async upload(payload) {
    const base = Leaderboard.apiBase();
    if (!base) return null;
    try {
      const r = await fetch(`${base}/api/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return d.code || null;
    } catch { return null; }
  },
  async fetch(code) {
    const base = Leaderboard.apiBase();
    if (!base) return null;
    try {
      const r = await fetch(`${base}/api/share?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      return d && d.share ? d.share : null;
    } catch { return null; }
  },
  // Fichier .bmr (JSON) pour le partage hors-ligne
  download(payload, filename) {
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'replay.bmr'; document.body.appendChild(a); a.click();
      a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
      return true;
    } catch { return false; }
  },
  parse(text) {
    try {
      const d = JSON.parse(text);
      if (d && d.ghost && Array.isArray(d.ghost.f) && d.ghost.f.length >= 6) return d;
    } catch {}
    return null;
  },
};
