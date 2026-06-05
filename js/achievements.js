// achievements.js — succès locaux basés sur des compteurs sauvegardés.
import { Save } from './core.js';

const KEY = 'stats';
function stats() { return Save.get(KEY, {}); }
export function statValue(k) { return stats()[k] || 0; }
export function bumpStat(k, by = 1, mode = 'add') {
  const s = stats();
  if (mode === 'max') s[k] = Math.max(s[k] || 0, by);
  else s[k] = (s[k] || 0) + by;
  Save.set(KEY, s);
  return s[k];
}
// marque un identifiant dans un ensemble (ex: niveaux terminés) ; renvoie la taille
export function markSet(k, id) {
  const s = stats();
  const arr = s[k] || [];
  if (!arr.includes(id)) { arr.push(id); s[k] = arr; Save.set(KEY, s); }
  return arr.length;
}
export function setSize(k) { const v = stats()[k]; return Array.isArray(v) ? v.length : 0; }

// Définition des succès : {id, nom, desc, check(g)->bool}
export const ACHIEVEMENTS = [
  { id: 'first', name: 'Premier pas', desc: 'Terminer un niveau', check: () => setSize('cleared') >= 1 },
  { id: 'clear5', name: 'Explorateur', desc: 'Terminer 5 niveaux', check: () => setSize('cleared') >= 5 },
  { id: 'allclear', name: 'Aventurier', desc: 'Terminer les 9 niveaux', check: () => setSize('cleared') >= 9 },
  { id: 'boss', name: 'Tombeur de boss', desc: 'Vaincre un boss', check: () => statValue('boss') >= 1 },
  { id: 'gems10', name: 'Chasseur de gemmes', desc: 'Récolter 10 gemmes', check: () => statValue('gems') >= 10 },
  { id: 'gemsall', name: 'Collectionneur', desc: 'Récolter 27 gemmes', check: () => statValue('gems') >= 27 },
  { id: 'record', name: 'Sprinteur', desc: 'Établir un record perso', check: () => statValue('records') >= 1 },
  { id: 'gold', name: 'Médaille d’or', desc: 'Obtenir une médaille d’or', check: () => statValue('gold') >= 1 },
  { id: 'vwin', name: 'Combattant', desc: 'Gagner un combat versus', check: () => statValue('vwin') >= 1 },
  { id: 'vwin5', name: 'Champion', desc: 'Gagner 5 combats versus', check: () => statValue('vwin') >= 5 },
];

export function unlockedCount() { return ACHIEVEMENTS.filter((a) => { try { return a.check(); } catch { return false; } }).length; }
