// scene_mariokart.js — Mode Karting V4 — IA par capteurs de route, Barrières, 3 Tours
import { VIEW_W, VIEW_H } from './core.js';
import { SKIN_LIST } from './art.js';

const TILE_SIZE = 12;
const PI  = Math.PI;
const PI2 = PI * 2;
const TOTAL_LAPS = 3;

// =====================================================================
//  CIRCUITS — Routes larges (3-4 tuiles), barrières physiques
//  0 = Herbe (mur invisible), 1 = Route, 2 = Ligne de départ/arrivée
// =====================================================================
function M(name, str) {
  const lines = str.trim().split('\n').map(l => l.trim().replace(/ /g, ''));
  const h = lines.length, w = Math.max(...lines.map(l => l.length));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      data[y * w + x] = parseInt(lines[y]?.[x]) || 0;
  return { name, w, h, data };
}

const TRACKS = [
  // ──── 1. Grand Ovale (Débutant) ────
  M('Grand Ovale', `
    00000000000000000000000
    00011111111111111111000
    00111111111111111111100
    01111000000000000111110
    01110000000000000011110
    01110000000000000011110
    01110000000000000011110
    01110000000000000011110
    01110000000000000011110
    01111000000000000111110
    00111111111111111111100
    00011111112211111111000
    00000000000000000000000
  `),

  // ──── 2. Circuit en D ────
  M('Circuit en D', `
    00000000000000000000000
    00011111111111111100000
    00111111111111111110000
    01111000000000011111000
    01110000000000001111100
    01110000000000000111110
    01110000000000000011110
    01110000000000000111110
    01110000000000001111100
    01111000000000011111000
    00111111111111111110000
    00011111112211111100000
    00000000000000000000000
  `),

  // ──── 3. Fer à Cheval ────
  M('Fer à Cheval', `
    0000000000000000000000000
    0011111111000001111111100
    0011111111100011111111100
    0011100001111111000011100
    0011100001111111000011100
    0011100000000000000011100
    0011100000000000000011100
    0011100000000000000011100
    0011100000000000000011100
    0011100001111111000011100
    0011100001111111000011100
    0011111111100011111111100
    0011111122000001111111100
    0000000000000000000000000
  `),

  // ──── 4. Zigzag Express ────
  M('Zigzag Express', `
    00000000000000000000000
    01111111000000011111110
    01111111100000111111110
    00000011111111111000000
    00000011111111111000000
    01111111100000111111110
    01111111000000011111110
    00000011111111111000000
    00000011111111111000000
    01111111100000111111110
    01111111000000011111110
    00000011111111111000000
    00000011111122111000000
    00000011111111111000000
    00000000000000000000000
  `),

  // ──── 5. Boucle Intérieure ────
  M('Boucle Intérieure', `
    000000000000000000000000
    001111111111111111111100
    001111111111111111111100
    001110000000000000011100
    001110000000000000011100
    001110001111111100011100
    001110001111111100011100
    001110001110001100011100
    001110001110001100011100
    001110001111111100011100
    001110001111111100011100
    001110000000000000011100
    001111111111111111111100
    001111111122111111111100
    000000000000000000000000
  `),

  // ──── 6. Serpentin Long ────
  M('Serpentin Long', `
    000000000000000000000000
    011111111111111111111110
    011111111111111111111110
    000000000000000000011110
    000000000000000000011110
    011111111111111111111110
    011111111111111111111110
    011110000000000000000000
    011110000000000000000000
    011111111111111111111110
    011111111111111111111110
    000000000000000000011110
    000000000000000000011110
    011111111111111111111110
    011111111122111111111110
    000000000000000000000000
  `),

  // ──── 7. Grand Prix ────
  M('Grand Prix', `
    00000000000000000000000000
    00111111111111111111111100
    00111111111111111111111100
    00111000000000000000111100
    00111000000000000000011100
    00111000011111110000011100
    00111000011111110000011100
    00111000011000000000011100
    00111000011000000000011100
    00111000011111110000011100
    00111000011111110000011100
    00111000000000000000111100
    00111111111111111111111100
    00111111111122111111111100
    00000000000000000000000000
  `),
];

// =====================================================================
//  IA PAR CAPTEURS DE ROUTE — Universelle, suit automatiquement la route
// =====================================================================
const PERSONALITIES = [
  null, // 0 = joueur
  { topSpeed: 30, steerGain: 1.0, brakeSkill: 0.90, wobble: 0.08 }, // Prudent
  { topSpeed: 33, steerGain: 1.3, brakeSkill: 0.70, wobble: 0.15 }, // Agressif
  { topSpeed: 31, steerGain: 1.1, brakeSkill: 0.85, wobble: 0.10 }, // Équilibré
  { topSpeed: 34, steerGain: 1.4, brakeSkill: 0.65, wobble: 0.18 }, // Téméraire
  { topSpeed: 29, steerGain: 0.9, brakeSkill: 1.00, wobble: 0.04 }, // Pro
  { topSpeed: 32, steerGain: 1.2, brakeSkill: 0.75, wobble: 0.13 }, // Kamikaze
  { topSpeed: 31, steerGain: 1.0, brakeSkill: 0.80, wobble: 0.10 }, // Régulier
];

class RoadAI {
  constructor(id) {
    this.id = id;
    const p = PERSONALITIES[id] || PERSONALITIES[1];
    this.topSpeed   = p.topSpeed;
    this.steerGain  = p.steerGain;
    this.brakeSkill = p.brakeSkill;
    this.wobble     = p.wobble;
    this.smoothSteer = 0;
    this.wobbleT = Math.random() * 100;
  }

  update(dt, kart, karts, getTile) {
    const k = kart;
    this.wobbleT += dt;

    // ── Capteurs de route : 9 rayons de -70° à +70° ──
    const rayAngles  = [-1.2, -0.8, -0.5, -0.25, 0, 0.25, 0.5, 0.8, 1.2];
    const rayWeights = [-1.5, -1.0, -0.6, -0.3,  0, 0.3,  0.6, 1.0, 1.5];

    let weightedSum = 0;
    let totalDist = 0;
    let centerDist = 0;

    for (let i = 0; i < rayAngles.length; i++) {
      const angle = k.angle + rayAngles[i];
      let dist = 0;
      for (let step = 1; step <= 10; step++) {
        const cx = k.x + Math.sin(angle) * step * TILE_SIZE * 0.45;
        const cz = k.z + Math.cos(angle) * step * TILE_SIZE * 0.45;
        if (getTile(cx, cz) > 0) dist = step;
        else break;
      }
      weightedSum += dist * rayWeights[i];
      totalDist += dist;
      if (i === 4) centerDist = dist;
    }

    // ── Direction ──
    let targetSteer = 0;
    if (totalDist > 0) {
      targetSteer = (weightedSum / totalDist) * this.steerGain * 3.5;
    } else {
      // Complètement hors route ? Tourner fort dans la dernière direction connue
      targetSteer = this.smoothSteer > 0 ? 4.0 : -4.0;
    }

    // Lissage humain du volant
    const smoothFactor = Math.min(1, dt * 10);
    this.smoothSteer += (targetSteer - this.smoothSteer) * smoothFactor;

    // Wobble de personnalité
    const wobbleVal = Math.sin(this.wobbleT * 3 + this.id * 7) * this.wobble;
    const steer = this.smoothSteer + wobbleVal;

    // ── Accélération ──
    let acc = 1.0;

    // Freinage prédictif (route courte devant = virage)
    if (centerDist < 3 && k.speed > 18) {
      acc = 0.15 * this.brakeSkill;
    } else if (centerDist < 5 && k.speed > 24) {
      acc = 0.4;
    }

    // Si sur l'herbe, ralentir
    if (getTile(k.x, k.z) === 0) acc = 0.2;

    // Drift automatique
    const drift = Math.abs(steer) > 2.2 && k.speed > 20;

    // Vitesse max
    k.maxAiSpeed = this.topSpeed + (drift ? 3 : 0);

    // ── Évitement des autres karts ──
    let avoidSteer = 0;
    for (let j = 0; j < karts.length; j++) {
      if (karts[j] === k) continue;
      const dx = karts[j].x - k.x;
      const dz = karts[j].z - k.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < 350 && distSq > 1) {
        const a = Math.atan2(dx, dz);
        let diff = a - k.angle;
        while (diff > PI) diff -= PI2;
        while (diff < -PI) diff += PI2;
        if (Math.abs(diff) < PI / 2) {
          avoidSteer += (diff > 0 ? -1.5 : 1.5) * (350 - distSq) / 350;
        }
      }
    }

    // ── Rubberbanding (garder la course serrée) ──
    const player = karts[0];
    if (player && player !== k) {
      const pdx = player.x - k.x;
      const pdz = player.z - k.z;
      const pdist = pdx * pdx + pdz * pdz;
      if (pdist > 40000) {
        // Loin du joueur → boost
        k.maxAiSpeed += 4;
      } else if (pdist > 80000) {
        // Très loin → gros boost
        k.maxAiSpeed += 7;
      }
    }

    return { acc, steer: steer + avoidSteer, drift };
  }
}

// =====================================================================
//  COULEURS ABGR (Little Endian)
// =====================================================================
const COL_GRASS1   = 0xFF28AA28;
const COL_GRASS2   = 0xFF229222;
const COL_ASPHALT1 = 0xFF555555;
const COL_ASPHALT2 = 0xFF4A4A4A;
const COL_START    = 0xFFEEEEEE;
const COL_CURB_R   = 0xFF0000FF;
const COL_CURB_W   = 0xFFFFFFFF;
const COL_CENTER   = 0xFF88BBFF;

// =====================================================================
//  SCÈNE MARIO KART
// =====================================================================
export class MarioKartScene {
  constructor(game) {
    this.game = game;
    this.state = 'menu';
    this.selectedTrack = 0;
    this.selectedSkin = 0;
    this.renderW = 384;
    this.renderH = 216;

    // Escape → retour menu (fonctionne partout)
    this._escHandler = (e) => {
      if (e.key === 'Escape') this.game.returnToMenu();
    };
    document.addEventListener('keydown', this._escHandler);

    this.initMenu();
  }

  // ── Menu de sélection ──
  initMenu() {
    let html = `<div class="title" style="margin-bottom:10px;"><span class="big" style="color:#d02020; font-size:40px; text-shadow: 2px 2px #fff;">PIXEL KART</span></div>`;
    html += `<div style="display:flex; justify-content:space-around; width:100%;">
      <div style="flex:1;">
        <h3>Pilote</h3>
        <select id="mk-skin" style="font-size:20px; padding:5px;">
          ${SKIN_LIST.map((s,i)=>`<option value="${i}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;">
        <h3>Circuit</h3>
        <select id="mk-track" style="font-size:20px; padding:5px;">
          ${TRACKS.map((t,i)=>`<option value="${i}">${i+1}. ${t.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="margin-top:30px;">
      <button class="btn" id="mk-start" style="font-size:24px; background:#d02020;">🏁 COURSE (${TOTAL_LAPS} tours)</button>
      <button class="btn secondary" id="mk-back">Retour</button>
    </div>
    <p class="hint" style="margin-top:20px;">
      <b>Contrôles</b>: <br>
      Saut (Espace/Haut) = <b>ACCÉLÉRER</b><br>
      Tir (Shift/J) = <b>FREINER / DÉRAPER</b><br>
      ←/→ = <b>TOURNER</b> · Échap = <b>MENU</b>
    </p>`;
    const p = this.game.panel(html);
    p.querySelector('#mk-start').onclick = () => {
      this.selectedSkin = parseInt(p.querySelector('#mk-skin').value);
      this.selectedTrack = parseInt(p.querySelector('#mk-track').value);
      this.game.clearUI();
      this.initRace();
    };
    p.querySelector('#mk-back').onclick = () => this.game.returnToMenu();
  }

  // ── Initialisation de la course ──
  initRace() {
    this.track = TRACKS[this.selectedTrack];
    this.karts = [];
    this.aiControllers = [];
    this.raceState = 'countdown'; // countdown → racing → finished

    // Trouver la ligne de départ (tuile 2)
    let startX = 2, startZ = 2;
    for (let i = 0; i < this.track.data.length; i++) {
      if (this.track.data[i] === 2) {
        startX = (i % this.track.w) * TILE_SIZE + TILE_SIZE / 2;
        startZ = Math.floor(i / this.track.w) * TILE_SIZE + TILE_SIZE / 2;
        break;
      }
    }

    // Angle de départ : scanner les 4 directions pour la route la plus longue
    let startAngle = 0;
    let bestLen = 0;
    for (const [a, dx, dz] of [[0,0,1],[PI,0,-1],[PI/2,1,0],[-PI/2,-1,0]]) {
      let len = 0;
      for (let step = 1; step < 8; step++) {
        if (this.getTile(startX + dx * step * TILE_SIZE, startZ + dz * step * TILE_SIZE) > 0) len++;
        else break;
      }
      if (len > bestLen) { bestLen = len; startAngle = a; }
    }

    // Créer les 8 coureurs
    for (let i = 0; i < 8; i++) {
      const isPlayer = i === 0;
      const skinIndex = isPlayer ? this.selectedSkin : (i % SKIN_LIST.length);

      // Grille 2×4
      const col = (i % 2 === 0) ? -1 : 1;
      const row = Math.floor(i / 2);
      const perpX = Math.sin(startAngle + PI / 2) * col * 3;
      const perpZ = Math.cos(startAngle + PI / 2) * col * 3;
      const backX = -Math.sin(startAngle) * row * 4;
      const backZ = -Math.cos(startAngle) * row * 4;

      const kart = {
        isPlayer, id: i,
        x: startX + perpX + backX,
        z: startZ + perpZ + backZ,
        angle: startAngle,
        speed: 0,
        maxAiSpeed: 30,
        skin: SKIN_LIST[skinIndex],
        lap: 0,
        onStartLine: true, // Commence sur la ligne
        lapCooldown: 2.0,
      };
      this.karts.push(kart);

      if (!isPlayer) {
        this.aiControllers.push(new RoadAI(i));
      }
    }

    // Framebuffer
    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = this.renderW;
    this.bufferCanvas.height = this.renderH;
    this.bufferCtx = this.bufferCanvas.getContext('2d');
    this.horizon = 108;
    this.imgData = this.bufferCtx.createImageData(this.renderW, this.renderH - this.horizon);
    this.pixels = new Uint32Array(this.imgData.data.buffer);

    this.state = 'play';
    this.raceTime = 0;
    this.countdown = 3.0;
    this.finishTime = 0;
    this.playerPosition = 1;
  }

  // ── Accès tuile ──
  _tileAt(tx, tz) {
    if (tx >= 0 && tx < this.track.w && tz >= 0 && tz < this.track.h)
      return this.track.data[tz * this.track.w + tx];
    return 0;
  }

  getTile(worldX, worldZ) {
    return this._tileAt(Math.floor(worldX / TILE_SIZE), Math.floor(worldZ / TILE_SIZE));
  }

  // ── Mise à jour ──
  update(dt) {
    if (this.state !== 'play') return;

    // Pause / retour menu
    const I = this.game.input;
    if (I.justPressed && I.justPressed('pause', 0)) {
      this.game.returnToMenu();
      return;
    }

    // Countdown
    if (this.countdown > 0) {
      this.countdown -= dt;
      return;
    }

    if (this.raceState === 'countdown') this.raceState = 'racing';

    // Course terminée → attendre 3s puis menu
    if (this.raceState === 'finished') {
      this.finishTime += dt;
      if (this.finishTime > 5.0) {
        this.game.clearUI();
        this.initMenu();
        this.state = 'menu';
      }
      return;
    }

    this.raceTime += dt;

    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      let acc = 0, steer = 0, drift = false;

      if (k.isPlayer) {
        acc = I.isDown('jump', 0) ? 1.0 : 0;
        steer = (I.isDown('left', 0) ? 1 : 0) + (I.isDown('right', 0) ? -1 : 0);
        drift = I.isDown('fire', 0);
        k.maxAiSpeed = drift ? 38 : 32;
      } else {
        const ai = this.aiControllers.find(c => c.id === k.id);
        if (ai) {
          const r = ai.update(dt, k, this.karts, (x, z) => this.getTile(x, z));
          acc = r.acc; steer = r.steer; drift = r.drift;
        }
      }

      // ── Physique ──
      if (acc > 0) k.speed += acc * 30 * dt;
      else if (acc < 0) k.speed += acc * 20 * dt;
      else {
        if (k.speed > 0) k.speed = Math.max(0, k.speed - 12 * dt);
        else if (k.speed < 0) k.speed = Math.min(0, k.speed + 12 * dt);
      }

      // Limite de vitesse
      const limit = k.maxAiSpeed;
      const minSpd = k.isPlayer ? (drift ? -8 : 0) : -10;
      k.speed = Math.max(minSpd, Math.min(k.speed, limit));

      // Rotation
      const steerMod = drift ? 3.5 : 2.2;
      const speedFactor = Math.max(0.25, Math.abs(k.speed) / 30);
      k.angle += steer * steerMod * dt * speedFactor;

      // ── MOUVEMENT AVEC BARRIÈRES ──
      const vx = Math.sin(k.angle) * k.speed * dt;
      const vz = Math.cos(k.angle) * k.speed * dt;

      const newX = k.x + vx;
      const newZ = k.z + vz;

      if (this.getTile(newX, newZ) > 0) {
        // Chemin libre
        k.x = newX;
        k.z = newZ;
      } else {
        // Barrière ! Glisser le long du mur SANS PÉNALITÉ
        let slid = false;
        if (this.getTile(k.x + vx, k.z) > 0) {
          k.x += vx;
          slid = true;
        }
        if (this.getTile(k.x, k.z + vz) > 0) {
          k.z += vz;
          slid = true;
        }
        // Rebond uniquement si complètement bloqué
        if (!slid) {
          k.speed = Math.abs(k.speed) > 5 ? k.speed * -0.15 : 0;
        }
      }

      // ── DÉTECTION DES TOURS ──
      const tile = this.getTile(k.x, k.z);
      k.lapCooldown -= dt;
      if (tile === 2) {
        if (!k.onStartLine && k.lapCooldown <= 0) {
          k.lap++;
          k.lapCooldown = 4.0; // Cooldown anti-triche
          // Le joueur a fini ?
          if (k.isPlayer && k.lap >= TOTAL_LAPS) {
            this.raceState = 'finished';
            this.finishTime = 0;
            // Calculer la position
            const sorted = [...this.karts].sort((a, b) => b.lap - a.lap);
            this.playerPosition = sorted.findIndex(kk => kk.isPlayer) + 1;
          }
        }
        k.onStartLine = true;
      } else {
        k.onStartLine = false;
      }
    }

    // ── Collisions entre karts ──
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const k1 = this.karts[i], k2 = this.karts[j];
        const dx = k2.x - k1.x, dz = k2.z - k1.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 5.0;
        if (distSq > 0.01 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist, nz = dz / dist;

          // Pousser les karts mais vérifier qu'ils restent sur la route
          const newK1x = k1.x - nx * overlap, newK1z = k1.z - nz * overlap;
          const newK2x = k2.x + nx * overlap, newK2z = k2.z + nz * overlap;

          if (this.getTile(newK1x, newK1z) > 0) { k1.x = newK1x; k1.z = newK1z; }
          if (this.getTile(newK2x, newK2z) > 0) { k2.x = newK2x; k2.z = newK2z; }

          k1.speed *= 0.95; k2.speed *= 0.95;
        }
      }
    }
  }

  // ── Rendu Mode 7 ──
  drawMode7() {
    const player = this.karts[0];
    const camX = player.x, camZ = player.z, camA = player.angle;
    const camHeight = 6.0, fov = 1.0;
    const W = this.renderW, H = this.renderH;
    const hHalf = H - this.horizon;
    const trackW = this.track.w, trackH = this.track.h;
    const data = this.track.data, T = TILE_SIZE;
    const sinA = Math.sin(camA), cosA = Math.cos(camA);

    let offset = 0;
    for (let y = 0; y < hHalf; y++) {
      const rowDist = camHeight / (y + 1) * (H / 2);

      const rayX0 = sinA + cosA * fov, rayZ0 = cosA - sinA * fov;
      const rayX1 = sinA - cosA * fov, rayZ1 = cosA + sinA * fov;

      const floorX0 = camX + rowDist * rayX0, floorZ0 = camZ + rowDist * rayZ0;
      const floorX1 = camX + rowDist * rayX1, floorZ1 = camZ + rowDist * rayZ1;

      const stepX = (floorX1 - floorX0) / W, stepZ = (floorZ1 - floorZ0) / W;
      let floorX = floorX0, floorZ = floorZ0;

      for (let x = 0; x < W; x++) {
        const tx = Math.floor(floorX / T), tz = Math.floor(floorZ / T);
        const tileVal = (tx >= 0 && tx < trackW && tz >= 0 && tz < trackH)
          ? data[tz * trackW + tx] : 0;

        let col;
        if (tileVal > 0) {
          const lx = floorX - tx * T, lz = floorZ - tz * T;
          const bw = 1.8;
          let isBorder = false;
          if (lx < bw  && this._tileAt(tx - 1, tz) === 0) isBorder = true;
          else if (lx > T - bw && this._tileAt(tx + 1, tz) === 0) isBorder = true;
          else if (lz < bw  && this._tileAt(tx, tz - 1) === 0) isBorder = true;
          else if (lz > T - bw && this._tileAt(tx, tz + 1) === 0) isBorder = true;

          if (isBorder) {
            col = (Math.floor((floorX + floorZ) / 3) & 1) ? COL_CURB_R : COL_CURB_W;
          } else if (tileVal === 2) {
            col = ((Math.floor(floorX / 2) ^ Math.floor(floorZ / 2)) & 1) ? COL_START : COL_ASPHALT1;
          } else {
            // Asphalte texturé + ligne centrale
            const halfT = T / 2;
            const atCenter = (Math.abs(lx - halfT) < 0.4 || Math.abs(lz - halfT) < 0.4);
            const isH = (this._tileAt(tx-1,tz) > 0 && this._tileAt(tx+1,tz) > 0);
            const isV = (this._tileAt(tx,tz-1) > 0 && this._tileAt(tx,tz+1) > 0);
            if (atCenter && (isH || isV)) {
              col = ((isH ? tz : tx) & 1) ? COL_CENTER : COL_ASPHALT1;
            } else {
              col = ((Math.floor(floorX*2) ^ Math.floor(floorZ*2)) & 1) ? COL_ASPHALT1 : COL_ASPHALT2;
            }
          }
        } else {
          col = ((Math.floor(floorX/T) ^ Math.floor(floorZ/T)) & 1) ? COL_GRASS1 : COL_GRASS2;
        }

        // Brouillard
        if (y < 25) {
          const fade = Math.max(0.25, y / 25);
          const r = ((col & 0xFF) * fade) & 0xFF;
          const g = (((col >> 8) & 0xFF) * fade) & 0xFF;
          const b = (((col >> 16) & 0xFF) * fade) & 0xFF;
          col = 0xFF000000 | (b << 16) | (g << 8) | r;
        }

        this.pixels[offset++] = col;
        floorX += stepX; floorZ += stepZ;
      }
    }
  }

  // ── Sprite kart ──
  drawKartSprite(ctx, cx, cy, width, skinHex, steer, diffAngle = 0) {
    const w = width, h = width * 0.8;
    const px = cx - w / 2, py = cy - h;

    let diff = diffAngle % PI2;
    if (diff > PI) diff -= PI2;
    if (diff < -PI) diff += PI2;

    const pi4 = PI / 4;
    let view = 'back';
    if (diff > 3*pi4 || diff < -3*pi4) view = 'front';
    else if (diff > pi4) view = 'left';
    else if (diff < -pi4) view = 'right';

    const headOff = steer * (w * 0.1);

    switch (view) {
      case 'back':
        ctx.fillStyle = '#111';
        ctx.fillRect(px - w*0.1, py + h*0.2, w*0.3, h*0.3);
        ctx.fillRect(px + w*0.8, py + h*0.2, w*0.3, h*0.3);
        ctx.fillRect(px - w*0.15, py + h*0.7, w*0.3, h*0.4);
        ctx.fillRect(px + w*0.85, py + h*0.7, w*0.3, h*0.4);
        ctx.fillStyle = '#999';
        ctx.fillRect(px + w*0.1, py + h*0.3, w*0.8, h*0.6);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w*0.2, py + h*0.4, w*0.6, h*0.5);
        ctx.fillRect(px + w*0.3, py + h*0.2, w*0.4, h*0.2);
        ctx.beginPath(); ctx.arc(cx + headOff, py + h*0.2, w*0.3, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w*0.15 + headOff, py + h*0.1, w*0.3, w*0.15);
        break;
      case 'front':
        ctx.fillStyle = '#111';
        ctx.fillRect(px - w*0.15, py + h*0.7, w*0.3, h*0.4);
        ctx.fillRect(px + w*0.85, py + h*0.7, w*0.3, h*0.4);
        ctx.fillRect(px - w*0.1, py + h*0.2, w*0.3, h*0.3);
        ctx.fillRect(px + w*0.8, py + h*0.2, w*0.3, h*0.3);
        ctx.fillStyle = '#999';
        ctx.fillRect(px + w*0.1, py + h*0.3, w*0.8, h*0.6);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w*0.2, py + h*0.1, w*0.6, h*0.6);
        ctx.fillRect(px + w*0.3, py + h*0.6, w*0.4, h*0.3);
        ctx.beginPath(); ctx.arc(cx - headOff, py + h*0.2, w*0.3, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w*0.2 - headOff, py + h*0.05, w*0.4, w*0.25);
        ctx.fillStyle = 'black';
        ctx.fillRect(cx - w*0.1 - headOff, py + h*0.1, w*0.05, w*0.05);
        ctx.fillRect(cx + w*0.05 - headOff, py + h*0.1, w*0.05, w*0.05);
        break;
      case 'right':
        ctx.fillStyle = '#111';
        ctx.fillRect(px + w*0.1, py + h*0.6, w*0.3, h*0.4);
        ctx.fillRect(px + w*0.6, py + h*0.6, w*0.3, h*0.4);
        ctx.fillStyle = '#999';
        ctx.fillRect(px + w*0.1, py + h*0.4, w*0.8, h*0.4);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w*0.1, py + h*0.3, w*0.5, h*0.3);
        ctx.fillRect(px + w*0.6, py + h*0.45, w*0.3, h*0.15);
        ctx.beginPath(); ctx.arc(cx - w*0.1, py + h*0.15, w*0.25, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w*0.1, py + h*0.05, w*0.25, w*0.15);
        break;
      case 'left':
        ctx.fillStyle = '#111';
        ctx.fillRect(px + w*0.6, py + h*0.6, w*0.3, h*0.4);
        ctx.fillRect(px + w*0.1, py + h*0.6, w*0.3, h*0.4);
        ctx.fillStyle = '#999';
        ctx.fillRect(px + w*0.1, py + h*0.4, w*0.8, h*0.4);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w*0.4, py + h*0.3, w*0.5, h*0.3);
        ctx.fillRect(px + w*0.1, py + h*0.45, w*0.3, h*0.15);
        ctx.beginPath(); ctx.arc(cx + w*0.1, py + h*0.15, w*0.25, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w*0.15, py + h*0.05, w*0.25, w*0.15);
        break;
    }
  }

  // ── Rendu principal ──
  draw(ctx) {
    if (this.state !== 'play') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      return;
    }

    const horizon = this.horizon;
    const bc = this.bufferCtx;
    const PLAYER_SIZE = 40;

    // 1. Ciel
    const grad = bc.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, '#1a5aff');
    grad.addColorStop(0.6, '#5599ff');
    grad.addColorStop(1, '#aaddff');
    bc.fillStyle = grad;
    bc.fillRect(0, 0, this.renderW, horizon);

    // 2. Sol Mode 7
    this.drawMode7();
    bc.putImageData(this.imgData, 0, horizon);

    // 3. Sprites (Z-sort)
    const player = this.karts[0];
    const camA = player.angle, camX = player.x, camZ = player.z;
    const sinCam = Math.sin(camA), cosCam = Math.cos(camA);

    const sorted = [...this.karts].sort((a, b) =>
      ((b.x-camX)**2 + (b.z-camZ)**2) - ((a.x-camX)**2 + (a.z-camZ)**2)
    );

    const I = this.game.input;

    for (const k of sorted) {
      if (k.isPlayer) {
        const steer = (I.isDown('left', 0) ? -1 : 0) + (I.isDown('right', 0) ? 1 : 0);
        this.drawKartSprite(bc, this.renderW / 2, this.renderH - 10, PLAYER_SIZE, k.skin.color, steer);
      } else {
        const dx = k.x - camX, dz = k.z - camZ;
        const rx = -(dx * cosCam - dz * sinCam);
        const rz = dx * sinCam + dz * cosCam;

        if (rz > 1.0) {
          const focalLength = 160;
          const scale = focalLength / rz;
          const screenX = (this.renderW / 2) + (rx * scale);
          const screenY = horizon + (6.0 * scale);

          if (screenX > -80 && screenX < this.renderW + 80 && screenY > horizon && screenY < this.renderH + 50) {
            // Taille IA proportionnelle à la distance (perspective correcte)
            const kartSize = Math.max(8, Math.min(PLAYER_SIZE, PLAYER_SIZE * scale));
            const diffAngle = k.angle - camA;
            const steerIA = Math.sin(k.id * 10 + Date.now() / 200) * 0.5;
            this.drawKartSprite(bc, screenX, screenY, kartSize, k.skin.color, steerIA, diffAngle);
          }
        }
      }
    }

    // 4. Copie sur l'écran final
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bufferCanvas, 0, 0, VIEW_W, VIEW_H);

    // 5. HUD
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;

    // Vitesse
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    const speed = Math.round(Math.abs(player.speed) * 4);
    ctx.textAlign = 'right';
    ctx.fillText(speed + ' km/h', VIEW_W - 15, VIEW_H - 20);

    // Tours
    const currentLap = Math.min((player.lap || 0) + 1, TOTAL_LAPS);
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(`Tour ${currentLap}/${TOTAL_LAPS}`, 15, 35);

    // Chrono
    const mins = Math.floor(this.raceTime / 60);
    const secs = Math.floor(this.raceTime % 60);
    const ms = Math.floor((this.raceTime * 100) % 100);
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`${mins}:${String(secs).padStart(2,'0')}.${String(ms).padStart(2,'0')}`, VIEW_W / 2, 30);

    // Hint menu
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'right';
    ctx.fillText('ESC = Menu', VIEW_W - 10, 20);

    // Countdown
    if (this.countdown > 0) {
      ctx.font = 'bold 80px sans-serif';
      ctx.fillStyle = '#ff3333';
      ctx.textAlign = 'center';
      const num = Math.ceil(this.countdown);
      ctx.fillText(num > 0 ? String(num) : 'GO!', VIEW_W / 2, VIEW_H / 2);
    }

    // Écran de fin de course
    if (this.raceState === 'finished') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, VIEW_H / 4, VIEW_W, VIEW_H / 2);

      ctx.font = 'bold 48px sans-serif';
      ctx.fillStyle = this.playerPosition === 1 ? '#ffd700' : '#fff';
      ctx.textAlign = 'center';
      const posText = this.playerPosition === 1 ? '🏆 1ère PLACE !' :
                      this.playerPosition <= 3 ? `${this.playerPosition}ème place !` :
                      `${this.playerPosition}ème place`;
      ctx.fillText(posText, VIEW_W / 2, VIEW_H / 2 - 10);

      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ffdd44';
      ctx.fillText(`Temps : ${mins}:${String(secs).padStart(2,'0')}.${String(ms).padStart(2,'0')}`, VIEW_W / 2, VIEW_H / 2 + 30);

      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Retour au menu dans quelques secondes...', VIEW_W / 2, VIEW_H / 2 + 60);
    }

    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'left';
  }

  dispose() {
    this.state = 'menu';
    if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
  }
}
