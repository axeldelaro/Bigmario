// server.js — relais WebSocket minimal pour le versus en ligne de Bigmario.
// Aucune logique de jeu côté serveur: il met en relation 2 joueurs d'un même
// "salon" (room) et relaie leurs messages. Léger, gratuit à héberger.
//
// Lancement local : npm install && npm start
// Déploiement gratuit : voir ../README.md (Render / Railway / Glitch...)

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const rooms = new Map(); // roomId -> [ws, ws]

const server = http.createServer((req, res) => {
  // petite page de santé (utile pour les hébergeurs gratuits + keep-alive)
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bigmario relay OK — ' + rooms.size + ' salon(s) actif(s).');
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
