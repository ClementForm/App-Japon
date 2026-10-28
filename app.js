'use strict';

// ============ Constantes ============
const STORE_KEY = 'voyage-japon-v1';
const TILE_CACHE = 'tiles-v1'; // doit correspondre à sw.js
const PHOTO_CACHE = 'photos-v1'; // idem
// Fonds de carte gratuits sans clé. Un seul sous-domaine par fond pour que chaque tuile
// n'ait qu'une URL (donc une seule entrée en cache). Les hôtes sont aussi listés dans sw.js.
// Fond vectoriel : « style » (dessiné par MapLibre, attribution fournie par le style). Fond image : « urls », plusieurs couches
// possibles (fond + noms) ; maxNative = zoom maximal servi. kbPerTile sert à estimer le téléchargement.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const BASEMAPS = {
  positron: {
    label: 'Épuré 3D (OpenFreeMap) – latin + japonais',
    style: 'https://tiles.openfreemap.org/styles/positron',
    kbPerTile: 250,
  },
  liberty: {
    label: 'Coloré 3D (OpenFreeMap) – latin + japonais',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    kbPerTile: 250,
  },
  gray: {
    label: 'Épuré (gris clair) – japonais + anglais',
    urls: [`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
    attribution: 'Tuiles © Esri — Esri, HERE, Garmin, © OpenStreetMap',
    maxNative: 16,
  },
  esri: {
    label: 'Détaillé – japonais + anglais',
    urls: [`${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`],
    attribution: 'Tuiles © Esri — Esri, HERE, Garmin, © OpenStreetMap',
    maxNative: 18,
  },
  osmfr: {
    label: 'OSM France – noms en caractères latins',
    urls: ['https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · OSM France',
    maxNative: 18,
  },
};
let basemap = BASEMAPS[pref('basemap-v3', 'positron')] ? pref('basemap-v3', 'positron') : 'positron';
const fillTemplate = (u, z, x, y) => u.replace('{z}', z).replace('{x}', x).replace('{y}', y);
// Les tuiles OpenFreeMap changent d'URL à chaque mise à jour hebdomadaire : on les range
// en cache sans la version (même règle dans sw.js).
const tileKey = (url) => url.replace(/(tiles\.openfreemap\.org\/planet\/)[^/]+\//, '$1_/');
const COLORS = ['#e6194b', '#4363d8', '#3cb44b', '#f58231', '#911eb4', '#0097a7', '#f032e6', '#9a6324', '#469990', '#800000', '#808000', '#000075'];

const $ = (s) => document.querySelector(s);

// Icônes au trait (grille 24 × 24, dans l'esprit de Lucide). Dans le HTML : data-icon="nom" (+ data-size).
const ICONS = {
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  go: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="14" r=".5"/><circle cx="15" cy="14" r=".5"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  tap: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.6-2.2L4 15.5a1.6 1.6 0 0 1 2.5-2L9 16"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  external: '<path d="M7 17 17 7M8 7h9v9"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  reorder: '<path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  // Onglets
  map: '<path d="M14.1 5.9 9.9 3.8a2 2 0 0 0-1.8 0L3.6 6A1 1 0 0 0 3 7v12.4a.6.6 0 0 0 .9.5l4.2-2.1a2 2 0 0 1 1.8 0l4.2 2.1a2 2 0 0 0 1.8 0L20.4 18a1 1 0 0 0 .6-.9V4.6a.6.6 0 0 0-.9-.5l-4.2 2.1a2 2 0 0 1-1.8 0Z"/><path d="M15 6v15M9 3.5v15"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  bed: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
  // Types de restaurants
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  noodles: '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M8 21h8M9 3l2.5 8M15.5 3 14 11"/>',
  fish: '<path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z"/><path d="M18 12v.5M16 17.93a9.77 9.77 0 0 1 0-11.86M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33"/>',
  meat: '<path d="M3 21 21 3"/><rect x="5.5" y="10.5" width="6" height="6" rx="1.6" transform="rotate(45 8.5 13.5)"/><rect x="10.5" y="5.5" width="6" height="6" rx="1.6" transform="rotate(45 13.5 8.5)"/>',
  sweet: '<path d="m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11"/><path d="M17 7A5 5 0 0 0 7 7"/><path d="M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4"/>',
  market: '<path d="M3 9l1.5-5h15L21 9M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M5 13v8h14v-8M10 21v-5h4v5"/>',
};
const icon = (name, size = 20) =>
  `<svg class="i" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, +el.dataset.size || 20)));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function setPref(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

// ============ Données ============
// Noms des hébergements de l'itinéraire de base : reconnus aussi dans les données
// enregistrées avant l'existence de l'option « hébergement ».
const DEFAULT_HOTELS = new Set((window.DEFAULT_TRIP?.days || []).flatMap((d) => d.points.filter((p) => p.hotel).map((p) => p.name)));
// Photo de chaque lieu de base : complète les points enregistrés avant l'ajout des photos.
const DEFAULT_PHOTOS = new Map((window.DEFAULT_TRIP?.days || []).flatMap((d) => d.points.filter((p) => p.photo).map((p) => [p.name, [p.photo, p.credit]])));
// Ville de chaque hébergement de base : complète les données enregistrées avant l'ajout du champ.
const DEFAULT_CITIES = new Map((window.DEFAULT_TRIP?.days || []).flatMap((d) => d.points.filter((p) => p.city).map((p) => [p.name, p.city])));
// Position et photo de chaque resto de base : reprises d'après le nom pour les restos enregistrés avant leur ajout.
const DEFAULT_RESTO_POS = new Map((window.DEFAULT_TRIP?.restaurants || []).filter((r) => r.lat != null).map((r) => [r.name, r]));
const DEFAULT_RESTO_PHOTOS = new Map((window.DEFAULT_TRIP?.restaurants || []).filter((r) => r.photo).map((r) => [r.name, r]));
let state = load();
let currentDayId = pref('currentDay', null) || null;
let lastDayId = currentDayId; // jour rouvert par l'onglet « Programme »
let tab = currentDayId ? 'day' : ['hotels', 'restos'].includes(pref('tab', '')) ? pref('tab', '') : 'overview';
let pending = null; // { type: 'add', dayId } | { type: 'move', pid }
let editing = null; // { pid } ou { draft: { lat, lng } }
let editingDayId = null;
let meMarker = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  return normalize(window.DEFAULT_TRIP || { name: 'Voyage au Japon', days: [] });
}

// Lieu d'un restaurant : recherche Google Maps (query) et/ou position sur la carte (lat, lng, approx).
function restoPlace(r) {
  const out = {};
  if (r.query) out.query = String(r.query);
  const src = r.lat != null && r.lat !== '' ? r : DEFAULT_RESTO_POS.get(r.name);
  if (src && Number.isFinite(+src.lat) && Number.isFinite(+src.lng)) Object.assign(out, { lat: +src.lat, lng: +src.lng, approx: !!src.approx });
  if (!out.query && out.lat == null) out.query = String(r.name || '');
  return out;
}

function normalize(data) {
  if (!data || !Array.isArray(data.days)) throw new Error('Format invalide');
  return {
    name: String(data.name || 'Voyage au Japon'),
    days: data.days.map((d, i) => ({
      id: String(d.id || uid()),
      title: String(d.title || ''),
      date: String(d.date || ''),
      color: String(d.color || COLORS[i % COLORS.length]),
      points: (Array.isArray(d.points) ? d.points : [])
        .filter((p) => Number.isFinite(+p.lat) && Number.isFinite(+p.lng))
        .map((p) => ({
          id: String(p.id || uid()),
          name: String(p.name || 'Point'),
          lat: +p.lat,
          lng: +p.lng,
          time: String(p.time || ''),
          note: String(p.note || ''),
          hotel: p.hotel === undefined ? DEFAULT_HOTELS.has(p.name) : !!p.hotel,
          photo: String(p.photo || DEFAULT_PHOTOS.get(p.name)?.[0] || ''),
          credit: String(p.photo ? p.credit || '' : DEFAULT_PHOTOS.get(p.name)?.[1] || ''),
          city: String(p.city || DEFAULT_CITIES.get(p.name) || ''),
        })),
    })),
    // Données d'avant la rubrique Restos : on part de la liste de base.
    restaurants: (Array.isArray(data.restaurants) ? data.restaurants : window.DEFAULT_TRIP?.restaurants || []).map((r) => ({
      id: String(r.id || uid()),
      name: String(r.name || 'Restaurant'),
      city: String(r.city || ''),
      kind: String(r.kind || 'food'),
      note: String(r.note || ''),
      noFish: !!r.noFish,
      done: !!r.done,
      when: String(r.when || ''), // moment conseillé, indicatif : la rubrique reste sans lien avec les jours
      // Photo du plat : reprise des restos de base d'après le nom si elle manque (données plus anciennes).
      photo: String(r.photo || DEFAULT_RESTO_PHOTOS.get(r.name)?.photo || ''),
      credit: String(r.photo ? r.credit || '' : DEFAULT_RESTO_PHOTOS.get(r.name)?.credit || ''),
      ...restoPlace(r),
    })),
    base: +data.base || 0, // version de l'itinéraire de base dont ces données sont issues
  };
}

function save() {
  sortDays();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    alert("Impossible d'enregistrer (stockage plein ou bloqué). Pensez à exporter une sauvegarde.");
  }
  navigator.storage?.persist?.();
}

function sortDays() {
  state.days.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}

const getDay = (id) => state.days.find((d) => d.id === id);
const dayIndex = (d) => state.days.indexOf(d);

function findPoint(pid) {
  for (const day of state.days) {
    const point = day.points.find((p) => p.id === pid);
    if (point) return { day, point };
  }
  return null;
}

function dayLabel(d) {
  return `J${dayIndex(d) + 1}${d.title ? ' · ' + d.title : ''}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

const fmtParts = (iso, opts) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', opts) : '');

// Date du téléphone (heure locale : celle du Japon une fois sur place).
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ============ Géo / Google Maps ============
function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);
const ll = (p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

// Itinéraire en transports. Sans origine, Google Maps part de la position actuelle.
function dirUrl(pts) {
  const q = new URLSearchParams({ api: '1', destination: ll(pts[pts.length - 1]), travelmode: 'transit' });
  if (pts.length > 1) q.set('origin', ll(pts[0]));
  return 'https://www.google.com/maps/dir/?' + q;
}

// Reconnaît « 35.0, 135.7 » et les liens Google Maps longs.
function parseCoords(s) {
  const pats = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) {
      const lat = +m[1], lng = +m[2];
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

// ============ Carte ============
// Fond image : un style MapLibre avec une couche raster par URL.
function styleFor(b) {
  if (b.style) return b.style;
  return {
    version: 8,
    sources: Object.fromEntries(b.urls.map((url, i) => [`r${i}`, {
      type: 'raster', tiles: [url], tileSize: 256, maxzoom: b.maxNative, ...(i ? {} : { attribution: b.attribution }),
    }])),
    layers: b.urls.map((_, i) => ({ id: `r${i}`, type: 'raster', source: `r${i}` })),
  };
}

const map = new maplibregl.Map({
  container: 'map',
  style: styleFor(BASEMAPS[basemap]),
  center: [138.25, 36.2],
  zoom: 5,
  maxPitch: 70,
  attributionControl: false,
  // Kanji et kana dessinés avec la police du téléphone : rien à télécharger.
  localIdeographFontFamily: '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif',
});
// À gauche : la colonne de droite est prise par les boutons ronds de l'app.
map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-left');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-left');
// Crédits repliés en « ⓘ » : dépliés, ils masquent le haut de la carte sur téléphone.
map.on('load', () => $('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));

function setBasemap(key) {
  basemap = key;
  map.setStyle(styleFor(BASEMAPS[key]), { diff: false });
}

// À chaque fond chargé : bâtiments en relief (fonds vectoriels).
map.on('style.load', add3dBuildings);

function add3dBuildings() {
  const style = map.getStyle();
  if (!style.sources.openmaptiles || style.layers.some((l) => l.type === 'fill-extrusion')) return;
  const firstLabel = style.layers.find((l) => l.type === 'symbol')?.id;
  map.addLayer({
    id: 'buildings-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': '#dedcd8',
      // Les bâtiments « poussent » entre les zooms 14 et 15.
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 6]],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  }, firstLabel);
}

// Noms des lieux seulement en zoomant : vue d'ensemble, ils se chevauchent.
const updateLabels = () => $('#map').classList.toggle('no-labels', map.getZoom() < 15);
map.on('zoom', updateLabels);
updateLabels();

// Icône « hotel » de Material Icons (Apache 2.0).
const BED_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="#fff" aria-label="Hébergement"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/></svg>';

// Contenu des pastilles : un lit pour les hébergements, sinon un numéro (les hébergements ne comptent pas).
function pointLabels(points) {
  let n = 0;
  return points.map((p) => (p.hotel ? BED_SVG : String(++n)));
}

let markers = [];
function renderMap() {
  markers.forEach((m) => m.remove());
  markers = [];
  // Onglet Restos : les restaurants au premier plan, l'itinéraire en filigrane.
  if (tab === 'restos') {
    for (const r of visibleRestos().filter(hasPlace)) {
      const el = document.createElement('div');
      el.className = `num-marker resto-marker${r.approx ? ' approx' : ''}${r.done ? ' done' : ''}`;
      el.style.zIndex = 2;
      el.title = r.approx ? `${r.name} (position approximative)` : r.name;
      el.innerHTML = `<span>${icon(r.kind in KIND_ICONS ? KIND_ICONS[r.kind] : 'utensils', 16)}</span><b class="pt-label">${esc(r.name)}${r.approx ? ' ~' : ''}</b>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (snap === 'peek') setSnap('half'); // la fiche doit être visible
        const card = $(`#sheet-body [data-rid="${CSS.escape(r.id)}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.classList.add('flash');
        setTimeout(() => card?.classList.remove('flash'), 1200);
      });
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(map));
    }
  }
  for (const day of state.days) {
    const active = tab !== 'restos' && (!currentDayId || currentDayId === day.id);
    const labels = pointLabels(day.points);
    day.points.forEach((p, j) => {
      const el = document.createElement('div');
      el.className = 'num-marker';
      el.style.zIndex = active ? 1 : 0;
      el.innerHTML = `<span style="background:${esc(day.color)}">${labels[j]}</span>`
        + (currentDayId === day.id ? `<b class="pt-label">${esc(p.name)}</b>` : '');
      el.addEventListener('click', (e) => {
        if (pending) return; // laisse la carte recevoir le clic
        e.stopPropagation();
        // Depuis n'importe quel onglet : on bascule sur le jour du point et on ouvre sa fiche (avec photo).
        if (tab !== 'day' || currentDayId !== day.id) selectDay(day.id);
        openView(p.id);
      });
      markers.push(new maplibregl.Marker({ element: el, opacity: active ? '1' : '0.12' }).setLngLat([p.lng, p.lat]).addTo(map));
    });
  }
}

function sheetPadding() {
  // Hauteur visée plutôt que mesurée : le panneau peut être en pleine animation.
  if (isWide()) return { top: 90, left: $('#sheet').getBoundingClientRect().right + 30, bottom: 40, right: 40 };
  const h = snapHeights()[snap === 'full' ? 'half' : snap];
  return { top: mapTop() + 10, left: 40, bottom: h + 20, right: 80 }; // à droite : la colonne de boutons
}

// Bas de la première rangée de boutons ronds (zone d'encoche comprise).
function mapTop() {
  return parseFloat(getComputedStyle($('#topbar')).paddingTop) + 62;
}

// Un jour : vue inclinée pour voir les bâtiments en relief. Tout le voyage : vue à plat.
function fitView(animate = true) {
  const days = currentDayId ? [getDay(currentDayId)] : state.days;
  const restos = tab === 'restos' ? visibleRestos().filter(hasPlace) : [];
  const pts = restos.length ? restos : days.flatMap((d) => d.points);
  if (!pts.length) return;
  const bounds = new maplibregl.LngLatBounds();
  pts.forEach((p) => bounds.extend([p.lng, p.lat]));
  const cam = map.cameraForBounds(bounds, { padding: sheetPadding(), maxZoom: 15 });
  if (!cam) return;
  map.easeTo({ ...cam, bearing: 0, pitch: currentDayId ? 30 : 0, duration: animate ? 800 : 0 });
}

map.on('click', (e) => {
  if (!pending) return;
  const { lat, lng } = e.lngLat;
  const p = pending;
  setPending(null);
  if (p.type === 'add') {
    openPointDialog(null, { lat, lng });
  } else if (p.type === 'move') {
    const f = findPoint(p.pid);
    if (f) {
      f.point.lat = lat;
      f.point.lng = lng;
      save();
      render();
    }
  }
});

// Appui long sur la carte (clic droit à la souris) : ajout rapide au jour affiché.
function quickAdd({ lat, lng }) {
  if (!currentDayId || pending || $('#dlg-point').open) return;
  openPointDialog(null, { lat, lng });
}
map.on('contextmenu', (e) => quickAdd(e.lngLat));
// iOS ne déclenche pas « contextmenu » à l'appui long : on le détecte à la main.
let press = null;
map.on('touchstart', (e) => {
  clearTimeout(press?.timer);
  press = e.originalEvent.touches.length === 1
    ? { point: e.point, timer: setTimeout(() => quickAdd(e.lngLat), 600) }
    : null;
});
map.on('touchmove', (e) => {
  if (press && e.point.dist(press.point) > 10) clearTimeout(press.timer);
});
map.on('touchend', () => clearTimeout(press?.timer));
map.on('touchcancel', () => clearTimeout(press?.timer));

// Pendant qu'on touche la carte, le panneau est réduit puis retrouve sa hauteur.
let snapBeforePending = null;
function setPending(p, text) {
  pending = p;
  $('#map').classList.toggle('picking', !!p);
  if (p) {
    snapBeforePending ??= snap;
    setSnap('peek');
    showBanner(text, 'Annuler', () => setPending(null));
  } else {
    if (snapBeforePending) setSnap(snapBeforePending);
    snapBeforePending = null;
    hideBanner();
  }
}

// ============ Bandeau ============
let bannerAction = null;
function showBanner(text, btn, action) {
  $('#banner-text').textContent = text;
  $('#banner-btn').textContent = btn;
  $('#banner-btn').hidden = !btn;
  bannerAction = action;
  $('#banner').hidden = false;
}
function hideBanner() {
  $('#banner').hidden = true;
  bannerAction = null;
}
$('#banner-btn').addEventListener('click', () => bannerAction?.());

// ============ Rendu ============
function render() {
  renderTabs();
  renderSheet();
  renderMap();
}

// Onglets du panneau. « Programme » affiche un jour (currentDayId) ; les autres, tout le voyage.
function renderTabs() {
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#btn-back').hidden = tab === 'overview';
  $('#fab-add').hidden = tab !== 'day' && tab !== 'restos';
}

function renderSheet() {
  const day = tab === 'day' && getDay(currentDayId);
  $('#sheet-body').innerHTML = day ? dayHtml(day)
    : tab === 'hotels' ? hotelsHtml()
    : tab === 'restos' ? restosHtml()
    : overviewHtml();
  $('#sheet-body .day-pills .on, #sheet-body .filters .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  applySnap();
}

// ============ Restaurants (sans lien avec les jours) ============
const KIND_ICONS = { noodles: 'noodles', sushi: 'fish', meat: 'meat', sweet: 'sweet', market: 'market', food: 'utensils' };
const KIND_LABELS = { noodles: 'Nouilles', sushi: 'Poisson / sushi', meat: 'Viande / grill', sweet: 'Sucré / café', market: 'Marché', food: 'Cuisine' };
let restoCity = pref('restoCity', '');
let restoNoFish = pref('restoNoFish', '') === '1';
let restoDone = ['todo', 'done'].includes(pref('restoDone', '')) ? pref('restoDone', '') : ''; // '' = tous

const hasPlace = (r) => Number.isFinite(r.lat);
const searchUrl = (q) => 'https://www.google.com/maps/search/?' + new URLSearchParams({ api: '1', query: q });
// Villes dans l'ordre du voyage (ordre d'apparition dans la liste).
const restoCities = () => [...new Set(state.restaurants.map((r) => r.city).filter(Boolean))];
const visibleRestos = () => state.restaurants.filter((r) => (!restoCity || r.city === restoCity) && (!restoNoFish || r.noFish)
  && (!restoDone || r.done === (restoDone === 'done')));

function restoCard(r) {
  // Avec un nom à chercher, Google Maps trouve le bon resto mieux qu'une position (parfois approximative).
  const go = r.query
    ? `<a class="btn primary" href="${esc(searchUrl(r.query))}" target="_blank" rel="noopener">${icon('search', 18)}Chercher sur Maps</a>`
    : `<a class="btn primary" href="${esc(dirUrl([r]))}" target="_blank" rel="noopener">${icon('go', 18)}Y aller</a>`;
  return `
    <article class="card resto ${r.done ? 'done' : ''} ${r.photo ? 'has-photo' : ''}" data-rid="${esc(r.id)}">
      ${r.photo ? `<figure class="dish" data-act="edit-resto"><img src="${esc(r.photo)}" alt="" loading="lazy">${r.credit ? `<figcaption>Photo : ${esc(r.credit)}</figcaption>` : ''}${r.done ? `<span class="done-badge">${icon('check', 14)}Testé</span>` : ''}</figure>` : ''}
      <div class="card-top" data-act="edit-resto">
        <span class="ico">${icon(KIND_ICONS[r.kind] || 'utensils', 24)}</span>
        <div class="grow">
          <b class="card-title">${esc(r.name)}</b>
          <small>${esc(KIND_LABELS[r.kind] || 'Cuisine')}${r.city ? ' · ' + esc(r.city) : ''}</small>
          ${r.when ? `<small class="when">${icon('calendar', 14)}${esc(r.when)}</small>` : ''}
          ${r.noFish ? `<span class="tag soft">${icon('check', 12)}Sans poisson OK</span>` : ''}
        </div>
      </div>
      ${r.note ? `<p class="resto-note">${esc(r.note)}</p>` : ''}
      <div class="resto-actions">
        ${go}
        <button class="${r.done ? 'on' : ''}" data-act="toggle-done" aria-pressed="${r.done}">${icon('check', 18)}${r.done ? 'Testé' : 'À tester'}</button>
      </div>
    </article>`;
}

function restosHtml() {
  if (restoCity && !restoCities().includes(restoCity)) restoCity = '';
  const list = visibleRestos();
  const filters = ['', ...restoCities()].map((c) => `<button class="filter ${c === restoCity ? 'on' : ''}" data-act="resto-city" data-city="${esc(c)}">${esc(c || 'Toutes')}</button>`).join('');
  // Toutes les villes : regroupées sous un intertitre.
  const groups = restoCity ? [[restoCity, list]] : restoCities().map((c) => [c, list.filter((r) => r.city === c)]).filter(([, rs]) => rs.length);
  const others = restoCity ? [] : list.filter((r) => !r.city);
  const body = groups.map(([c, rs]) => `${restoCity ? '' : `<h3 class="group">${esc(c)}</h3>`}${rs.map(restoCard).join('')}`).join('') + others.map(restoCard).join('');
  const done = state.restaurants.filter((r) => r.done).length;
  return `
    <div class="sheet-head">
      <div class="grow"><small class="eyebrow">${done} testé${done > 1 ? 's' : ''} sur ${state.restaurants.length}</small><h1>Restaurants</h1></div>
      <button class="filter fish ${restoNoFish ? 'on' : ''}" data-act="resto-nofish">${icon('fish', 16)}Sans poisson</button>
    </div>
    <div class="segmented">${[['', 'Tous', state.restaurants.length], ['todo', 'À tester', state.restaurants.length - done], ['done', 'Testés', done]]
      .map(([v, label, n]) => `<button class="${v === restoDone ? 'on' : ''}" data-act="resto-done" data-done="${v}">${label}<small>${n}</small></button>`).join('')}</div>
    <div class="filters">${filters}</div>
    ${body || '<p class="empty">Aucun restaurant pour ce filtre.</p>'}
    <button class="wide" data-act="add-resto">${icon('plus')}Ajouter un restaurant</button>`;
}

// Un hébergement par séjour : les nuits consécutives au même hôtel sont regroupées.
function stays() {
  const out = [];
  for (const day of state.days) {
    for (const p of day.points.filter((q) => q.hotel)) {
      const last = out[out.length - 1];
      if (last && last.name === p.name) {
        last.to = day.date || last.to;
        if (p.note.length < last.point.note.length) last.point = p; // la note sans ajout du jour
      } else {
        out.push({ name: p.name, city: p.city, from: day.date, to: day.date, color: day.color, point: p });
      }
    }
  }
  return out;
}

const JP = /[぀-ヿ一-鿿]/;

function hotelsHtml() {
  const fmt = (iso) => fmtParts(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  const cards = stays().map((s) => {
    const lines = s.point.note.split('\n').filter(Boolean);
    const jp = lines.find((l) => JP.test(l));
    const addr = jp ? lines[lines.indexOf(jp) - 1] : '';
    const infos = lines.filter((l) => l !== jp && l !== addr);
    return `
    <article class="card" data-pid="${esc(s.point.id)}">
      <div class="card-top" data-act="view-point">
        <span class="ico" style="--c:${esc(s.color)}">${BED_SVG}</span>
        <div class="grow">
          ${s.city ? `<span class="city" style="color:${esc(s.color)}">${icon('pin', 14)}${esc(s.city)}</span>` : ''}
          <b class="card-title">${esc(s.name)}</b>
          ${addr ? `<small>${esc(addr)}</small>` : ''}
          ${s.from ? `<small>${esc(fmt(s.from))}${s.to !== s.from ? ' — ' + esc(fmt(s.to)) : ''}</small>` : ''}
        </div>
      </div>
      ${infos.length ? `<div class="label">Infos</div><div class="card-note">${infos.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
      ${jp ? `<div class="label">Adresse en japonais</div><button class="copy-box" data-act="copy" data-text="${esc(jp)}"><span>${esc(jp)}</span>${COPY_SVG}</button>` : ''}
      <a class="btn primary wide" href="${esc(dirUrl([s.point]))}" target="_blank" rel="noopener">${icon('go')}Y aller</a>
    </article>`;
  }).join('');
  return `
    <div class="sheet-head">
      <div class="grow"><h1>Hôtels et hébergements</h1></div>
      <span class="pill">${stays().length}</span>
    </div>
    ${cards || '<p class="empty">Aucun hébergement.<br>Cochez « Hébergement » sur un point pour l’ajouter ici.</p>'}`;
}

const COPY_SVG = icon('copy', 18);

function toast(text) {
  showBanner(text, '', null);
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hideBanner, 1800);
}

// « Départ dans 3 jours », « Jour 5 sur 15 »… d'après les dates des jours.
function tripStatus() {
  const dates = state.days.map((d) => d.date).filter(Boolean).sort();
  if (!dates.length) return null;
  const t = todayIso();
  const first = dates[0], last = dates[dates.length - 1];
  const range = `${fmtParts(first, { day: 'numeric', month: 'short' })} → ${fmtParts(last, { day: 'numeric', month: 'short' })}`;
  if (t < first) {
    const n = Math.round((new Date(first + 'T12:00') - new Date(t + 'T12:00')) / 864e5);
    return { range, text: n === 1 ? 'Départ demain' : `Départ dans ${n} jours` };
  }
  if (t <= last) return { range, text: `Jour ${dates.filter((d) => d <= t).length} sur ${dates.length}`, now: true };
  return { range, text: 'Terminé' };
}

function overviewHtml() {
  const today = todayIso();
  const status = tripStatus();
  const items = state.days.map((d) => {
    const visits = d.points.filter((p) => !p.hotel).length;
    const cls = d.date && d.date < today ? 'past' : '';
    return `
    <li class="day-row ${cls}" data-day="${esc(d.id)}">
      <div class="date-tile" style="--c:${esc(d.color)}">
        <small>${esc(fmtParts(d.date, { weekday: 'short' }))}</small><b>${esc(fmtParts(d.date, { day: 'numeric' }) || 'J' + (dayIndex(d) + 1))}</b><small>${esc(fmtParts(d.date, { month: 'short' }))}</small>
      </div>
      <div class="info"><b>${esc(d.title || 'Jour ' + (dayIndex(d) + 1))}</b><small>J${dayIndex(d) + 1} · ${visits} étape${visits > 1 ? 's' : ''}</small></div>
      ${d.date === today ? '<span class="tag">Aujourd’hui</span>' : ''}
      <span class="chev">${icon('right')}</span>
    </li>`;
  }).join('');
  return `
    <div class="sheet-head">
      <div class="grow">${status ? `<small class="eyebrow">${esc(status.range)}</small>` : ''}<h1>${esc(state.name)}</h1></div>
      ${status ? `<span class="pill ${status.now ? 'accent' : ''}">${esc(status.text)}</span>` : ''}
    </div>
    ${items ? `<ul class="list">${items}</ul>` : '<p class="empty">Aucun jour pour l’instant.<br>Créez votre premier jour de voyage.</p>'}
    <button class="wide" data-act="add-day">${icon('plus')}Ajouter un jour</button>`;
}

let reordering = false; // boutons ▲ ▼ affichés

function dayHtml(day) {
  const pts = day.points;
  const i = dayIndex(day);
  const rows = [];
  const labels = pointLabels(pts);
  pts.forEach((p, j) => {
    if (j > 0) {
      const prev = pts[j - 1];
      rows.push(`<li class="leg"><a href="${esc(dirUrl([prev, p]))}" target="_blank" rel="noopener">${fmtDist(distKm(prev, p))} · <b>Itinéraire${icon('external', 14)}</b></a></li>`);
    }
    const sub = p.note.split('\n')[0];
    rows.push(`
      <li class="stop ${p.hotel ? 'hotel' : ''}" data-pid="${esc(p.id)}">
        <span class="badge" style="background:${esc(day.color)}">${labels[j]}</span>
        <div class="stop-main" data-act="view-point">
          <div class="stop-text">
            ${p.time ? `<span class="time">${esc(p.time.replace(':', ' h '))}</span>` : ''}
            <b>${esc(p.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}
          </div>
          ${p.photo ? `<img class="thumb" src="${esc(p.photo)}" alt="" loading="lazy">` : ''}
        </div>
        ${reordering ? `<div class="reorder">
          <button class="icon-btn" data-act="up" aria-label="Monter" ${j === 0 ? 'disabled' : ''}>${icon('up', 18)}</button>
          <button class="icon-btn" data-act="down" aria-label="Descendre" ${j === pts.length - 1 ? 'disabled' : ''}>${icon('down', 18)}</button>
        </div>` : ''}
      </li>`);
  });

  const today = todayIso();
  const pills = state.days.map((d) => `
    <button class="day-pill ${d.id === day.id ? 'on' : ''} ${d.date === today ? 'today' : ''}" style="--c:${esc(d.color)}" data-day="${esc(d.id)}">
      <small>${esc(fmtParts(d.date, { weekday: 'short' }) || 'J' + (dayIndex(d) + 1))}</small><b>${esc(fmtParts(d.date, { day: 'numeric' }) || dayIndex(d) + 1)}</b>
    </button>`).join('');
  return `
    <div class="day-pills">${pills}</div>
    <div class="sheet-head">
      <div class="grow">
        <small class="eyebrow" style="color:${esc(day.color)}">Jour ${i + 1}${day.date ? ' · ' + esc(fmtDate(day.date)) : ''}${day.date === today ? ' · Aujourd’hui' : ''}</small>
        <h1>${esc(day.title || 'Jour ' + (i + 1))}</h1>
      </div>
      <button class="icon-btn mini ${reordering ? 'on' : ''}" data-act="reorder" aria-label="${reordering ? 'Terminer' : 'Changer l’ordre'}">${icon(reordering ? 'check' : 'reorder', 18)}</button>
      <button class="icon-btn mini" data-act="edit-day" aria-label="Modifier le jour">${icon('pencil', 17)}</button>
    </div>
    ${rows.length ? `<ol class="list timeline" style="--c:${esc(day.color)}">${rows.join('')}</ol>` : '<p class="empty">Ajoutez des étapes avec le bouton +<br>ou par un appui long sur la carte.</p>'}`;
}

// Sans jour : onglet « Aperçu » (ou celui demandé), carte de tout le voyage.
function selectDay(id, toTab) {
  if ((id || null) !== currentDayId) reordering = false;
  currentDayId = id || null;
  if (currentDayId) lastDayId = currentDayId;
  tab = currentDayId ? 'day' : toTab || 'overview';
  setPref('currentDay', currentDayId || '');
  setPref('tab', tab);
  render();
  $('#sheet-body').scrollTop = 0;
  fitView();
}

function setTab(t) {
  if (t !== 'day') return selectDay(null, t);
  const today = state.days.find((d) => d.date === todayIso());
  selectDay((getDay(lastDayId) || today || state.days[0])?.id, 'overview');
}

function stepDay(delta) {
  const i = dayIndex(getDay(currentDayId)) + delta;
  if (state.days[i]) selectDay(state.days[i].id);
}

// ============ Panneau : glisser entre 3 hauteurs ============
const SNAPS = ['peek', 'half', 'full'];
let snap = SNAPS.includes(pref('sheetSnap', '')) ? pref('sheetSnap', '') : 'half';
const isWide = () => window.innerWidth >= 800;

function snapHeights() {
  const sheet = $('#sheet');
  const head = $('#sheet-body .sheet-head');
  const pad = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
  const peek = head ? head.offsetTop + head.offsetHeight + pad + 4 : 100;
  const full = window.innerHeight - mapTop() + 8;
  return { peek, half: Math.max(peek, Math.min(full, Math.round(window.innerHeight * 0.5))), full };
}

function applySnap() {
  $('#sheet').style.height = isWide() ? '' : snapHeights()[snap] + 'px';
  if (snap === 'peek') $('#sheet-body').scrollTop = 0; // l'en-tête doit rester visible
}

function setSnap(s) {
  snap = s;
  if (!pending) setPref('sheetSnap', s);
  applySnap();
}

window.addEventListener('resize', applySnap);

let drag = null;
let justDragged = false;
$('#sheet').addEventListener('pointerdown', (e) => {
  if (isWide() || !e.target.closest('#sheet-handle, #tabs, .sheet-head')) return;
  drag = { x: e.clientX, y: e.clientY, h: $('#sheet').offsetHeight, t: e.timeStamp, axis: null, head: !!e.target.closest('.sheet-head') };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.axis) {
    if (Math.hypot(dx, dy) < 8) return;
    drag.axis = Math.abs(dy) >= Math.abs(dx) ? 'y' : 'x';
    if (drag.axis === 'y') $('#sheet').classList.add('dragging');
  }
  if (drag.axis === 'y') {
    const { peek, full } = snapHeights();
    $('#sheet').style.height = Math.min(full, Math.max(peek * 0.85, drag.h - dy)) + 'px';
  }
});
function endDrag(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  $('#sheet').classList.remove('dragging');
  if (!d.axis) return; // simple toucher : géré par « click »
  justDragged = true;
  setTimeout(() => { justDragged = false; }, 0);
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (d.axis === 'x') {
    // Balayage horizontal sur l'en-tête : jour précédent / suivant.
    if (d.head && tab === 'day' && Math.abs(dx) > 50) stepDay(dx < 0 ? 1 : -1);
    return;
  }
  const v = dy / Math.max(1, e.timeStamp - d.t); // px/ms, positif vers le bas
  const hs = snapHeights();
  const h = $('#sheet').offsetHeight;
  let i = SNAPS.indexOf(snap);
  if (v > 0.5) i = Math.max(0, i - 1);
  else if (v < -0.5) i = Math.min(2, i + 1);
  else i = SNAPS.reduce((best, s, k) => (Math.abs(hs[s] - h) < Math.abs(hs[SNAPS[best]] - h) ? k : best), 0);
  setSnap(SNAPS[i]);
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
// Après un glissement, le « click » qui suit ne doit rien déclencher.
$('#sheet').addEventListener('click', (e) => {
  if (justDragged) { e.stopPropagation(); e.preventDefault(); }
}, true);

// ============ Interactions du panneau ============
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (snap === 'peek') setSnap('half');
  setTab(b.dataset.tab);
});
$('#btn-back').addEventListener('click', () => setTab('overview'));
$('#btn-hotels').addEventListener('click', () => {
  if (snap === 'peek') setSnap('half');
  setTab('hotels');
});
$('#fab-add').addEventListener('click', () => (tab === 'restos' ? openRestoDialog(null) : openAddDialog()));

$('#sheet-handle').addEventListener('click', () => setSnap(snap === 'half' ? 'full' : 'half'));

// Rangées de dates et de filtres : au doigt, défilement natif ; à la souris, on les fait glisser à la main.
let rowDrag = null;
$('#sheet-body').addEventListener('pointerdown', (e) => {
  const row = e.pointerType === 'mouse' && e.target.closest('.day-pills, .filters');
  if (row) rowDrag = { row, x: e.clientX, left: row.scrollLeft, moved: false };
});
window.addEventListener('pointermove', (e) => {
  if (!rowDrag) return;
  const dx = e.clientX - rowDrag.x;
  if (!rowDrag.moved && Math.abs(dx) < 5) return;
  rowDrag.moved = true;
  rowDrag.row.classList.add('grabbing');
  rowDrag.row.scrollLeft = rowDrag.left - dx;
});
window.addEventListener('pointerup', () => {
  if (!rowDrag) return;
  rowDrag.row.classList.remove('grabbing');
  // Un glissement ne doit pas sélectionner la date sous la souris.
  if (rowDrag.moved) {
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
  }
  rowDrag = null;
});

$('#sheet-body').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], [data-day]');
  // Toucher l'en-tête d'un panneau réduit : le déplier.
  if (!el?.matches('button') && snap === 'peek' && e.target.closest('.sheet-head')) return setSnap('half');
  if (!el) return;
  const act = el.dataset.act;
  const pid = el.closest('[data-pid]')?.dataset.pid;

  if (!act && el.dataset.day) return selectDay(el.dataset.day);
  if (act === 'add-day') return openDayDialog(null);
  if (act === 'edit-day') return openDayDialog(currentDayId);
  if (act === 'add-point') return openAddDialog();
  if (act === 'view-point') return openView(pid);
  if (act === 'resto-city' || act === 'resto-nofish' || act === 'resto-done') {
    if (act === 'resto-city') setPref('restoCity', (restoCity = el.dataset.city));
    else if (act === 'resto-done') setPref('restoDone', (restoDone = el.dataset.done));
    else setPref('restoNoFish', (restoNoFish = !restoNoFish) ? '1' : '');
    renderSheet();
    renderMap();
    return fitView();
  }
  if (act === 'toggle-done') {
    const r = state.restaurants.find((x) => x.id === el.closest('[data-rid]').dataset.rid);
    r.done = !r.done;
    save();
    renderSheet();
    return renderMap(); // avec un filtre Testés / À tester, le resto peut quitter la liste
  }
  if (act === 'edit-resto') return openRestoDialog(el.closest('[data-rid]').dataset.rid);
  if (act === 'add-resto') return openRestoDialog(null);
  if (act === 'copy') {
    navigator.clipboard?.writeText(el.dataset.text).then(() => toast('Adresse copiée'), () => toast('Copie impossible'));
    return;
  }
  if (act === 'reorder') {
    reordering = !reordering;
    return renderSheet();
  }
  if (act === 'up' || act === 'down') {
    const { day } = findPoint(pid);
    const i = day.points.findIndex((p) => p.id === pid);
    const j = act === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= day.points.length) return;
    [day.points[i], day.points[j]] = [day.points[j], day.points[i]];
    save();
    render();
  }
});

// ============ Dialogues ============
document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
// Fermer en touchant le fond.
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// --- Fiche d'un point (lecture) ---
let viewing = null; // id du point affiché
function openView(pid) {
  const f = findPoint(pid);
  if (!f) return;
  const { day, point: p } = f;
  const i = day.points.indexOf(p);
  const prev = day.points[i - 1], next = day.points[i + 1];
  viewing = pid;
  const badge = $('#view-badge');
  badge.innerHTML = pointLabels(day.points)[i];
  badge.style.background = day.color;
  $('#view-meta').textContent = [p.time && p.time.replace(':', ' h '), `J${dayIndex(day) + 1}`, fmtDate(day.date)].filter(Boolean).join(' · ');
  $('#view-name').textContent = p.name;
  $('#view-note').innerHTML = p.note.split(/\n+/).filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('');
  $('#view-note-box').hidden = !p.note;
  $('#view-photo').hidden = !p.photo;
  $('#view-photo img').src = p.photo || '';
  $('#view-photo figcaption').textContent = p.credit ? 'Photo : ' + p.credit : '';
  $('#view-go').href = dirUrl([p]);
  $('#view-from-prev').hidden = !prev;
  if (prev) {
    $('#view-from-prev').href = dirUrl([prev, p]);
    $('#view-from-prev small').textContent = `${prev.name} · ${fmtDist(distKm(prev, p))}`;
  }
  $('#view-prev').disabled = !prev;
  $('#view-next').disabled = !next;
  const dlg = $('#dlg-view');
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  // Centre le point dans la partie de carte visible au-dessus de la fiche.
  const covered = isWide() ? 0 : dlg.getBoundingClientRect().height;
  map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), offset: [0, -covered / 2], duration: 600 });
}

function viewStep(delta) {
  const { day, point } = findPoint(viewing);
  const q = day.points[day.points.indexOf(point) + delta];
  if (q) openView(q.id);
}
$('#view-prev').addEventListener('click', () => viewStep(-1));
$('#view-next').addEventListener('click', () => viewStep(1));
$('#view-edit').addEventListener('click', () => {
  $('#dlg-view').close();
  openPointDialog(viewing);
});

// --- Ajouter un point ---
function openAddDialog() {
  $('#search-results').innerHTML = '';
  $('#search-status').textContent = navigator.onLine ? '' : 'Hors ligne : la recherche est indisponible, mais vous pouvez coller des coordonnées ou toucher la carte.';
  $('#dlg-add').showModal();
}

let lastResults = [];
$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return;
  const coords = parseCoords(q);
  if (coords) {
    $('#dlg-add').close();
    return openPointDialog(null, coords);
  }
  if (!navigator.onLine) {
    $('#search-status').textContent = 'Hors ligne : recherche impossible.';
    return;
  }
  $('#search-status').textContent = 'Recherche…';
  $('#search-results').innerHTML = '';
  try {
    const b = map.getBounds();
    const params = new URLSearchParams({
      q, format: 'jsonv2', limit: '8', countrycodes: 'jp', 'accept-language': 'fr,en,ja',
      viewbox: [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(','),
    });
    const r = await fetch('https://nominatim.openstreetmap.org/search?' + params);
    const data = await r.json();
    lastResults = data.map((d) => ({ name: d.name || d.display_name.split(',')[0], detail: d.display_name, lat: +d.lat, lng: +d.lon }));
    $('#search-status').textContent = lastResults.length ? '' : 'Aucun résultat. Essayez en anglais ou en japonais.';
    $('#search-results').innerHTML = lastResults.map((r, i) => `<li data-i="${i}"><b>${esc(r.name)}</b><small>${esc(r.detail)}</small></li>`).join('');
  } catch {
    $('#search-status').textContent = 'Erreur de recherche.';
  }
});

$('#search-results').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const r = lastResults[+li.dataset.i];
  $('#dlg-add').close();
  openPointDialog(null, r);
});

$('#add-tap').addEventListener('click', () => {
  $('#dlg-add').close();
  setPending({ type: 'add' }, 'Touchez la carte pour placer le point');
});

$('#add-gps').addEventListener('click', () => {
  locate((pos) => {
    $('#dlg-add').close();
    openPointDialog(null, { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'Ma position' });
  });
});

// --- Point ---
function openPointDialog(pid, draft) {
  const f = $('#point-form');
  const el = f.elements;
  el.dayId.innerHTML = state.days.map((d) => `<option value="${esc(d.id)}">${esc(dayLabel(d))}</option>`).join('');
  let p;
  if (pid) {
    const found = findPoint(pid);
    if (!found) return;
    p = found.point;
    editing = { pid };
    el.dayId.value = found.day.id;
    $('#point-heading').textContent = 'Modifier le point';
  } else {
    p = { name: draft.name || '', lat: draft.lat, lng: draft.lng, time: '', note: '', hotel: false, photo: '', credit: '' };
    editing = { draft: p };
    el.dayId.value = currentDayId;
    $('#point-heading').textContent = 'Nouveau point';
  }
  el.title.value = p.name;
  el.time.value = p.time;
  el.note.value = p.note;
  el.hotel.checked = p.hotel;
  $('#point-photo').hidden = !p.photo;
  $('#point-photo img').src = p.photo || '';
  $('#point-photo figcaption').textContent = p.credit ? 'Photo : ' + p.credit : '';
  $('#point-coords').innerHTML = `${icon('pin', 15)} ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  $('#point-goto').href = dirUrl([p]);
  $('#point-extra').hidden = !pid;
  $('#point-delete').hidden = !pid;
  $('#dlg-point').showModal();
}

$('#point-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const el = e.target.elements;
  const name = el.title.value.trim();
  if (!name) return;
  const target = getDay(el.dayId.value);
  const fields = { name, time: el.time.value, note: el.note.value.trim(), hotel: el.hotel.checked };
  if (editing.pid) {
    const { day, point } = findPoint(editing.pid);
    Object.assign(point, fields);
    if (target && target !== day) {
      day.points.splice(day.points.indexOf(point), 1);
      target.points.push(point);
    }
  } else if (target) {
    target.points.push({ id: uid(), lat: editing.draft.lat, lng: editing.draft.lng, ...fields });
  }
  save();
  $('#dlg-point').close();
  render();
});

$('#point-move').addEventListener('click', () => {
  const pid = editing.pid;
  $('#dlg-point').close();
  setPending({ type: 'move', pid }, 'Touchez la carte à la nouvelle position');
});

$('#point-delete').addEventListener('click', () => {
  const { day, point } = findPoint(editing.pid);
  if (!confirm(`Supprimer « ${point.name} » ?`)) return;
  day.points.splice(day.points.indexOf(point), 1);
  save();
  $('#dlg-point').close();
  render();
});

// --- Jour ---
function openDayDialog(id) {
  const el = $('#day-form').elements;
  editingDayId = id;
  const d = id && getDay(id);
  if (d) {
    el.title.value = d.title;
    el.date.value = d.date;
    el.color.value = d.color;
    $('#day-heading').textContent = 'Modifier ' + `J${dayIndex(d) + 1}`;
  } else {
    const last = [...state.days].reverse().find((x) => x.date);
    el.title.value = '';
    el.date.value = last ? addDaysIso(last.date, 1) : '';
    el.color.value = COLORS[state.days.length % COLORS.length];
    $('#day-heading').textContent = 'Nouveau jour';
  }
  $('#day-delete').hidden = !d;
  $('#dlg-day').showModal();
}

$('#day-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const el = e.target.elements;
  const fields = { title: el.title.value.trim(), date: el.date.value, color: el.color.value };
  let id = editingDayId;
  if (id) Object.assign(getDay(id), fields);
  else {
    id = uid();
    state.days.push({ id, points: [], ...fields });
  }
  save();
  $('#dlg-day').close();
  selectDay(id);
});

$('#day-delete').addEventListener('click', () => {
  const d = getDay(editingDayId);
  if (!confirm(`Supprimer ${dayLabel(d)} et ses ${d.points.length} point(s) ?`)) return;
  state.days.splice(state.days.indexOf(d), 1);
  save();
  $('#dlg-day').close();
  selectDay(null);
});

// --- Restaurant ---
let editingRestoId = null;
function openRestoDialog(id) {
  const el = $('#resto-form').elements;
  const r = id && state.restaurants.find((x) => x.id === id);
  editingRestoId = r ? r.id : null;
  $('#resto-cities').innerHTML = restoCities().map((c) => `<option value="${esc(c)}">`).join('');
  el.title.value = r ? r.name : '';
  el.city.value = r ? r.city : restoCity;
  el.kind.value = r ? r.kind : 'food';
  el.note.value = r ? r.note : '';
  el.place.value = r ? r.query || `${r.lat}, ${r.lng}` : '';
  el.noFish.checked = r ? r.noFish : false;
  el.when.value = r ? r.when : '';
  $('#resto-heading').textContent = r ? 'Modifier le restaurant' : 'Nouveau restaurant';
  $('#resto-delete').hidden = !r;
  $('#dlg-resto').showModal();
}

$('#resto-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const el = e.target.elements;
  const name = el.title.value.trim();
  if (!name) return;
  const place = el.place.value.trim();
  const coords = parseCoords(place);
  const r = state.restaurants.find((x) => x.id === editingRestoId);
  // Même recherche qu'avant : on garde la position déjà connue sur la carte.
  const kept = !coords && r && hasPlace(r) && r.query === (place || name) ? { lat: r.lat, lng: r.lng, approx: r.approx } : {};
  const fields = {
    name, city: el.city.value.trim(), kind: el.kind.value, note: el.note.value.trim(), noFish: el.noFish.checked, when: el.when.value.trim(),
    ...(coords || { query: place || name, ...kept }),
  };
  if (r) {
    delete r.lat; delete r.lng; delete r.query; delete r.approx;
    Object.assign(r, fields);
  } else {
    state.restaurants.push({ id: uid(), done: false, ...fields });
  }
  save();
  $('#dlg-resto').close();
  render();
});

$('#resto-delete').addEventListener('click', () => {
  const r = state.restaurants.find((x) => x.id === editingRestoId);
  if (!confirm(`Supprimer « ${r.name} » ?`)) return;
  state.restaurants.splice(state.restaurants.indexOf(r), 1);
  save();
  $('#dlg-resto').close();
  render();
});

// --- Menu ---
$('#btn-menu').addEventListener('click', async () => {
  $('#trip-name').value = state.name;
  fillBasemaps();
  const day = currentDayId && getDay(currentDayId);
  $('#menu-download').innerHTML = icon('download') + `Télécharger la carte hors-ligne (${day ? `J${dayIndex(day) + 1}` : 'tout le voyage'})`;
  $('#storage-info').textContent = '';
  $('#dlg-menu').showModal();
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    $('#storage-info').textContent = `Espace utilisé : ${(usage / 1048576).toFixed(1)} Mo`;
  }
});

function fillBasemaps() {
  $('#basemap').innerHTML = Object.entries(BASEMAPS).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
  $('#basemap').value = basemap;
}
$('#basemap').addEventListener('change', (e) => {
  setPref('basemap-v3', e.target.value); // seul un choix explicite est mémorisé
  setBasemap(e.target.value);
});

$('#trip-name').addEventListener('change', (e) => {
  state.name = e.target.value.trim() || 'Voyage au Japon';
  save();
  renderSheet();
});

$('#menu-export').addEventListener('click', async () => {
  const json = JSON.stringify(state, null, 2);
  const name = `voyage-japon-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: state.name }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

$('#menu-import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = normalize(JSON.parse(await file.text()));
    if (!confirm(`Remplacer le voyage actuel par « ${data.name} » (${data.days.length} jours) ?`)) return;
    state = data;
    save();
    $('#dlg-menu').close();
    selectDay(null);
  } catch {
    alert('Fichier invalide.');
  }
});

$('#menu-clear-tiles').addEventListener('click', async () => {
  if (!('caches' in window) || !confirm('Supprimer toutes les cartes téléchargées ?')) return;
  await caches.delete(TILE_CACHE);
  $('#dlg-menu').close();
});

// ============ Cartes hors ligne ============
function tileXY(lat, lng, z) {
  const n = 2 ** z;
  const r = lat * Math.PI / 180;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

function addBox(set, templates, z, north, west, south, east) {
  const [x1, y1] = tileXY(north, west, z);
  const [x2, y2] = tileXY(south, east, z);
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) templates.forEach((u) => set.add(fillTemplate(u, z, x, y)));
}

// Rayon (km) téléchargé autour de chaque point, selon le niveau de zoom.
// Les tuiles vectorielles s'arrêtent au zoom 14 : au-delà, MapLibre redessine les mêmes données.
const RASTER_RADIUS_KM = { 11: 8, 12: 5, 13: 3, 14: 2, 15: 1.2, 16: 0.7, 17: 0.4, 18: 0.2 };
const VECTOR_RADIUS_KM = { 8: 30, 9: 20, 10: 12, 11: 6, 12: 4, 13: 2.5, 14: 1.5 };
const JAPAN = [45.6, 129.3, 30.9, 146];

function addAround(set, templates, points, radius, minZ, maxZ) {
  for (const p of points) {
    for (const [z, km] of Object.entries(radius)) {
      if (+z < minZ || +z > maxZ) continue;
      const dLat = km / 111, dLng = km / (111 * Math.cos(p.lat * Math.PI / 180));
      addBox(set, templates, +z, p.lat + dLat, p.lng - dLng, p.lat - dLat, p.lng + dLng);
    }
  }
}

const getJson = async (url) => (await fetch(url)).json();

async function offlineUrls(points) {
  const b = BASEMAPS[basemap];
  const set = new Set();
  if (!b.style) {
    for (let z = 5; z <= 8; z++) addBox(set, b.urls, z, ...JAPAN); // vue d'ensemble du Japon
    addAround(set, b.urls, points, RASTER_RADIUS_KM, 0, b.maxNative);
    return [...set];
  }
  // Fond vectoriel : le style, ses icônes, ses polices (lettres latines) et ses tuiles.
  set.add(b.style);
  const style = await getJson(b.style);
  const sprites = Array.isArray(style.sprite) ? style.sprite.map((s) => s.url) : [style.sprite];
  for (const s of sprites.filter(Boolean)) ['.json', '.png', '@2x.json', '@2x.png'].forEach((ext) => set.add(s + ext));
  const fonts = new Set();
  for (const l of style.layers) {
    const f = l.layout?.['text-font'];
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) fonts.add(f.join(','));
  }
  for (const f of fonts) {
    for (const r of ['0-255', '256-511', '8192-8447']) set.add(new URL(style.glyphs.replace('{fontstack}', f).replace('{range}', r)).href);
  }
  for (const src of Object.values(style.sources)) {
    let { tiles: templates, minzoom = 0, maxzoom = 14 } = src;
    if (src.url) {
      set.add(src.url);
      const tj = await getJson(src.url);
      ({ tiles: templates, minzoom = 0, maxzoom = 14 } = tj);
    }
    if (!templates) continue;
    for (let z = Math.max(minzoom, 0); z <= Math.min(maxzoom, 6); z++) addBox(set, templates, z, ...JAPAN);
    addAround(set, templates, points, VECTOR_RADIUS_KM, minzoom, maxzoom);
  }
  return [...set];
}

let abortDownload = false;
$('#menu-download').addEventListener('click', async () => {
  if (!('caches' in window)) return alert('Le cache n’est pas disponible (ouvrez l’app via https).');
  if (!navigator.onLine) return alert('Connexion nécessaire pour télécharger les cartes.');
  const days = currentDayId ? [getDay(currentDayId)] : state.days;
  const points = days.flatMap((d) => d.points);
  if (!points.length) return alert('Ajoutez d’abord des points : la carte est téléchargée autour d’eux.');
  let urls;
  try {
    urls = await offlineUrls(points);
  } catch {
    return alert('Impossible de préparer le téléchargement (réseau ?).');
  }
  const mb = Math.round(urls.length * (BASEMAPS[basemap].kbPerTile || 30) / 1024);
  if (!confirm(`Télécharger ${urls.length} fichiers de carte (≈ ${mb} Mo) autour de ${points.length} point(s) ?\nIdéalement en Wi-Fi.`)) return;
  $('#dlg-menu').close();

  const cache = await caches.open(TILE_CACHE);
  let i = 0, done = 0, failed = 0;
  abortDownload = false;
  showBanner(`Téléchargement… 0 / ${urls.length}`, 'Arrêter', () => { abortDownload = true; });
  const worker = async () => {
    while (i < urls.length && !abortDownload) {
      const url = urls[i++];
      try {
        if (!(await cache.match(tileKey(url), { ignoreVary: true }))) {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) await cache.put(tileKey(url), res);
          else failed++;
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 10 === 0) $('#banner-text').textContent = `Téléchargement… ${done} / ${urls.length}`;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const msg = abortDownload ? 'Téléchargement arrêté.' : failed ? `Terminé, ${failed} tuile(s) en échec.` : 'Cartes disponibles hors ligne';
  showBanner(msg, 'OK', hideBanner);
  setTimeout(hideBanner, 5000);
});

// ============ Géolocalisation ============
function locate(onSuccess) {
  if (!navigator.geolocation) return alert('Géolocalisation indisponible.');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const at = [pos.coords.longitude, pos.coords.latitude];
      if (!meMarker) {
        const el = document.createElement('div');
        el.className = 'me-dot';
        meMarker = new maplibregl.Marker({ element: el }).setLngLat(at).addTo(map);
      } else {
        meMarker.setLngLat(at);
      }
      onSuccess(pos);
    },
    (err) => alert('Position introuvable : ' + err.message),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
  );
}

$('#btn-locate').addEventListener('click', () => {
  locate((pos) => map.easeTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: Math.max(map.getZoom(), 15) }));
});

// ============ Hors ligne ============
function updateOnline() { $('#offline-pill').hidden = navigator.onLine; }
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js');
}

// ============ Démarrage ============
// Itinéraire de base plus récent (ex. visites ajoutées) : proposer de remplacer les données enregistrées.
const baseVersion = +window.DEFAULT_TRIP?.base || 0;
if (state.base < baseVersion) {
  const empty = state.days.every((d) => d.points.every((p) => p.hotel));
  if (empty || confirm('Un itinéraire plus complet est disponible (visites, horaires, restaurants).\nRemplacer votre itinéraire actuel ? Vos modifications du programme seront perdues.')) {
    // Restos : on garde les cases « Testé » (par nom) et les restaurants ajoutés à la main.
    const old = state.restaurants;
    state = normalize(window.DEFAULT_TRIP);
    const tested = new Set(old.filter((r) => r.done).map((r) => r.name));
    state.restaurants.forEach((r) => { r.done = tested.has(r.name); });
    const names = new Set(state.restaurants.map((r) => r.name));
    state.restaurants.push(...old.filter((r) => !/^r\d+$/.test(r.id) && !names.has(r.name)));
  }
  state.base = baseVersion; // ne plus redemander
  save();
}

// Photos des lieux : mises en cache dès le lancement pour être visibles hors ligne.
if ('caches' in window && location.protocol !== 'file:') {
  caches.open(PHOTO_CACHE).then(async (cache) => {
    const urls = new Set([...state.days.flatMap((d) => d.points.map((p) => p.photo)), ...state.restaurants.map((r) => r.photo)].filter(Boolean));
    for (const u of urls) {
      const url = new URL(u, location.href).href;
      if (!(await cache.match(url))) await cache.add(url).catch(() => {});
    }
  });
}

if (currentDayId && !getDay(currentDayId)) {
  currentDayId = lastDayId = null;
  tab = 'overview';
}
// Pendant le voyage : ouvrir le jour J au premier lancement de la journée.
const todayDay = state.days.find((d) => d.date === todayIso());
if (todayDay && pref('autoDay', '') !== todayIso()) {
  currentDayId = lastDayId = todayDay.id;
  tab = 'day';
  setPref('currentDay', currentDayId);
  setPref('autoDay', todayIso());
}
render();
fitView(false);
