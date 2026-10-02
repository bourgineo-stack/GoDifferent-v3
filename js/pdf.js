// Bilan PDF personnel. Construit uniquement à partir des données enregistrées (pas de l'écran),
// donc identique même après un rechargement de la page.
import { ALTERNATIVES, FREINS, LEVIERS, ENGAGEMENTS, MODES, SEMAINES_TRAVAILLEES, COUT_KM_VOITURE } from './constants.js';
import { THEMES, PHASES } from './contenu.js';
import { facteurKm } from './calc.js';
import { CONFIG } from './config.js';

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const C = { encre: [21, 19, 42], doux: [107, 103, 133], orange: [247, 147, 30], vert: [76, 140, 30], violet: [107, 75, 176], fond: [244, 242, 251] };
const kg = x => Math.round(x).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
const km1 = x => x.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

// jsPDF n'est chargé qu'au premier clic (environ 350 Ko épargnés au démarrage)
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = JSPDF_URL; s.onload = ok; s.onerror = () => ko(new Error('jsPDF indisponible'));
    document.head.appendChild(s);
  });
}

// Libellé lisible d'un frein ou levier, y compris « autre: texte libre »
const libelle = (dico, v) => v?.startsWith('autre: ') ? v.slice(7) : (dico[v] || v || '');

export async function telechargerBilan({ reponse, profile, contacts, groupe }) {
  await loadJsPdf();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 16, W = 178, BAS = 280;
  let y = 0, page = 1;
  const d = reponse.data;

  // ---- Outils de mise en page ----
  const couleur = c => doc.setTextColor(...c);
  const police = (taille, gras = false) => { doc.setFontSize(taille); doc.setFont('helvetica', gras ? 'bold' : 'normal'); };
  const place = h => { if (y + h > BAS) { pied(); doc.addPage(); page++; y = 20; } };
  const texte = (t, taille = 10, c = C.encre, gras = false, x = L, largeur = W) => {
    police(taille, gras); couleur(c);
    const lignes = doc.splitTextToSize(String(t), largeur);
    const h = lignes.length * taille * 0.42;
    place(h);
    doc.text(lignes, x, y + taille * 0.35);
    y += h + 1.5;
  };
  const titre = t => { y += 4; place(12); police(11, true); couleur(C.violet); doc.text(t.toUpperCase(), L, y + 4); y += 6; doc.setDrawColor(...C.violet); doc.setLineWidth(0.4); doc.line(L, y, L + W, y); y += 4; };
  const ligne = (a, b) => { place(7); police(10); couleur(C.doux); doc.text(a, L, y + 4); police(10, true); couleur(C.encre); doc.text(b, L + W, y + 4, { align: 'right' }); y += 7; };
  function pied() {
    police(8); couleur(C.doux);
    doc.text('GoDifferent, ateliers de mobilité durable. Document personnel.', L, 290);
    doc.text(`Page ${page}`, L + W, 290, { align: 'right' });
  }

  // ---- En-tête ----
  doc.setFillColor(...C.encre); doc.rect(0, 0, 210, 26, 'F');
  police(18, true); couleur(C.orange); doc.text('GoDifferent', L, 15);
  police(10); doc.setTextColor(255, 255, 255);
  doc.text('Mon bilan mobilité', L + W, 11, { align: 'right' });
  doc.text(`${profile.pseudo}, ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, L + W, 18, { align: 'right' });
  y = 36;

  // ---- Chiffre principal ----
  const pas = d.engagement === 'pas_maintenant' || d.alternative_1 === 'aucun';
  doc.setFillColor(...C.fond); doc.roundedRect(L, y, W, 38, 3, 3, 'F');
  police(10); couleur(C.doux);
  doc.text(pas ? 'Vos émissions actuelles' : 'Votre réduction espérée', 105, y + 9, { align: 'center' });
  police(32, true); couleur(pas ? C.encre : C.vert);
  doc.text(`${pas ? '' : '-'}${kg(pas ? d.emissions_actuelles_kg : d.gain_espere_kg)} kg CO2 / an`, 105, y + 23, { align: 'center' });
  police(9); couleur(C.doux);
  doc.text(pas ? 'Pas de changement prévu pour l\'instant : chaque trajet compte, le jour où vous le déciderez.'
    : `Soit l'équivalent de ${kg(d.gain_espere_kg / facteurKm('car-thermal'))} km parcourus en voiture thermique.`, 105, y + 32, { align: 'center' });
  y += 44;

  if (!pas) {
    const col = W / 3;
    [['Minimum garanti', d.gain_potentiel_min_kg, C.encre], ['Espéré', d.gain_espere_kg, C.vert], ['Objectif', d.gain_potentiel_max_kg, C.encre]]
      .forEach(([l, v, c], i) => {
        police(8); couleur(C.doux); doc.text(l.toUpperCase(), L + col * i + col / 2, y + 4, { align: 'center' });
        police(14, true); couleur(c); doc.text(`-${kg(v)} kg`, L + col * i + col / 2, y + 11, { align: 'center' });
      });
    y += 16;
    if (d.economie_max_euros > 0) texte(`Jusqu'à ${kg(d.economie_max_euros)} euros par an d'économie sur l'usage de la voiture si vous atteignez votre objectif.`, 10, C.encre, true);
  }

  // ---- Situation ----
  titre('Votre situation');
  ligne('Mode actuel', `${MODES[d.transport_actuel] || d.transport_actuel}${d.transport_secondaire ? ` (${d.mode1_days} j) + ${MODES[d.transport_secondaire]} (${d.mode2_days} j)` : ''}`);
  ligne('Distance domicile-travail', `${km1(d.distance_km)} km`);
  ligne('Rythme', `${d.jours_presence} jours par semaine, ${d.nb_trajets_ar} aller-retour par jour, départ ${d.heure_depart}`);
  ligne('Kilomètres par an', `${kg(reponse.kmAn)} km`);
  ligne('Émissions actuelles', `${kg(d.emissions_actuelles_kg)} kg CO2 par an`);

  // ---- Choix ----
  titre('Vos choix');
  ligne(ALTERNATIVES[d.alternative_1], d.alternative_1 === 'aucun' ? '' : `-${kg(d.gain_max_kg)} kg si 100 % des trajets`);
  if (d.alternative_2) ligne(`Plan B : ${ALTERNATIVES[d.alternative_2]}`, `-${kg(reponse.gain2)} kg si 100 % des trajets`);
  ligne('Engagement', ENGAGEMENTS[d.engagement]);
  if (!pas) ligne('Part de vos trajets', `de ${Math.round(d.frequency_min * 100)} % à ${Math.round(d.frequency_max * 100)} %, probabilité ${Math.round(d.proba_max * 100)} %`);
  const freins = [d.frein_1, d.frein_2].filter(Boolean).map(f => libelle(FREINS, f));
  const leviers = [d.levier_1, d.levier_2].filter(Boolean).map(l => libelle(LEVIERS, l));
  ligne('Ce qui vous freine', '');
  freins.forEach(f => texte(`- ${f}`, 10, C.encre, false, L + 4, W - 4));
  ligne('Ce qui vous aiderait', '');
  leviers.forEach(l => texte(`- ${l}`, 10, C.encre, false, L + 4, W - 4));

  // ---- Voisins ----
  const voisins = [...contacts].filter(c => c.distance < CONFIG.DISTANCE_THRESHOLD_KM).sort((a, b) => a.distance - b.distance).slice(0, 6);
  if (voisins.length) {
    titre('Vos voisins, pour covoiturer');
    texte(voisins.map(v => `${v.pseudo} (${km1(v.distance)} km)`).join(', '), 10);
    texte("Retrouvez-les par leur pseudo auprès de l'animateur ou lors du prochain atelier.", 9, C.doux);
  }

  // ---- Hypothèses ----
  titre('Hypothèses de calcul');
  texte(`Distance à vol d'oiseau multipliée par 1,3. ${SEMAINES_TRAVAILLEES} semaines travaillées par an. Facteur d'émission de votre trajet actuel : ${Math.round(reponse.facteur * 1000)} g CO2e par km et par personne. Économies calculées sur l'usage de la voiture uniquement (${String(COUT_KM_VOITURE).replace('.', ',')} euro par km), hors coût de l'alternative. Gain espéré = minimum garanti + (objectif - minimum) x probabilité indiquée.`, 8, C.doux);
  pied();

  // ---- Page 2 : le groupe ----
  if (groupe?.distance) {
    doc.addPage(); page++; y = 20;
    police(16, true); couleur(C.encre); doc.text('La voix de votre groupe', L, y); y += 6;
    texte(groupe.distance === 'proche' ? 'Groupe habitant près du travail' : 'Groupe habitant loin du travail', 10, C.doux);
    let data = {}, notes = {};
    try { data = JSON.parse(groupe.data || '{}'); } catch { /* données absentes */ }
    try { notes = JSON.parse(groupe.phaseNotes || '{}'); } catch { /* notes absentes */ }
    THEMES[groupe.distance === 'proche' ? 'proche' : 'eloigne'].forEach((t, i) => {
      const k = i === 0 ? 'theme1' : 'theme2', dt = data[k] || {}, nt = notes[k] || {};
      titre(t.nom);
      const fr = [...(dt.freins || [])].sort((a, b) => b.votes - a.votes).slice(0, 3);
      if (fr.length) { texte('Freins identifiés ensemble', 10, C.encre, true); fr.forEach(f => texte(`- ${f.text} (${f.votes} voix)`, 10, C.encre, false, L + 4, W - 4)); }
      const val = Object.entries(dt.valeurs || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (val.length) { texte('Valeurs prioritaires', 10, C.encre, true); val.forEach(([v, n]) => texte(`- ${v} (${n} voix)`, 10, C.encre, false, L + 4, W - 4)); }
      if ((dt.engagements || []).length) { texte('Engagements pris ensemble', 10, C.encre, true); dt.engagements.forEach(e => texte(`- ${e.text} : ${e.count} personne${e.count > 1 ? 's' : ''}`, 10, C.encre, false, L + 4, W - 4)); }
      PHASES.forEach(p => { if (nt[p.key]) texte(`Notes, phase ${p.nom} : ${nt[p.key]}`, 9, C.doux); });
    });
    if (groupe.notes) { titre('Le mot de la fin'); texte(groupe.notes, 10); }
    pied();
  }

  doc.save(`bilan-mobilite-${profile.pseudo}.pdf`);
}
