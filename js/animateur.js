// Tableau de bord animateur : à projeter pendant l'atelier.
// Lecture seule. Écoute en temps réel des 4 sous-collections (une lecture par document au départ,
// puis une par nouveauté) : de l'ordre de 2 000 à 3 000 lectures pour tout un atelier.
import { db, auth } from './firebase.js';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';
import { roadKm, bearing, trajetActuel } from './calc.js';
import { ALTERNATIVES, FREINS, COUT_KM_VOITURE } from './constants.js';
import { CONFIG } from './config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (x, d = 0) => x.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });

const S = { ws: null, code: '', participants: new Map(), rencontres: new Map(), groups: new Map(), responses: new Map() };
const TELETRAVAIL = { nom: 'Télétravail', hex: '#8A86A8', pour: 'Télétravail' };
const peloteDe = mode => CONFIG.PELOTES.find(p => p.modes.includes(mode)) || TELETRAVAIL;

// ===================== Connexion =====================
$('#btn-google').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    const snap = await getDocs(collection(db, 'workshops'));
    const today = new Date().toLocaleDateString('sv-SE');
    const ateliers = snap.docs.map(d => ({ code: d.id, ...d.data() }))
      .sort((a, b) => (b.expirationDate || '').localeCompare(a.expirationDate || ''));
    $('#atelier').innerHTML = ateliers.map(a =>
      `<option value="${esc(a.code)}">${esc(a.code)}${a.expirationDate < today ? ' (expiré)' : ''}</option>`).join('');
    $('#btn-google').hidden = true;
    $('#choix-atelier').hidden = false;
  } catch (e) { erreur(`Connexion impossible : ${e.code || e.message}`); }
});

$('#btn-ouvrir').addEventListener('click', async () => {
  const code = $('#atelier').value;
  try {
    const snap = await getDoc(doc(db, 'workshops', code));
    S.ws = snap.data(); S.code = code;
    ouvrir();
    ['participants', 'rencontres', 'groups', 'responses'].forEach(col =>
      onSnapshot(collection(db, 'workshops', code, col), s => {
        s.docChanges().forEach(ch => ch.type === 'removed' ? S[col].delete(ch.doc.id) : S[col].set(ch.doc.id, ch.doc.data()));
        planifier();
      }, e => erreur(`Lecture impossible (${col}) : ${e.code}`)));
  } catch (e) { erreur(`Atelier illisible : ${e.code || e.message}`); }
});

$('#btn-demo').addEventListener('click', demo);
$('#btn-plein').addEventListener('click', () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
$('#btn-replay').addEventListener('click', rejouer);

function erreur(m) { $('#accueil-erreur').textContent = m; $('#accueil-erreur').hidden = false; }

function ouvrir() {
  $('#accueil').hidden = true;
  $('#tableau').hidden = false;
  $('#code-atelier').textContent = S.code;
  // Le centre de la carte = l'adresse de l'entreprise saisie dans l'outil admin
  $('#centre').textContent = `Centre : ${S.ws.companyAddress || `${(+S.ws.companyLat).toFixed(4)}, ${(+S.ws.companyLon).toFixed(4)}`}`;
  // Invitation : QR vers l'app participant (même dossier), code déjà rempli
  const url = `${location.href.replace(/animateur\.html.*$/, '')}?code=${encodeURIComponent(S.code)}`;
  const qr = (el, taille) => { el.innerHTML = ''; new window.QRCode(el, { text: url, width: taille, height: taille, colorDark: '#15132A', colorLight: '#ffffff' }); };
  qr($('#mini-qr'), 64);
  $('#btn-inviter').onclick = () => {
    qr($('#grand-qr'), Math.min(innerHeight * 0.7, innerWidth * 0.45));
    $('#grand-code').textContent = S.code;
    $('#grand-url').textContent = url.replace(/^https?:\/\//, '');
    $('#invitation').hidden = false;
  };
  $('#btn-fermer-invit').onclick = () => { $('#invitation').hidden = true; };
  $('#legende').innerHTML = [...CONFIG.PELOTES, TELETRAVAIL].map(p => `<li><i style="background:${p.hex}"></i>${esc(p.pour)}</li>`).join('');
  setInterval(() => { $('#horloge').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }, 1000);
  planifier();
}

// Rendu regroupé : au plus un par demi-seconde, même si 50 scans arrivent d'un coup
let attente = null;
function planifier() { if (!attente) attente = setTimeout(() => { attente = null; rendre(); }, 500); }

// ===================== Calculs =====================
const work = () => ({ lat: S.ws.companyLat, lon: S.ws.companyLon });

function calculer() {
  const parts = [...S.participants.entries()].map(([id, p]) => ({ id, ...p, t: trajetActuel(p, work()) }));
  const pos = new Map(parts.map(p => [p.id.slice(0, 12), p]));
  // Mini-défis : rencontres entre deux personnes habitant à moins du seuil (paires uniques)
  const paires = new Set();
  let defis = 0;
  S.rencontres.forEach(r => {
    const a = pos.get(r.fromId12), b = pos.get(r.toId12);
    const cle = [r.fromId12, r.toId12].sort().join('|');
    if (paires.has(cle)) return;
    paires.add(cle);
    if (a && b && roadKm(a, b) < CONFIG.DISTANCE_THRESHOLD_KM) defis++;
  });
  const reps = [...S.responses.values()];
  const gainRep = r => r.gain_espere_kg ?? ((r.gain_potentiel_min_kg || 0) + ((r.gain_potentiel_max_kg || 0) - (r.gain_potentiel_min_kg || 0)) * (r.proba_max || 0));
  return {
    parts, defis, rencontres: paires.size, reps,
    co2: parts.reduce((s, p) => s + p.t.emissions, 0),
    cout: parts.reduce((s, p) => s + p.t.kmAn * p.t.partVoiture * COUT_KM_VOITURE, 0),
    km: parts.reduce((s, p) => s + p.t.kmAn, 0),
    gain: reps.reduce((s, r) => s + gainRep(r), 0)
  };
}

// ===================== Rendu =====================
function rendre() {
  const c = calculer(), n = c.parts.length, cap = S.ws.capacity;
  $('#k-inscrits').textContent = n;
  $('#k-capacite').textContent = cap ? ` / ${cap}` : '';
  $('#k-rencontres').textContent = c.rencontres;
  $('#k-defis').textContent = c.defis;
  $('#k-groupes').textContent = S.groups.size;
  $('#k-reponses').textContent = c.reps.length;

  $('#e-co2').textContent = nf(c.co2 / 1000, 1);
  $('#e-cout').textContent = nf(Math.round(c.cout / 100) * 100);
  $('#e-km').textContent = nf(Math.round(c.km / 1000) * 1000);
  const solo = c.parts.filter(p => ['car-thermal', 'car-electric'].includes(p.transport)).length;
  $('#e-voiture').textContent = n ? `${nf(solo / n * 100)} % viennent seuls en voiture. Coût estimé à ${String(COUT_KM_VOITURE).replace('.', ',')} € par km.` : '';
  rendreModes(c.parts);

  $('#g-co2').textContent = nf(c.gain / 1000, 1);
  $('#g-part').textContent = `${nf(c.co2 ? c.gain / c.co2 * 100 : 0)} %`;
  rendreBarres('#g-alternatives', compter(c.reps.map(r => r.alternative_1)), ALTERNATIVES);
  rendreBarres('#g-freins', compter(c.reps.flatMap(r => [r.frein_1, r.frein_2]).filter(Boolean).map(f => f.startsWith('autre') ? 'autre_frein' : f)), FREINS);

  rendreJalons(c, n, cap);
  rendreCarte(c.parts);
}

const compter = liste => liste.filter(Boolean).reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});

function rendreBarres(sel, compte, libelles) {
  const tri = Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = tri[0]?.[1] || 1;
  $(sel).innerHTML = tri.length ? tri.map(([k, v]) =>
    `<li><span>${esc(libelles[k] || k)}</span><b style="--p:${v / max}"></b><em>${v}</em></li>`).join('') : '<li class="vide">En attente des réponses</li>';
}

function rendreModes(parts) {
  const n = parts.length || 1;
  const groupes = [...CONFIG.PELOTES, TELETRAVAIL].map(p => ({ p, v: parts.filter(x => peloteDe(x.transport) === p).length })).filter(g => g.v);
  $('#modes').innerHTML = groupes.map(g =>
    `<span style="flex:${g.v};background:${g.p.hex}" title="${esc(g.p.pour)}">${g.v / n >= 0.25 ? `${esc(g.p.pour)} ${nf(g.v / n * 100)} %` : g.v / n >= 0.07 ? `${nf(g.v / n * 100)} %` : ''}</span>`).join('');
}

// ----- Jalons : chaque objectif atteint allume une étape ; le dernier fait gagner la séance -----
function rendreJalons(c, n, cap) {
  const O = CONFIG.OBJECTIFS;
  const cibleInscrits = cap ? Math.ceil(cap * O.inscriptionPart) : Math.max(10, n);
  const moyRencontres = n ? (c.rencontres * 2) / n : 0;
  const jalons = [
    { nom: 'Toute la salle connectée', detail: `${n} inscrits sur ${cibleInscrits}`, p: n / cibleInscrits },
    { nom: 'Ça tisse des liens', detail: `${nf(moyRencontres, 1)} rencontres par personne, objectif ${O.rencontresParPersonne}`, p: moyRencontres / O.rencontresParPersonne },
    { nom: 'Voisins débusqués', detail: `${c.defis} mini-défis sur ${Math.ceil(n * O.defisParPersonne) || 1}`, p: c.defis / (Math.ceil(n * O.defisParPersonne) || 1) },
    { nom: "Tout le monde s'engage", detail: `${c.reps.length} engagements sur ${Math.ceil(n * O.reponsesPart) || 1}`, p: c.reps.length / (Math.ceil(n * O.reponsesPart) || 1) },
    { nom: 'Objectif climat', detail: `-${nf(c.co2 ? c.gain / c.co2 * 100 : 0)} % sur -${nf(O.reductionCO2 * 100)} % visés`, p: c.co2 ? (c.gain / c.co2) / O.reductionCO2 : 0 }
  ];
  const atteints = jalons.filter(j => j.p >= 1).length;
  $('#mission-score').textContent = jalons[4].p >= 1 ? 'Séance gagnée !' : `${atteints} jalon${atteints > 1 ? 's' : ''} sur 5`;
  $('#mission-score').classList.toggle('gagne', jalons[4].p >= 1);
  $('#jalons').innerHTML = jalons.map((j, i) =>
    `<li class="${j.p >= 1 ? 'atteint' : ''}" style="--c:var(--fil-${i % 4})">
       <span class="puce">${j.p >= 1 ? '✓' : i + 1}</span>
       <div><p class="jalon-nom">${j.nom}</p><p class="doux">${j.detail}</p>
       <span class="jauge"><b style="width:${Math.min(100, j.p * 100)}%"></b></span></div>
     </li>`).join('');
}

// ----- Carte « salle » : le travail au centre, chacun selon sa direction et sa distance -----
// Aucun fond de carte : impossible de reconnaître une adresse, et c'est la disposition de la salle.
const R = 430, C0 = 500;
let echelle = 10;

function position(p) {
  const d = roadKm(work(), p), cap = bearing(work(), p) * Math.PI / 180;
  const r = R * Math.sqrt(Math.min(d, echelle) / echelle);
  return { x: C0 + r * Math.sin(cap), y: C0 - r * Math.cos(cap), d };
}

function rendreCarte(parts) {
  const svg = $('#carte');
  const ds = parts.map(p => roadKm(work(), p)).sort((a, b) => a - b);
  const p95 = ds[Math.floor(ds.length * 0.95)] || 10;
  echelle = [5, 10, 20, 30, 50, 80, 120].find(v => v >= p95) || 120;
  const anneaux = [1, 2, 5, 10, 20, 50, 100].filter(v => v < echelle).slice(-3).concat(echelle);
  if (!svg.querySelector('#fond')) {
    svg.innerHTML = `<g id="fond"></g><g id="points"></g>
      <circle cx="${C0}" cy="${C0}" r="26" class="travail"/><text x="${C0}" y="${C0 + 6}" class="travail-txt">Travail</text>
      <text x="${C0}" y="34" class="nord">N</text>`;
  }
  svg.querySelector('#fond').innerHTML = anneaux.map(v => {
    const r = R * Math.sqrt(v / echelle);
    return `<circle cx="${C0}" cy="${C0}" r="${r}" class="anneau"/><text x="${C0 + 6}" y="${C0 - r + 18}" class="anneau-txt">${v} km</text>`;
  }).join('');
  const g = svg.querySelector('#points');
  parts.forEach(p => {
    let c = g.querySelector(`[data-id="${p.id}"]`);
    const { x, y, d } = position(p);
    if (!c) {
      c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.dataset.id = p.id; c.setAttribute('r', 11); c.classList.add('point', 'nouveau');
      g.appendChild(c);
    }
    c.setAttribute('cx', x); c.setAttribute('cy', y);
    c.setAttribute('fill', peloteDe(p.transport).hex);
    c.classList.toggle('loin', d > echelle);
  });
}

// ----- Rejouer la matinée -----
// Dynamique reprise de « Simulation pelotes » : chacun part de chez lui à son heure de départ réelle,
// à la vitesse de son mode, en suivant un réseau de routes radiales qui convergent vers le travail.
// Les fils se superposent sur les mêmes axes : c'est là que naissent les lignes de covoiturage.
const VITESSE_KMH = { 'car-thermal': 45, 'car-electric': 45, carpool: 40, bus: 22, train: 30, bike: 16, ebike: 20, walk: 5 };
const AXES = 8, ANNEAUX = 6;
let reseau = null, rejeu = null;

function aleatoire(graine) { // générateur reproductible : le réseau est le même à chaque rejeu
  return () => { graine |= 0; graine = graine + 0x6D2B79F5 | 0; let t = Math.imul(graine ^ graine >>> 15, 1 | graine); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function construireReseau() {
  const rnd = aleatoire(42), N = [{ x: 0, y: 0 }], E = [];
  for (let a = 0; a < AXES; a++) {
    const ang = (2 * Math.PI / AXES) * a + (a % 2 ? 0.15 : 0);
    let prec = 0;
    for (let r = 1; r <= ANNEAUX; r++) {
      const d = r / ANNEAUX, w = Math.sin(a * 3 + r * 2) * 0.04;
      N.push({ x: Math.sin(ang + w * r) * d * 1.08, y: -Math.cos(ang + w * r) * d * 1.08 });
      E.push([prec, N.length - 1]); prec = N.length - 1;
    }
  }
  for (let r = 1; r <= ANNEAUX; r++) for (let a = 0; a < AXES; a++) E.push([1 + a * ANNEAUX + r - 1, 1 + ((a + 1) % AXES) * ANNEAUX + r - 1]);
  for (let a = 0; a < AXES; a++) for (let r = 2; r <= ANNEAUX; r++) {
    const b = N[1 + a * ANNEAUX + r - 1], ang = (2 * Math.PI / AXES) * a + Math.PI / AXES, l = 0.08 + rnd() * 0.06;
    N.push({ x: b.x + Math.sin(ang) * l, y: b.y - Math.cos(ang) * l }); E.push([1 + a * ANNEAUX + r - 1, N.length - 1]);
  }
  const adj = N.map(() => []); E.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  const ext = a => 1 + a * ANNEAUX + ANNEAUX - 1;
  const res = { N, E, adj, tc: [] };
  res.tc = [[0, 4], [2, 6], [1, 5]].map(([a, b]) => chemin(res, ext(a), ext(b))); // trois lignes de transport en commun
  return res;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Plus court chemin, en pénalisant les tronçons qui s'éloignent de l'arrivée
function chemin(res, de, vers) {
  const n = res.N.length, d = new Float64Array(n).fill(Infinity), prec = new Int32Array(n).fill(-1), vu = new Uint8Array(n);
  d[de] = 0; const file = [[0, de]];
  while (file.length) {
    file.sort((a, b) => a[0] - b[0]);
    const [du, u] = file.shift();
    if (vu[u]) continue; vu[u] = 1; if (u === vers) break;
    for (const v of res.adj[u]) {
      let c = dist(res.N[u], res.N[v]);
      if (dist(res.N[v], res.N[vers]) > dist(res.N[u], res.N[vers])) c *= 10;
      if (du + c < d[v]) { d[v] = du + c; prec[v] = u; file.push([du + c, v]); }
    }
  }
  const p = []; for (let c = vers; c !== -1; c = prec[c]) p.unshift(c);
  return p[0] === de ? p : [de, vers];
}

const procheNoeud = (res, pt) => res.N.reduce((m, n, i) => (dist(n, pt) < dist(res.N[m], pt) ? i : m), 0);

// Supprime les retours en arrière (on ne s'éloigne jamais du travail en chemin)
function sansDetour(pts) {
  const out = [pts[0]]; let best = dist(pts[0], { x: 0, y: 0 });
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i], { x: 0, y: 0 });
    if (d <= best * 1.05 || i === pts.length - 1) { out.push(pts[i]); best = Math.min(best, d); }
  }
  if (dist(out[out.length - 1], { x: 0, y: 0 }) > 0.02) out.push({ x: 0, y: 0 });
  return out;
}

function trajetReseau(res, home, mode) {
  const depart = procheNoeud(res, home);
  let noeuds;
  if (mode === 'bus' || mode === 'train') { // marche jusqu'à la ligne la plus proche, puis ligne vers le centre
    let best = null;
    res.tc.forEach(l => l.forEach((nd, k) => { const dd = dist(res.N[depart], res.N[nd]); if (!best || dd < best.d) best = { d: dd, l, k }; }));
    const centre = best.l.reduce((m, nd, k) => (dist(res.N[nd], { x: 0, y: 0 }) < dist(res.N[best.l[m]], { x: 0, y: 0 }) ? k : m), 0);
    const ligne = best.k <= centre ? best.l.slice(best.k, centre + 1) : best.l.slice(centre, best.k + 1).reverse();
    noeuds = [...chemin(res, depart, best.l[best.k]), ...ligne.slice(1)];
  } else noeuds = chemin(res, depart, 0);
  const pts = sansDetour([home, ...noeuds.map(i => res.N[i])]);
  let longueur = 0; for (let i = 1; i < pts.length; i++) longueur += dist(pts[i - 1], pts[i]);
  return { pts, longueur };
}

function surLeTrajet(t, k) { // position à la fraction k du trajet
  let reste = k * t.longueur;
  for (let i = 1; i < t.pts.length; i++) {
    const seg = dist(t.pts[i - 1], t.pts[i]);
    if (reste <= seg) { const f = seg ? reste / seg : 0; return { x: t.pts[i - 1].x + (t.pts[i].x - t.pts[i - 1].x) * f, y: t.pts[i - 1].y + (t.pts[i].y - t.pts[i - 1].y) * f }; }
    reste -= seg;
  }
  return t.pts[t.pts.length - 1];
}

function rejouer() {
  if (rejeu) return arreterRejeu();
  reseau ||= construireReseau();
  const minutes = p => { const [h, m] = (p.departureTime || '07:30').split(':').map(Number); return h * 60 + m; };
  const gens = calculer().parts.filter(p => p.transport !== 'remote' && p.t.distanceKm > 0).map(p => {
    const { x, y } = position(p), home = { x: (x - C0) / R, y: (y - C0) / R };
    const duree = p.t.distanceKm / (VITESSE_KMH[p.transport] || 40) * 60;
    return { ...p, home, dep: minutes(p), duree, arr: minutes(p) + duree, couleur: peloteDe(p.transport).hex, trajet: trajetReseau(reseau, home, p.transport) };
  });
  if (!gens.length) return;
  const debut = Math.min(...gens.map(g => g.dep)) - 5, fin = Math.max(...gens.map(g => g.arr)) + 3;
  const DUREE_MS = 30000, t0 = performance.now();

  // Toile posée exactement sur la carte
  const svg = $('#carte'), zone = svg.parentElement;
  const cv = document.createElement('canvas'); cv.id = 'toile'; zone.appendChild(cv);
  const ctx = cv.getContext('2d');
  const caler = () => {
    const b = svg.getBoundingClientRect(), z = zone.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    Object.assign(cv.style, { left: `${b.left - z.left}px`, top: `${b.top - z.top}px`, width: `${b.width}px`, height: `${b.height}px` });
    cv.width = b.width * dpr; cv.height = b.height * dpr;
    const k = Math.min(b.width, b.height) / 1000;
    return { s: R * k * dpr, cx: (b.width / 2) * dpr, cy: (b.height / 2) * dpr, dpr };
  };
  let ech = caler();
  const ecran = p => [ech.cx + p.x * ech.s, ech.cy + p.y * ech.s];
  $('#btn-replay').textContent = 'Effacer les fils';
  $('#replay-heure').hidden = false;

  const dessiner = maintenant => {
    const m = debut + (fin - debut) * Math.min(1, (maintenant - t0) / DUREE_MS);
    ctx.clearRect(0, 0, cv.width, cv.height);
    // Réseau (discret) et lignes de transport en commun
    ctx.lineWidth = 1 * ech.dpr; ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    reseau.E.forEach(([a, b]) => { const [ax, ay] = ecran(reseau.N[a]), [bx, by] = ecran(reseau.N[b]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); });
    ctx.setLineDash([6 * ech.dpr, 4 * ech.dpr]); ctx.strokeStyle = 'rgba(236,72,153,0.25)'; ctx.lineWidth = 2 * ech.dpr;
    reseau.tc.forEach(l => { ctx.beginPath(); l.forEach((nd, i) => { const [x, y] = ecran(reseau.N[nd]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
    ctx.setLineDash([]);
    let route = 0, arrives = 0;
    gens.forEach(g => {
      if (m < g.dep) return;
      const k = Math.min(1, (m - g.dep) / Math.max(g.duree, 0.5));
      k < 1 ? route++ : arrives++;
      // Fil déroulé jusqu'à la position actuelle
      ctx.beginPath();
      let reste = k * g.trajet.longueur, [x0, y0] = ecran(g.trajet.pts[0]); ctx.moveTo(x0, y0);
      for (let i = 1; i < g.trajet.pts.length && reste > 0; i++) {
        const seg = dist(g.trajet.pts[i - 1], g.trajet.pts[i]), pt = reste >= seg ? g.trajet.pts[i] : surLeTrajet(g.trajet, k);
        const [x, y] = ecran(pt); ctx.lineTo(x, y); reste -= seg;
      }
      ctx.strokeStyle = g.couleur; ctx.lineWidth = 3 * ech.dpr; ctx.lineCap = ctx.lineJoin = 'round';
      ctx.globalAlpha = k < 1 ? 0.9 : 0.55; ctx.shadowBlur = k < 1 ? 8 * ech.dpr : 0; ctx.shadowColor = g.couleur;
      ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (k < 1) { const [x, y] = ecran(surLeTrajet(g.trajet, k)); ctx.beginPath(); ctx.arc(x, y, 7 * ech.dpr, 0, 2 * Math.PI); ctx.fillStyle = g.couleur; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * ech.dpr; ctx.stroke(); }
    });
    $('#replay-heure').textContent = `${String(Math.floor(m / 60)).padStart(2, '0')} h ${String(Math.floor(m % 60)).padStart(2, '0')} · ${route} en route · ${arrives} arrivés`;
    if (m < fin) rejeu = requestAnimationFrame(dessiner);
    else { rejeu = 'fini'; bilanAxes(gens, ctx, ecran, ech); }
  };
  rejeu = requestAnimationFrame(dessiner);
}

// Fin du rejeu : voitures seules regroupées par axe d'arrivée = lignes de covoiturage possibles
function bilanAxes(gens, ctx, ecran, ech) {
  const parAxe = Array.from({ length: AXES }, () => 0);
  gens.filter(g => ['car-thermal', 'car-electric'].includes(g.transport) && g.t.distanceKm >= CONFIG.DISTANCE_THRESHOLD_KM).forEach(g => {
    const ang = (Math.atan2(g.home.x, -g.home.y) + 2 * Math.PI) % (2 * Math.PI);
    parAxe[Math.round(ang / (2 * Math.PI / AXES)) % AXES]++;
  });
  ctx.font = `800 ${16 * ech.dpr}px 'Atkinson Hyperlegible Next', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  parAxe.forEach((n, a) => {
    if (n < 3) return;
    const ang = (2 * Math.PI / AXES) * a, [x, y] = ecran({ x: Math.sin(ang) * 0.82, y: -Math.cos(ang) * 0.82 });
    const txt = `${n} voitures seules`, w = ctx.measureText(txt).width + 18 * ech.dpr;
    ctx.fillStyle = 'rgba(14,12,34,.88)'; ctx.strokeStyle = '#F7931E'; ctx.lineWidth = 2 * ech.dpr;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 15 * ech.dpr, w, 30 * ech.dpr, 15 * ech.dpr); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFC27A'; ctx.fillText(txt, x, y);
  });
  const lignes = parAxe.filter(n => n >= 3).length;
  $('#replay-heure').textContent = lignes
    ? `${lignes} ligne${lignes > 1 ? 's' : ''} de covoiturage possible${lignes > 1 ? 's' : ''} : au moins 3 voitures seules sur le même axe`
    : 'Arrivée de tout le monde. Repérez les axes où les fils de même couleur se superposent.';
}

function arreterRejeu() {
  if (typeof rejeu === 'number') cancelAnimationFrame(rejeu);
  rejeu = null;
  $('#toile')?.remove();
  $('#replay-heure').hidden = true;
  $('#btn-replay').textContent = 'Rejouer la matinée';
}

// ===================== Démonstration (aucune donnée Firestore) =====================
function demo() {
  S.code = 'DÉMONSTRATION';
  S.ws = { companyLat: 47.322, companyLon: 5.041, capacity: 60, companyAddress: 'Dijon (démonstration)' };
  ouvrir();
  const modes = [['car-thermal', 46], ['car-electric', 6], ['carpool', 8], ['bus', 10], ['train', 6], ['bike', 12], ['ebike', 6], ['walk', 4], ['remote', 2]];
  const tirerMode = () => { let r = Math.random() * 100; for (const [m, w] of modes) { if ((r -= w) < 0) return m; } return 'car-thermal'; };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
  const ids = [];
  let i = 0;
  // Arrivée des participants
  const arrivees = setInterval(() => {
    if (i >= 58) return clearInterval(arrivees);
    const d = Math.min(60, Math.exp(Math.log(8) + 0.8 * gauss())), a = Math.random() * 2 * Math.PI;
    const lat = S.ws.companyLat + (d / 1.3 / 111) * Math.cos(a), lon = S.ws.companyLon + (d / 1.3 / 111 / Math.cos(S.ws.companyLat * Math.PI / 180)) * Math.sin(a);
    const m = Math.round(465 + 25 * gauss()), id = `u_demo${String(i).padStart(5, '0')}_x`;
    ids.push(id);
    const transport = tirerMode();
    S.participants.set(id, { lat, lon, transport, nbTrajetsAR: 1, joursPresence: 5, departureTime: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` });
    i++; planifier();
  }, 250);
  // Rencontres
  setTimeout(() => {
    const scans = setInterval(() => {
      if (S.rencontres.size > 330) return clearInterval(scans);
      const a = ids[Math.floor(Math.random() * ids.length)], b = ids[Math.floor(Math.random() * ids.length)];
      if (a !== b) S.rencontres.set(`${a}_${b}`, { fromId12: a.slice(0, 12), toId12: b.slice(0, 12) });
      planifier();
    }, 60);
  }, 4000);
  // Groupes puis engagements
  setTimeout(() => { let k = 0; const gr = setInterval(() => { if (k++ >= 9) return clearInterval(gr); S.groups.set(`g${k}`, {}); planifier(); }, 600); }, 22000);
  setTimeout(() => {
    let k = 0;
    const alts = ['covoiturage', 'covoiturage', 'velo', 'tc', 'teletravail', 'electrique', 'aucun'];
    const fr = ['horaires', 'distance', 'infrastructure', 'famille', 'info'];
    const rep = setInterval(() => {
      if (k >= ids.length - 6) return clearInterval(rep);
      const p = S.participants.get(ids[k++]), t = trajetActuel(p, work());
      const alt = alts[Math.floor(Math.random() * alts.length)];
      const part = alt === 'aucun' ? 0 : [0.2, 0.2, 0.4, 0.6][Math.floor(Math.random() * 4)];
      S.responses.set(ids[k], { alternative_1: alt, frein_1: fr[Math.floor(Math.random() * fr.length)], gain_espere_kg: t.emissions * 0.5 * part });
      planifier();
    }, 350);
  }, 28000);
}
