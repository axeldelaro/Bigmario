// scene_mariokart.js — Mode Karting Rétro 2D (Mode 7) - Refonte Intégrale
import { VIEW_W, VIEW_H } from './core.js';
import { SKIN_LIST } from './art.js';

// --- Analyseur de Circuits ---
function M(name, str) {
  const lines = str.trim().split('\n').map(l => l.trim().replace(/ /g, ''));
  const h = lines.length, w = lines[0].length;
  const data = new Uint8Array(w * h);
  for(let y=0; y<h; y++) for(let x=0; x<w; x++) data[y*w+x] = parseInt(lines[y][x]);
  return { name, w, h, data };
}

// 0: Herbe, 1: Route, 2: Ligne d'arrivée
const TRACKS = [
  M('Circuit Basique (Ovale)', `
    0000000000000000
    0000111111110000
    0001100000011000
    0011000000001100
    0010000000000100
    0010000000000100
    0010000000000100
    0011000000001100
    0001100000021000
    0000111111110000
    0000000000000000
  `),
  M('Circuit Nuage (En 8)', `
    000000000000000000
    000111100000111100
    001100110001100110
    001000011011000010
    001000001110000010
    001100000100000110
    000110001110001100
    000011011011011000
    000001110001110000
    000002100000110000
    000000000000000000
  `),
  M('Labyrinthe Forestier', `
    000000000000000000
    001111111110011100
    001000000011110100
    001001111000000100
    001001001111111100
    001111000000000000
    000000001111111000
    000011111000001000
    000010000001111000
    000021111111000000
    000000000000000000
  `),
  M('Épingle Dangereuse', `
    0000000000000000
    0001111111111000
    0001000000001000
    0001001111001000
    0001001001001000
    0001001001001000
    0001001001001000
    0001001111001000
    0001000000001000
    0002111111111000
    0000000000000000
  `),
  M('Grand Carré', `
    00000000000000
    00111111111100
    00100000000100
    00100000000100
    00100000000100
    00100000000100
    00100000000100
    00100000000100
    00100000000100
    00211111111100
    00000000000000
  `),
  M('Double Boucle', `
    0000000000000000
    0011110000111100
    0110011001100110
    0100001111000010
    0110000110000110
    0011000110001100
    0001101111011000
    0000111001110000
    0000020000100000
    0000000000000000
  `),
  M('Circuit de la Plage', `
    00000000000000
    01111111111110
    01000000000010
    01011111111010
    01010000001010
    01010000001010
    01011111111010
    01000000000010
    02111111111110
    00000000000000
  `),
  M('Serpentin', `
    0000000000000
    0111100111100
    0100111100100
    0100000000100
    0100111100100
    0100100100100
    0111100111100
    0000000000200
    0000000000100
    0000000000000
  `),
  M('Ligne Droite de Vitesse', `
    000000000000
    000011110000
    000010010000
    000010010000
    000010010000
    000010010000
    000010010000
    000010010000
    000010010000
    000020010000
    000011110000
    000000000000
  `),
  M('Route Stellaire (Arc-en-Ciel)', `
    0000000000000000000
    0001111111111111000
    0001000000000001000
    0001001111111001000
    0001001000001001000
    0001001000001001000
    0001001111111001000
    0001000000000001000
    0002111111111111000
    0000000000000000000
  `)
];

const TILE_SIZE = 12; // Echelle du monde
// Formats de couleur en Little Endian (ABGR)
const C_GRASS1 = 0xFF2a7a2a, C_GRASS2 = 0xFF226622;
const C_ROAD1  = 0xFF777777, C_ROAD2  = 0xFF666666;
const C_LINE   = 0xFFdddddd;
const C_START1 = 0xFF2020d0, C_START2 = 0xFFaaaaaa; // Rouge et gris
const C_BORDER1= 0xFF4444ff, C_BORDER2= 0xFFeeeeee; // Vibreurs Rouge et Blanc

export class MarioKartScene {
  constructor(game) {
    this.game = game;
    this.state = 'menu';
    this.selectedTrack = 0;
    this.selectedSkin = 0;
    // Rendu en 320x240 pour look rétro 100% propre
    this.renderW = 320;
    this.renderH = 240;
    this.initMenu();
  }

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

  initRace() {
    this.track = TRACKS[this.selectedTrack];
    this.karts = [];
    
    // 1. Génération de la carte complète HD en mémoire (64x64 pixels par case)
    this.texW = this.track.w * 64;
    this.texH = this.track.h * 64;
    this.texData = new Uint32Array(this.texW * this.texH);
    for (let y = 0; y < this.track.h; y++) {
      for (let x = 0; x < this.track.w; x++) {
        const t = this.track.data[y * this.track.w + x];
        for (let py = 0; py < 64; py++) {
          for (let px = 0; px < 64; px++) {
            let col = C_GRASS1;
            const checker = ((px >> 3) + (py >> 3)) % 2 === 0; // Damier de 8 pixels
            
            if (t === 0) { // Herbe
              col = checker ? C_GRASS1 : C_GRASS2;
            } else if (t === 1) { // Route
              col = checker ? C_ROAD1 : C_ROAD2;
              // Bordure de piste
              if (px < 4 || px > 60 || py < 4 || py > 60) {
                 const borderCheck = ((px >> 2) + (py >> 2)) % 2 === 0;
                 col = borderCheck ? C_BORDER1 : C_BORDER2;
              }
              // Ligne médiane pointillée
              if (px > 30 && px < 34 && py > 16 && py < 48) col = C_LINE;
            } else if (t === 2) { // Ligne de départ
              col = checker ? C_START1 : C_START2;
            }
            this.texData[(y*64 + py) * this.texW + (x*64 + px)] = col;
          }
        }
      }
    }

    // 2. Trouver la position de départ (tuile '2')
    let startX = 2, startZ = 2;
    for (let i = 0; i < this.track.data.length; i++) {
      if (this.track.data[i] === 2) {
        startX = (i % this.track.w) * TILE_SIZE + TILE_SIZE/2;
        startZ = Math.floor(i / this.track.w) * TILE_SIZE + TILE_SIZE/2;
        break;
      }
    }

    // 3. Créer les coureurs
    for (let i = 0; i < 8; i++) {
      const isPlayer = i === 0;
      const skinIndex = isPlayer ? this.selectedSkin : (i % SKIN_LIST.length);
      const xOff = (i%2 === 0 ? -1.5 : 1.5);
      const zOff = Math.floor(i/2) * 2; // Placement sur la grille de départ
      
      this.karts.push({
        isPlayer,
        id: i,
        x: startX + xOff,
        z: startZ + zOff,
        angle: 0, // Regarde vers le sud (bas de la grille)
        speed: 0,
        skin: SKIN_LIST[skinIndex]
      });
    }

    // 4. Préparer le Framebuffer (Rendu logiciel)
    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = this.renderW = 384; 
    this.bufferCanvas.height = this.renderH = 216;
    this.bufferCtx = this.bufferCanvas.getContext('2d');
    this.horizon = 108;
    
    // On ne crée l'ImageData que pour la moitié basse de l'écran (le sol) pour optimiser et permettre le ciel en Canvas
    this.imgData = this.bufferCtx.createImageData(this.renderW, this.renderH - this.horizon);
    this.pixels = new Uint32Array(this.imgData.data.buffer);

    this.state = 'play';
  }

  getTile(worldX, worldZ) {
    const tx = Math.floor(worldX / TILE_SIZE);
    const tz = Math.floor(worldZ / TILE_SIZE);
    if (tx>=0 && tx<this.track.w && tz>=0 && tz<this.track.h) {
      return this.track.data[tz*this.track.w + tx];
    }
    return 0;
  }

  update(dt) {
    if (this.state !== 'play') return;
    const I = this.game.input;
    
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      let acc = 0, steer = 0, drift = false;
      
      if (k.isPlayer) {
        // ACCELERATION = SAUT. FREIN/DERAPAGE = TIR
        acc = I.isDown('jump', 0) ? 1 : 0;
        steer = (I.isDown('left', 0) ? 1 : 0) + (I.isDown('right', 0) ? -1 : 0);
        drift = I.isDown('fire', 0);
      } else {
        // IA ULTIME : Personnalités, Aspiration, Evitement, Rubberbanding, Drifting et Recovery
        acc = 0.9;
        
        // 1. Personnalités de base
        const baseSpeed = 29 + ((k.id * 17) % 6); // 29 à 34
        k.handling = k.handling || (1.0 + ((k.id * 13) % 5) * 0.1); 
        k.laneOffset = k.laneOffset || (((k.id * 37) % 11) / 10 - 0.5); 
        
        const lookDist = 16 + (k.speed * 0.2); // Le regard s'allonge avec la vitesse
        
        // 2. Senseurs de route (Gradient Descent)
        const L2_X = k.x + Math.cos(k.angle + 0.8) * lookDist;
        const L2_Z = k.z + Math.sin(k.angle + 0.8) * lookDist;
        const L1_X = k.x + Math.cos(k.angle + 0.4) * lookDist;
        const L1_Z = k.z + Math.sin(k.angle + 0.4) * lookDist;
        const C_X  = k.x + Math.cos(k.angle) * lookDist;
        const C_Z  = k.z + Math.sin(k.angle) * lookDist;
        const R1_X = k.x + Math.cos(k.angle - 0.4) * lookDist;
        const R1_Z = k.z + Math.sin(k.angle - 0.4) * lookDist;
        const R2_X = k.x + Math.cos(k.angle - 0.8) * lookDist;
        const R2_Z = k.z + Math.sin(k.angle - 0.8) * lookDist;

        let roadPull = 0;
        if (this.getTile(L2_X, L2_Z) > 0) roadPull += 1.0;
        if (this.getTile(L1_X, L1_Z) > 0) roadPull += 0.5;
        if (this.getTile(R1_X, R1_Z) > 0) roadPull -= 0.5;
        if (this.getTile(R2_X, R2_Z) > 0) roadPull -= 1.0;

        steer = (roadPull + k.laneOffset) * k.handling;

        // 3. Interactions Sociales Humaines (Jouer avec des "amis")
        let avoidSteer = 0;
        let draftBoost = 0;
        
        for (let j = 0; j < this.karts.length; j++) {
           if (i === j) continue;
           const other = this.karts[j];
           const dx = other.x - k.x;
           const dz = other.z - k.z;
           const distSq = dx*dx + dz*dz;
           
           if (distSq < 10000) { // Moins de 100 unités
              const angleToOther = Math.atan2(dz, dx);
              let diff = (angleToOther - k.angle) % (Math.PI*2);
              if (diff > Math.PI) diff -= Math.PI*2;
              if (diff < -Math.PI) diff += Math.PI*2;
              
              // Evitement d'Urgence (Si on risque de rentrer dans quelqu'un)
              if (distSq < 150 && Math.abs(diff) < Math.PI/2) {
                 avoidSteer += (diff > 0 ? -1.5 : 1.5) * (150 - distSq)/150;
              }
              
              // Aspiration (Drafting - Couloir de vitesse)
              if (distSq > 150 && distSq < 900 && Math.abs(diff) < 0.2) {
                 draftBoost += 3.0; // Vroum !
                 avoidSteer += diff * 0.8; // On s'aligne derrière lui
              }
           }
        }
        
        // 4. Rubberbanding (Garder la partie compétitive)
        const player = this.karts[0];
        const pdx = player.x - k.x;
        const pdz = player.z - k.z;
        const distToPlayerSq = pdx*pdx + pdz*pdz;
        let rubberBand = 0;
        
        // Le joueur va vers où ?
        const pVelX = Math.cos(player.angle);
        const pVelZ = Math.sin(player.angle);
        const dot = pdx * pVelX + pdz * pVelZ; 
        
        if (dot > 0 && distToPlayerSq > 40000) {
           rubberBand = 4.5; // L'IA est loin derrière, elle s'énerve !
        } else if (dot < 0 && distToPlayerSq > 60000) {
           rubberBand = -3.0; // L'IA est trop loin devant, elle fait des erreurs
        }
        
        // 5. Synthèse du Volant et Drifting
        steer += avoidSteer;
        drift = (Math.abs(steer) > 1.5 && k.speed > 25); // Dérapage contrôlé
        
        k.maxAiSpeed = baseSpeed + draftBoost + rubberBand;

        // 6. Urgence et Recovery (Si bloqué)
        const C_tile = this.getTile(C_X, C_Z);
        if (C_tile === 0) {
           steer = (roadPull >= 0 ? 3.0 : -3.0) * k.handling;
           acc = 0.5;
        }
        
        if (k.speed < 5 && C_tile === 0 && this.getTile(k.x, k.z) === 0) {
           k.stuckTime = (k.stuckTime || 0) + dt;
           if (k.stuckTime > 1.0) {
              acc = -1.0; // Marche arrière toute !
              steer = -steer; // Braquage inversé pour se dégager
           }
        } else {
           k.stuckTime = 0;
        }
      }
      
      // Physique Accélération
      if (acc > 0) k.speed += 25 * dt;
      else k.speed -= 15 * dt;
      
      // Physique Frottement Sol
      const tx = Math.floor(k.x / TILE_SIZE);
      const tz = Math.floor(k.z / TILE_SIZE);
      const tile = (tx>=0 && tx<this.track.w && tz>=0 && tz<this.track.h) ? this.track.data[tz*this.track.w + tx] : 0;
      if (tile === 0) k.speed *= 0.85; // Fort ralentissement sur l'herbe
      
      // Limite de vitesse (Permettre la marche arrière)
      const limit = k.isPlayer ? (drift ? 38 : 32) : k.maxAiSpeed;
      k.speed = Math.max(-15, Math.min(k.speed, limit));
      
      // Rotation
      const steerMod = drift ? 3.5 : 2.0;
      k.angle += steer * steerMod * dt * Math.max(0.3, Math.abs(k.speed)/32);
      
      // Déplacement (Vecteur avant)
      k.x += Math.cos(k.angle) * k.speed * dt;
      k.z += Math.sin(k.angle) * k.speed * dt;
    }
    
    // 7. Collisions Physiques entre les Karts (Auto-tamponneuses)
    for (let i = 0; i < this.karts.length; i++) {
       for (let j = i + 1; j < this.karts.length; j++) {
          const k1 = this.karts[i];
          const k2 = this.karts[j];
          const dx = k2.x - k1.x;
          const dz = k2.z - k1.z;
          const distSq = dx*dx + dz*dz;
          const radius = 6.0; 
          const minDist = radius * 2;
          
          if (distSq > 0 && distSq < minDist*minDist) {
             const dist = Math.sqrt(distSq);
             const push = (minDist - dist) / 2;
             const nx = dx / dist;
             const nz = dz / dist;
             
             // Repulsion physique
             k1.x -= nx * push;
             k1.z -= nz * push;
             k2.x += nx * push;
             k2.z += nz * push;
             
             // Perte de vitesse (frottement)
             k1.speed *= 0.98;
             k2.speed *= 0.98;
          }
       }
    }
  }

  // Ciel dynamique avec dégradé
  getSkyColor(y, h) {
    const ratio = y / h;
    const r = Math.floor(0x40 + ratio * (0x80 - 0x40));
    const g = Math.floor(0xb0 + ratio * (0xdb - 0xb0));
    const b = Math.floor(0xe0 + ratio * (0xff - 0xe0));
    return 0xFF000000 | (b << 16) | (g << 8) | r;
  }

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

    // Cache des couleurs ABGR
    const COL_GRASS1 = 0xFF28AA28, COL_GRASS2 = 0xFF229222;
    const COL_ASPHALT = 0xFF555555, COL_START = 0xFFEEEEEE;
    const COL_CURB_R = 0xFF0000FF, COL_CURB_W = 0xFFFFFFFF; // Vibreurs Rouge et Blanc

    let offset = 0;
    
    // On ne boucle que sur la moitié basse
    for (let y = 0; y < hHalf; y++) {
        // Distance de la ligne actuelle
        const rowDist = camHeight / (y + 1) * (H/2);
        
        // Rayon gauche de l'écran
        const rayX0 = Math.sin(camA) + Math.cos(camA) * fov;
        const rayZ0 = Math.cos(camA) - Math.sin(camA) * fov;
        // Rayon droit de l'écran
        const rayX1 = Math.sin(camA) - Math.cos(camA) * fov;
        const rayZ1 = Math.cos(camA) + Math.sin(camA) * fov;

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
          const tile = (tx>=0 && tx<trackW && tz>=0 && tz<trackH) ? data[tz*trackW + tx] : 0;
          
          let col = 0xFF000000;
          
          if (tile > 0) {
             // Graphismes de la route (Asphalte + Vibreurs)
             const lx = floorX - tx*T;
             const lz = floorZ - tz*T;
             const bw = 1.5; // Épaisseur du vibreur
             
             // Détecter si on est sur un bord adjacent à l'herbe
             let isBorder = false;
             if (lx < bw && (tx-1 < 0 || data[tz*trackW + tx-1] === 0)) isBorder = true;
             else if (lx > T-bw && (tx+1 >= trackW || data[tz*trackW + tx+1] === 0)) isBorder = true;
             else if (lz < bw && (tz-1 < 0 || data[(tz-1)*trackW + tx] === 0)) isBorder = true;
             else if (lz > T-bw && (tz+1 >= trackH || data[(tz+1)*trackW + tx] === 0)) isBorder = true;
             
             if (isBorder) {
                 const checker = Math.floor((floorX + floorZ) / 3) % 2;
                 col = checker === 0 ? COL_CURB_R : COL_CURB_W;
             } else if (tile === 2) {
                 const checker = Math.floor(floorX / 2) % 2;
                 col = checker === 0 ? COL_START : COL_ASPHALT;
             } else {
                 col = COL_ASPHALT;
             }
          } else {
             // Graphismes de l'herbe (Damier)
             const checker = (Math.floor(floorX/T) % 2) === (Math.floor(floorZ/T) % 2);
             col = checker ? COL_GRASS1 : COL_GRASS2;
          }
          
          // Ombrage au loin
          if (y < 20) {
              const fade = Math.max(0.3, y / 20);
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

  // Rendu d'un sprite de Kart directionnel (4 vues : Face, Dos, Gauche, Droite)
  drawKartSprite(ctx, cx, cy, width, skinHex, steer, diffAngle = 0) {
    const w = width;
    const h = width * 0.8;
    const px = cx - w/2;
    const py = cy - h;
    
    let diff = diffAngle % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    
    const pi4 = Math.PI / 4;
    let view = 'back';
    if (diff > 3*pi4 || diff < -3*pi4) view = 'front';
    else if (diff > pi4) view = 'left';
    else if (diff < -pi4) view = 'right';

    const headOff = steer * (w * 0.1);

    switch (view) {
      case 'back':
        ctx.fillStyle = '#111';
        ctx.fillRect(px - w*0.1, py + h*0.2, w*0.3, h*0.3); // Av gauche
        ctx.fillRect(px + w*0.8, py + h*0.2, w*0.3, h*0.3); // Av droite
        ctx.fillRect(px - w*0.15, py + h*0.7, w*0.3, h*0.4); // Arr gauche
        ctx.fillRect(px + w*0.85, py + h*0.7, w*0.3, h*0.4); // Arr droite
        ctx.fillStyle = '#999'; ctx.fillRect(px + w*0.1, py + h*0.3, w*0.8, h*0.6);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w*0.2, py + h*0.4, w*0.6, h*0.5);
        ctx.fillRect(px + w*0.3, py + h*0.2, w*0.4, h*0.2); // Capot
        ctx.fillStyle = skinHex;
        ctx.beginPath(); ctx.arc(cx + headOff, py + h*0.2, w*0.3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.fillRect(cx - w*0.15 + headOff, py + h*0.1, w*0.3, w*0.15);
        break;

      case 'front':
        ctx.fillStyle = '#111';
        ctx.fillRect(px - w*0.15, py + h*0.7, w*0.3, h*0.4); // Arr gauche
        ctx.fillRect(px + w*0.85, py + h*0.7, w*0.3, h*0.4); // Arr droite
        ctx.fillRect(px - w*0.1, py + h*0.2, w*0.3, h*0.3); // Av gauche
        ctx.fillRect(px + w*0.8, py + h*0.2, w*0.3, h*0.3); // Av droite
        ctx.fillStyle = '#999'; ctx.fillRect(px + w*0.1, py + h*0.3, w*0.8, h*0.6);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w*0.2, py + h*0.1, w*0.6, h*0.6);
        ctx.fillRect(px + w*0.3, py + h*0.6, w*0.4, h*0.3); // Pare-choc
        ctx.fillStyle = skinHex;
        ctx.beginPath(); ctx.arc(cx - headOff, py + h*0.2, w*0.3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffccaa'; 
        ctx.fillRect(cx - w*0.2 - headOff, py + h*0.05, w*0.4, w*0.25);
        ctx.fillStyle = 'black';
        ctx.fillRect(cx - w*0.1 - headOff, py + h*0.1, w*0.05, w*0.05); // Oeil G
        ctx.fillRect(cx + w*0.05 - headOff, py + h*0.1, w*0.05, w*0.05); // Oeil D
        break;

      case 'right': // Nez à droite
        ctx.fillStyle = '#111';
        ctx.fillRect(px + w*0.1, py + h*0.6, w*0.3, h*0.4); // Arr
        ctx.fillRect(px + w*0.6, py + h*0.6, w*0.3, h*0.4); // Av
        ctx.fillStyle = '#999'; ctx.fillRect(px + w*0.1, py + h*0.4, w*0.8, h*0.4);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w*0.1, py + h*0.3, w*0.5, h*0.3); // Cockpit
        ctx.fillRect(px + w*0.6, py + h*0.45, w*0.3, h*0.15); // Nez
        ctx.fillStyle = skinHex;
        ctx.beginPath(); ctx.arc(cx - w*0.1, py + h*0.15, w*0.25, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffccaa'; 
        ctx.fillRect(cx - w*0.1, py + h*0.05, w*0.25, w*0.15);
        break;

      case 'left': // Nez à gauche
        ctx.fillStyle = '#111';
        ctx.fillRect(px + w*0.6, py + h*0.6, w*0.3, h*0.4); // Arr
        ctx.fillRect(px + w*0.1, py + h*0.6, w*0.3, h*0.4); // Av
        ctx.fillStyle = '#999'; ctx.fillRect(px + w*0.1, py + h*0.4, w*0.8, h*0.4);
        ctx.fillStyle = skinHex;
        ctx.fillRect(px + w*0.4, py + h*0.3, w*0.5, h*0.3); // Cockpit
        ctx.fillRect(px + w*0.1, py + h*0.45, w*0.3, h*0.15); // Nez
        ctx.fillStyle = skinHex;
        ctx.beginPath(); ctx.arc(cx + w*0.1, py + h*0.15, w*0.25, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffccaa'; 
        ctx.fillRect(cx - w*0.15, py + h*0.05, w*0.25, w*0.15);
        break;
    }
  }

  draw(ctx) {
    if (this.state === 'menu') return;
    
    const horizon = this.horizon;

    // 1. Ciel avec dégradé et lueur
    const grad = this.bufferCtx.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, '#369bff'); // Bleu intense en haut
    grad.addColorStop(1, '#a6d9ff'); // Bleu clair vers l'horizon
    this.bufferCtx.fillStyle = grad;
    this.bufferCtx.fillRect(0, 0, this.renderW, horizon);
    
    // 2. Dessiner le sol projeté dans le ImageData (moitié basse)
    this.drawMode7();
    this.bufferCtx.putImageData(this.imgData, 0, horizon);
    
    // 3. Dessin des IAs et du Joueur par-dessus
    const player = this.karts[0];
    const camA = player.angle;
    const camX = player.x;
    const camZ = player.z;
    
    // Tri des entités : du plus loin au plus proche (Z-Sort)
    const sorted = [...this.karts].sort((a,b) => {
      const d1 = Math.pow(a.x-camX,2) + Math.pow(a.z-camZ,2);
      const d2 = Math.pow(b.x-camX,2) + Math.pow(b.z-camZ,2);
      return d2 - d1; 
    });

    for (const k of sorted) {
      if (k.isPlayer) {
        // Le joueur est fixé en bas de l'écran (vu de dos)
        const I = this.game.input;
        const steer = (I.isDown('left', 0) ? -1 : 0) + (I.isDown('right', 0) ? 1 : 0);
        this.drawKartSprite(this.bufferCtx, this.renderW / 2, this.renderH - 10, 48, k.skin.color, steer);
      } else {
        // Projection mathématique parfaite des adversaires
        const dx = k.x - camX;
        const dz = k.z - camZ;
        
        // Rotation mathématique correcte par rapport à la caméra
        const rx = -dx * Math.cos(camA) + dz * Math.sin(camA);
        const rz = dz * Math.cos(camA) + dx * Math.sin(camA);
        
        if (rz > 0.5) { // Devant la caméra uniquement
          const focalLength = 160; 
          const scale = focalLength / rz; // Plus c'est loin, plus l'échelle diminue
          const screenX = (this.renderW / 2) + (rx * scale);
          const screenY = horizon + (6.0 * scale); // 6.0 = camHeight
          
          // Vérifier si à l'écran
          if (screenX > -100 && screenX < this.renderW+100 && screenY > horizon) {
             const kartSize = Math.max(4, Math.min(60, 20 * scale));
             const diffAngle = k.angle - camA;
             // SteerIA ne s'applique qu'en vue arrière/avant pour faire tourner la tête
             const steerIA = (Math.sin(k.id*10 + Date.now()/200) > 0) ? 0.5 : -0.5;
             this.drawKartSprite(this.bufferCtx, screenX, screenY, kartSize, k.skin.color, steerIA, diffAngle);
          }
        }
      }
    }

    // 3. Dessiner le Buffer sur l'écran final
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bufferCanvas, 0, 0, VIEW_W, VIEW_H);

    // 4. HUD Superposé
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillText('🏎️ PIXEL KART 2D', 15, 35);
    const speed = Math.round(player.speed * 4); // km/h affichés
    ctx.fillText(speed + ' km/h', VIEW_W - 120, VIEW_H - 25);
    ctx.shadowColor = 'transparent'; 
  }

  dispose() {}
}
