// Carte réelle des lignes de covoiturage.
// Pour chaque conducteur seul, l'itinéraire routier réel est demandé à l'IGN (Géoplateforme, gratuit,
// sans clé, 5 requêtes/s maximum). On compte ensuite combien de voitures empruntent chaque tronçon.
// Confidentialité : seuls les tronçons utilisés par au moins MIN_VOITURES conducteurs s'affichent,
// et les premiers kilomètres de chaque trajet sont ignorés (on ne remonte pas à un domicile).
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const TUILES = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const ITINERAIRE = 'https://data.geopf.fr/navigation/itineraire';
export const MIN_VOITURES = 3;
const DEBUT_IGNORE_KM = 1.5;
const PAUSE_MS = 230; // un peu plus de 4 requêtes par seconde

let carte = null, calque = null, renderer = null;
const cache = new Map();     // id participant -> liste de points [lat, lon]
let resultat = null;         // dernières lignes calculées (sert aussi au compte rendu PDF)
export const lignesCalculees = () => resultat;

const pause = ms => new Promise(r => setTimeout(r, ms));
const km = (a, b) => {
  const R = 6371, rad = x => x * Math.PI / 180, dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function chargerLeaflet() {
  if (window.L) return Promise.resolve();
  document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: LEAFLET_CSS }));
  return new Promise((ok, ko) => {
    const s = Object.assign(document.createElement('script'), { src: LEAFLET_JS, onload: ok, onerror: () => ko(new Error('Leaflet indisponible')) });
    document.head.appendChild(s);
  });
}

export async function afficherCarte(conteneur, work, adresse) {
  await chargerLeaflet();
  if (!carte) {
    carte = window.L.map(conteneur, { zoomControl: true, attributionControl: true }).setView([work.lat, work.lon], 11);
    window.L.tileLayer(TUILES, { maxZoom: 15, minZoom: 6, attribution: '© IGN, Plan IGN' }).addTo(carte); // zoom limité : pas de vue à la rue
    renderer = window.L.canvas({ padding: 0.3 });
    window.L.circleMarker([work.lat, work.lon], { radius: 11, color: '#fff', weight: 3, fillColor: '#8E6FD8', fillOpacity: 1 })
      .bindTooltip(adresse || 'Lieu de travail', { permanent: true, direction: 'top', className: 'etiquette-travail', offset: [0, -12] }).addTo(carte);
  }
  setTimeout(() => carte.invalidateSize(), 50);
  return carte;
}

async function itineraire(depart, work) {
  const url = `${ITINERAIRE}?resource=bdtopo-osrm&profile=car&optimization=fastest&geometryFormat=geojson&getSteps=false&getBbox=false` +
    `&start=${depart.lon},${depart.lat}&end=${work.lon},${work.lat}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`IGN ${r.status}`);
  const d = await r.json();
  const geo = typeof d.geometry === 'string' ? JSON.parse(d.geometry) : d.geometry;
  return (geo?.coordinates || []).map(([lon, lat]) => [lat, lon]);
}

// Calcule les tronçons partagés. onProgres(fait, total) pour afficher l'avancement.
export async function calculerLignes(conducteurs, work, onProgres = () => {}) {
  let fait = 0, echecs = 0;
  for (const c of conducteurs) {
    if (!cache.has(c.id)) {
      try { cache.set(c.id, await itineraire(c, work)); }
      catch (e) { echecs++; console.warn('Itinéraire indisponible', e); }
      await pause(PAUSE_MS);
    }
    onProgres(++fait, conducteurs.length);
  }

  // Tronçon = deux sommets consécutifs (le même moteur renvoie les mêmes sommets sur une route commune)
  const troncons = new Map();
  conducteurs.forEach(c => {
    const pts = cache.get(c.id);
    if (!pts?.length) return;
    let parcouru = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      parcouru += km(a, b);
      if (parcouru < DEBUT_IGNORE_KM) continue;
      const cle = `${a[0].toFixed(5)},${a[1].toFixed(5)}|${b[0].toFixed(5)},${b[1].toFixed(5)}`;
      if (!troncons.has(cle)) troncons.set(cle, { a, b, ids: new Set() });
      troncons.get(cle).ids.add(c.id);
    }
  });
  const partages = [...troncons.values()].filter(t => t.ids.size >= MIN_VOITURES).map(t => ({ a: t.a, b: t.b, n: t.ids.size }));
  resultat = {
    troncons: partages,
    conducteurs: conducteurs.length,
    echecs,
    kmPartages: partages.reduce((s, t) => s + km(t.a, t.b), 0),
    max: partages.reduce((m, t) => Math.max(m, t.n), 0)
  };
  return resultat;
}

// Couleur de l'orange (3 voitures) au jaune clair (tronçon le plus chargé)
function couleur(n, max) {
  const k = max > MIN_VOITURES ? (n - MIN_VOITURES) / (max - MIN_VOITURES) : 1;
  const mix = (x, y) => Math.round(x + (y - x) * k);
  return `rgb(${mix(247, 255)},${mix(147, 236)},${mix(30, 160)})`;
}

export function dessinerLignes(res, work) {
  if (!carte) return;
  calque?.remove();
  calque = window.L.layerGroup().addTo(carte);
  const tri = [...res.troncons].sort((x, y) => x.n - y.n); // les plus chargés dessinés par-dessus
  tri.forEach(t => {
    const w = Math.min(18, 3 + (t.n - MIN_VOITURES) * 2.2);
    window.L.polyline([t.a, t.b], { renderer, weight: w + 8, color: couleur(t.n, res.max), opacity: 0.18, lineCap: 'round' }).addTo(calque); // halo
    window.L.polyline([t.a, t.b], { renderer, weight: w, color: couleur(t.n, res.max), opacity: 0.95, lineCap: 'round' }).addTo(calque);
  });
  const pts = res.troncons.flatMap(t => [t.a, t.b]);
  if (pts.length) carte.fitBounds(window.L.latLngBounds([...pts, [work.lat, work.lon]]), { padding: [30, 30], maxZoom: 13 });
}
