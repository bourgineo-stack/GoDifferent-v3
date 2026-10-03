// Bilan PDF personnel. Construit uniquement à partir des données enregistrées (pas de l'écran),
// donc identique même après un rechargement de la page.
import { ALTERNATIVES, FREINS, LEVIERS, ENGAGEMENTS, MODES, SEMAINES_TRAVAILLEES, COUT_KM_VOITURE } from './constants.js?v=6i';
import { THEMES, PHASES } from './contenu.js?v=6i';
import { facteurKm } from './calc.js?v=6i';
import { CONFIG } from './config.js?v=6i';

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// Palette (RVB) : les quatre fils du logo + encre
const C = {
  encre: [21, 19, 42], doux: [110, 106, 140], ligne: [226, 223, 240], fondDoux: [246, 245, 252],
  bleu: [43, 168, 224], vert: [96, 160, 40], vertClair: [234, 245, 222], orange: [247, 147, 30], orangeClair: [254, 240, 224],
  violet: [107, 75, 176], violetClair: [238, 233, 250], blanc: [255, 255, 255]
};
const FILS = [C.bleu, [140, 198, 63], C.orange, [142, 111, 216]];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

// Nombres « 6 802,7 » : jsPDF ne sait pas dessiner l'espace fine insécable du français (elle sortait en « / »)
const nb = (x, d = 0) => x.toLocaleString('fr-FR', { maximumFractionDigits: d }).replace(/[\u202f\u00a0]/g, ' ');
const moins = x => (Math.round(x) > 0 ? `-${nb(x)}` : '0'); // pas de « -0 »

function loadJsPdf() {
  if (window.jspdf) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = JSPDF_URL; s.onload = ok; s.onerror = () => ko(new Error('jsPDF indisponible'));
    document.head.appendChild(s);
  });
}

// Le logo (webp, non lu par jsPDF) converti en PNG via un canvas
function logoPng() {
  return new Promise(ok => {
    const img = new Image();
    img.onload = () => {
      const c = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
      c.getContext('2d').drawImage(img, 0, 0);
      ok({ data: c.toDataURL('image/png'), ratio: img.naturalWidth / img.naturalHeight });
    };
    img.onerror = () => ok(null);
    img.src = 'logo.webp';
  });
}

const libelle = (dico, v) => v?.startsWith('autre: ') ? v.slice(7) : (dico[v] || v || '');

export async function telechargerBilan({ reponse, profile, contacts, groupe }) {
  await loadJsPdf();
  const logo = await logoPng();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 16, W = 178, BAS = 279;
  let y = 0, page = 1;
  const d = reponse.data;

  // ---------- Outils ----------
  const fill = c => doc.setFillColor(...c);
  const ink = c => doc.setTextColor(...c);
  const draw = c => doc.setDrawColor(...c);
  const font = (t, g = false) => { doc.setFontSize(t); doc.setFont('helvetica', g ? 'bold' : 'normal'); };
  const txt = (t, x, yy, o) => doc.text(String(t), x, yy, o);
  const carte = (x, yy, w, h, fond, r = 4) => { fill(fond); doc.roundedRect(x, yy, w, h, r, r, 'F'); };
  const place = h => { if (y + h > BAS) { pied(); doc.addPage(); page++; entetePetit(); } };
  const lignes = (t, larg, taille) => { font(taille); return doc.splitTextToSize(String(t), larg); };

  function filCouleurs(yy, h = 1.6) { FILS.forEach((c, i) => { fill(c); doc.rect(i * 52.5, yy, 52.5, h, 'F'); }); }
  function entete(titre, sousTitre) {
    fill(C.encre); doc.rect(0, 0, 210, 34, 'F');
    if (logo) doc.addImage(logo.data, 'PNG', L, 8, 18 * logo.ratio, 18);
    font(15, true); ink(C.blanc); txt(titre, L + W, 15, { align: 'right' });
    font(9); ink([200, 196, 230]); txt(sousTitre, L + W, 22, { align: 'right' });
    filCouleurs(34);
    y = 46;
  }
  function entetePetit() {
    fill(C.encre); doc.rect(0, 0, 210, 12, 'F'); filCouleurs(12, 1);
    font(8, true); ink(C.blanc); txt('GoDifferent', L, 8); font(8); txt(profile.pseudo, L + W, 8, { align: 'right' });
    y = 22;
  }
  function pied() {
    draw(C.ligne); doc.setLineWidth(0.3); doc.line(L, 284, L + W, 284);
    font(7.5); ink(C.doux);
    txt('GoDifferent, ateliers de mobilité durable. Document personnel, à conserver.', L, 289);
    txt(`${page}`, L + W, 289, { align: 'right' });
  }
  function titre(t, couleur = C.violet) {
    place(14);
    fill(couleur); doc.roundedRect(L, y, 3, 7, 1, 1, 'F');
    font(12, true); ink(C.encre); txt(t, L + 6, y + 5.5);
    y += 10.5;
  }
  // Pastilles à la suite, retour à la ligne automatique
  function pastilles(items, fond, texte) {
    let x = L;
    font(9.5, true);
    items.forEach(t => {
      const w = doc.getTextWidth(t) + 8;
      if (x + w > L + W) { x = L; y += 10; }
      place(10);
      carte(x, y, w, 7.5, fond, 3.7); ink(texte); txt(t, x + 4, y + 5.1);
      x += w + 3;
    });
    y += 12;
  }

  // ---- Hypothèses (en fin de document) ----
  function hypotheses() {
  const hyp = `Distance à vol d'oiseau multipliée par 1,3. ${SEMAINES_TRAVAILLEES} semaines travaillées par an. Facteur d'émission de votre trajet actuel : ${nb(reponse.facteur * 1000)} g CO2e par km et par personne. Économies calculées sur l'usage de la voiture uniquement (${String(COUT_KM_VOITURE).replace('.', ',')} euro par km), hors coût de l'alternative. Gain espéré = minimum garanti + (objectif - minimum) x probabilité indiquée.`;
  const l = lignes(hyp, W - 10, 7.5);
  place(l.length * 3.3 + 10);
  carte(L, y, W, l.length * 3.3 + 8, C.fondDoux, 3);
  font(7.5, true); ink(C.doux); txt('HYPOTHÈSES DE CALCUL', L + 5, y + 5);
  font(7.5); doc.text(l, L + 5, y + 9.5);
  y += l.length * 3.3 + 12;
  }

  // ===================== PAGE 1 =====================
  entete('Mon bilan mobilité', `${profile.pseudo}  ·  ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`);
  const pas = d.engagement === 'pas_maintenant' || d.alternative_1 === 'aucun';

  // ---- Chiffre principal ----
  carte(L, y, W, 35, pas ? C.fondDoux : C.vertClair, 6);
  font(10, true); ink(pas ? C.doux : C.vert);
  txt(pas ? 'VOS ÉMISSIONS ACTUELLES' : 'VOTRE RÉDUCTION ESPÉRÉE', L + 10, y + 9);
  font(34, true); ink(pas ? C.encre : C.vert);
  txt(pas ? nb(d.emissions_actuelles_kg) : moins(d.gain_espere_kg), L + 10, y + 24);
  const largeur = doc.getTextWidth(pas ? nb(d.emissions_actuelles_kg) : moins(d.gain_espere_kg));
  font(13, true); txt('kg CO2 / an', L + 13 + largeur, y + 24);
  font(9); ink(C.doux);
  txt(pas ? "Pas de changement prévu pour l'instant : chaque trajet comptera, le jour venu."
    : `Soit l'équivalent de ${nb(d.gain_espere_kg / facteurKm('car-thermal'))} km parcourus en voiture thermique.`, L + 10, y + 30.5);
  y += 40;

  // ---- Trois paliers ----
  if (!pas) {
    const w = (W - 8) / 3;
    [['MINIMUM GARANTI', d.gain_potentiel_min_kg, C.bleu, false], ['ESPÉRÉ', d.gain_espere_kg, C.vert, true], ['OBJECTIF', d.gain_potentiel_max_kg, [142, 111, 216], false]]
      .forEach(([l, v, c, fort], i) => {
        const x = L + i * (w + 4);
        carte(x, y, w, 18, fort ? c : C.fondDoux, 4);
        if (!fort) { fill(c); doc.rect(x, y + 3, 1.6, 12, 'F'); }
        font(7.5, true); ink(fort ? C.blanc : C.doux); txt(l, x + w / 2, y + 7, { align: 'center' });
        font(15, true); ink(fort ? C.blanc : C.encre); txt(`${moins(v)} kg`, x + w / 2, y + 14.5, { align: 'center' });
      });
    y += 23;
    if (d.economie_max_euros > 0) {
      carte(L, y, W, 11, C.orangeClair, 4);
      font(10, true); ink([170, 90, 0]);
      txt(`Jusqu'à ${nb(d.economie_max_euros)} euros par an d'économie sur l'usage de la voiture, si vous atteignez votre objectif.`, L + 6, y + 7);
      y += 14;
    }
  }

  // ---- Le trajet, dessiné ----
  titre('Votre trajet aujourd\'hui', C.bleu);
  place(34);
  const mode = MODES[d.transport_actuel] || d.transport_actuel;
  const pelote = CONFIG.PELOTES.find(p => p.modes.includes(d.transport_actuel));
  const coul = pelote ? hex(pelote.hex) : C.doux;
  const x1 = L + 8, x2 = L + 108;
  draw(coul); doc.setLineWidth(1.6); doc.line(x1, y + 10, x2, y + 10);
  fill(C.blanc); draw(coul); doc.setLineWidth(1.2); doc.circle(x1, y + 10, 4, 'FD');
  fill(C.violet); doc.circle(x2, y + 10, 4, 'F');
  font(7, true); ink(C.doux); txt('DOMICILE', x1, y + 19, { align: 'center' }); txt('TRAVAIL', x2, y + 19, { align: 'center' });
  font(11, true); ink(C.encre); txt(`${nb(d.distance_km, 1)} km`, (x1 + x2) / 2, y + 7, { align: 'center' });
  font(9); ink(C.doux);
  txt(d.transport_secondaire ? `${mode} ${d.mode1_days} j + ${MODES[d.transport_secondaire]} ${d.mode2_days} j` : mode, (x1 + x2) / 2, y + 16, { align: 'center' });
  // Indicateurs à droite
  [['Km par an', `${nb(reponse.kmAn)} km`], ['Émissions', `${nb(d.emissions_actuelles_kg)} kg CO2`], ['Rythme', `${d.jours_presence} j/sem, départ ${d.heure_depart}`]]
    .forEach(([l, v], i) => { font(7.5, true); ink(C.doux); txt(l.toUpperCase(), L + 122, y + 2 + i * 10); font(10, true); ink(C.encre); txt(v, L + 122, y + 6.5 + i * 10); });
  y += 28;

  // ---- Choix ----
  titre('Vos choix pour changer', C.orange);
  place(20);
  carte(L, y, W, 16, C.fondDoux, 4); fill(C.orange); doc.rect(L, y + 3, 1.6, 10, 'F');
  font(7.5, true); ink(C.doux); txt('PREMIER CHOIX', L + 6, y + 6);
  font(12, true); ink(C.encre); txt(ALTERNATIVES[d.alternative_1] || '', L + 6, y + 12.5);
  if (d.alternative_1 !== 'aucun') { font(11, true); ink(C.vert); txt(`${moins(d.gain_max_kg)} kg si 100 % des trajets`, L + W - 6, y + 10, { align: 'right' }); }
  y += 20;
  if (d.alternative_2) {
    place(10);
    font(10); ink(C.doux); txt(`Plan B : ${ALTERNATIVES[d.alternative_2]}`, L + 6, y + 4);
    font(10, true); ink(C.encre); txt(`${moins(reponse.gain2)} kg si 100 %`, L + W - 6, y + 4, { align: 'right' });
    y += 9;
  }
  // Engagement : jauge de la part des trajets visée
  place(20);
  font(10, true); ink(C.encre); txt(ENGAGEMENTS[d.engagement] || '', L, y + 4);
  if (!pas) {
    const jx = L, jw = W, jy = y + 8;
    fill(C.ligne); doc.roundedRect(jx, jy, jw, 4, 2, 2, 'F');
    fill(C.vert); doc.roundedRect(jx + jw * d.frequency_min, jy, Math.max(2, jw * (d.frequency_max - d.frequency_min)), 4, 2, 2, 'F');
    font(8); ink(C.doux);
    txt(`De ${nb(d.frequency_min * 100)} % à ${nb(d.frequency_max * 100)} % de vos trajets, probabilité d'y arriver : ${nb(d.proba_max * 100)} %`, L, jy + 9);
    y += 22;
  } else y += 8;

  // ---- Freins et leviers ----
  const freins = [d.frein_1, d.frein_2].filter(Boolean).map(f => libelle(FREINS, f));
  const leviers = [d.levier_1, d.levier_2].filter(Boolean).map(l => libelle(LEVIERS, l));
  // Deux colonnes côte à côte : freins à gauche, leviers à droite
  // Pastilles sur une ou deux lignes (les libellés longs ne sont plus coupés)
  const hauteurs = items => items.map(t => { font(9.5, true); return doc.splitTextToSize(t, 78).slice(0, 2).length * 4.2 + 3.8; });
  const total = items => hauteurs(items).reduce((a, h) => a + h + 2, 0);
  place(12 + Math.max(total(freins), total(leviers)));
  const colonne = (x, nom, items, accent, fond, texte) => {
    fill(accent); doc.roundedRect(x, y, 3, 7, 1, 1, 'F');
    font(12, true); ink(C.encre); txt(nom, x + 6, y + 5.5);
    let yy = y + 11;
    items.forEach((t, i) => {
      font(9.5, true);
      const ln = doc.splitTextToSize(t, 78).slice(0, 2), h = hauteurs([t])[0];
      carte(x, yy, 86, h, fond, 3.5);
      ink(texte); doc.text(ln, x + 4, yy + 5.2);
      yy += h + 2;
    });
  };
  colonne(L, 'Ce qui vous freine', freins, C.orange, C.orangeClair, [150, 80, 0]);
  colonne(L + 92, 'Ce qui vous aiderait', leviers, C.vert, C.vertClair, [60, 110, 20]);
  y += 14 + Math.max(total(freins), total(leviers));

  // ---- Voisins ----
  const voisins = [...contacts].filter(c => c.distance < CONFIG.DISTANCE_THRESHOLD_KM).sort((a, b) => a.distance - b.distance).slice(0, 8);
  if (voisins.length) {
    place(26); // le titre ne reste pas seul en bas de page
    titre('Vos voisins, pour covoiturer', C.bleu);
    pastilles(voisins.map(v => `${v.pseudo}  ${nb(v.distance, 1)} km`), [228, 243, 251], [20, 100, 140]);
  }

  if (!groupe?.distance) hypotheses();
  pied();

  // ===================== PAGE 2 : le groupe =====================
  if (groupe?.distance) {
    doc.addPage(); page++;
    const dist = groupe.distance === 'proche' ? 'proche' : 'eloigne';
    entete('La voix de votre groupe', dist === 'proche' ? 'Groupe habitant près du travail' : 'Groupe habitant loin du travail');
    let data = {}, notes = {};
    try { data = JSON.parse(groupe.data || '{}'); } catch { /* absentes */ }
    try { notes = JSON.parse(groupe.phaseNotes || '{}'); } catch { /* absentes */ }

    THEMES[dist].forEach((t, i) => {
      const k = i === 0 ? 'theme1' : 'theme2', dt = data[k] || {}, nt = notes[k] || {}, col = hex(t.couleur);
      titre(t.nom, col);
      const barres = (titreBloc, items) => {
        if (!items.length) return;
        const max = Math.max(...items.map(x => x.n));
        place(8); font(8, true); ink(C.doux); txt(titreBloc.toUpperCase(), L, y + 3); y += 6;
        items.forEach(x => {
          place(8);
          font(9.5); ink(C.encre); txt(doc.splitTextToSize(x.t, 92)[0], L, y + 4);
          fill(C.ligne); doc.roundedRect(L + 96, y + 1, 70, 3.5, 1.7, 1.7, 'F');
          fill(col); doc.roundedRect(L + 96, y + 1, Math.max(3, 70 * x.n / max), 3.5, 1.7, 1.7, 'F');
          font(9.5, true); txt(String(x.n), L + W, y + 4, { align: 'right' });
          y += 7;
        });
        y += 2;
      };
      barres('Freins identifiés ensemble (voix)', [...(dt.freins || [])].sort((a, b) => b.votes - a.votes).slice(0, 4).map(f => ({ t: f.text, n: f.votes })));
      barres('Valeurs prioritaires (voix)', Object.entries(dt.valeurs || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => ({ t: v, n })));
      barres('Engagements pris ensemble (personnes)', (dt.engagements || []).map(e => ({ t: e.text, n: e.count })));
      PHASES.forEach(p => {
        if (!nt[p.key]) return;
        const ln = lignes(`${p.nom} : ${nt[p.key]}`, W - 6, 9);
        place(ln.length * 4 + 2); font(9); ink(C.doux); doc.text(ln, L + 3, y + 3.5); y += ln.length * 4 + 2;
      });
      if (!(dt.freins || []).length && !Object.keys(dt.valeurs || {}).length && !(dt.engagements || []).length) {
        font(9); ink(C.doux); txt('Aucun vote enregistré sur ce sujet.', L, y + 3); y += 7;
      }
      y += 3;
    });

    if (groupe.notes) {
      const ln = lignes(groupe.notes, W - 22, 11);
      place(ln.length * 5 + 22);
      carte(L, y, W, ln.length * 5 + 16, C.violetClair, 6);
      font(40, true); ink([142, 111, 216]); txt('"', L + 6, y + 17);
      font(8, true); ink(C.violet); txt('LE MOT DE LA FIN', L + 18, y + 7);
      font(11, true); ink(C.encre); doc.text(ln, L + 18, y + 13);
      y += ln.length * 5 + 20;
    }
    y += 4;
    hypotheses();
    pied();
  }

  doc.save(`bilan-mobilite-${profile.pseudo}.pdf`);
}
