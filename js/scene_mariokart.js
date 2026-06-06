// scene_mariokart.js — Mini-jeu de karting en 3D (Style Super Mario Kart / Mode 7)
import * as THREE from './vendor/three.module.js';
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
  { name: 'Piste des Glaces', w: 8, h: 8, data: Array(64).fill(1).map((_,i)=>i===56?2:(Math.random()>0.7?0:1)) }, // Procédural chaotique
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
  { name: 'Route Arc-en-Ciel', w: 10, h: 10, data: Array(100).fill(1).map((_,i) => i===90?2:(Math.random()>0.4?1:0)) }, // Difficile
];

// Couleurs de la piste
const TILE_SIZE = 10;
const ROAD_COL = '#777', GRASS_COL = '#3a8b3a', LINE_COL = '#fff', START_COL = '#d02020';

export class MarioKartScene {
  constructor(game) {
    this.game = game;
    this.state = 'menu'; // menu -> play -> end
    this.selectedTrack = 0;
    this.selectedSkin = 0;
    this.initMenu();
  }

  initMenu() {
    let html = `<div class="title" style="margin-bottom:10px;"><span class="big" style="color:#d02020; font-size:40px; text-shadow: 2px 2px #fff;">KARTING 3D</span></div>`;
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
    
    // Initialiser 3D
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.selectedTrack === 9 ? '#000' : '#46c8ff'); // Arc en ciel = nuit
    this.camera = new THREE.PerspectiveCamera(75, VIEW_W/VIEW_H, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.game.canvas, antialias: false });
    
    // Générer la texture du sol (la grille)
    const tCanvas = document.createElement('canvas');
    tCanvas.width = this.track.w * 64; tCanvas.height = this.track.h * 64;
    const ctx = tCanvas.getContext('2d');
    for (let y = 0; y < this.track.h; y++) {
      for (let x = 0; x < this.track.w; x++) {
        const t = this.track.data[y * this.track.w + x];
        ctx.fillStyle = t === 0 ? GRASS_COL : t === 1 ? ROAD_COL : START_COL;
        ctx.fillRect(x*64, y*64, 64, 64);
        if (t === 1) { // Ligne pointillée
          ctx.fillStyle = LINE_COL;
          ctx.fillRect(x*64+30, y*64+30, 4, 4);
        }
      }
    }
    const tex = new THREE.CanvasTexture(tCanvas);
    tex.magFilter = THREE.NearestFilter;
    const planeGeo = new THREE.PlaneGeometry(this.track.w * TILE_SIZE, this.track.h * TILE_SIZE);
    const planeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((this.track.w*TILE_SIZE)/2, 0, (this.track.h*TILE_SIZE)/2);
    this.scene.add(plane);

    // Trouver le point de départ
    let startX = 2, startY = 2;
    for (let i = 0; i < this.track.data.length; i++) {
      if (this.track.data[i] === 2) {
        startX = (i % this.track.w) * TILE_SIZE + TILE_SIZE/2;
        startY = Math.floor(i / this.track.w) * TILE_SIZE + TILE_SIZE/2;
        break;
      }
    }

    // Créer les 8 karts
    const geo = new THREE.BoxGeometry(2, 2, 3);
    for (let i = 0; i < 8; i++) {
      const isPlayer = i === 0;
      const skinIndex = isPlayer ? this.selectedSkin : (i % SKIN_LIST.length);
      const color = new THREE.Color(SKIN_LIST[skinIndex].color);
      const mat = new THREE.MeshBasicMaterial({ color: color });
      const mesh = new THREE.Mesh(geo, mat);
      
      // Décalage sur la ligne de départ
      const xOff = (i%2 === 0 ? -1.5 : 1.5);
      const zOff = Math.floor(i/2) * 3;
      
      mesh.position.set(startX + xOff, 1, startY + zOff);
      this.scene.add(mesh);
      
      this.karts.push({
        isPlayer,
        mesh,
        x: startX + xOff,
        z: startY + zOff,
        angle: 0,
        speed: 0,
        lap: 0,
        progress: 0,
        skin: SKIN_LIST[skinIndex]
      });
    }

    this.state = 'play';
    this.startTime = Date.now();
  }

  update(dt) {
    if (this.state !== 'play') return;
    const inputs = this.game.input.get();
    
    // Update tous les karts
    for (let i = 0; i < this.karts.length; i++) {
      const k = this.karts[i];
      let acc = 0, steer = 0, drift = false;
      
      if (k.isPlayer) {
        acc = inputs.jump ? 1 : 0; // A = accel
        steer = (inputs.left ? 1 : 0) + (inputs.right ? -1 : 0);
        drift = inputs.fire; // B = drift
      } else {
        // IA très basique du kart : avance et tourne vers le centre de la route
        acc = 0.8 + Math.random()*0.2; // Toujours avancer
        // Regarder un peu devant
        const lookX = k.x + Math.sin(k.angle) * 4;
        const lookZ = k.z + Math.cos(k.angle) * 4;
        const tx = Math.floor(lookX / TILE_SIZE);
        const ty = Math.floor(lookZ / TILE_SIZE);
        const tile = (tx>=0 && tx<this.track.w && ty>=0 && ty<this.track.h) ? this.track.data[ty*this.track.w + tx] : 0;
        
        if (tile === 0) {
          // Si on va vers l'herbe, on tourne fort (au hasard un peu)
          steer = Math.sin(Date.now()/500 + i) > 0 ? 1 : -1; 
        } else {
          // Micro-ajustements aléatoires pour faire naturel
          steer = Math.sin(Date.now()/300 + i * 45) * 0.3;
        }
      }
      
      // Physique
      if (acc > 0) k.speed += 20 * dt;
      else k.speed -= 10 * dt; // Freinage naturel
      
      // Herbe ralentit
      const tx = Math.floor(k.x / TILE_SIZE);
      const ty = Math.floor(k.z / TILE_SIZE);
      const tile = (tx>=0 && tx<this.track.w && ty>=0 && ty<this.track.h) ? this.track.data[ty*this.track.w + tx] : 0;
      if (tile === 0) k.speed *= 0.8; // Ralentissement massif sur l'herbe
      
      k.speed = Math.max(0, Math.min(k.speed, drift ? 35 : 30)); // Vitesse max
      
      const steerMod = drift ? 3.5 : 2.5; // Dérapage tourne plus vite
      k.angle += steer * steerMod * dt * (k.speed/30);
      
      k.x += Math.sin(k.angle) * k.speed * dt;
      k.z += Math.cos(k.angle) * k.speed * dt;
      
      k.mesh.position.x = k.x;
      k.mesh.position.z = k.z;
      k.mesh.rotation.y = k.angle;
      
      // Camera pour le joueur
      if (k.isPlayer) {
        this.camera.position.x = k.x - Math.sin(k.angle) * 10;
        this.camera.position.z = k.z - Math.cos(k.angle) * 10;
        this.camera.position.y = 5;
        this.camera.lookAt(k.x, 1, k.z);
      }
    }
  }

  draw(ctx) {
    if (this.state === 'menu') return;
    this.renderer.render(this.scene, this.camera);
    
    // HUD par-dessus le canvas 3D
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText('🏎️ MARIO KART MODE', 10, 30);
    ctx.fillText('Position : ? / 8', 10, 60);
    const speed = Math.round(this.karts[0]?.speed * 5 || 0);
    ctx.fillText(speed + ' km/h', VIEW_W - 100, VIEW_H - 20);
  }

  dispose() {
    this.renderer?.dispose();
  }
}
