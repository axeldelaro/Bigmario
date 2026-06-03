# 🎮 Bigmario — jeu de plateforme rétro, jouable en ligne

Un jeu de plateforme **100 % original** (aucun asset de Nintendo), inspiré des
mécaniques classiques du genre : courir, sauter, écraser les ennemis, ramasser
des pièces, des power-ups, traverser des mondes… plus un **mode versus** local et
en ligne.

> ⚠️ **À propos des droits.** *Super Mario Bros.*, Mario, et leurs personnages,
> niveaux et musiques sont la propriété de Nintendo. Ce projet **ne réutilise
> aucun de ces éléments** : tous les graphismes, le personnage (« Bolt »), les
> niveaux, la musique et le code sont créés de zéro et générés par code, donc
> librement hébergeables et partageables.

- 🕹️ **Jouable au clavier, à la manette, et au tactile** (overlay en mode paysage sur téléphone, vibration).
- 🧩 **Aventure solo** : 3 mondes / 6 niveaux, **combat de boss**, ennemis variés (marcheur, carapace, volant, **à pics**), power-ups (champignon / fleur de feu / étoile), blocs, tuyaux, drapeau d'arrivée.
- 🪜 **Mécaniques** : **ressorts**, **plateformes mobiles**, **checkpoints**, **gemmes cachées** (3/niveau, sauvegardées).
- ✨ **Game feel** : screen-shake, hit-stop, cartes d'intro de niveau, particules.
- ⚔️ **Versus** : **contre l'IA**, à 2 sur le même écran, **ou en ligne** (premier à 5 KO), 3 arènes.
- 📲 **PWA** : installable sur l'écran d'accueil et **jouable hors-ligne**.
- 🎵 Musique chiptune et bruitages **générés en temps réel** (aucun fichier audio).
- 💸 **Hébergement gratuit** : le jeu est 100 % statique (GitHub Pages), le serveur versus tient sur une offre gratuite (Render).

---

## ▶️ Jouer tout de suite (en local)

Le jeu est statique : il suffit d'un petit serveur web (à cause des modules ES).

```bash
# depuis la racine du dépôt
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

ou avec Node :

```bash
npx serve .
```

## 🎯 Contrôles

| Action | Clavier J1 | Clavier J2 (versus local) | Manette |
|---|---|---|---|
| Se déplacer | ◀ ▶ / A D | F H | Stick / croix |
| Sauter | Espace / ↑ / W | T / Y | A (ou Y) |
| Courir / Tir | J / Maj | U | X / B / RT |
| Pause | Échap / P | — | Start |

Sur téléphone : tourne en **paysage**, les boutons tactiles apparaissent.

---

## 🌐 Mettre le jeu en ligne (gratuit)

### 1. Le jeu (GitHub Pages)
1. Pousse ce dépôt sur GitHub.
2. `Settings → Pages → Source : GitHub Actions`.
3. Le workflow `.github/workflows/pages.yml` publie le jeu à chaque push sur `main`.
   Ton jeu sera sur `https://<ton-pseudo>.github.io/<repo>/`.

> Le solo et le versus **local** fonctionnent sans rien d'autre.

### 2. Le serveur versus en ligne (Render — gratuit)
Le versus en ligne a besoin d'un petit relais WebSocket (`/server`).

**Option A — Blueprint (1 clic) :**
1. Sur [Render](https://render.com) : `New → Blueprint`, sélectionne ce dépôt.
2. Render lit `server/render.yaml` et crée le service `bigmario-relay`.
3. Tu obtiens une URL `https://bigmario-relay-xxxx.onrender.com`.

**Option B — manuel :** `New → Web Service`, root directory `server`,
build `npm install`, start `npm start`.

Puis dans le jeu : **Versus en ligne → Adresse du serveur** =
`wss://bigmario-relay-xxxx.onrender.com` (note le **`wss://`**, pas `https://`).
Partage le **même code de salon** à ton adversaire et lancez-vous.

> 💤 L'offre gratuite de Render met le serveur en veille après inactivité :
> la première connexion peut prendre ~30 s, c'est normal.

Hébergeurs alternatifs gratuits compatibles : **Railway**, **Glitch**, **Fly.io**, **Cyclic**.

---

## 🧱 Structure du projet

```
index.html          page + canvas + overlays
styles.css          UI, menus, contrôles tactiles
js/
  core.js           constantes physiques, utilitaires, sauvegarde
  input.js          clavier + manette (Gamepad API) + tactile, multi-joueurs
  audio.js          bruitages + musique chiptune (WebAudio)
  art.js            génération des sprites pixel-art + tuiles (procédural)
  level.js          tilemap, collisions AABB, rendu décor/parallax
  levels.js         données des mondes/niveaux + arènes versus (level design)
  entities.js       joueur, ennemis, objets, projectiles, particules
  scene_game.js     scène solo (caméra, HUD, transitions de niveaux)
  scene_versus.js   scène combat (local + en ligne)
  net.js            client WebSocket
  main.js           boucle de jeu, scaling canvas, menus, gestion mobile
server/
  server.js         relais WebSocket (versus en ligne)
  package.json      dépendance: ws
  render.yaml       déploiement gratuit en 1 clic
.github/workflows/pages.yml   déploiement GitHub Pages
```

## 🛠️ Personnaliser

- **Ajouter un niveau** : édite `js/levels.js` (grille de caractères, légende en haut du fichier).
- **Changer le perso / les ennemis** : édite les grilles de pixels dans `js/art.js`.
- **Régler la physique** (gravité, saut, vitesse) : `js/core.js`.

## 📜 Licence

Code et assets originaux — libre d'utilisation et de modification.
Ne contient aucune propriété intellectuelle de tiers.
