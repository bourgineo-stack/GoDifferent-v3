// Étape 6 : engagements individuels, puis bilan (écran + PDF).
import { store } from '../store.js';
import { show, onEnter } from '../router.js';
import { saveResponse } from '../db.js';
import { trajetActuel, gainAlternative, partTrajets, fmtKm, facteurKm, lieuConnu } from '../calc.js';
import { $, esc, toast, busy } from '../ui.js';
import { ALTERNATIVES, FREINS, LEVIERS, ENGAGEMENTS, MODES, SEMAINES_TRAVAILLEES, COUT_KM_VOITURE } from '../constants.js';
import { telechargerBilan } from '../pdf.js';

// Fréquences en jours par semaine (converties en part des trajets selon les jours de présence)
const FREQ_MIN = [[0, 'Aucun engagement'], [1 / 44, 'Un essai unique'], [1 / 13, 'Une fois par trimestre'], [0.23, 'Une fois par mois'],
  [0.46, 'Deux fois par mois'], [1, '1 jour par semaine'], [2, '2 jours par semaine'], [3, '3 jours par semaine']];
const FREQ_MAX = [[0, 'Aucun'], [0.23, 'Une fois par mois'], [0.46, 'Deux fois par mois'], [1, '1 jour par semaine'],
  [2, '2 jours par semaine'], [3, '3 jours par semaine'], [4, '4 jours par semaine'], [99, 'Tous les jours']];
const PROBAS = [[0.2, '20 % : peu probable'], [0.5, '50 % : possible'], [0.8, '80 % : probable'], [1, '100 % : certain']];

const kg = x => Math.round(x).toLocaleString('fr-FR');
const opts = (entries, vide) => (vide ? `<option value="">${vide}</option>` : '') +
  entries.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');

export function init() {
  $('#alt1').innerHTML = opts(Object.entries(ALTERNATIVES), 'Choisir…');
  $('#alt2').innerHTML = opts(Object.entries(ALTERNATIVES).filter(([k]) => k !== 'aucun'), 'Aucune');
  $('#frein1').innerHTML = opts(Object.entries(FREINS), 'Choisir…');
  $('#frein2').innerHTML = opts(Object.entries(FREINS), 'Aucun');
  $('#levier1').innerHTML = opts(Object.entries(LEVIERS), 'Choisir…');
  $('#levier2').innerHTML = opts(Object.entries(LEVIERS), 'Aucun');
  $('#engagement').innerHTML = Object.entries(ENGAGEMENTS).map(([v, l]) =>
    `<label class="case"><input type="radio" name="engagement" value="${v}"><span>${esc(l)}</span></label>`).join('');
  $('#proba').innerHTML = opts(PROBAS);
  $('#proba').value = '0.8';

  $('#form-engagements').addEventListener('change', onChange);
  $('#form-engagements').addEventListener('input', onChange);
  $('#form-engagements').addEventListener('submit', onSubmit);
  $('#btn-pdf').addEventListener('click', e => busy(e.currentTarget, 'Préparation du PDF…', downloadPdf));

  onEnter('step6', fillForm);
  onEnter('bilan', renderBilan);
}

// ---------- Formulaire ----------
function fillForm() {
  const { workshop } = store.get();
  $('#alerte-lieu').hidden = lieuConnu({ lat: workshop.companyLat, lon: workshop.companyLon });
  const jours = store.get().profile.joursPresence;
  // On n'affiche pas « 4 jours par semaine » à quelqu'un qui en travaille 3
  $('#freq-min').innerHTML = opts(FREQ_MIN.filter(([v]) => v <= jours));
  $('#freq-max').innerHTML = opts(FREQ_MAX.filter(([v]) => v <= jours || v === 99));
  const r = store.get().reponse?.formulaire;
  if (r) Object.entries(r).forEach(([id, v]) => {
    if (id === 'engagement') { const el = document.querySelector(`[name=engagement][value="${v}"]`); if (el) el.checked = true; }
    else if ($('#' + id)) $('#' + id).value = v;
  });
  onChange();
}

function form() {
  const v = id => $('#' + id).value;
  return {
    alt1: v('alt1'), alt2: v('alt2'), frein1: v('frein1'), frein2: v('frein2'), levier1: v('levier1'), levier2: v('levier2'),
    frein1_autre: v('frein1_autre').trim(), frein2_autre: v('frein2_autre').trim(),
    levier1_autre: v('levier1_autre').trim(), levier2_autre: v('levier2_autre').trim(),
    engagement: document.querySelector('[name=engagement]:checked')?.value || '',
    'freq-min': v('freq-min'), 'freq-max': v('freq-max'), proba: v('proba')
  };
}

function onChange() {
  const f = form();
  // Pas deux fois le même choix
  [['alt1', 'alt2'], ['frein1', 'frein2'], ['levier1', 'levier2']].forEach(([a, b]) => {
    $('#' + b).querySelectorAll('option').forEach(o => { o.disabled = !!o.value && o.value === f[a]; });
    if (f[b] && f[b] === f[a]) $('#' + b).value = '';
  });
  ['frein1', 'frein2', 'levier1', 'levier2'].forEach(id => { $('#' + id + '_autre').hidden = !f[id].startsWith('autre'); });
  $('#bloc-frequence').hidden = !['pret', 'interesse'].includes(f.engagement);

  // Potentiel affiché dès le choix de l'alternative
  const t = trajet(), g = gainAlternative(f.alt1, t);
  $('#potentiel').hidden = !f.alt1 || f.alt1 === 'aucun';
  $('#potentiel').textContent = g.kg > 0
    ? `Si vous faisiez tous vos trajets ainsi : -${kg(g.kg)} kg de CO2 par an.`
    : 'Cette alternative ne réduit pas vos émissions actuelles.';
}

const trajet = () => {
  const { profile, workshop } = store.get();
  return trajetActuel(profile, { lat: workshop.companyLat, lon: workshop.companyLon });
};

function valider(f) {
  if (!f.alt1) return 'Choisissez au moins une alternative.';
  if (!f.frein1) return 'Choisissez au moins un frein.';
  if (!f.levier1) return 'Choisissez au moins un levier.';
  for (const id of ['frein1', 'frein2', 'levier1', 'levier2']) {
    if (f[id].startsWith('autre') && !f[id + '_autre']) return 'Précisez votre réponse « Autre ».';
  }
  if (!f.engagement) return "Indiquez votre niveau d'engagement.";
  if (['pret', 'interesse'].includes(f.engagement) && Number(f['freq-min']) > Number(f['freq-max'])) {
    return 'Le minimum garanti ne peut pas dépasser le maximum.';
  }
  return '';
}

async function onSubmit(e) {
  e.preventDefault();
  const f = form(), err = valider(f);
  if (err) return toast(err, 'error');
  const { code, profile, contacts, groupe } = store.get();
  const t = trajet(), jours = profile.joursPresence;
  const engage = ['pret', 'interesse'].includes(f.engagement);
  const fMin = engage ? partTrajets(Number(f['freq-min']), jours) : 0;
  const fMax = engage ? partTrajets(Number(f['freq-max']), jours) : 0;
  const proba = Number(f.proba);
  const g1 = gainAlternative(f.alt1, t), g2 = gainAlternative(f.alt2, t);
  const garanti = g1.kg * fMin, objectif = g1.kg * fMax, espere = garanti + (objectif - garanti) * proba;
  const autre = (k, txt) => k.startsWith('autre') ? `autre: ${txt}` : k;
  const gd = groupe?.doc || {};

  const data = {
    participantId: profile.id, emoji: profile.pseudo, timestamp: new Date().toISOString(),
    transport_actuel: profile.transport, transport_secondaire: profile.transport2 || '',
    mode1_days: profile.mode1Days || 0, mode2_days: profile.mode2Days || 0,
    distance_km: Math.round(t.distanceKm * 10) / 10, nb_trajets_ar: profile.nbTrajetsAR,
    jours_presence: jours, heure_depart: profile.departureTime, nb_scans: contacts.length,
    emissions_actuelles_kg: Math.round(t.emissions),
    alternative_1: f.alt1, alternative_2: f.alt2 || '',
    frein_1: autre(f.frein1, f.frein1_autre), frein_2: f.frein2 ? autre(f.frein2, f.frein2_autre) : '',
    levier_1: autre(f.levier1, f.levier1_autre), levier_2: f.levier2 ? autre(f.levier2, f.levier2_autre) : '',
    engagement: f.engagement, frequency_min: fMin, frequency_max: fMax, proba_max: proba,
    gain_max_kg: Math.round(g1.kg), gain_potentiel_min_kg: Math.round(garanti), gain_potentiel_max_kg: Math.round(objectif),
    group_id: gd.id || '', group_distance: gd.distance || '', group_themes: gd.data || '', scribe_notes: gd.notes || '',
    // Ajouts v3
    gain_espere_kg: Math.round(espere), economie_max_euros: Math.round(g1.euros * fMax)
  };

  await busy(e.submitter || $('#form-engagements [type=submit]'), 'Enregistrement…', async () => {
    try { await saveResponse(code, profile.id, data); }
    catch (err) {
      console.error(err);
      return toast('Réponses non enregistrées : connexion instable. Appuyez à nouveau sur « Valider ».', 'error');
    }
    store.set({ reponse: { data, formulaire: { ...f, alt2: f.alt2 }, gain2: Math.round(g2.kg), kmAn: Math.round(t.kmAn), facteur: t.facteur } });
    show('bilan');
  });
}

// ---------- Bilan à l'écran ----------
function renderBilan() {
  const r = store.get().reponse;
  if (!r) return show('step6');
  const d = r.data, pas = d.engagement === 'pas_maintenant' || d.alternative_1 === 'aucun';
  const euros = d.economie_max_euros;
  $('#bilan-contenu').innerHTML = `
    <div class="carte bilan-tete">
      ${pas
        ? `<p class="etiquette">Pas de changement prévu pour l'instant</p>
           <p class="bilan-chiffre">${kg(d.emissions_actuelles_kg)}<small> kg CO2 / an</small></p>
           <p class="aide">Vos émissions actuelles. Si un jour vous changez, chaque trajet compte.</p>`
        : `<p class="etiquette">Réduction espérée</p>
           <p class="bilan-chiffre">-${kg(d.gain_espere_kg)}<small> kg CO2 / an</small></p>
           <p class="aide">Soit l'équivalent de ${kg(d.gain_espere_kg / facteurKm('car-thermal'))} km en voiture thermique.</p>`}
    </div>
    ${pas ? '' : `<div class="trio">
      <div><p class="etiquette">Minimum garanti</p><p>-${kg(d.gain_potentiel_min_kg)} kg</p></div>
      <div class="fort"><p class="etiquette">Espéré</p><p>-${kg(d.gain_espere_kg)} kg</p></div>
      <div><p class="etiquette">Objectif</p><p>-${kg(d.gain_potentiel_max_kg)} kg</p></div>
    </div>
    ${euros > 0 ? `<p class="verdict ok">Jusqu'à <strong>${kg(euros)} € par an</strong> d'économie sur l'usage de la voiture si vous atteignez votre objectif.</p>` : ''}`}
    <h2 class="intertitre">Votre situation</h2>
    <ul class="contacts">
      <li><span>Mode actuel</span><span class="km">${esc(MODES[d.transport_actuel] || d.transport_actuel)}${d.transport_secondaire ? ' + ' + esc(MODES[d.transport_secondaire]) : ''}</span></li>
      <li><span>Distance domicile-travail</span><span class="km">${fmtKm(d.distance_km)}</span></li>
      <li><span>Kilomètres par an</span><span class="km">${kg(r.kmAn)} km</span></li>
      <li><span>Émissions actuelles</span><span class="km">${kg(d.emissions_actuelles_kg)} kg CO2</span></li>
    </ul>
    <h2 class="intertitre">Vos choix</h2>
    <ul class="contacts">
      <li><span>${esc(ALTERNATIVES[d.alternative_1])}</span><span class="km">-${kg(d.gain_max_kg)} kg si 100 %</span></li>
      ${d.alternative_2 ? `<li><span>Plan B : ${esc(ALTERNATIVES[d.alternative_2])}</span><span class="km">-${kg(r.gain2)} kg si 100 %</span></li>` : ''}
    </ul>
    <details class="hypotheses">
      <summary>Hypothèses de calcul</summary>
      <p>Distance estimée à vol d'oiseau × 1,3. ${SEMAINES_TRAVAILLEES} semaines travaillées par an. Facteur d'émission de votre trajet actuel : ${(r.facteur * 1000).toFixed(0)} g CO2e par km et par personne. Économies calculées sur l'usage de la voiture seulement (${COUT_KM_VOITURE.toLocaleString('fr-FR')} € par km), hors coût de l'alternative. Gain espéré = minimum garanti + (objectif - minimum) × probabilité indiquée.</p>
    </details>`;
}

async function downloadPdf() {
  const { reponse, profile, contacts, groupe } = store.get();
  try { await telechargerBilan({ reponse, profile, contacts, groupe: groupe?.doc || null }); }
  catch (err) { console.error(err); toast('Le PDF n\'a pas pu être généré. Vérifiez la connexion puis réessayez.', 'error'); }
}
