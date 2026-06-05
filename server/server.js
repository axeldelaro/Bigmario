// server.js — relais WebSocket pour Bigmario (2-8 joueurs par salon).
// Chaque salon a un code à 4 lettres. L'hôte fixe la taille max du salon.
// Le serveur relaie les messages entre joueurs — aucune logique de jeu ici.
//
// Lancement local : node server.js
// Hébergement gratuit : Render, Railway, Glitch (PORT = variable d'env)

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 8;

// Dossier racine du jeu (parent de server/)
const GAME_ROOT = path.join(__dirname, '..');

// Types MIME pour les fichiers statiques du jeu
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', ...CORS });
    res.end(data);
  });
}

// ------------------------------------------------------------------ salons --
// room = { code, maxPlayers, clients: Map<id, ws>, nextId, hostId }
const rooms = new Map(); // code -> room

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ2345679';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[Math.random() * chars.length | 0]).join(''); }
  while (rooms.has(code));
  return code;
}

function broadcast(room, msg, excludeId = -1) {
  const raw = JSON.stringify(msg);
  for (const [id, ws] of room.clients) {
    if (id !== excludeId && ws.readyState === 1) ws.send(raw);
  }
}

function playerList(room) {
  const list = [];
  for (const [id, ws] of room.clients) {
    list.push({ id, pseudo: ws.pseudo || ('Joueur ' + (id + 1)) });
  }
  return list;
}

function removeClient(ws) {
  if (ws.room === undefined) return;
  const room = rooms.get(ws.room);
  if (!room) return;
  room.clients.delete(ws.playerId);
  // si plus personne → supprimer le salon
  if (room.clients.size === 0) { rooms.delete(ws.room); return; }
  // si l'hôte part → promouvoir le premier joueur restant
  if (ws.playerId === room.hostId) {
    room.hostId = room.clients.keys().next().value;
    const newHost = room.clients.get(room.hostId);
    if (newHost) newHost.send(JSON.stringify({ t: 'promoted_host' }));
  }
  broadcast(room, { t: 'player_left', id: ws.playerId, players: playerList(room) });
}

// ------------------------------------------------------ API HTTP légère ----
// (classements speedrun déjà présents — conservés tels quels)
const SCORES_FILE = path.join(__dirname, 'scores.json');
const GHOSTS_FILE = path.join(__dirname, 'ghosts.json');
const SHARES_FILE = path.join(__dirname, 'shares.json');
const MAX_PER_LEVEL = 50;
const MAX_GHOST_POINTS = 12000;
const MAX_SHARES = 1000;
let scores = {}, ghosts = {}, shares = {};
try { scores = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')); } catch { scores = {}; }
try { ghosts = JSON.parse(fs.readFileSync(GHOSTS_FILE, 'utf8')); } catch { ghosts = {}; }
try { shares = JSON.parse(fs.readFileSync(SHARES_FILE, 'utf8')); } catch { shares = {}; }
let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(SCORES_FILE, JSON.stringify(scores), () => {});
    fs.writeFile(GHOSTS_FILE, JSON.stringify(ghosts), () => {});
    fs.writeFile(SHARES_FILE, JSON.stringify(shares), () => {});
  }, 1000);
}
function makeShareCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c = ''; for (let i = 0; i < 6; i++) c += A[(Math.random() * A.length) | 0]; } while (shares[c]);
  return c;
}
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
function sendJSON(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify(obj)); }
function validGhost(g) {
  return g && typeof g === 'object' && Number.isFinite(g.dt) && Array.isArray(g.f)
    && g.f.length >= 6 && g.f.length <= MAX_GHOST_POINTS && g.f.every((v) => Number.isFinite(v));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  if (url.pathname === '/api/scores' && req.method === 'GET') {
    const level = String(url.searchParams.get('level') || '');
    const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '10', 10) || 10);
    const list = (scores[level] || []).slice(0, limit);
    const gl = ghosts[level] || [];
    return sendJSON(res, 200, { level, scores: list, hasGhost: gl.length > 0, ghostName: gl[0] ? gl[0].name : null });
  }
  if (url.pathname === '/api/ghost' && req.method === 'GET') {
    const level = String(url.searchParams.get('level') || '');
    const list = ghosts[level] || [];
    const rankStr = url.searchParams.get('rank');
    if (rankStr != null) { const g = list[Math.max(0, (parseInt(rankStr, 10) || 1) - 1)]; if (!g) return sendJSON(res, 200, { ghost: null }); return sendJSON(res, 200, { ghost: g.data, name: g.name, ms: g.ms }); }
    return sendJSON(res, 200, { list: list.slice(0, 3).map((g, i) => ({ rank: i + 1, name: g.name, ms: g.ms })) });
  }
  if (url.pathname === '/api/share' && req.method === 'GET') {
    const code = String(url.searchParams.get('code') || '').toUpperCase().slice(0, 8);
    const s = shares[code]; return sendJSON(res, 200, { share: s ? s.payload : null });
  }
  if (url.pathname === '/api/share' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 2e5) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch { return sendJSON(res, 400, { error: 'bad json' }); }
      if (!validGhost(m.ghost)) return sendJSON(res, 400, { error: 'invalid ghost' });
      const payload = { kind: m.kind === 'arena' ? 'arena' : 'level', w: m.w | 0, l: m.l | 0, arena: m.arena | 0, name: String(m.name || 'JOUEUR').slice(0, 12), ms: Math.round(Number(m.ms) || 0), ghost: { dt: Math.round(m.ghost.dt), f: m.ghost.f } };
      const keys = Object.keys(shares);
      if (keys.length >= MAX_SHARES) keys.sort((a, b) => shares[a].ts - shares[b].ts).slice(0, keys.length - MAX_SHARES + 1).forEach((k) => delete shares[k]);
      const code = makeShareCode(); shares[code] = { payload, ts: Date.now() }; persist();
      return sendJSON(res, 200, { ok: true, code });
    }); return;
  }
  if (url.pathname === '/api/scores' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 2e5) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch { return sendJSON(res, 400, { error: 'bad json' }); }
      const level = String(m.level || '').slice(0, 16);
      const name = String(m.name || 'JOUEUR').replace(/[^\w \-éàèùçâêîôû]/gi, '').slice(0, 12) || 'JOUEUR';
      const ms = Math.round(Number(m.ms));
      if (!level || !isFinite(ms) || ms <= 0 || ms > 36e5) return sendJSON(res, 400, { error: 'invalid' });
      const list = scores[level] || (scores[level] = []);
      const existing = list.findIndex((s) => s.name === name);
      if (existing >= 0) { if (ms < list[existing].ms) list[existing] = { name, ms, ts: Date.now() }; }
      else list.push({ name, ms, ts: Date.now() });
      list.sort((a, b) => a.ms - b.ms);
      if (list.length > MAX_PER_LEVEL) list.length = MAX_PER_LEVEL;
      if (validGhost(m.ghost)) {
        const gl = ghosts[level] || (ghosts[level] = []);
        const gi = gl.findIndex((x) => x.name === name);
        const entry = { name, ms, data: { dt: Math.round(m.ghost.dt), f: m.ghost.f } };
        if (gi >= 0) { if (ms <= gl[gi].ms) gl[gi] = entry; } else gl.push(entry);
        gl.sort((a, b) => a.ms - b.ms); if (gl.length > 3) gl.length = 3;
      }
      persist();
      const rank = list.findIndex((s) => s.name === name) + 1;
      return sendJSON(res, 200, { ok: true, rank, total: list.length, scores: list.slice(0, 10) });
    }); return;
  }
  // Fichiers statiques du jeu (fallback)
  let urlPath = url.pathname === '/' ? '/index.html' : url.pathname;
  // Empêcher la traversée de répertoire
  const filePath = path.join(GAME_ROOT, urlPath.replace(/\.\./g, ''));
  if (!filePath.startsWith(GAME_ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  serveFile(res, filePath);
});

// --------------------------------------------------------- WebSocket lobby --
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.room      = undefined;
  ws.playerId  = undefined;
  ws.pseudo    = 'Joueur';

  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }

    // ── Créer un salon (hôte) ──────────────────────────────────────────
    if (m.t === 'create') {
      if (ws.room) return; // déjà dans une salle
      const maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, m.maxPlayers | 0 || 2));
      const code = genCode();
      const room = { code, maxPlayers, clients: new Map(), nextId: 0, hostId: 0 };
      rooms.set(code, room);
      ws.room = code;
      ws.playerId = 0;
      ws.pseudo = String(m.pseudo || 'Hôte').slice(0, 16);
      room.clients.set(0, ws);
      room.hostId = 0;
      ws.send(JSON.stringify({ t: 'created', code, id: 0, maxPlayers, players: playerList(room) }));
      return;
    }

    // ── Rejoindre un salon (guest) ─────────────────────────────────────
    if (m.t === 'join') {
      if (ws.room) return;
      const code = String(m.code || '').trim().toUpperCase().slice(0, 4);
      const room = rooms.get(code);
      if (!room) { ws.send(JSON.stringify({ t: 'error', msg: 'Salon introuvable : code ' + code })); return; }
      // nettoyer les clients morts
      for (const [id, c] of room.clients) if (c.readyState !== 1) room.clients.delete(id);
      if (room.clients.size >= room.maxPlayers) { ws.send(JSON.stringify({ t: 'error', msg: 'Salon complet (' + room.maxPlayers + '/' + room.maxPlayers + ')' })); return; }

      const id = room.nextId = (room.nextId || 0) + 1;
      ws.room = code;
      ws.playerId = id;
      ws.pseudo = String(m.pseudo || ('Joueur ' + (id + 1))).slice(0, 16);
      room.clients.set(id, ws);

      // envoyer la liste existante au nouvel arrivant
      ws.send(JSON.stringify({ t: 'joined', code, id, maxPlayers: room.maxPlayers, players: playerList(room) }));
      // annoncer aux autres
      broadcast(room, { t: 'player_joined', id, pseudo: ws.pseudo, players: playerList(room) }, id);
      return;
    }

    // ── Changer son pseudo ─────────────────────────────────────────────
    if (m.t === 'set_pseudo') {
      ws.pseudo = String(m.pseudo || 'Joueur').slice(0, 16);
      const room = rooms.get(ws.room); if (!room) return;
      broadcast(room, { t: 'player_joined', id: ws.playerId, pseudo: ws.pseudo, players: playerList(room) });
      return;
    }

    // ── Modifier la taille max du salon (hôte seul) ────────────────────
    if (m.t === 'set_max') {
      const room = rooms.get(ws.room); if (!room || ws.playerId !== room.hostId) return;
      room.maxPlayers = Math.max(room.clients.size, Math.min(MAX_PLAYERS, m.maxPlayers | 0 || 2));
      broadcast(room, { t: 'room_info', maxPlayers: room.maxPlayers, players: playerList(room) });
      return;
    }

    // ── Relayer un message à tous les autres ───────────────────────────
    if (m.t === 'relay') {
      const room = rooms.get(ws.room); if (!room) return;
      const out = JSON.stringify({ t: 'relay', d: m.d, from: ws.playerId });
      for (const [id, c] of room.clients) {
        if (id !== ws.playerId && c.readyState === 1) c.send(out);
      }
      return;
    }

    // ── Relayer à un seul joueur (état privé) ─────────────────────────
    if (m.t === 'relay_to') {
      const room = rooms.get(ws.room); if (!room) return;
      const target = room.clients.get(m.to | 0);
      if (target && target.readyState === 1) target.send(JSON.stringify({ t: 'relay', d: m.d, from: ws.playerId }));
      return;
    }

    // ── Lancer la partie (hôte seul) ──────────────────────────────────
    if (m.t === 'start') {
      const room = rooms.get(ws.room); if (!room || ws.playerId !== room.hostId) return;
      // Utiliser les IDs fournis par l'hôte (inclut les bots) ou fallback sur les clients connectés
      const ids = Array.isArray(m.ids) && m.ids.length > 0 ? m.ids : Array.from(room.clients.keys());
      broadcast(room, { t: 'start', arenaIdx: m.arenaIdx | 0, playerCount: ids.length, ids, tournament: !!m.tournament }, ws.playerId);
      return;
    }

    // ── Quitter proprement ────────────────────────────────────────────
    if (m.t === 'leave') {
      removeClient(ws);
      ws.room = undefined; ws.playerId = undefined;
      return;
    }
  });

  ws.on('close', () => removeClient(ws));
  ws.on('error', () => { try { ws.terminate(); } catch {} removeClient(ws); });
});

// ping/pong anti-zombie toutes les 25s
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 25000);

server.listen(PORT, () => console.log('Bigmario relay sur le port ' + PORT));
