// scene_mariokart.js — Mode Karting Rétro 2D (Mode 7) - Refonte V3
import { VIEW_W, VIEW_H } from './core.js';
import { SKIN_LIST } from './art.js';

// =====================================================================
//  CONSTANTES
// =====================================================================
const TILE_SIZE = 12;
const PI  = Math.PI;
const PI2 = PI * 2;

// =====================================================================
//  CIRCUITS — Routes larges (3-4 tuiles), techniques, sans passages étroits
//  0 = Herbe, 1 = Route, 2 = Ligne de départ
// =====================================================================
function M(name, str, waypoints) {
  const lines = str.trim().split('\n').map(l => l.trim().replace(/ /g, ''));
  const h = lines.length, w = lines[0].length;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      data[y * w + x] = parseInt(lines[y][x]) || 0;
  return { name, w, h, data, waypoints };
}

// Waypoints = liste de {x, z} en coordonnées TILES, l'IA suit ces points dans l'ordre en boucle
const TRACKS = [
  // ──── 1. Circuit Ovale Large ────
  M('Grand Ovale', `
    00000000000000000000
    00001111111111110000
    00011111111111111000
    00111000000000111100
    00110000000000011100
    01110000000000011100
    01100000000000001110
    01100000000000001110
    01100000000000001110
    01110000000000011100
    00110000000000011100
    00111000000000111100
    00011111122111111000
    00001111111111110000
    00000000000000000000
  `, [
    {x:10,z:13}, {x:15,z:12}, {x:17,z:10}, {x:18,z:7},
    {x:17,z:4}, {x:15,z:2}, {x:10,z:1}, {x:5,z:2},
    {x:3,z:4}, {x:2,z:7}, {x:3,z:10}, {x:5,z:12}
  ]),

  // ──── 2. Circuit en 8 (Double Boucle) ────
  M('Double Boucle', `
    00000000000000000000
    00111111001111111000
    01111111011111111100
    01100011111100001100
    01100001111000001100
    01111111001111111100
    00111111001111111000
    01111111001111111100
    01100001111000001100
    01100011111100001100
    01111111011111111100
    00111122001111111000
    00000000000000000000
  `, [
    {x:5,z:11}, {x:3,z:10}, {x:2,z:8}, {x:3,z:6},
    {x:5,z:5}, {x:7,z:4}, {x:9,z:3}, {x:12,z:4},
    {x:15,z:3}, {x:17,z:2}, {x:18,z:4}, {x:17,z:6},
    {x:15,z:7}, {x:12,z:7}, {x:9,z:8}, {x:7,z:9},
    {x:5,z:10}, {x:3,z:11}
  ]),

  // ──── 3. Circuit Technique (Chicanes) ────
  M('Chicane Royale', `
    00000000000000000000
    00111111111111111100
    00111111111111111100
    00110000000000001100
    00110000000000001100
    00110011111100001100
    00110011111100001100
    00110000000000001100
    00110000000000001100
    00110000111111001100
    00110000111111001100
    00110000000000001100
    00110000000000001100
    00112211111111111100
    00111111111111111100
    00000000000000000000
  `, [
    {x:4,z:14}, {x:16,z:14}, {x:17,z:10}, {x:14,z:10},
    {x:9,z:10}, {x:5,z:9}, {x:5,z:6}, {x:6,z:5},
    {x:11,z:5}, {x:16,z:5}, {x:17,z:3}, {x:10,z:2},
    {x:3,z:3}, {x:3,z:12}
  ]),

  // ──── 4. Circuit de la Montagne ────
  M('Col de Montagne', `
    0000000000000000000000
    0011111100000111111100
    0011111100001111111100
    0011000000001100001100
    0011000000001100001100
    0011000000001100001100
    0011000001111100001100
    0011000001111100001100
    0011000001100000001100
    0011111101100000001100
    0011111101100000001100
    0000001101111111111100
    0000001101111111111100
    0000001100000000001100
    0011111100000000001100
    0011111122000111111100
    0011000000001111111100
    0011000000001100000000
    0011111111111100000000
    0011111111111100000000
    0000000000000000000000
  `, [
    {x:6,z:15}, {x:3,z:15}, {x:2,z:17}, {x:6,z:19},
    {x:10,z:19}, {x:12,z:17}, {x:12,z:15}, {x:12,z:12},
    {x:16,z:11}, {x:19,z:10}, {x:19,z:6}, {x:19,z:3},
    {x:15,z:2}, {x:12,z:4}, {x:12,z:7}, {x:8,z:7},
    {x:5,z:7}, {x:3,z:5}, {x:3,z:2}, {x:6,z:1},
    {x:10,z:1}, {x:14,z:1}
  ]),

  // ──── 5. Grand Prix Final ────
  M('Grand Prix', `
    000000000000000000000000
    001111111111111111111100
    001111111111111111111100
    001100000000000000001100
    001100000000000000001100
    001100001111111100001100
    001100001111111100001100
    001100001100001100001100
    001100001100001100001100
    001100001100001100001100
    001100001111111100001100
    001100001111111100001100
    001100000000000000001100
    001100000000000000001100
    001111111111222111111100
    001111111111111111111100
    000000000000000000000000
  `, [
    {x:12,z:15}, {x:20,z:14}, {x:21,z:10}, {x:21,z:5},
    {x:20,z:3}, {x:12,z:2}, {x:4,z:3}, {x:3,z:5},
    {x:3,z:10}, {x:3,z:13}, {x:4,z:14}, {x:8,z:14},
    {x:8,z:11}, {x:9,z:6}, {x:12,z:5}, {x:15,z:6},
    {x:16,z:11}, {x:15,z:14}
  ]),

  // ──── 6. Serpent Express ────
  M('Serpent Express', `
    00000000000000000000
    01111100001111100000
    01111110011111110000
    00000111111000011100
    00000111111000011100
    01111110011111110000
    01111100001111100000
    00000111111000011100
    00000111111000011100
    01111110011111110000
    01111100001111100000
    00002111111000011100
    00000111111000011100
    01111110011111110000
    01111100001111100000
    00000000000000000000
  `, [
    {x:3,z:11}, {x:1,z:10}, {x:1,z:6}, {x:3,z:5},
    {x:6,z:4}, {x:8,z:3}, {x:11,z:2}, {x:14,z:1},
    {x:16,z:2}, {x:17,z:4}, {x:16,z:6}, {x:13,z:6},
    {x:10,z:7}, {x:7,z:8}, {x:5,z:9}, {x:3,z:10},
    {x:3,z:12}, {x:6,z:13}, {x:8,z:14}, {x:13,z:14},
    {x:16,z:13}, {x:17,z:11}, {x:16,z:9}, {x:13,z:9},
    {x:10,z:10}, {x:7,z:11}
  ]),

  // ──── 7. Route Arc-en-Ciel ────
  M('Route Arc-en-Ciel', `
    000000000000000000000000
    000111111111111111111000
    001111111111111111111100
    001100000000000000001100
    001100000000000000001100
    001100001111111100001100
    001100001111111100001100
    001100001100001100001100
    001100001100001100001100
    001100001111111100001100
    001100001111111100001100
    001100000000000000001100
    001100000000000000001100
    001122111111111111111100
    001111111111111111111100
    000000000000000000000000
  `, [
    {x:4,z:14}, {x:10,z:14}, {x:18,z:14}, {x:21,z:12},
    {x:21,z:7}, {x:21,z:4}, {x:18,z:2}, {x:10,z:2},
    {x:4,z:2}, {x:2,z:4}, {x:2,z:7}, {x:2,z:12},
    // Boucle intérieure
    {x:5,z:11}, {x:9,z:10}, {x:14,z:10}, {x:16,z:8},
    {x:14,z:6}, {x:9,z:6}, {x:5,z:7}
  ]),
];

// =====================================================================
//  WAYPOINT PATHFINDER — IA par suivi de checkpoints
// =====================================================================
class WaypointAI {
  constructor(kart, waypoints, personality) {
    this.kart = kart;
    this.waypoints = waypoints;
    this.currentWP = 0;
    this.wpThresholdSq = 10 * 10; // Distance en unités monde au carré pour valider un WP

    // Personnalité unique
    this.topSpeed     = personality.topSpeed;     // 28-35
    this.aggression   = personality.aggression;   // 0.5-1.5 (multiplier de steer)
    this.brakingSkill = personality.brakingSkill;  // 0.6-1.0 (anticipe les virages)
    this.errorRate    = personality.errorRate;     // 0-0.3 (erreurs random)
    this.laneOffset   = personality.laneOffset;   // -3 à +3 (décalage latéral)
    this.reaction     = personality.reaction;     // 0-0.2s (délai de réaction)

    // État interne
    this.stuckTimer = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.draftBonus = 0;
    this.rubberBonus = 0;
    this.errorAccum = 0;
  }

  getTarget() {
    const wp = this.waypoints[this.currentWP];
    return {
      x: wp.x * TILE_SIZE + TILE_SIZE / 2 + this.laneOffset,
      z: wp.z * TILE_SIZE + TILE_SIZE / 2
    };
  }

  advanceWP() {
    this.currentWP = (this.currentWP + 1) % this.waypoints.length;
  }

  update(dt, karts, playerKart, getTile) {
    const k = this.kart;

    // ── Avancer le waypoint si on est proche ──
    const tgt = this.getTarget();
    const dxWP = tgt.x - k.x;
    const dzWP = tgt.z - k.z;
    const distWPSq = dxWP * dxWP + dzWP * dzWP;
    if (distWPSq < this.wpThresholdSq) {
      this.advanceWP();
    }

    // ── Direction vers le waypoint courant ──
    const freshTgt = this.getTarget();
    const dx = freshTgt.x - k.x;
    const dz = freshTgt.z - k.z;
    const targetAngle = Math.atan2(dx, dz);

    // ── Différence angulaire ──
    let angleDiff = targetAngle - k.angle;
    while (angleDiff > PI) angleDiff -= PI2;
    while (angleDiff < -PI) angleDiff += PI2;

    // ── Steering vers le waypoint ──
    let steer = angleDiff * 3.0 * this.aggression;
    steer = Math.max(-3.0, Math.min(3.0, steer)); // Clamp

    // ── Erreurs humaines (petit wobble) ──
    this.errorAccum += dt;
    if (this.errorRate > 0) {
      steer += Math.sin(this.errorAccum * 4 + k.id * 7) * this.errorRate * 1.5;
    }

    // ── Accélération intelligente ──
    let acc = 1.0;
    const absAngleDiff = Math.abs(angleDiff);

    // Freiner dans les virages serrés
    if (absAngleDiff > 0.6 && k.speed > 20) {
      acc = 0.3 * this.brakingSkill;
    } else if (absAngleDiff > 0.3 && k.speed > 25) {
      acc = 0.6;
    }

    // ── Aspiration (Drafting) ──
    this.draftBonus = 0;
    for (let j = 0; j < karts.length; j++) {
      if (karts[j] === k) continue;
      const odx = karts[j].x - k.x;
      const odz = karts[j].z - k.z;
      const odist = odx * odx + odz * odz;
      if (odist > 100 && odist < 1600) {
        const aToOther = Math.atan2(odx, odz);
        let adiff = aToOther - k.angle;
        while (adiff > PI) adiff -= PI2;
        while (adiff < -PI) adiff += PI2;
        if (Math.abs(adiff) < 0.25) {
          this.draftBonus = Math.max(this.draftBonus, 4.0);
        }
      }
    }

    // ── Évitement d'urgence des autres karts ──
    let avoidSteer = 0;
    for (let j = 0; j < karts.length; j++) {
      if (karts[j] === k) continue;
      const odx = karts[j].x - k.x;
      const odz = karts[j].z - k.z;
      const odist = odx * odx + odz * odz;
      if (odist < 400 && odist > 1) {
        const aToOther = Math.atan2(odx, odz);
        let adiff = aToOther - k.angle;
        while (adiff > PI) adiff -= PI2;
        while (adiff < -PI) adiff += PI2;
        if (Math.abs(adiff) < PI / 2) {
          const strength = (400 - odist) / 400;
          avoidSteer += (adiff > 0 ? -2.0 : 2.0) * strength;
        }
      }
    }
    steer += avoidSteer;

    // ── Rubberbanding ──
    this.rubberBonus = 0;
    if (playerKart) {
      const pdx = playerKart.x - k.x;
      const pdz = playerKart.z - k.z;
      const pdist = pdx * pdx + pdz * pdz;
      // Mesurer si on est devant ou derrière
      const pDir = Math.atan2(pdx, pdz);
      let pDiff = pDir - k.angle;
      while (pDiff > PI) pDiff -= PI2;
      while (pDiff < -PI) pDiff += PI2;
      const isBehind = Math.abs(pDiff) < PI / 2;

      if (isBehind && pdist > 30000) {
        this.rubberBonus = 5.0; // Rattrapez-le !
      } else if (!isBehind && pdist > 50000) {
        this.rubberBonus = -4.0; // Ralentir, trop d'avance
      }
    }

    // ── Drift automatique dans les gros virages ──
    const drift = (absAngleDiff > 0.8 && k.speed > 22);

    // ── Détection de blocage (stuck) ──
    const moved = Math.abs(k.x - this.lastX) + Math.abs(k.z - this.lastZ);
    this.lastX = k.x;
    this.lastZ = k.z;

    if (moved < 0.2 * dt * 60) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }

    // Si bloqué > 1.5s, marche arrière et braquage inverse
    if (this.stuckTimer > 1.5) {
      acc = -1.0;
      steer = -steer * 2;
      if (this.stuckTimer > 3.0) {
        // Reset au dernier waypoint
        const wp = this.waypoints[this.currentWP];
        k.x = wp.x * TILE_SIZE + TILE_SIZE / 2;
        k.z = wp.z * TILE_SIZE + TILE_SIZE / 2;
        k.speed = 5;
        this.stuckTimer = 0;
      }
    }

    // ── Vitesse max composite ──
    k.maxAiSpeed = this.topSpeed + this.draftBonus + this.rubberBonus;

    return { acc, steer, drift };
  }
}

// =====================================================================
//  PERSONNALITÉS DES IAs
// =====================================================================
function makePersonality(id) {
  // Chaque IA a un profil unique et déterministe
  const profiles = [
    null, // index 0 = joueur
    { topSpeed: 30, aggression: 1.0, brakingSkill: 0.9, errorRate: 0.05, laneOffset: -1.5, reaction: 0.05 }, // Prudent
    { topSpeed: 33, aggression: 1.3, brakingSkill: 0.7, errorRate: 0.15, laneOffset:  2.0, reaction: 0.10 }, // Agressif
    { topSpeed: 31, aggression: 1.1, brakingSkill: 0.85, errorRate: 0.08, laneOffset: -0.5, reaction: 0.07 }, // Équilibré
    { topSpeed: 34, aggression: 1.4, brakingSkill: 0.6, errorRate: 0.20, laneOffset:  1.0, reaction: 0.15 }, // Téméraire
    { topSpeed: 29, aggression: 0.9, brakingSkill: 1.0, errorRate: 0.02, laneOffset:  0.0, reaction: 0.03 }, // Pro
    { topSpeed: 32, aggression: 1.2, brakingSkill: 0.75, errorRate: 0.12, laneOffset: -2.5, reaction: 0.08 }, // Kamikaze
    { topSpeed: 31, aggression: 1.0, brakingSkill: 0.80, errorRate: 0.10, laneOffset:  3.0, reaction: 0.12 }, // Large
  ];
  return profiles[id] || profiles[1];
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
const COL_CENTER   = 0xFF88BBFF; // Ligne centrale bleue

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
    this.initMenu();
  }

  // ── Menu de sélection ──
  initMenu() {
    let html = `<div class="title" style="margin-bottom:10px;"><span class="big" style="color:#d02020; font-size:40px; text-shadow: 2px 2px #fff;">KARTING 2D</span></div>`;
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
      <button class="btn" id="mk-start" style="font-size:24px; background:#d02020;">🏁 DÉMARRER LA COURSE</button>
      <button class="btn secondary" id="mk-back">Retour</button>
    </div>
    <p class="hint" style="margin-top:20px;">
      <b>Contrôles</b>: <br>
      Saut (Clavier: Espace/Haut / Tactile: Droite) = <b>ACCÉLÉRER</b><br>
      Tir (Clavier: Shift/J / Tactile: HautGauche) = <b>FREINER / DÉRAPER</b><br>
      Gauche/Droite = <b>TOURNER</b>
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

    // Trouver la position de départ (tuile '2')
    let startX = 2, startZ = 2;
    for (let i = 0; i < this.track.data.length; i++) {
      if (this.track.data[i] === 2) {
        startX = (i % this.track.w) * TILE_SIZE + TILE_SIZE / 2;
        startZ = Math.floor(i / this.track.w) * TILE_SIZE + TILE_SIZE / 2;
        break;
      }
    }

    // Déterminer l'angle de départ (direction de la route adjacente)
    const startTX = Math.floor(startX / TILE_SIZE);
    const startTZ = Math.floor(startZ / TILE_SIZE);
    let startAngle = 0;
    // Regarder quelle direction a de la route
    if (this._tileAt(startTX, startTZ - 1) > 0) startAngle = 0;        // Nord
    else if (this._tileAt(startTX, startTZ + 1) > 0) startAngle = PI;   // Sud
    else if (this._tileAt(startTX + 1, startTZ) > 0) startAngle = PI/2; // Est
    else if (this._tileAt(startTX - 1, startTZ) > 0) startAngle = -PI/2;// Ouest

    // Créer les 8 coureurs
    for (let i = 0; i < 8; i++) {
      const isPlayer = i === 0;
      const skinIndex = isPlayer ? this.selectedSkin : (i % SKIN_LIST.length);

      // Grille de départ : 2 colonnes, 4 rangées
      const col = (i % 2 === 0) ? -1 : 1;
      const row = Math.floor(i / 2);
      // Décalage perpendiculaire à la direction de départ
      const perpX = Math.sin(startAngle + PI / 2) * col * 3;
      const perpZ = Math.cos(startAngle + PI / 2) * col * 3;
      // Décalage dans la direction opposée (derrière la ligne)
      const backX = -Math.sin(startAngle) * row * 4;
      const backZ = -Math.cos(startAngle) * row * 4;

      const kart = {
        isPlayer,
        id: i,
        x: startX + perpX + backX,
        z: startZ + perpZ + backZ,
        angle: startAngle,
        speed: 0,
        maxAiSpeed: 30,
        skin: SKIN_LIST[skinIndex],
        stuckTime: 0,
      };
      this.karts.push(kart);

      // Créer le contrôleur IA
      if (!isPlayer && this.track.waypoints) {
        this.aiControllers.push(
          new WaypointAI(kart, this.track.waypoints, makePersonality(i))
        );
      }
    }

    // Préparer le Framebuffer
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
  }

  // ── Accès tuile par index ──
  _tileAt(tx, tz) {
    if (tx >= 0 && tx < this.track.w && tz >= 0 && tz < this.track.h) {
      return this.track.data[tz * this.track.w + tx];
    }
    return 0;
  }

  getTile(worldX, worldZ) {
    return this._tileAt(Math.floor(worldX / TILE_SIZE), Math.floor(worldZ / TILE_SIZE));
  }

  // ── Boucle de mise à jour ──
  update(dt) {
    if (this.state !== 'play') return;

    // Countdown au départ
    if (this.countdown > 0) {
      this.countdown -= dt;
      return;
    }

    this.raceTime += dt;
    const I = this.game.input;

    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      let acc = 0, steer = 0, drift = false;

      if (k.isPlayer) {
        // ── Contrôles Joueur ──
        acc = I.isDown('jump', 0) ? 1.0 : 0;
        steer = (I.isDown('left', 0) ? 1 : 0) + (I.isDown('right', 0) ? -1 : 0);
        drift = I.isDown('fire', 0);
        k.maxAiSpeed = drift ? 38 : 32;
      } else {
        // ── IA par Waypoints ──
        const ai = this.aiControllers.find(c => c.kart === k);
        if (ai) {
          const result = ai.update(dt, this.karts, this.karts[0], (x, z) => this.getTile(x, z));
          acc = result.acc;
          steer = result.steer;
          drift = result.drift;
        }
      }

      // ── Physique ──
      // Accélération
      if (acc > 0) {
        k.speed += acc * 30 * dt;
      } else if (acc < 0) {
        k.speed += acc * 20 * dt; // Marche arrière
      } else {
        k.speed -= 12 * dt; // Décélération naturelle
      }

      // Frottement sol
      const tile = this.getTile(k.x, k.z);
      if (tile === 0) k.speed *= (1.0 - 2.0 * dt); // Fort ralentissement herbe

      // Limite de vitesse
      const limit = k.maxAiSpeed;
      k.speed = Math.max(-12, Math.min(k.speed, limit));

      // Rotation (proportionnelle à la vitesse, mais toujours un minimum)
      const steerMod = drift ? 3.5 : 2.2;
      const speedFactor = Math.max(0.25, Math.abs(k.speed) / 30);
      k.angle += steer * steerMod * dt * speedFactor;

      // Déplacement
      k.x += Math.sin(k.angle) * k.speed * dt;
      k.z += Math.cos(k.angle) * k.speed * dt;
    }

    // ── Collisions physiques entre karts ──
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const k1 = this.karts[i];
        const k2 = this.karts[j];
        const dx = k2.x - k1.x;
        const dz = k2.z - k1.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 5.0;

        if (distSq > 0.01 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const nz = dz / dist;

          k1.x -= nx * overlap;
          k1.z -= nz * overlap;
          k2.x += nx * overlap;
          k2.z += nz * overlap;

          // Transfert d'énergie cinétique
          const relSpeed = (k1.speed - k2.speed) * 0.3;
          k1.speed -= relSpeed;
          k2.speed += relSpeed;

          k1.speed *= 0.95;
          k2.speed *= 0.95;
        }
      }
    }
  }

  // ── Rendu Mode 7 (sol projeté) ──
  drawMode7() {
    const player = this.karts[0];
    const camX = player.x;
    const camZ = player.z;
    const camA = player.angle;
    const camHeight = 6.0;
    const fov = 1.0;

    const W = this.renderW;
    const H = this.renderH;
    const hHalf = H - this.horizon;

    const trackW = this.track.w;
    const trackH = this.track.h;
    const data = this.track.data;
    const T = TILE_SIZE;

    const sinA = Math.sin(camA);
    const cosA = Math.cos(camA);

    let offset = 0;

    for (let y = 0; y < hHalf; y++) {
      const rowDist = camHeight / (y + 1) * (H / 2);

      const rayX0 = sinA + cosA * fov;
      const rayZ0 = cosA - sinA * fov;
      const rayX1 = sinA - cosA * fov;
      const rayZ1 = cosA + sinA * fov;

      const floorX0 = camX + rowDist * rayX0;
      const floorZ0 = camZ + rowDist * rayZ0;
      const floorX1 = camX + rowDist * rayX1;
      const floorZ1 = camZ + rowDist * rayZ1;

      const stepX = (floorX1 - floorX0) / W;
      const stepZ = (floorZ1 - floorZ0) / W;

      let floorX = floorX0;
      let floorZ = floorZ0;

      for (let x = 0; x < W; x++) {
        const tx = Math.floor(floorX / T);
        const tz = Math.floor(floorZ / T);
        const tileVal = (tx >= 0 && tx < trackW && tz >= 0 && tz < trackH)
          ? data[tz * trackW + tx] : 0;

        let col;

        if (tileVal > 0) {
          // ── Route ──
          const lx = floorX - tx * T;
          const lz = floorZ - tz * T;
          const bw = 1.8;

          // Vibreurs sur les bords adjacents à l'herbe
          let isBorder = false;
          if (lx < bw  && this._tileAt(tx - 1, tz) === 0) isBorder = true;
          else if (lx > T - bw && this._tileAt(tx + 1, tz) === 0) isBorder = true;
          else if (lz < bw  && this._tileAt(tx, tz - 1) === 0) isBorder = true;
          else if (lz > T - bw && this._tileAt(tx, tz + 1) === 0) isBorder = true;

          if (isBorder) {
            const checker = Math.floor((floorX + floorZ) / 3) & 1;
            col = checker ? COL_CURB_R : COL_CURB_W;
          } else if (tileVal === 2) {
            // Damier départ
            const checker = (Math.floor(floorX / 2) ^ Math.floor(floorZ / 2)) & 1;
            col = checker ? COL_START : COL_ASPHALT1;
          } else {
            // Ligne centrale (au milieu de la tuile)
            const halfT = T / 2;
            const atCenter = (Math.abs(lx - halfT) < 0.4 || Math.abs(lz - halfT) < 0.4);
            // Seulement si c'est un segment droit (route des deux côtés)
            const isHStripe = (this._tileAt(tx - 1, tz) > 0 && this._tileAt(tx + 1, tz) > 0);
            const isVStripe = (this._tileAt(tx, tz - 1) > 0 && this._tileAt(tx, tz + 1) > 0);

            if (atCenter && (isHStripe || isVStripe)) {
              // Pointillés : un tronçon sur deux
              const tileSum = (isHStripe ? tz : tx);
              col = (tileSum & 1) ? COL_CENTER : COL_ASPHALT1;
            } else {
              // Asphalte légèrement texturé
              const checker = ((Math.floor(floorX * 2) ^ Math.floor(floorZ * 2)) & 1);
              col = checker ? COL_ASPHALT1 : COL_ASPHALT2;
            }
          }
        } else {
          // ── Herbe (damier) ──
          const checker = (Math.floor(floorX / T) ^ Math.floor(floorZ / T)) & 1;
          col = checker ? COL_GRASS1 : COL_GRASS2;
        }

        // Fog à l'horizon
        if (y < 25) {
          const fade = Math.max(0.25, y / 25);
          const r = ((col & 0xFF) * fade) & 0xFF;
          const g = (((col >> 8) & 0xFF) * fade) & 0xFF;
          const b = (((col >> 16) & 0xFF) * fade) & 0xFF;
          col = 0xFF000000 | (b << 16) | (g << 8) | r;
        }

        this.pixels[offset++] = col;

        floorX += stepX;
        floorZ += stepZ;
      }
    }
  }

  // ── Sprite de kart directionnel ──
  drawKartSprite(ctx, cx, cy, width, skinHex, steer, diffAngle = 0) {
    const w = width;
    const h = width * 0.8;
    const px = cx - w / 2;
    const py = cy - h;

    let diff = diffAngle % PI2;
    if (diff > PI) diff -= PI2;
    if (diff < -PI) diff += PI2;

    const pi4 = PI / 4;
    let view = 'back';
    if (diff > 3 * pi4 || diff < -3 * pi4) view = 'front';
    else if (diff > pi4) view = 'left';
    else if (diff < -pi4) view = 'right';

    const headOff = steer * (w * 0.1);

    switch (view) {
      case 'back':
        ctx.fillStyle = '#111';
        ctx.fillRect(px - w * 0.1, py + h * 0.2, w * 0.3, h * 0.3);
        ctx.fillRect(px + w * 0.8, py + h * 0.2, w * 0.3, h * 0.3);
        ctx.fillRect(px - w * 0.15, py + h * 0.7, w * 0.3, h * 0.4);
        ctx.fillRect(px + w * 0.85, py + h * 0.7, w * 0.3, h * 0.4);
        ctx.fillStyle = '#999';
        ctx.fillRect(px + w * 0.1, py + h * 0.3, w * 0.8, h * 0.6);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w * 0.2, py + h * 0.4, w * 0.6, h * 0.5);
        ctx.fillRect(px + w * 0.3, py + h * 0.2, w * 0.4, h * 0.2);
        ctx.beginPath(); ctx.arc(cx + headOff, py + h * 0.2, w * 0.3, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w * 0.15 + headOff, py + h * 0.1, w * 0.3, w * 0.15);
        break;

      case 'front':
        ctx.fillStyle = '#111';
        ctx.fillRect(px - w * 0.15, py + h * 0.7, w * 0.3, h * 0.4);
        ctx.fillRect(px + w * 0.85, py + h * 0.7, w * 0.3, h * 0.4);
        ctx.fillRect(px - w * 0.1, py + h * 0.2, w * 0.3, h * 0.3);
        ctx.fillRect(px + w * 0.8, py + h * 0.2, w * 0.3, h * 0.3);
        ctx.fillStyle = '#999';
        ctx.fillRect(px + w * 0.1, py + h * 0.3, w * 0.8, h * 0.6);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w * 0.2, py + h * 0.1, w * 0.6, h * 0.6);
        ctx.fillRect(px + w * 0.3, py + h * 0.6, w * 0.4, h * 0.3);
        ctx.beginPath(); ctx.arc(cx - headOff, py + h * 0.2, w * 0.3, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w * 0.2 - headOff, py + h * 0.05, w * 0.4, w * 0.25);
        ctx.fillStyle = 'black';
        ctx.fillRect(cx - w * 0.1 - headOff, py + h * 0.1, w * 0.05, w * 0.05);
        ctx.fillRect(cx + w * 0.05 - headOff, py + h * 0.1, w * 0.05, w * 0.05);
        break;

      case 'right':
        ctx.fillStyle = '#111';
        ctx.fillRect(px + w * 0.1, py + h * 0.6, w * 0.3, h * 0.4);
        ctx.fillRect(px + w * 0.6, py + h * 0.6, w * 0.3, h * 0.4);
        ctx.fillStyle = '#999';
        ctx.fillRect(px + w * 0.1, py + h * 0.4, w * 0.8, h * 0.4);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w * 0.1, py + h * 0.3, w * 0.5, h * 0.3);
        ctx.fillRect(px + w * 0.6, py + h * 0.45, w * 0.3, h * 0.15);
        ctx.beginPath(); ctx.arc(cx - w * 0.1, py + h * 0.15, w * 0.25, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w * 0.1, py + h * 0.05, w * 0.25, w * 0.15);
        break;

      case 'left':
        ctx.fillStyle = '#111';
        ctx.fillRect(px + w * 0.6, py + h * 0.6, w * 0.3, h * 0.4);
        ctx.fillRect(px + w * 0.1, py + h * 0.6, w * 0.3, h * 0.4);
        ctx.fillStyle = '#999';
        ctx.fillRect(px + w * 0.1, py + h * 0.4, w * 0.8, h * 0.4);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w * 0.4, py + h * 0.3, w * 0.5, h * 0.3);
        ctx.fillRect(px + w * 0.1, py + h * 0.45, w * 0.3, h * 0.15);
        ctx.beginPath(); ctx.arc(cx + w * 0.1, py + h * 0.15, w * 0.25, 0, PI2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w * 0.15, py + h * 0.05, w * 0.25, w * 0.15);
        break;
    }
  }

  // ── Rendu principal ──
  draw(ctx) {
    if (this.state === 'menu') return;

    const horizon = this.horizon;
    const bc = this.bufferCtx;

    // 1. Ciel dégradé
    const grad = bc.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, '#1a5aff');
    grad.addColorStop(0.6, '#5599ff');
    grad.addColorStop(1, '#aaddff');
    bc.fillStyle = grad;
    bc.fillRect(0, 0, this.renderW, horizon);

    // 2. Sol Mode 7
    this.drawMode7();
    bc.putImageData(this.imgData, 0, horizon);

    // 3. Sprites des karts (Z-sort)
    const player = this.karts[0];
    const camA = player.angle;
    const camX = player.x;
    const camZ = player.z;

    const sorted = [...this.karts].sort((a, b) => {
      const d1 = (a.x - camX) ** 2 + (a.z - camZ) ** 2;
      const d2 = (b.x - camX) ** 2 + (b.z - camZ) ** 2;
      return d2 - d1;
    });

    const sinCam = Math.sin(camA);
    const cosCam = Math.cos(camA);

    for (const k of sorted) {
      if (k.isPlayer) {
        const I = this.game.input;
        const steer = (I.isDown('left', 0) ? -1 : 0) + (I.isDown('right', 0) ? 1 : 0);
        this.drawKartSprite(bc, this.renderW / 2, this.renderH - 10, 48, k.skin.color, steer);
      } else {
        const dx = k.x - camX;
        const dz = k.z - camZ;

        // Rotation dans le repère caméra
        const rx = dx * cosCam - dz * sinCam;
        const rz = dx * sinCam + dz * cosCam;

        if (rz > 1.0) {
          const focalLength = 160;
          const scale = focalLength / rz;
          const screenX = (this.renderW / 2) + (rx * scale);
          const screenY = horizon + (6.0 * scale);

          if (screenX > -100 && screenX < this.renderW + 100 && screenY > horizon && screenY < this.renderH + 50) {
            const kartSize = Math.max(4, Math.min(60, 20 * scale));
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
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText('🏎️ PIXEL KART', 15, 35);

    const speed = Math.round(Math.abs(player.speed) * 4);
    ctx.fillText(speed + ' km/h', VIEW_W - 140, VIEW_H - 25);

    // Countdown
    if (this.countdown > 0) {
      ctx.font = 'bold 80px sans-serif';
      ctx.fillStyle = '#ff3333';
      ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(this.countdown), VIEW_W / 2, VIEW_H / 2);
      ctx.textAlign = 'left';
    }

    // Temps de course
    const mins = Math.floor(this.raceTime / 60);
    const secs = Math.floor(this.raceTime % 60);
    const ms = Math.floor((this.raceTime * 100) % 100);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ffdd44';
    ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`, VIEW_W / 2 - 50, 30);

    ctx.shadowColor = 'transparent';
  }

  dispose() {}
}
