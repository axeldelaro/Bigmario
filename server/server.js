// server.js — relais WebSocket minimal pour le versus en ligne de Bigmario.
// Aucune logique de jeu côté serveur: il met en relation 2 joueurs d'un même
// "salon" (room) et relaie leurs messages. Léger, gratuit à héberger.
//
// Lancement local : npm install && npm start
// Déploiement gratuit : voir ../README.md (Render / Railway / Glitch...)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const rooms = new Map(); // roomId -> [ws, ws]

// ---- Classement (contre-la-montre) ----
const SCORES_FILE = path.join(__dirname, 'scores.json');
const MAX_PER_LEVEL = 50;
let scores = {}; // levelId -> [{name, ms, ts}]
try { scores = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')); } catch { scores = {}; }
let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; fs.writeFile(SCORES_FILE, JSON.stringify(scores), () => {}); }, 1000);
}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
function sendJSON(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  if (url.pathname === '/api/scores' && req.method === 'GET') {
    const level = String(url.searchParams.get('level') || '');
    const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '10', 10) || 10);
    const list = (scores[level] || []).slice(0, limit);
    return sendJSON(res, 200, { level, scores: list });
  }

  if (url.pathname === '/api/scores' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch { return sendJSON(res, 400, { error: 'bad json' }); }
      const level = String(m.level || '').slice(0, 16);
      const name = String(m.name || 'JOUEUR').replace(/[^\w \-éàèùçâêîôû]/gi, '').slice(0, 12) || 'JOUEUR';
      const ms = Math.round(Number(m.ms));
      if (!level || !isFinite(ms) || ms <= 0 || ms > 36e5) return sendJSON(res, 400, { error: 'invalid' });
      const list = scores[level] || (scores[level] = []);
      // un seul meilleur temps par pseudo
      const existing = list.findIndex((s) => s.name === name);
      if (existing >= 0) { if (ms < list[existing].ms) list[existing] = { name, ms, ts: Date.now() }; }
      else list.push({ name, ms, ts: Date.now() });
      list.sort((a, b) => a.ms - b.ms);
      if (list.length > MAX_PER_LEVEL) list.length = MAX_PER_LEVEL;
      persist();
      const rank = list.findIndex((s) => s.name === name) + 1;
      return sendJSON(res, 200, { ok: true, rank, scores: list.slice(0, 10) });
    });
    return;
  }

  // page de santé (utile pour les hébergeurs gratuits + keep-alive)
  res.writeHead(200, { 'Content-Type': 'text/plain', ...CORS });
  res.end('Bigmario relay OK — ' + rooms.size + ' salon(s), ' + Object.keys(scores).length + ' niveau(x) classés.');
});

const wss = new WebSocketServer({ server });

function peersOf(ws) {
  const room = rooms.get(ws.room);
  if (!room) return [];
  return room.filter((c) => c !== ws && c.readyState === 1);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }

    if (m.t === 'join') {
      const id = String(m.room || 'default').slice(0, 32);
      let room = rooms.get(id);
      if (!room) { room = []; rooms.set(id, room); }
      // nettoyage des sockets morts
      for (let i = room.length - 1; i >= 0; i--) if (room[i].readyState !== 1) room.splice(i, 1);
      if (room.length >= 2) { ws.send(JSON.stringify({ t: 'full' })); return; }
      ws.room = id;
      const role = room.length === 0 ? 'host' : 'guest';
      room.push(ws);
      ws.send(JSON.stringify({ t: 'joined', role, players: room.length }));
      // prévenir les deux de la présence
      peersOf(ws).forEach((p) => p.send(JSON.stringify({ t: 'peer', present: true })));
      if (role === 'guest') ws.send(JSON.stringify({ t: 'peer', present: true }));
      return;
    }

    if (m.t === 'relay') {
      peersOf(ws).forEach((p) => p.send(JSON.stringify({ t: 'relay', d: m.d })));
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.room);
    if (!room) return;
    const i = room.indexOf(ws);
    if (i >= 0) room.splice(i, 1);
    peersOf(ws).forEach((p) => p.send(JSON.stringify({ t: 'peer', present: false })));
    if (room.length === 0) rooms.delete(ws.room);
  });
});

// ping/pong pour fermer les connexions zombies
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30000);

server.listen(PORT, () => console.log('Bigmario relay sur le port ' + PORT));
