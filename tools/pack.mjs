// pack.mjs — crée dist/bigmario-offline.zip : une copie autonome du jeu,
// jouable hors-ligne sur un petit serveur local (Three.js est inclus localement).
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';

const OUT = 'dist/bigmario-offline.zip';
const INCLUDE = ['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'sw.js', 'js', 'README.md'];

mkdirSync('dist', { recursive: true });
rmSync(OUT, { force: true });
// -r récursif, -q silencieux ; on exclut les caches éventuels
execSync(`zip -r -q ${OUT} ${INCLUDE.join(' ')} -x '*/node_modules/*' '*/.DS_Store'`, { stdio: 'inherit' });
const mb = (statSync(OUT).size / 1048576).toFixed(2);
console.log(`✅ ${OUT} créé (${mb} Mo).`);
console.log('   Décompresse, puis dans le dossier : python3 -m http.server  →  http://localhost:8000');
