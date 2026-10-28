# Voyage au Japon – carte d'itinéraire hors ligne

Application web (PWA) pour téléphone : un trajet par jour sur une carte, des points d'intérêt numérotés dans l'ordre, et un bouton pour envoyer le trajet à Google Maps.

## Essayer sur le PC

Double-cliquer sur **`lancer.bat`** (laisser la fenêtre noire ouverte). Ouvrir `index.html` directement affiche la carte, mais sans le mode hors ligne.

## Mettre l'app en ligne (une seule fois)

Le mode hors ligne exige une adresse **https**. Le plus simple :

1. Aller sur <https://app.netlify.com/drop> (compte gratuit).
2. Glisser-déposer **tout le dossier** `App Japon`.
3. Netlify donne une adresse du type `https://xxxx.netlify.app`.

(Alternative : GitHub Pages.)

## Installer sur le téléphone

- **iPhone (Safari)** : ouvrir l'adresse → bouton Partager → « Sur l'écran d'accueil ».
- **Android (Chrome)** : ouvrir l'adresse → menu ⋮ → « Installer l'application ».

⚠️ Sur iPhone, l'app installée a **son propre stockage**, séparé de Safari. Créez votre itinéraire **depuis l'icône installée**, pas dans Safari.

## Utilisation

- **＋ Ajouter un jour** (en bas de l’Aperçu) : nouveau jour (date, titre, couleur).
- **Panneau du bas** : le faire glisser (réduit / moitié / plein écran). Onglets **Aperçu** (tous les jours), **Programme** (un jour : toucher une date ou balayer le titre) et **Hôtels** (dates, adresse en japonais à copier pour un taxi). Pendant le voyage, le jour J s'ouvre tout seul.
- **＋** (bouton noir, onglet Programme) : ajouter une étape au jour affiché.
- **Restos** : restaurants classés par ville, sans lien avec les dates. Filtres par ville et « Sans poisson », bouton « Y aller » (ou recherche Google Maps s'il n'y a pas d'adresse précise), case « Testé ». **＋** pour en ajouter un, toucher une fiche pour la modifier.
- **Toucher une étape** (liste ou carte) : fiche avec photo, note complète et « Y aller ». **✎ Modifier** depuis la fiche pour la changer, la déplacer ou la changer de jour.
- Ajouter une étape : rechercher un lieu (avec réseau), coller un lien Google Maps ou des coordonnées `35.71, 139.79`, toucher la carte, ou prendre « Ma position ».
- **Appui long sur la carte** : ajout rapide d'un point au jour affiché.
- **⇅ Ordre** : affiche les boutons ▲ ▼ pour réordonner les étapes.
- **Itinéraire ↗** entre deux points : ouvre le trajet en transports dans Google Maps.

## Avant de partir (avec du Wi-Fi)

1. Saisir tous les points.
2. Menu **⋯ → Télécharger la carte pour le hors-ligne** (depuis l'Aperçu pour l'ensemble du voyage). La carte est téléchargée autour de chaque point.
3. Menu **⋯ → Exporter une sauvegarde** : gardez le fichier `.json` (mail, Drive…). **Importer** permet de le recharger sur un autre téléphone.

Hors ligne, tout fonctionne (carte téléchargée, points, GPS) sauf la recherche de lieux. Google Maps a besoin de réseau pour calculer l'itinéraire. Vous pouvez aussi télécharger les zones dans l'app Google Maps (« Cartes hors connexion »), mais les trajets en transports n'y sont pas disponibles.

## Notes techniques

- Fichiers statiques, sans compilation : `index.html`, `app.js`, `styles.css`, `sw.js` (cache hors ligne), MapLibre GL JS dans `vendor/`.
- Données stockées dans le `localStorage` du téléphone.
- Fonds de carte gratuits et sans compte : OpenFreeMap (par défaut « Épuré 3D », vectoriel, bâtiments en relief), Esri, OSM France. Usage personnel raisonnable, ne pas télécharger des régions entières.
- Après une modification du code, augmenter `SHELL_CACHE` dans `sw.js` (`shell-v2`…) pour que les téléphones prennent la nouvelle version.
