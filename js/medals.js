// medals.js — temps de référence (or/argent/bronze) par niveau pour le contre-la-montre.
// Calculés depuis la largeur du niveau (vitesse ~120 px/s), avec un cas spécial boss.

export function parTimes(def) {
  if (!def || !def.map) return { gold: 30000, silver: 50000, bronze: 80000 };
  const isBoss = def.map.join('').includes('O');
  if (isBoss) return { gold: 28000, silver: 45000, bronze: 70000 };
  const widthPx = def.map[0].length * 16;
  const base = (widthPx / 120) * 1000; // ms à ~120 px/s
  return {
    gold: Math.round(base * 0.95),
    silver: Math.round(base * 1.25),
    bronze: Math.round(base * 1.7),
  };
}

export function medalFor(ms, par) {
  if (ms == null || !par) return null;
  if (ms <= par.gold) return 'gold';
  if (ms <= par.silver) return 'silver';
  if (ms <= par.bronze) return 'bronze';
  return null;
}

export const MEDAL_EMOJI = { gold: '🥇', silver: '🥈', bronze: '🥉' };
