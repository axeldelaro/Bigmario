// leaderboard.js — meilleurs temps (contre-la-montre).
// Toujours sauvegardés en local ; soumission/lecture en ligne si un serveur est configuré.
// Précision: temps stocké en millisecondes entières (affiché au millième de seconde).
import { Save } from './core.js';

export const fmtTime = (ms) => {
  if (ms == null) return '--:--.---';
  ms = Math.max(0, Math.round(ms));
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = ms % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
};

export const Leaderboard = {
  localKey(levelId) { return 'pb.' + levelId; },
  getLocalBest(levelId) { return Save.get(this.localKey(levelId), null); },
  setLocalBest(levelId, ms) {
    const cur = this.getLocalBest(levelId);
    if (cur == null || ms < cur) { Save.set(this.localKey(levelId), Math.round(ms)); return true; }
    return false;
  },

  // Convertit une URL ws(s):// du serveur versus en http(s):// (même hôte) pour l'API.
  apiBase() {
    let url = Save.get('serverUrl', '');
    if (!url) return '';
    return url.replace(/^ws/, 'http').replace(/\/+$/, '');
  },

  async fetchTop(levelId, limit = 10) {
    const base = this.apiBase();
    if (!base) return null;
    try {
      const r = await fetch(`${base}/api/scores?level=${encodeURIComponent(levelId)}&limit=${limit}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      return Array.isArray(data.scores) ? data.scores : [];
    } catch { return null; }
  },

  async submit(levelId, name, ms, ghost) {
    const base = this.apiBase();
    if (!base) return null;
    try {
      const body = { level: levelId, name: (name || 'JOUEUR').slice(0, 12), ms: Math.round(ms) };
      if (ghost && ghost.f && ghost.f.length) body.ghost = ghost;
      const r = await fetch(`${base}/api/scores`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },

  // Récupère le fantôme du record en ligne pour un niveau.
  async fetchGhost(levelId) {
    const base = this.apiBase();
    if (!base) return null;
    try {
      const r = await fetch(`${base}/api/ghost?level=${encodeURIComponent(levelId)}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      return data && data.ghost ? { data: data.ghost, name: data.name, ms: data.ms } : null;
    } catch { return null; }
  },
};
