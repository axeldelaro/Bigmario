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
- 🧊 **Rendu 3D (WebGL/Three.js)** en option : le monde, les blocs, les persos et ennemis rendus en 3D temps réel (style 2.5D), piloté par le moteur 2D validé. Bascule 2D/3D dans les Options. **Three.js est livré en local** (`js/vendor/`), donc la **3D marche aussi hors-ligne** ; **repli automatique en 2D** si le GPU ne suit pas.
- 🎮 **Mini-jeux vs IA** : **course aux pièces** et **course aux étoiles** sur 3 terrains — ramasse plus que le bot avant la fin du temps.
- 🎨 **Décors détaillés** : ciel en dégradé, parallaxe multi-couches (montagnes, collines, arbres, nuages), cristaux scintillants et torches animées ; ombres au sol et menus animés.
- 🗺️ **Carte du monde** animée pour choisir ses niveaux.
- ✅ **Niveaux garantis franchissables** : un validateur physique headless (`test/solve.mjs`) simule le moteur réel et vérifie qu'un auto-joueur atteint l'arrivée de chaque niveau.
- 🧩 **Aventure solo** : 3 mondes / **9 niveaux**, **combat de boss**, ennemis variés (marcheur, carapace, volant, **à pics**), power-ups (champignon / fleur de feu / étoile), blocs, tuyaux, drapeau d'arrivée.
- ⏱️ **Contre-la-montre** : chrono au **millième de seconde**, retry instantané, **meilleurs temps locaux** et **classements en ligne**.
- 🏁 **Marathon** : les 9 niveaux d'affilée, un seul chrono, classement dédié.
- 🔗 **Combos** : enchaîne les écrasements en l'air pour des points croissants (jusqu'au 1-UP), champignon vert **1-UP**.
- 💥 **Écrasement piqué** : appuie sur **Bas** en l'air pour un slam qui broie tout (même les ennemis à pics) avec onde de choc.
- 👹 **Gros boss** (Gardien) : grand, 5 PV, projectiles et onde de choc au sol — à vaincre par-dessus.
- 👻 **Fantômes** : rejoue ton record (PB) **et** le fantôme du **record en ligne** (WR) côte à côte ; en versus, affronte un **fantôme rival** (rejoue un adversaire d'un match précédent).
- 🎬 **Replays** : revois n'importe quel run (caméra qui suit, lecture/pause, vitesse 0.5×/1×/2×).
- 👥 **Fantôme d'ami** : partage un run par **code court** (serveur) ou **fichier .bmr**, charge celui d'un ami pour le **revoir** ou **courir contre**.
- 🥇 **Médailles** (or/argent/bronze) par temps de référence, **succès** à débloquer.
- ⏸️ **Menu pause tactile** (Reprendre / Recommencer / Son / Menu) et **réglage son mémorisé**.
- 🪜 **Mécaniques** : **ressorts**, **plateformes mobiles**, **checkpoints**, **gemmes cachées** (3/niveau, sauvegardées), **1-UP** et **plume** (vol plané : maintiens Saut en l'air).
- 🎮 **Boutons tactiles personnalisables** (taille, opacité, gaucher/droitier) dans les Options.
- 🗺️ **Niveaux avec relief** (les 3 mondes) : plateaux, escaliers, pics, doubles parcours (route basse sûre + route haute à récompenses), tous validés franchissables.
- 🎥 **Caméra** à zone morte + look-ahead lissé (suivi doux, sans ballottement aux sauts).
- ✨ **Game feel** : screen-shake, hit-stop, cartes d'intro de niveau, particules.
- ⚔️ **Versus** : **contre l'IA**, à 2 sur le même écran, **ou en ligne** (premier à 5 KO), 3 arènes.
- 📲 **PWA / hors-ligne complet** : installable sur l'écran d'accueil et **jouable 100 % hors-ligne** (3D incluse, Three.js en local). Menu **Options → 📥 Jouer hors-ligne** : installer l'appli, préparer le cache, ou télécharger le jeu. **Compteur FPS** activable pour vérifier la fluidité.
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

> ⚠️ Ouvrir `index.html` en double-clic (`file://`) **ne marche pas** : les
> modules ES exigent un serveur. Utilise une des commandes ci-dessus.

## 📥 Jouer hors-ligne (sans internet)

Tout est conçu pour tourner **100 % en local**, y compris la 3D (Three.js est
livré dans `js/vendor/`, aucune dépendance réseau à l'exécution).

Trois moyens, au choix :

1. **Installer l'appli (recommandé)** — ouvre le jeu en ligne une fois, puis
   **Options → 📥 Jouer hors-ligne → Installer l'appli** (ou « Ajouter à l'écran
   d'accueil »). Le service worker met tout en cache : tu peux ensuite couper le
   réseau, l'appli se lance et la 3D fonctionne.
2. **Garder l'onglet** — après une visite en ligne, recharger la page marche
   même hors-ligne (cache du service worker).
3. **Version fichier (dossier complet)** — récupère le jeu et lance un serveur
   local :
   ```bash
   npm run pack        # crée dist/bigmario-offline.zip (autonome)
   #   …ou « Code → Download ZIP » sur GitHub, ou le bouton 💾 in-game.
   # puis, dans le dossier décompressé :
   python3 -m http.server 8000   # → http://localhost:8000
   ```

**Vérifier la fluidité** : Options → *Compteur FPS: ON* affiche les images/s en
bas de l'écran (vert ≥ 50, jaune ≥ 30). Sur mobile, la densité de pixels 3D est
plafonnée automatiquement pour rester fluide ; la simulation physique coûte
~0,3 µs/pas (budget 120 Hz = 8,33 ms), donc la marge va entièrement au rendu.

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

### 3. Les classements en ligne (contre-la-montre)
Le **même serveur** sert aussi de classement : il expose une petite API REST
(`GET /api/scores?level=ID`, `POST /api/scores`). Le jeu réutilise
automatiquement l'adresse configurée pour le versus (le `wss://` est converti en
`https://` pour l'API). Les temps sont **toujours sauvegardés en local** ; s'il y
a un serveur, le jeu propose d'**envoyer ton temps** et affiche le top 10.

> Les temps sont stockés dans `server/scores.json`. Sur une offre gratuite, le
> disque peut être réinitialisé lors d'un redéploiement (les records locaux, eux,
> restent).

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
