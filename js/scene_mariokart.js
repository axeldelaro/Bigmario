// scene_mariokart.js — Mini-jeu de karting en Mode 7 (Pseudo-3D 100% 2D)
import { VIEW_W, VIEW_H } from './core.js';
import { SKIN_LIST } from './art.js';

// --- 10 Circuits Procéduraux (Grilles de piste) ---
// 1 = Route, 0 = Herbe/Hors-piste, 2 = Ligne d'arrivée
const TRACKS = [
  { name: 'Circuit Basique', w: 10, h: 10, data: [
    1,1,1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,0,1,
    1,0,1,1,1,1,1,1,0,1,
    1,0,1,0,0,0,0,1,0,1,
    1,0,1,0,1,1,0,1,0,1,
    1,0,1,0,1,1,0,1,0,1,
    1,0,1,0,0,0,0,1,0,1,
    1,0,1,1,1,1,1,1,0,1,
    2,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,
  ]},
  { name: 'Le Grand 8', w: 12, h: 12, data: [
    0,0,1,1,1,1,1,1,1,1,0,0,
    0,1,1,0,0,0,0,0,0,1,1,0,
    1,1,0,0,1,1,1,1,0,0,1,1,
    1,0,0,1,1,0,0,1,1,0,0,1,
    1,0,1,1,0,0,0,0,1,1,0,1,
    1,0,1,0,0,1,1,0,0,1,0,1,
    1,0,1,0,0,1,1,0,0,1,0,1,
    1,0,1,1,0,0,0,0,1,1,0,1,
    1,0,0,1,1,0,0,1,1,0,0,1,
    1,1,0,0,1,1,1,1,0,0,1,1,
    0,1,1,0,0,0,0,0,0,1,1,0,
    0,0,2,1,1,1,1,1,1,1,0,0,
  ]},
  { name: 'Labyrinthe Vert', w: 10, h: 10, data: [
    1,1,1,1,1,0,1,1,1,1,
    1,0,0,0,1,0,1,0,0,1,
    1,0,1,1,1,0,1,1,0,1,
    1,0,1,0,0,0,0,1,0,1,
    1,0,1,1,1,1,1,1,0,1,
    1,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,
    0,0,0,0,0,0,1,0,0,0,
    1,1,1,1,1,1,1,1,1,1,
    2,0,0,0,0,0,0,0,0,1,
  ]},
  { name: 'Ligne Droite Infernale', w: 6, h: 15, data: Array(90).fill(1).map((_,i) => (i%6===0||i%6===5) && i>10 ? 0 : (i===3?2:1)) },
  { name: 'Piste des Glaces', w: 8, h: 8, data: Array(64).fill(1).map((_,i)=>i===56?2:(Math.random()>0.7?0:1)) },
  { name: 'Zig-Zag', w: 8, h: 12, data: [
    1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,1,
    1,0,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,
    1,1,1,1,1,1,1,1,
    0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,
    1,1,1,1,1,1,1,1,
    0,0,0,0,0,0,0,1,
    2,1,1,1,1,1,1,1,
    1,1,1,1,1,1,1,1,
  ]},
  { name: 'Ovale Rapide', w: 8, h: 8, data: [
    0,1,1,1,1,1,1,0,
    1,1,0,0,0,0,1,1,
    1,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,1,
    1,0,0,0,0,0,0,1,
    1,1,0,0,0,0,1,1,
    0,1,1,2,1,1,1,0,
  ]},
  { name: 'Carré Magique', w: 7, h: 7, data: [1,1,1,1,1,1,1, 1,0,0,0,0,0,1, 1,0,1,1,1,0,1, 1,0,1,0,1,0,1, 1,0,1,1,1,0,1, 1,0,0,0,0,0,1, 1,1,1,2,1,1,1] },
  { name: 'Spirale', w: 9, h: 9, data: [
    1,1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,1,
    1,0,1,1,1,1,1,0,1,
    1,0,1,0,0,0,1,0,1,
    1,0,1,0,1,0,1,0,1,
    1,0,1,0,1,1,1,0,1,
    1,0,1,0,0,0,0,0,1,
    1,0,1,1,1,1,1,1,1,
    2,0,0,0,0,0,0,0,0,
  ]},
  { name: 'Route Arc-en-Ciel', w: 10, h: 10, data: Array(100).fill(1).map((_,i) => i===90?2:(Math.random()>0.4?1:0)) },
];

const TILE_SIZE = 10;
// Little Endian ABGR format colors for ImageData
const COL_GRASS = 0xFF3a8b3a;
const COL_ROAD  = 0xFF777777;
const COL_LINE  = 0xFFffffff;
const COL_START = 0xFF2020d0; // d02020 -> 0xFF2020D0
const COL_SKY   = 0xFFffc846; // 46c8ff -> 0xFFFFC846 (ciel de base)
const COL_SPACE = 0xFF221111; // ciel nuit pour arc-en-ciel

export class MarioKartScene {
  constructor(game) {
    this.game = game;
    this.state = 'menu';
    this.selectedTrack = 0;
    this.selectedSkin = 0;
    // Rendu en demi-résolution pour garantir les 60 FPS sur ImageData (pixels doublés)
    this.renderW = Math.floor(VIEW_W / 2);
    this.renderH = Math.floor(VIEW_H / 2);
    this.initMenu();
  }

  initMenu() {
    let html = `<div class="title" style="margin-bottom:10px;"><span class="big" style="color:#d02020; font-size:40px; text-shadow: 2px 2px #fff;">KARTING 2D</span></div>`;
    html += `<div style="display:flex; justify-content:space-around; width:100%;">
      <div style="flex:1;">
        <h3>Personnage</h3>
        <select id="mk-skin" style="font-size:20px; padding:5px;">
          ${SKIN_LIST.map((s,i)=>`<option value="${i}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;">
        <h3>Circuit (10 dispo)</h3>
        <select id="mk-track" style="font-size:20px; padding:5px;">
          ${TRACKS.map((t,i)=>`<option value="${i}">${i+1}. ${t.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="margin-top:30px;">
      <button class="btn" id="mk-start" style="font-size:24px; background:#d02020;">🏁 DÉMARRER LA COURSE</button>
      <button class="btn secondary" id="mk-back">Retour</button>
    </div>
    <p class="hint" style="margin-top:20px;"><b>Contrôles</b>: A (Saut) pour Accélérer, Gauche/Droite pour Tourner.<br>Maintenir B (Feu) pour Déraper !</p>`;
    const p = this.game.panel(html);
    p.querySelector('#mk-start').onclick = () => {
      this.selectedSkin = parseInt(p.querySelector('#mk-skin').value);
      this.selectedTrack = parseInt(p.querySelector('#mk-track').value);
      this.game.clearUI();
      this.initRace();
    };
    p.querySelector('#mk-back').onclick = () => this.game.showMainMenu();
  }

  initRace() {
    this.track = TRACKS[this.selectedTrack];
    this.karts = [];
    
    // Convertir la texture en grille 2D
    this.texW = this.track.w * 64;
    this.texH = this.track.h * 64;
    this.texData = new Uint32Array(this.texW * this.texH);
    for (let y = 0; y < this.track.h; y++) {
      for (let x = 0; x < this.track.w; x++) {
        const t = this.track.data[y * this.track.w + x];
        const baseCol = t === 0 ? COL_GRASS : t === 1 ? COL_ROAD : COL_START;
        for (let py = 0; py < 64; py++) {
          for (let px = 0; px < 64; px++) {
            let col = baseCol;
            // Pointillés blancs sur la route au milieu de la tuile
            if (t === 1 && px > 30 && px < 34 && py > 30 && py < 34) col = COL_LINE;
            this.texData[(y*64 + py) * this.texW + (x*64 + px)] = col;
          }
        }
      }
    }

    let startX = 2, startY = 2;
    for (let i = 0; i < this.track.data.length; i++) {
      if (this.track.data[i] === 2) {
        startX = (i % this.track.w) * TILE_SIZE + TILE_SIZE/2;
        startY = Math.floor(i / this.track.w) * TILE_SIZE + TILE_SIZE/2;
        break;
      }
    }

    for (let i = 0; i < 8; i++) {
      const isPlayer = i === 0;
      const skinIndex = isPlayer ? this.selectedSkin : (i % SKIN_LIST.length);
      const xOff = (i%2 === 0 ? -1.5 : 1.5);
      const zOff = Math.floor(i/2) * 3;
      
      this.karts.push({
        isPlayer,
        x: startX + xOff,
        z: startY + zOff,
        angle: 0,
        speed: 0,
        skin: SKIN_LIST[skinIndex]
      });
    }

    // Préparation du rendu ImageData pour le Mode 7
    this.bufferCanvas = document.createElement('canvas');
    this.bufferCanvas.width = this.renderW;
    this.bufferCanvas.height = this.renderH;
    this.bufferCtx = this.bufferCanvas.getContext('2d');
    this.imgData = this.bufferCtx.createImageData(this.renderW, this.renderH);
    this.pixels = new Uint32Array(this.imgData.data.buffer);

    this.state = 'play';
  }

  update(dt) {
    if (this.state !== 'play') return;
    const inputs = this.game.input.get();
    
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      let acc = 0, steer = 0, drift = false;
      
      if (k.isPlayer) {
        acc = inputs.jump ? 1 : 0;
        steer = (inputs.left ? 1 : 0) + (inputs.right ? -1 : 0);
        drift = inputs.fire;
      } else {
        acc = 0.8 + Math.random()*0.2;
        const lookX = k.x + Math.sin(k.angle) * 4;
        const lookZ = k.z + Math.cos(k.angle) * 4;
        const tx = Math.floor(lookX / TILE_SIZE);
        const ty = Math.floor(lookZ / TILE_SIZE);
        const tile = (tx>=0 && tx<this.track.w && ty>=0 && ty<this.track.h) ? this.track.data[ty*this.track.w + tx] : 0;
        
        if (tile === 0) {
          steer = Math.sin(Date.now()/500 + i) > 0 ? 1 : -1; 
        } else {
          steer = Math.sin(Date.now()/300 + i * 45) * 0.3;
        }
      }
      
      if (acc > 0) k.speed += 20 * dt;
      else k.speed -= 10 * dt;
      
      const tx = Math.floor(k.x / TILE_SIZE);
      const ty = Math.floor(k.z / TILE_SIZE);
      const tile = (tx>=0 && tx<this.track.w && ty>=0 && ty<this.track.h) ? this.track.data[ty*this.track.w + tx] : 0;
      if (tile === 0) k.speed *= 0.8;
      
      k.speed = Math.max(0, Math.min(k.speed, drift ? 35 : 30));
      
      const steerMod = drift ? 3.5 : 2.5;
      k.angle += steer * steerMod * dt * (k.speed/30);
      
      k.x += Math.sin(k.angle) * k.speed * dt;
      k.z += Math.cos(k.angle) * k.speed * dt;
    }
  }

  drawMode7() {
    const W = this.renderW;
    const H = this.renderH;
    const player = this.karts[0];
    
    // Paramètres caméra Mode 7
    const camX = player.x;
    const camZ = player.z;
    const camA = player.angle; // L'angle du joueur
    
    const fov = 1.0; 
    const camHeight = 4.0; // Hauteur de la caméra au-dessus du sol
    const horizon = Math.floor(H / 2); // Milieu de l'écran
    
    const skyCol = this.selectedTrack === 9 ? COL_SPACE : COL_SKY;

    for (let y = 0; y < H; y++) {
      if (y < horizon) {
        // Ciel
        this.pixels.fill(skyCol, y * W, (y + 1) * W);
      } else {
        // Sol (Mode 7 Raycasting horizontal)
        const rowDist = camHeight / (y - horizon + 1) * (H/2);
        
        // Rayon gauche extrême
        const rayDirX0 = Math.sin(camA) - Math.cos(camA) * fov;
        const rayDirZ0 = Math.cos(camA) + Math.sin(camA) * fov;
        // Rayon droit extrême
        const rayDirX1 = Math.sin(camA) + Math.cos(camA) * fov;
        const rayDirZ1 = Math.cos(camA) - Math.sin(camA) * fov;

        const floorX0 = camX + rowDist * rayDirX0;
        const floorZ0 = camZ + rowDist * rayDirZ0;
        const floorX1 = camX + rowDist * rayDirX1;
        const floorZ1 = camZ + rowDist * rayDirZ1;
        
        const floorStepX = (floorX1 - floorX0) / W;
        const floorStepZ = (floorZ1 - floorZ0) / W;

        let fx = floorX0;
        let fz = floorZ0;

        let offset = y * W;
        for (let x = 0; x < W; x++) {
          // Échantillonnage de la carte
          // Mapping world coordinate to Texture coordinate (x * 64 / TILE_SIZE)
          const tx = Math.floor((fx * 64) / TILE_SIZE);
          const tz = Math.floor((fz * 64) / TILE_SIZE);
          
          let col = COL_GRASS;
          if (tx >= 0 && tx < this.texW && tz >= 0 && tz < this.texH) {
             col = this.texData[tz * this.texW + tx];
          }
          // Assombrissement progressif (brouillard) au loin
          if (y < horizon + 10) {
            // Effet d'ombre basique (bitshift pour réduire RGB)
            col = (col & 0xFEFEFE) >> 1;
          }

          this.pixels[offset++] = col;
          fx += floorStepX;
          fz += floorStepZ;
        }
      }
    }
  }

  draw(ctx) {
    if (this.state === 'menu') return;
    
    // Remplir ImageData (Sol Mode 7)
    this.drawMode7();
    this.bufferCtx.putImageData(this.imgData, 0, 0);
    
    // Agrandir au format de l'écran (pixels bruts sans lissage)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bufferCanvas, 0, 0, VIEW_W, VIEW_H);

    // Dessin des Sprites par-dessus
    const player = this.karts[0];
    const camA = player.angle;
    
    // Trier les karts par distance
    const sorted = [...this.karts].sort((a,b) => {
      const d1 = Math.pow(a.x-player.x,2) + Math.pow(a.z-player.z,2);
      const d2 = Math.pow(b.x-player.x,2) + Math.pow(b.z-player.z,2);
      return d2 - d1; // Plus loin d'abord
    });

    for (const k of sorted) {
      if (k.isPlayer) {
        // Le joueur est toujours affiché en bas au centre
        ctx.fillStyle = k.skin.color;
        ctx.fillRect(VIEW_W/2 - 20, VIEW_H - 40, 40, 40);
        // Pare-brise / Détail
        ctx.fillStyle = '#fff';
        ctx.fillRect(VIEW_W/2 - 10, VIEW_H - 35, 20, 10);
      } else {
        // Projection simple
        const dx = k.x - player.x;
        const dz = k.z - player.z;
        
        // Rotation pour faire face à la caméra
        const rx = dx * Math.cos(-camA) - dz * Math.sin(-camA);
        const rz = dx * Math.sin(-camA) + dz * Math.cos(-camA);
        
        if (rz > 1) { // Devant la caméra
          const scale = 200 / rz;
          const sx = (VIEW_W / 2) + (rx * scale);
          const sy = (VIEW_H / 2) + (4 * scale); // 4 = camHeight approximatif
          
          const sW = 3 * scale;
          const sH = 3 * scale;
          
          if (sx > -sW && sx < VIEW_W+sW && sy > -sH && sy < VIEW_H+sH) {
            ctx.fillStyle = k.skin.color;
            ctx.fillRect(sx - sW/2, sy - sH, sW, sH);
          }
        }
      }
    }
    
    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText('🏎️ PIXEL KART 2D', 10, 30);
    const speed = Math.round(player.speed * 5);
    ctx.fillText(speed + ' km/h', VIEW_W - 100, VIEW_H - 20);
  }

  dispose() {}
}
