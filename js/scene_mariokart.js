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
    this.bufferCanvas.width = this.renderW;
    this.bufferCanvas.height = this.renderH;
    this.bufferCtx = this.bufferCanvas.getContext('2d');
    this.imgData = this.bufferCtx.createImageData(this.renderW, this.renderH);
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
        steer = (I.isDown('left', 0) ? -1 : 0) + (I.isDown('right', 0) ? 1 : 0);
        drift = I.isDown('fire', 0);
      } else {
        // IA : Intelligence par antennes (feelers)
        acc = 0.85 + Math.random()*0.15;
        const lookDist = 14;
        const L_X = k.x + Math.sin(k.angle - 0.6) * lookDist;
        const L_Z = k.z + Math.cos(k.angle - 0.6) * lookDist;
        const R_X = k.x + Math.sin(k.angle + 0.6) * lookDist;
        const R_Z = k.z + Math.cos(k.angle + 0.6) * lookDist;
        const F_X = k.x + Math.sin(k.angle) * lookDist;
        const F_Z = k.z + Math.cos(k.angle) * lookDist;
        
        const tileL = this.getTile(L_X, L_Z);
        const tileR = this.getTile(R_X, R_Z);
        const tileF = this.getTile(F_X, F_Z);
        
        if (tileF === 0) { // Mur d'herbe en face
          if (tileL > 0) steer = -1.5; // Tourne gauche toute !
          else if (tileR > 0) steer = 1.5; // Tourne droite toute !
          else steer = 1.8; // Demi-tour d'urgence
        } else {
          // Sur la route, on se centre
          if (tileL === 0 && tileR > 0) steer = 1.0;
          else if (tileR === 0 && tileL > 0) steer = -1.0;
          else steer = Math.sin(Date.now()/250 + i * 45) * 0.15; // Léger wobble naturel
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
      
      // Limite de vitesse
      k.speed = Math.max(0, Math.min(k.speed, drift ? 38 : 32));
      
      // Rotation (permettre de tourner même à très basse vitesse)
      const steerMod = drift ? 3.5 : 2.0;
      k.angle += steer * steerMod * dt * Math.max(0.3, k.speed/32);
      
      // Déplacement (Vecteur avant)
      k.x += Math.sin(k.angle) * k.speed * dt;
      k.z += Math.cos(k.angle) * k.speed * dt;
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
    const W = this.renderW;
    const H = this.renderH;
    const player = this.karts[0];
    
    const camX = player.x;
    const camZ = player.z;
    const camA = player.angle; 
    
    const fov = 1.0; 
    const camHeight = 6.0; 
    const horizon = Math.floor(H * 0.45); 
    
    let offset = 0;
    const isSpace = this.selectedTrack === 9;

    for (let y = 0; y < H; y++) {
      if (y < horizon) {
        // Ciel
        const skyCol = isSpace ? 0xFF221111 : this.getSkyColor(y, horizon);
        this.pixels.fill(skyCol, offset, offset + W);
        offset += W;
      } else {
        // Pseudo-3D (Mode 7) - Projection du sol
        const rowDist = camHeight / (y - horizon + 1) * (H/2);
        
        // Rayon gauche de l'écran
        const rayX0 = Math.sin(camA) - Math.cos(camA) * fov;
        const rayZ0 = Math.cos(camA) + Math.sin(camA) * fov;
        // Rayon droit de l'écran
        const rayX1 = Math.sin(camA) + Math.cos(camA) * fov;
        const rayZ1 = Math.cos(camA) - Math.sin(camA) * fov;

        const floorX0 = camX + rowDist * rayX0;
        const floorZ0 = camZ + rowDist * rayZ0;
        const floorX1 = camX + rowDist * rayX1;
        const floorZ1 = camZ + rowDist * rayZ1;
        
        const stepX = (floorX1 - floorX0) / W;
        const stepZ = (floorZ1 - floorZ0) / W;

        let fx = floorX0;
        let fz = floorZ0;

        for (let x = 0; x < W; x++) {
          const tx = Math.floor((fx * 64) / TILE_SIZE);
          const tz = Math.floor((fz * 64) / TILE_SIZE);
          
          let col;
          if (tx >= 0 && tx < this.texW && tz >= 0 && tz < this.texH) {
             col = this.texData[tz * this.texW + tx];
          } else {
             // Hors de la grille = Damier infini (Herbe ou Espace)
             if (isSpace) col = 0xFF000000;
             else col = ((tx >> 5) + (tz >> 5)) % 2 === 0 ? C_GRASS1 : C_GRASS2;
          }
          
          // Ombres d'horizon (Fog)
          if (y < horizon + 15 && !isSpace) {
             const fade = (y - horizon) / 15;
             const r = ((col & 0xFF) * fade) | 0;
             const g = (((col >> 8) & 0xFF) * fade) | 0;
             const b = (((col >> 16) & 0xFF) * fade) | 0;
             col = 0xFF000000 | (b << 16) | (g << 8) | r;
          }

          this.pixels[offset++] = col;
          fx += stepX;
          fz += stepZ;
        }
      }
    }
  }

  // Rendu d'un sprite de Kart très net
  drawKartSprite(ctx, cx, cy, width, skinHex, steer) {
    const w = width;
    const h = width * 0.8;
    const px = cx - w/2;
    const py = cy - h;
    
    // Roues (Noir)
    ctx.fillStyle = '#111';
    ctx.fillRect(px - w*0.1, py + h*0.2, w*0.3, h*0.3); // Avant gauche
    ctx.fillRect(px + w*0.8, py + h*0.2, w*0.3, h*0.3); // Avant droite
    ctx.fillRect(px - w*0.15, py + h*0.7, w*0.3, h*0.4); // Arrière gauche
    ctx.fillRect(px + w*0.85, py + h*0.7, w*0.3, h*0.4); // Arrière droite

    // Châssis (Gris)
    ctx.fillStyle = '#999';
    ctx.fillRect(px + w*0.1, py + h*0.3, w*0.8, h*0.6);

    // Carrosserie (Couleur du joueur)
    ctx.fillStyle = skinHex;
    ctx.fillRect(px + w*0.2, py + h*0.4, w*0.6, h*0.5);
    ctx.fillRect(px + w*0.3, py + h*0.2, w*0.4, h*0.2); // Capot avant

    // Personnage (Tête)
    const headOff = steer * (w * 0.1);
    ctx.beginPath();
    ctx.arc(cx + headOff, py + h*0.2, w*0.3, 0, Math.PI*2);
    ctx.fill();
    
    // Visière / Peau
    ctx.fillStyle = '#ffccaa'; 
    ctx.fillRect(cx - w*0.15 + headOff, py + h*0.1, w*0.3, w*0.15);
  }

  draw(ctx) {
    if (this.state === 'menu') return;
    
    // 1. Dessiner le sol projeté dans le ImageData
    this.drawMode7();
    this.bufferCtx.putImageData(this.imgData, 0, 0);
    
    // 2. Dessin des IAs et du Joueur par-dessus
    const player = this.karts[0];
    const camA = player.angle;
    const camX = player.x;
    const camZ = player.z;
    const horizon = this.renderH * 0.45;
    
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
        
        // Rotation par rapport à la caméra
        const rx = dx * Math.cos(-camA) - dz * Math.sin(-camA);
        const rz = dx * Math.sin(-camA) + dz * Math.cos(-camA);
        
        if (rz > 0.5) { // Devant la caméra uniquement
          const focalLength = 160; 
          const scale = focalLength / rz; // Plus c'est loin, plus l'échelle diminue
          const screenX = (this.renderW / 2) + (rx * scale);
          const screenY = horizon + (6.0 * scale); // 6.0 = camHeight
          
          // Vérifier si à l'écran
          if (screenX > -100 && screenX < this.renderW+100 && screenY > horizon) {
             const kartSize = Math.max(4, Math.min(60, 20 * scale));
             const diffAngle = k.angle - camA;
             const steerIA = Math.sin(diffAngle) * 1.5; // La tête se tourne fortement dans la direction du mouvement
             this.drawKartSprite(this.bufferCtx, screenX, screenY, kartSize, k.skin.color, steerIA);
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
