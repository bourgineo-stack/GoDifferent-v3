// Clôture de l'atelier, depuis le tableau de bord animateur :
// 1. archive Excel complète (sans coordonnées), 2. dossier PDME pour le générateur,
// 3. compte rendu PDF pour l'entreprise, 4. effacement des données dans Firestore.
import { db } from './firebase.js';
import { collection, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { roadKm, bearing, direction, trajetActuel } from './calc.js';
import { MODES, ALTERNATIVES, FREINS, LEVIERS, ENGAGEMENTS, COUT_KM_VOITURE, SEMAINES_TRAVAILLEES } from './constants.js';
import { THEMES } from './contenu.js';
import { CONFIG } from './config.js';
import { lignesCalculees, MIN_VOITURES } from './lignes.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const SOUS_COLLECTIONS = ['participants', 'participantScans', 'rencontres', 'retrouvailles', 'groups', 'responses', 'meta'];

const charger = (url, test) => test() ? Promise.resolve() : new Promise((ok, ko) => {
  const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => ko(new Error(`Chargement impossible : ${url}`));
  document.head.appendChild(s);
});
const telecharger = (nom, contenu, type) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([contenu], { type })), download: nom });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const libelle = (dico, v) => v?.startsWith('autre: ') ? `Autre : ${v.slice(7)}` : (dico[v] || v || '');
const nb = (x, d = 0) => (x || 0).toLocaleString('fr-FR', { maximumFractionDigits: d }).replace(/[\u202f\u00a0]/g, ' ');
const jour = () => new Date().toLocaleDateString('sv-SE');

// ===================== Les données, une seule fois et sans coordonnées =====================
export function dossier(S) {
  const work = { lat: S.ws.companyLat, lon: S.ws.companyLon };
  const id12 = id => id.slice(0, 12);
  const parts = [...S.participants.entries()].map(([id, p]) => ({ id, p, t: trajetActuel(p, work) }));
  const pseudo = new Map(parts.map(x => [id12(x.id), x.p.pseudo || '?']));
  const reponse = new Map([...S.responses.values()].map(r => [r.participantId, r]));
  const groupes = [...S.groups.entries()].filter(([, g]) => g.distance).map(([gid, g], i) => ({ gid, nom: `G${i + 1}`, g }));
  const groupeDe = new Map();
  groupes.forEach(({ nom, g }) => [g.scribeId12, ...(g.memberIds || [])].forEach(m => m && groupeDe.set(m, nom)));

  // Rencontres (paires uniques)
  const paires = new Map();
  S.rencontres.forEach(r => { const k = [r.fromId12, r.toId12].sort().join('|'); if (!paires.has(k)) paires.set(k, r); });
  const pos = new Map(parts.map(x => [id12(x.id), x.p]));
  const rencontres = [...paires.values()].map(r => {
    const a = pos.get(r.fromId12), b = pos.get(r.toId12);
    return { 'Pseudo A': pseudo.get(r.fromId12) || r.fromPseudo || '?', 'Pseudo B': pseudo.get(r.toId12) || '?', 'Distance entre domiciles (km)': a && b ? +roadKm(a, b).toFixed(1) : '' };
  });
  const nbRencontres = id => [...paires.values()].filter(r => r.fromId12 === id || r.toId12 === id).length;

  // Binômes potentiels : conducteurs seuls habitant à moins du seuil l'un de l'autre (appariement glouton)
  const seuls = parts.filter(x => ['car-thermal', 'car-electric'].includes(x.p.transport));
  const candidats = [];
  for (let i = 0; i < seuls.length; i++) for (let j = i + 1; j < seuls.length; j++) {
    const d = roadKm(seuls[i].p, seuls[j].p);
    if (d < CONFIG.DISTANCE_THRESHOLD_KM) candidats.push({ a: seuls[i], b: seuls[j], d });
  }
  candidats.sort((x, y) => x.d - y.d);
  const pris = new Set(), binomes = [];
  candidats.forEach(c => {
    if (pris.has(c.a.id) || pris.has(c.b.id)) return;
    pris.add(c.a.id); pris.add(c.b.id);
    const secteur = `${direction(bearing(work, c.a.p)).replace(/^au |^à l'/, '')}, ${nb(c.a.t.distanceKm)} km`;
    binomes.push({ p: [c.a.p.pseudo, c.b.p.pseudo], s: secteur, d: +c.d.toFixed(1), e: Math.round(Math.min(c.a.t.emissions, c.b.t.emissions)) });
  });

  // Tables de l'archive
  const tParticipants = parts.map(({ id, p, t }) => ({
    Pseudo: p.pseudo, 'Mode principal': MODES[p.transport] || p.transport, 'Mode secondaire': MODES[p.transport2] || '',
    'Jours mode principal': p.transport2 ? p.mode1Days : '', 'Jours mode secondaire': p.transport2 ? p.mode2Days : '',
    'Jours par semaine': p.joursPresence, 'Allers-retours par jour': p.nbTrajetsAR, 'Heure de départ': p.departureTime,
    'Distance domicile-travail (km)': +t.distanceKm.toFixed(1), 'Direction depuis le travail': direction(bearing(work, p)).replace(/^au |^à l'/, ''),
    'Km par an': Math.round(t.kmAn), 'Émissions (kg CO2/an)': Math.round(t.emissions), 'Rencontres': nbRencontres(id12(id)), 'Groupe': groupeDe.get(id12(id)) || ''
  }));
  const tEngagements = parts.filter(x => reponse.get(x.id)).map(({ id, p }) => {
    const r = reponse.get(id);
    return {
      Pseudo: p.pseudo, 'Alternative 1': ALTERNATIVES[r.alternative_1] || r.alternative_1, 'Alternative 2': ALTERNATIVES[r.alternative_2] || '',
      'Frein 1': libelle(FREINS, r.frein_1), 'Frein 2': libelle(FREINS, r.frein_2), 'Levier 1': libelle(LEVIERS, r.levier_1), 'Levier 2': libelle(LEVIERS, r.levier_2),
      Engagement: ENGAGEMENTS[r.engagement] || r.engagement, 'Part des trajets min (%)': Math.round((r.frequency_min || 0) * 100),
      'Part des trajets max (%)': Math.round((r.frequency_max || 0) * 100), 'Probabilité (%)': Math.round((r.proba_max || 0) * 100),
      'Gain si 100 % (kg/an)': r.gain_max_kg || 0, 'Gain garanti (kg/an)': r.gain_potentiel_min_kg || 0,
      'Gain espéré (kg/an)': r.gain_espere_kg ?? '', 'Gain objectif (kg/an)': r.gain_potentiel_max_kg || 0, 'Économie max (€/an)': r.economie_max_euros ?? ''
    };
  });
  const tGroupes = groupes.flatMap(({ nom, g }) => {
    let data = {}, notes = {};
    try { data = JSON.parse(g.data || '{}'); } catch { /* vide */ }
    try { notes = JSON.parse(g.phaseNotes || '{}'); } catch { /* vide */ }
    const dist = g.distance === 'proche' ? 'proche' : 'eloigne';
    return THEMES[dist].map((t, i) => {
      const k = i === 0 ? 'theme1' : 'theme2', d = data[k] || {}, n = notes[k] || {};
      return {
        Groupe: nom, Scribe: pseudo.get(g.scribeId12) || g.scribePseudo || '', Personnes: (g.memberIds || []).length + 1,
        Parcours: dist === 'proche' ? 'Près du travail' : 'Loin du travail', Sujet: t.nom,
        'Freins (voix)': (d.freins || []).sort((a, b) => b.votes - a.votes).map(f => `${f.text} (${f.votes})`).join(' ; '),
        'Valeurs (voix)': Object.entries(d.valeurs || {}).sort((a, b) => b[1] - a[1]).map(([v, c]) => `${v} (${c})`).join(' ; '),
        'Engagements (personnes)': (d.engagements || []).map(e => `${e.text} (${e.count})`).join(' ; '),
        'Notes intérêts': n.revelation || '', 'Notes freins': n.freins || '', 'Notes action': n.action || '',
        'Mot de la fin': i === 0 ? (g.notes || '') : ''
      };
    });
  });

  // Indicateurs
  const co2 = parts.reduce((s, x) => s + x.t.emissions, 0);
  const cout = parts.reduce((s, x) => s + x.t.kmAn * x.t.partVoiture * COUT_KM_VOITURE, 0);
  const gain = [...S.responses.values()].reduce((s, r) => s + (r.gain_espere_kg ?? 0), 0);
  const indicateurs = {
    'Code atelier': S.code, 'Date de clôture': jour(), 'Adresse du site': S.ws.companyAddress || '',
    'Participants inscrits': parts.length, 'Participants attendus': S.attendus || S.ws.expectedParticipants || '',
    'Rencontres': paires.size, 'Groupes': groupes.length, 'Engagements validés': S.responses.size,
    'Émissions domicile-travail (t CO2/an)': +(co2 / 1000).toFixed(1), 'Coût voiture domicile-travail (€/an)': Math.round(cout),
    'Réduction espérée (t CO2/an)': +(gain / 1000).toFixed(1), 'Réduction espérée (% des émissions)': co2 ? Math.round(gain / co2 * 100) : 0,
    'Binômes de covoiturage potentiels': binomes.length,
    ...(lignesCalculees() ? {
      [`Km de routes partagées par au moins ${MIN_VOITURES} conducteurs seuls`]: Math.round(lignesCalculees().kmPartages),
      'Tronçon le plus chargé (conducteurs seuls)': lignesCalculees().max
    } : {}),
    'Hypothèses': `Distance vol d'oiseau x 1,3 ; ${SEMAINES_TRAVAILLEES} semaines/an ; coût voiture ${COUT_KM_VOITURE} €/km ; seuil de voisinage ${CONFIG.DISTANCE_THRESHOLD_KM} km`
  };

  // Format attendu par le générateur de PDME (v7)
  const TRANSPORT_V7 = { 'car-thermal': 'Voiture solo', 'car-electric': 'Voiture solo', carpool: 'Covoiturage', bike: 'Vélo', ebike: 'Vélo', train: 'TC', bus: 'TC', walk: 'Marche', remote: 'Télétravail' };
  const ENG_V7 = { pret: 'Prêt à changer', interesse: 'Prêt à essayer', pas_maintenant: 'Pas maintenant' };
  const pdme = {
    participants: parts.map(({ id, p, t }, i) => {
      const r = reponse.get(id), alternatif = !['car-thermal', 'car-electric'].includes(p.transport);
      return {
        id: 'P' + String(i + 1).padStart(3, '0'), emoji: p.pseudo, transport: TRANSPORT_V7[p.transport] || p.transport,
        distance_km: +t.distanceKm.toFixed(1), frein_1: r ? libelle(FREINS, r.frein_1) : '', levier_1: r ? libelle(LEVIERS, r.levier_1) : '',
        engagement: r ? ENG_V7[r.engagement] : (alternatif ? 'Déjà alternatif' : ''), emissions_kg: Math.round(t.emissions), gain_max: r?.gain_max_kg || 0
      };
    }),
    binomes,
    groupes: groupes.map(({ nom, g }) => {
      let data = {}; try { data = JSON.parse(g.data || '{}'); } catch { /* vide */ }
      const dist = g.distance === 'proche' ? 'proche' : 'eloigne';
      const freins = Object.values(data).flatMap(d => d.freins || []).sort((a, b) => b.votes - a.votes).slice(0, 3).map(f => f.text);
      return { id: nom, dist: dist === 'proche' ? 'Près du travail' : 'Loin du travail', th: THEMES[dist].map(t => t.nom).join(', '),
        n: [g.notes, freins.length ? `Freins principaux : ${freins.join(', ')}.` : ''].filter(Boolean).join(' ') };
    })
  };

  return {
    version: 'godifferent-v3', code: S.code, date: jour(),
    entreprise: { adresse: S.ws.companyAddress || '', date_atelier: jour() },
    indicateurs, binomes, pdme,
    tables: { Participants: tParticipants, Engagements: tEngagements, Groupes: tGroupes, Rencontres: rencontres,
      'Binômes potentiels': binomes.map(b => ({ 'Pseudo A': b.p[0], 'Pseudo B': b.p[1], 'Secteur': b.s, 'Distance entre domiciles (km)': b.d, 'Gain si covoiturage quotidien (kg/an)': b.e })) }
  };
}

// ===================== 1. Archive Excel =====================
export async function archiveExcel(S) {
  await charger(XLSX_URL, () => window.XLSX);
  const d = dossier(S), wb = window.XLSX.utils.book_new();
  const synthese = Object.entries(d.indicateurs).map(([Indicateur, Valeur]) => ({ Indicateur, Valeur }));
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(synthese), 'Synthèse');
  Object.entries(d.tables).forEach(([nom, lignes]) =>
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(lignes.length ? lignes : [{ Information: 'Aucune donnée' }]), nom.slice(0, 31)));
  window.XLSX.writeFile(wb, `atelier-${S.code}-${d.date}.xlsx`);
}

// ===================== 2. Dossier PDME =====================
export function dossierPdme(S) {
  const d = dossier(S);
  telecharger(`dossier-pdme-${S.code}-${d.date}.json`, JSON.stringify({ version: d.version, code: d.code, date: d.date, entreprise: d.entreprise, indicateurs: d.indicateurs, data: d.pdme }, null, 2), 'application/json');
}

// ===================== 3. Compte rendu PDF pour l'entreprise =====================
export async function compteRendu(S) {
  await charger(JSPDF_URL, () => window.jspdf);
  const d = dossier(S), I = d.indicateurs;
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const L = 16, W = 178; let y = 0, page = 1;
  const C = { encre: [21, 19, 42], doux: [110, 106, 140], ligne: [226, 223, 240], fond: [246, 245, 252], vert: [96, 160, 40], orange: [247, 147, 30], violet: [107, 75, 176] };
  const FILS = [[43, 168, 224], [140, 198, 63], [247, 147, 30], [142, 111, 216]];
  const font = (t, g) => { doc.setFontSize(t); doc.setFont('helvetica', g ? 'bold' : 'normal'); };
  const ink = c => doc.setTextColor(...c), fill = c => doc.setFillColor(...c);
  const pied = () => { font(7.5); ink(C.doux); doc.text("GoDifferent, ateliers de mobilité durable. Données agrégées et anonymes.", L, 289); doc.text(String(page), L + W, 289, { align: 'right' }); };
  const place = h => { if (y + h > 278) { pied(); doc.addPage(); page++; y = 20; } };
  const titre = (t, c = C.violet) => { place(14); fill(c); doc.roundedRect(L, y, 3, 7, 1, 1, 'F'); font(12, true); ink(C.encre); doc.text(t, L + 6, y + 5.5); y += 11; };
  const texte = (t, taille = 9.5, c = C.encre) => { font(taille); ink(c); const l = doc.splitTextToSize(String(t), W); place(l.length * 4.3); doc.text(l, L, y + 3.5); y += l.length * 4.3 + 1.5; };
  const barres = (compte, libelles, couleur) => {
    const tri = Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 6), max = tri[0]?.[1] || 1;
    if (!tri.length) return texte('Aucune réponse.', 9, C.doux);
    tri.forEach(([k, v]) => {
      place(7); font(9.5); ink(C.encre); doc.text(doc.splitTextToSize(libelles[k] || k, 90)[0], L, y + 4);
      fill(C.ligne); doc.roundedRect(L + 95, y + 1, 70, 3.5, 1.7, 1.7, 'F'); fill(couleur); doc.roundedRect(L + 95, y + 1, Math.max(3, 70 * v / max), 3.5, 1.7, 1.7, 'F');
      font(9.5, true); doc.text(String(v), L + W, y + 4, { align: 'right' }); y += 7;
    });
    y += 2;
  };

  // En-tête
  fill(C.encre); doc.rect(0, 0, 210, 32, 'F'); FILS.forEach((c, i) => { fill(c); doc.rect(i * 52.5, 32, 52.5, 1.6, 'F'); });
  font(17, true); ink([247, 147, 30]); doc.text('GoDifferent', L, 15);
  font(14, true); ink([255, 255, 255]); doc.text("Compte rendu de l'atelier mobilité", L + W, 14, { align: 'right' });
  font(9); ink([200, 196, 230]); doc.text(`${I['Adresse du site'] || S.code}  ·  ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, L + W, 21, { align: 'right' });
  y = 44;

  // Chiffres clés
  const cles = [[`${I['Participants inscrits']}`, 'participants'], [`${I['Rencontres']}`, 'rencontres'], [`${nb(I['Émissions domicile-travail (t CO2/an)'], 1)} t`, 'CO2 par an aujourd\'hui'],
    [`${nb(I['Coût voiture domicile-travail (€/an)'])} €`, 'par an en voiture'], [`-${nb(I['Réduction espérée (t CO2/an)'], 1)} t`, 'CO2 par an espérés'], [`${I['Binômes de covoiturage potentiels']}`, 'binômes de covoiturage']];
  const cw = (W - 10) / 3;
  cles.forEach(([v, l], i) => {
    const x = L + (i % 3) * (cw + 5), yy = y + Math.floor(i / 3) * 22;
    fill(i === 4 ? [234, 245, 222] : C.fond); doc.roundedRect(x, yy, cw, 19, 3, 3, 'F');
    font(15, true); ink(i === 4 ? C.vert : C.encre); doc.text(v, x + cw / 2, yy + 9, { align: 'center' });
    font(8); ink(C.doux); doc.text(l, x + cw / 2, yy + 15, { align: 'center' });
  });
  y += 48;

  // Diagnostic
  titre('Comment viennent les salariés', [43, 168, 224]);
  const mc = {}; d.tables.Participants.forEach(p => { mc[p['Mode principal']] = (mc[p['Mode principal']] || 0) + 1; });
  barres(mc, {}, [43, 168, 224]);
  const bandes = { 'Moins de 5 km': 0, '5 à 15 km': 0, '15 à 30 km': 0, 'Plus de 30 km': 0 };
  d.tables.Participants.forEach(p => { const k = p['Distance domicile-travail (km)']; bandes[k < 5 ? 'Moins de 5 km' : k < 15 ? '5 à 15 km' : k < 30 ? '15 à 30 km' : 'Plus de 30 km']++; });
  titre('Distances domicile-travail', [43, 168, 224]); barres(bandes, {}, [140, 198, 63]);

  // Engagements
  const E = d.tables.Engagements;
  titre('Ce que les salariés sont prêts à changer', C.vert);
  texte(`${E.length} engagements validés. Réduction espérée : ${nb(I['Réduction espérée (t CO2/an)'], 1)} t de CO2 par an, soit ${I['Réduction espérée (% des émissions)']} % des émissions actuelles du trajet domicile-travail.`);
  const cnt = k => E.reduce((m, r) => { if (r[k]) m[r[k]] = (m[r[k]] || 0) + 1; return m; }, {});
  barres(cnt('Alternative 1'), {}, C.vert);
  titre('Freins exprimés', C.orange);
  const fr = {}; E.forEach(r => ['Frein 1', 'Frein 2'].forEach(k => { if (r[k]) fr[r[k]] = (fr[r[k]] || 0) + 1; })); barres(fr, {}, C.orange);
  titre('Leviers attendus de l\'employeur', C.vert);
  const lv = {}; E.forEach(r => ['Levier 1', 'Levier 2'].forEach(k => { if (r[k]) lv[r[k]] = (lv[r[k]] || 0) + 1; })); barres(lv, {}, C.vert);

  // Groupes
  if (d.tables.Groupes.length) {
    titre('La parole des groupes', C.violet);
    d.tables.Groupes.forEach(g => {
      place(16); font(10, true); ink(C.encre); doc.text(`${g.Groupe} (${g.Personnes} personnes), ${g.Sujet}`, L, y + 4); y += 6;
      if (g['Freins (voix)']) texte(`Freins : ${g['Freins (voix)']}`, 9);
      if (g['Engagements (personnes)']) texte(`Engagements : ${g['Engagements (personnes)']}`, 9);
      if (g['Mot de la fin']) texte(`« ${g['Mot de la fin']} »`, 9, C.doux);
      y += 2;
    });
  }

  // Covoiturage
  if (d.binomes.length) {
    titre('Covoiturage : binômes potentiels', [247, 147, 30]);
    texte(`${d.binomes.length} paires de conducteurs seuls habitent à moins de ${CONFIG.DISTANCE_THRESHOLD_KM} km l'une de l'autre. Covoiturer chaque jour éviterait jusqu'à ${nb(d.binomes.reduce((s, b) => s + b.e, 0) / 1000, 1)} t de CO2 par an.`);
    texte(d.binomes.map(b => `${b.s} (${nb(b.d, 1)} km entre domiciles)`).join(' ; '), 8.5, C.doux);
  }

  // Lignes de covoiturage : schéma des routes partagées (calculé depuis l'onglet « Carte réelle »)
  const lg = lignesCalculees();
  if (lg?.troncons.length) {
    titre('Les lignes de covoiturage, sur les vraies routes', [247, 147, 30]);
    texte(`${nb(lg.kmPartages)} km de routes sont empruntés chaque matin par au moins ${MIN_VOITURES} conducteurs seuls, jusqu'à ${lg.max} sur le même tronçon. Plus le trait est épais, plus ils sont nombreux.`);
    const H = 95; place(H + 6);
    const pts = lg.troncons.flatMap(t => [t.a, t.b]).concat([[S.ws.companyLat, S.ws.companyLon]]);
    const la = pts.map(p => p[0]), lo = pts.map(p => p[1]);
    const kx = Math.cos((Math.min(...la) + Math.max(...la)) / 2 * Math.PI / 180);
    const larg = (Math.max(...lo) - Math.min(...lo)) * kx || 0.01, haut = (Math.max(...la) - Math.min(...la)) || 0.01;
    const ech = Math.min((W - 10) / larg, (H - 10) / haut), ox = L + (W - larg * ech) / 2, oy = y + (H - haut * ech) / 2;
    const xy = p => [ox + (p[1] - Math.min(...lo)) * kx * ech, oy + (Math.max(...la) - p[0]) * ech];
    fill(C.fond); doc.roundedRect(L, y, W, H, 3, 3, 'F');
    [...lg.troncons].sort((a, b) => a.n - b.n).forEach(t => {
      const [x1, y1] = xy(t.a), [x2, y2] = xy(t.b);
      doc.setDrawColor(247, Math.round(147 - 60 * (t.n - MIN_VOITURES) / Math.max(1, lg.max - MIN_VOITURES)), 30);
      doc.setLineWidth(0.5 + (t.n - MIN_VOITURES) * 0.35); doc.setLineCap('round'); doc.line(x1, y1, x2, y2);
    });
    const [wx, wy] = xy([S.ws.companyLat, S.ws.companyLon]);
    fill(C.violet); doc.circle(wx, wy, 2.2, 'F'); font(8, true); ink(C.violet); doc.text('Lieu de travail', wx + 3.5, wy + 1);
    y += H + 4;
  }

  titre('Méthode et confidentialité', C.doux);
  texte(`${I['Hypothèses']}. Les engagements sont des intentions déclarées. Ce compte rendu ne contient que des données agrégées : aucune adresse, coordonnée ni réponse individuelle. Les données collectées pendant l'atelier sont effacées de la base à sa clôture.`, 8, C.doux);
  pied();
  doc.save(`compte-rendu-atelier-${S.code}-${d.date}.pdf`);
}

// ===================== 4. Effacement dans Firestore =====================
export async function effacer(code) {
  let total = 0;
  for (const nom of SOUS_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'workshops', code, nom));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const lot = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach(d => lot.delete(d.ref));
      await lot.commit();
    }
    total += snap.size;
  }
  return total;
}
