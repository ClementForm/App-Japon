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
const MODES = [
  ['transit', '🚆', 'Transports'],
  ['walking', '🚶', 'À pied'],
  ['driving', '🚗', 'Voiture'],
  ['bicycling', '🚲', 'Vélo'],
];

const $ = (s) => document.querySelector(s);
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
let state = load();
let currentDayId = pref('currentDay', null);
let travelMode = pref('travelMode', 'transit');
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
          photo: String(p.photo || ''),
          credit: String(p.credit || ''),
        })),
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

// Sans origine, Google Maps part de la position actuelle.
function dirUrl(pts, mode) {
  const q = new URLSearchParams({ api: '1', destination: ll(pts[pts.length - 1]), travelmode: mode });
  if (pts.length > 1) q.set('origin', ll(pts[0]));
  const mid = pts.slice(1, -1);
  if (mid.length) q.set('waypoints', mid.map(ll).join('|'));
  return 'https://www.google.com/maps/dir/?' + q;
}

// Google Maps sur mobile accepte au plus 3 étapes intermédiaires, et aucune en transports.
function routeChunks(points, mode) {
  const max = mode === 'transit' ? 2 : 5;
  const chunks = [];
  for (let i = 0; i < points.length - 1; i += max - 1) chunks.push(points.slice(i, i + max));
  return chunks;
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
map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');

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
  for (const day of state.days) {
    const active = !currentDayId || currentDayId === day.id;
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
        if (currentDayId === day.id) openPointDialog(p.id);
        else selectDay(day.id);
      });
      markers.push(new maplibregl.Marker({ element: el, opacity: active ? '1' : '0.12' }).setLngLat([p.lng, p.lat]).addTo(map));
    });
  }
}

function sheetPadding() {
  const r = $('#sheet').getBoundingClientRect();
  const wide = window.innerWidth >= 800;
  return wide
    ? { top: 80, left: r.right + 30, bottom: 40, right: 40 }
    : { top: 80, left: 30, bottom: r.height + 20, right: 30 };
}

// Un jour : vue inclinée pour voir les bâtiments en relief. Tout le voyage : vue à plat.
function fitView(animate = true) {
  const days = currentDayId ? [getDay(currentDayId)] : state.days;
  const pts = days.flatMap((d) => d.points);
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

function setPending(p, text) {
  pending = p;
  $('#map').classList.toggle('picking', !!p);
  if (p) {
    $('#sheet').classList.add('collapsed');
    showBanner(text, 'Annuler', () => setPending(null));
  } else {
    $('#sheet').classList.remove('collapsed');
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
  renderChips();
  renderSheet();
  renderMap();
}

function renderChips() {
  const chips = [`<button class="chip ${currentDayId ? '' : 'active'}" data-day="">Tout</button>`];
  for (const d of state.days) {
    const on = d.id === currentDayId;
    chips.push(`<button class="chip ${on ? 'active' : ''}" style="--c:${esc(d.color)};border-color:${esc(d.color)}" data-day="${esc(d.id)}">J${dayIndex(d) + 1}</button>`);
  }
  chips.push('<button class="chip" data-act="add-day" aria-label="Ajouter un jour">＋</button>');
  $('#chips').innerHTML = chips.join('');
  $('#chips .active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function renderSheet() {
  const day = currentDayId && getDay(currentDayId);
  $('#sheet-body').innerHTML = day ? dayHtml(day) : overviewHtml();
}

function overviewHtml() {
  const total = state.days.reduce((n, d) => n + d.points.length, 0);
  const items = state.days.map((d) => `
    <li class="item" data-day="${esc(d.id)}">
      <span class="dot" style="background:${esc(d.color)}"></span>
      <div class="info"><b>${esc(dayLabel(d))}</b><small>${esc(fmtDate(d.date))}${d.date ? ' · ' : ''}${d.points.length} point${d.points.length > 1 ? 's' : ''}</small></div>
      <span class="muted">›</span>
    </li>`).join('');
  return `
    <div class="sheet-head">
      <div class="grow"><h1>${esc(state.name)}</h1><small>${state.days.length} jour${state.days.length > 1 ? 's' : ''} · ${total} point${total > 1 ? 's' : ''}</small></div>
    </div>
    <div class="more">
      ${items ? `<ul class="list">${items}</ul>` : '<p class="empty">Aucun jour pour l’instant.<br>Créez votre premier jour de voyage.</p>'}
      <button class="primary wide" data-act="add-day">＋ Ajouter un jour</button>
    </div>`;
}

function dayHtml(day) {
  const pts = day.points;
  const modes = MODES.map(([k, icon, label]) =>
    `<button class="${k === travelMode ? 'on' : ''}" data-act="mode" data-mode="${k}" title="${label}" aria-label="${label}">${icon}</button>`).join('');

  let routes = '';
  if (pts.length === 1) {
    routes = `<a class="btn" href="${esc(dirUrl(pts, travelMode))}" target="_blank" rel="noopener">🗺️ Y aller depuis ma position</a>`;
  } else if (pts.length > 1) {
    const chunks = routeChunks(pts, travelMode);
    if (travelMode === 'transit' && chunks.length > 1) {
      routes = '<p class="muted">En transports, Google Maps n’accepte pas d’étapes : ouvrez chaque trajet avec « Itinéraire ↗ » ci-dessous.</p>';
    } else {
      routes = chunks.map((c, k) => {
        const label = chunks.length > 1 ? `Trajet ${k + 1} : ${c[0].name} → ${c[c.length - 1].name}` : 'Ouvrir le trajet dans Google Maps';
        return `<a class="btn" href="${esc(dirUrl(c, travelMode))}" target="_blank" rel="noopener">🗺️ ${esc(label)}</a>`;
      }).join('');
    }
  }

  const rows = [];
  const labels = pointLabels(pts);
  pts.forEach((p, j) => {
    if (j > 0) {
      const prev = pts[j - 1];
      rows.push(`<li class="leg">↓ ${fmtDist(distKm(prev, p))} · <a href="${esc(dirUrl([prev, p], travelMode))}" target="_blank" rel="noopener">Itinéraire ↗</a></li>`);
    }
    const sub = [p.time, p.note.split('\n')[0]].filter(Boolean).join(' · ');
    rows.push(`
      <li class="item" data-pid="${esc(p.id)}">
        <span class="badge" style="background:${esc(day.color)}">${labels[j]}</span>
        ${p.photo ? `<img class="thumb" src="${esc(p.photo)}" alt="" loading="lazy" data-act="edit-point">` : ''}
        <div class="info" data-act="edit-point"><b>${esc(p.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
        <button class="icon-btn" data-act="up" aria-label="Monter" ${j === 0 ? 'disabled' : ''}>▲</button>
        <button class="icon-btn" data-act="down" aria-label="Descendre" ${j === pts.length - 1 ? 'disabled' : ''}>▼</button>
      </li>`);
  });

  return `
    <div class="sheet-head">
      <span class="dot" style="background:${esc(day.color)}"></span>
      <div class="grow"><h1>${esc(dayLabel(day))}</h1><small>${esc(fmtDate(day.date))}${day.date ? ' · ' : ''}${pts.length} point${pts.length > 1 ? 's' : ''}</small></div>
      <button class="icon-btn" data-act="edit-day" aria-label="Modifier le jour">✎</button>
    </div>
    <div class="actions">
      <button class="primary" data-act="add-point">＋ Point</button>
      <div class="modes">${modes}</div>
    </div>
    <div class="more">
      <div class="routes">${routes}</div>
      ${rows.length ? `<ol class="list">${rows.join('')}</ol>` : '<p class="empty">Ajoutez des points avec « ＋ Point »<br>ou par un appui long sur la carte.</p>'}
    </div>`;
}

function selectDay(id) {
  currentDayId = id || null;
  setPref('currentDay', currentDayId || '');
  render();
  fitView();
}

// ============ Interactions du panneau ============
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'add-day') openDayDialog(null);
  else selectDay(b.dataset.day);
});

$('#sheet-handle').addEventListener('click', () => $('#sheet').classList.toggle('collapsed'));

$('#sheet-body').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act], [data-day]');
  if (!el) return;
  const act = el.dataset.act;
  const pid = el.closest('[data-pid]')?.dataset.pid;

  if (!act && el.dataset.day) return selectDay(el.dataset.day);
  if (act === 'add-day') return openDayDialog(null);
  if (act === 'edit-day') return openDayDialog(currentDayId);
  if (act === 'add-point') return openAddDialog();
  if (act === 'edit-point') return openPointDialog(pid);
  if (act === 'mode') {
    travelMode = el.dataset.mode;
    setPref('travelMode', travelMode);
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
  $('#point-coords').textContent = `📍 ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  $('#point-goto').href = dirUrl([p], travelMode);
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

// --- Menu ---
$('#btn-menu').addEventListener('click', async () => {
  $('#trip-name').value = state.name;
  fillBasemaps();
  const day = currentDayId && getDay(currentDayId);
  $('#menu-download').textContent = `⬇️ Télécharger la carte hors-ligne (${day ? `J${dayIndex(day) + 1}` : 'tout le voyage'})`;
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
  const msg = abortDownload ? 'Téléchargement arrêté.' : failed ? `Terminé, ${failed} tuile(s) en échec.` : 'Cartes disponibles hors ligne ✓';
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
  if (empty || confirm('Un itinéraire plus complet est disponible (visites, horaires, photos).\nRemplacer votre itinéraire actuel ? Vos modifications seront perdues.')) {
    state = normalize(window.DEFAULT_TRIP);
  }
  state.base = baseVersion; // ne plus redemander
  save();
}

// Photos des lieux : mises en cache dès le lancement pour être visibles hors ligne.
if ('caches' in window && location.protocol !== 'file:') {
  caches.open(PHOTO_CACHE).then(async (cache) => {
    const urls = new Set(state.days.flatMap((d) => d.points.map((p) => p.photo)).filter(Boolean));
    for (const u of urls) {
      const url = new URL(u, location.href).href;
      if (!(await cache.match(url))) await cache.add(url).catch(() => {});
    }
  });
}

if (currentDayId && !getDay(currentDayId)) currentDayId = null;
render();
fitView(false);
