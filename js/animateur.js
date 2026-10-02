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
    svg.innerHTML = `<g id="fond"></g><g id="fils"></g><g id="points"></g>
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

// ----- Rejouer la matinée : chaque fil part vers le centre à l'heure de départ de la personne -----
let rejeu = null;
function rejouer() {
  cancelAnimationFrame(rejeu);
  const parts = calculer().parts.filter(p => p.transport !== 'remote');
  const fils = $('#fils'); fils.innerHTML = '';
  if (!parts.length) return;
  const minutes = p => { const [h, m] = (p.departureTime || '07:30').split(':').map(Number); return h * 60 + m; };
  const debut = Math.min(...parts.map(minutes)) - 15, fin = Math.max(...parts.map(minutes)) + 15;
  const DUREE = 20000, t0 = performance.now(), partis = new Set();
  $('#replay-heure').hidden = false;
  const pas = now => {
    const k = Math.min(1, (now - t0) / DUREE), m = debut + (fin - debut) * k;
    $('#replay-heure').textContent = `${String(Math.floor(m / 60)).padStart(2, '0')} h ${String(Math.floor(m % 60)).padStart(2, '0')}`;
    parts.forEach(p => {
      if (partis.has(p.id) || minutes(p) > m) return;
      partis.add(p.id);
      const { x, y } = position(p);
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      Object.entries({ x1: x, y1: y, x2: C0, y2: C0, stroke: peloteDe(p.transport).hex }).forEach(([a, v]) => l.setAttribute(a, v));
      l.classList.add('fil');
      fils.appendChild(l);
    });
    if (k < 1) rejeu = requestAnimationFrame(pas);
  };
  rejeu = requestAnimationFrame(pas);
}

// ===================== Démonstration (aucune donnée Firestore) =====================
function demo() {
  S.code = 'DÉMONSTRATION';
  S.ws = { companyLat: 47.322, companyLon: 5.041, capacity: 60 };
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
