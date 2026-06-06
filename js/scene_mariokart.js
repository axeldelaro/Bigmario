// scene_mariokart.js — Mini-jeu de karting en Mode 7 (Pseudo-3D 100% 2D)
import { VIEW_W, VIEW_H } from './core.js';
import { SKIN_LIST } from './art.js';

// --- 10 Circuits Procéduraux ---
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

const TILE_SIZE = 12; // Plus grand pour plus de détails
// Format ABGR pour ImageData
const COL_GRASS1 = 0xFF2a7a2a;
const COL_GRASS2 = 0xFF226622;
const COL_ROAD1  = 0xFF777777;
const COL_ROAD2  = 0xFF666666;
const COL_LINE   = 0xFFdddddd;
const COL_START1 = 0xFF2020d0; 
const COL_START2 = 0xFFaaaaaa;
const COL_BORDER1= 0xFF4444ff; // Bordure rouge et blanc (ABGR = rouge)
const COL_BORDER2= 0xFFeeeeee; 

export class MarioKartScene {
  constructor(game) {
    this.game = game;
    this.state = 'menu';
    this.selectedTrack = 0;
    this.selectedSkin = 0;
    // Rendu en 320x240 pour l'esthétique Mode 7 SNES/GBA
    this.renderW = 320;
    this.renderH = 240;
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
    
    // Génération de la texture 2D HD (64x64 par case)
    this.texW = this.track.w * 64;
    this.texH = this.track.h * 64;
    this.texData = new Uint32Array(this.texW * this.texH);
    for (let y = 0; y < this.track.h; y++) {
      for (let x = 0; x < this.track.w; x++) {
        const t = this.track.data[y * this.track.w + x];
        for (let py = 0; py < 64; py++) {
          for (let px = 0; px < 64; px++) {
            let col = COL_GRASS1;
            const checker = ((px >> 3) + (py >> 3)) % 2 === 0; // Damier 8x8
            
            if (t === 0) { // Herbe
              col = checker ? COL_GRASS1 : COL_GRASS2;
            } else if (t === 1) { // Route
              // Damier de route très subtil
              col = checker ? COL_ROAD1 : COL_ROAD2;
              // Bordure de piste (Vibreur rouge/blanc)
              if (px < 4 || px > 60 || py < 4 || py > 60) {
                 const borderCheck = ((px >> 2) + (py >> 2)) % 2 === 0;
                 col = borderCheck ? COL_BORDER1 : COL_BORDER2;
              }
              // Ligne pointillée
              if (px > 30 && px < 34 && py > 16 && py < 48) col = COL_LINE;
            } else if (t === 2) { // Départ
              col = checker ? COL_START1 : COL_START2;
            }
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
        id: i,
        x: startX + xOff,
        z: startY + zOff,
        angle: 0,
        speed: 0,
        skin: SKIN_LIST[skinIndex]
      });
    }

    // Préparation Canvas interne pour le Mode 7
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
    const I = this.game.input;
    
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      let acc = 0, steer = 0, drift = false;
      
      if (k.isPlayer) {
        acc = I.isDown('jump', 0) ? 1 : 0;
        steer = (I.isDown('left', 0) ? 1 : 0) + (I.isDown('right', 0) ? -1 : 0);
        drift = I.isDown('fire', 0);
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

  // Interpolation de dégradé ciel (ABGR)
  getSkyColor(y, h) {
    // Bleu clair en haut (0xFFe0b040) à bleu ciel à l'horizon (0xFFffdb80)
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
    const horizon = Math.floor(H * 0.45); // Un peu au dessus du centre
    
    // Rendu ligne par ligne
    let offset = 0;
    for (let y = 0; y < H; y++) {
      if (y < horizon) {
        // Ciel dégradé
        const skyCol = this.selectedTrack === 9 ? 0xFF221111 : this.getSkyColor(y, horizon);
        this.pixels.fill(skyCol, offset, offset + W);
        offset += W;
      } else {
        // Pseudo-3D
        const rowDist = camHeight / (y - horizon + 1) * (H/2);
        
        const rayX0 = Math.sin(camA) - Math.cos(camA) * fov;
        const rayZ0 = Math.cos(camA) + Math.sin(camA) * fov;
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
             // Herbe infinie en damier
             col = ((tx >> 5) + (tz >> 5)) % 2 === 0 ? COL_GRASS1 : COL_GRASS2;
          }
          
          // Ombre de brouillard lointain
          if (y < horizon + 15) {
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

  // Fonction pour dessiner un kart en Pixel Art sur le buffer 2D
  drawKartSprite(ctx, cx, cy, width, skinHex, isPlayer, steer) {
    const w = width;
    const h = width * 0.8;
    const px = cx - w/2;
    const py = cy - h;
    
    // Roues (Noir)
    ctx.fillStyle = '#111';
    ctx.fillRect(px - w*0.1, py + h*0.2, w*0.3, h*0.3); // Avant gauche
    ctx.fillRect(px + w*0.8, py + h*0.2, w*0.3, h*0.3); // Avant droite
    ctx.fillRect(px - w*0.15, py + h*0.7, w*0.3, h*0.4); // Arriere gauche
    ctx.fillRect(px + w*0.85, py + h*0.7, w*0.3, h*0.4); // Arriere droite

    // Châssis (Gris)
    ctx.fillStyle = '#999';
    ctx.fillRect(px + w*0.1, py + h*0.3, w*0.8, h*0.6);

    // Carrosserie (Couleur du perso)
    ctx.fillStyle = skinHex;
    ctx.fillRect(px + w*0.2, py + h*0.4, w*0.6, h*0.5);
    ctx.fillRect(px + w*0.3, py + h*0.2, w*0.4, h*0.2); // Capot avant

    // Personnage (Tête)
    ctx.fillStyle = skinHex;
    // Si ça tourne, décaler la tête
    const headOff = steer * (w * 0.1);
    ctx.beginPath();
    ctx.arc(cx + headOff, py + h*0.2, w*0.3, 0, Math.PI*2);
    ctx.fill();
    // Casquette/Visage
    ctx.fillStyle = '#ffccaa'; // Peau
    ctx.fillRect(cx - w*0.15 + headOff, py + h*0.1, w*0.3, w*0.15);
    
    // Si ce n'est pas le joueur (vu de dos), on dessine les yeux car on le voit de face/dos selon l'angle.
    // Pour simplifier, on assume qu'on les voit de dos tout le temps comme le joueur.
  }

  draw(ctx) {
    if (this.state === 'menu') return;
    
    this.drawMode7();
    this.bufferCtx.putImageData(this.imgData, 0, 0);
    
    // --- Dessin des Karts ---
    const player = this.karts[0];
    const camA = player.angle;
    
    const sorted = [...this.karts].sort((a,b) => {
      const d1 = Math.pow(a.x-player.x,2) + Math.pow(a.z-player.z,2);
      const d2 = Math.pow(b.x-player.x,2) + Math.pow(b.z-player.z,2);
      return d2 - d1; 
    });

    for (const k of sorted) {
      if (k.isPlayer) {
        // Le joueur est fixe, en bas
        const I = this.game.input;
        const steer = I.isDown('left', 0) ? -1 : (I.isDown('right', 0) ? 1 : 0);
        this.drawKartSprite(this.bufferCtx, this.renderW / 2, this.renderH - 10, 48, k.skin.color, true, steer);
      } else {
        const dx = k.x - player.x;
        const dz = k.z - player.z;
        
        const rx = dx * Math.cos(-camA) - dz * Math.sin(-camA);
        const rz = dx * Math.sin(-camA) + dz * Math.cos(-camA);
        
        if (rz > 0.5) { 
          const scale = 180 / rz;
          const sx = (this.renderW / 2) + (rx * scale);
          const sy = (this.renderH * 0.45) + (6.0 * scale); // horizon + height * scale
          
          if (sx > -100 && sx < this.renderW+100 && sy > -100 && sy < this.renderH+100) {
             const kartSize = 30 * (scale / 40); // Ajustement de l'échelle
             // Approximation de la rotation du bot
             const steer = Math.sin(k.id * 10 + Date.now()/200); 
             this.drawKartSprite(this.bufferCtx, sx, sy, kartSize, k.skin.color, false, steer);
          }
        }
      }
    }

    // Agrandir l'image bufferisée sur l'écran (Look Rétro)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bufferCanvas, 0, 0, VIEW_W, VIEW_H);

    // HUD Haute Résolution (Par dessus)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillText('🏎️ PIXEL KART 2D', 15, 35);
    const speed = Math.round(player.speed * 5);
    ctx.fillText(speed + ' km/h', VIEW_W - 120, VIEW_H - 25);
    ctx.shadowColor = 'transparent'; // Reset
  }

  dispose() {}
}
