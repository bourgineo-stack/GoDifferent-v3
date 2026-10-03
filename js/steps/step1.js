// Étape 1 : accueil (code + RGPD), profil, écran "prêt".
import { store } from '../store.js?v=6i';
import { show, onEnter, goToStep } from '../router.js?v=6i';
import { fetchWorkshop, saveParticipant } from '../db.js?v=6i';
import { geocode, isConfident } from '../geocode.js?v=6i';
import { round3 } from '../calc.js?v=6i';
import { $, esc, toast, busy } from '../ui.js?v=6i';
import { PSEUDO_WORDS, MODES } from '../constants.js?v=6i';
import { CONFIG } from '../config.js?v=6i';

// Bouton d'envoi, y compris quand le formulaire est relancé par le code (requestSubmit)
const submitBtn = e => e.submitter || e.target.querySelector('[type=submit]');
const normalizeCode = c => c.trim().toUpperCase().replace(/\s+/g, '-');
const today = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale
const genId = () => 'u_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
const genPseudo = () =>
  PSEUDO_WORDS[Math.floor(Math.random() * PSEUDO_WORDS.length)] + String(Math.floor(Math.random() * 1000)).padStart(3, '0');

let chosenPlace = null;   // adresse retenue (remise à zéro si l'adresse est retapée)
let multimodal = null;    // { transport2, mode1Days, mode2Days }

export function init() {
  // Textes RGPD issus de la config
  document.querySelectorAll('[data-contact]').forEach(el => { el.textContent = CONFIG.CONTACT_EMAIL; el.href = `mailto:${CONFIG.CONTACT_EMAIL}`; });
  document.querySelectorAll('[data-retention]').forEach(el => { el.textContent = CONFIG.RGPD_RETENTION_DAYS; });

  // Code pré-rempli par le QR d'invitation (?code=...)
  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) $('#code').value = urlCode;

  $('#form-accueil').addEventListener('submit', onJoin);
  $('#form-profil').addEventListener('submit', onProfile);
  $('#adresse').addEventListener('input', () => { chosenPlace = null; $('#adresse-choix').hidden = true; });
  $('#jours').addEventListener('change', () => { if (multimodal) resetMultimodal(); });

  // Multimodal
  $('#multi').addEventListener('change', e => { if (e.target.checked) openMultimodal(); else resetMultimodal(); });
  $('#multi-modifier').addEventListener('click', openMultimodal);
  $('#form-multi').addEventListener('submit', onMultimodal);
  $('#multi-annuler').addEventListener('click', () => { $('#dlg-multi').close(); if (!multimodal) $('#multi').checked = false; });

  // Invitation
  $('#btn-inviter').addEventListener('click', openInvite);

  onEnter('step1-profil', fillProfileForm);
  onEnter('step1-pret', fillReady);
}

// ---------- Accueil ----------
async function onJoin(e) {
  e.preventDefault();
  const code = normalizeCode($('#code').value);
  if (!code) return toast("Saisissez le code donné par l'animateur.", 'error');
  if (!$('#rgpd').checked) return toast('Cochez la case de consentement pour continuer.', 'error');

  await busy(submitBtn(e), 'Vérification…', async () => {
    let ws;
    try { ws = await fetchWorkshop(code); }
    catch (err) {
      console.error(err);
      return toast('Connexion impossible. Vérifiez le réseau puis réessayez.', 'error');
    }
    if (!ws || (ws.expirationDate && ws.expirationDate < today())) {
      return toast("Code inconnu ou atelier terminé. Vérifiez le code auprès de l'animateur.", 'error');
    }
    if (store.get().code !== code) store.set({ profile: null, contacts: [], game: null, groupe: null, reponse: null }); // autre atelier : on repart de zéro
    store.set({
      code,
      workshop: {
        companyLat: ws.companyLat, companyLon: ws.companyLon,
        steps: ws.steps || {}, capacity: ws.capacity || null, expirationDate: ws.expirationDate
      }
    });
    show(store.get().profile ? 'step1-pret' : 'step1-profil');
  });
}

// ---------- Profil ----------
function fillProfileForm() {
  const p = store.get().profile;
  if (!p) return;
  $('#adresse').value = p.addressLabel || '';
  $('#mode').value = p.transport;
  $('#ar').value = String(p.nbTrajetsAR);
  $('#jours').value = String(p.joursPresence);
  $('#depart').value = p.departureTime;
  chosenPlace = { label: p.addressLabel, lat: p.lat, lon: p.lon };
  if (p.transport2) {
    multimodal = { transport2: p.transport2, mode1Days: p.mode1Days, mode2Days: p.mode2Days };
    $('#multi').checked = true;
    renderMultimodalSummary();
  }
}

async function onProfile(e) {
  e.preventDefault();
  const address = $('#adresse').value.trim();
  const transport = $('#mode').value;
  if (!address || !transport) return toast('Renseignez votre adresse et votre mode de transport.', 'error');

  await busy(submitBtn(e), 'Enregistrement…', async () => {
    // 1. Adresse : on géocode si elle n'a pas déjà été choisie
    if (!chosenPlace) {
      const results = await geocode(address);
      if (!results.length) return toast('Adresse introuvable. Ajoutez la ville ou le code postal.', 'error');
      if (!isConfident(results)) return showChoices(results);
      chosenPlace = results[0];
    }

    // 2. Profil (coordonnées arrondies à ~100 m)
    const prev = store.get().profile;
    const profile = {
      id: prev?.id || genId(),
      pseudo: prev?.pseudo || genPseudo(),
      addressLabel: chosenPlace.label,
      lat: round3(chosenPlace.lat),
      lon: round3(chosenPlace.lon),
      transport,
      transport2: multimodal?.transport2 || '',
      mode1Days: multimodal?.mode1Days || 0,
      mode2Days: multimodal?.mode2Days || 0,
      nbTrajetsAR: parseInt($('#ar').value, 10),
      joursPresence: parseInt($('#jours').value, 10),
      departureTime: $('#depart').value || '07:30'
    };

    // 3. Écriture confirmée AVANT de passer à la suite
    try { await saveParticipant(store.get().code, profile); }
    catch (err) {
      console.error(err);
      return toast("Profil non enregistré : connexion instable. Appuyez à nouveau sur « Enregistrer ».", 'error');
    }
    store.set({ profile });
    show('step1-pret');
  });
}

function showChoices(results) {
  const box = $('#adresse-choix');
  box.innerHTML = '<p>Plusieurs adresses correspondent. Laquelle est la vôtre ?</p>' +
    results.map((r, i) => `<button type="button" class="choix" data-i="${i}">${esc(r.label)}</button>`).join('');
  box.hidden = false;
  box.querySelectorAll('.choix').forEach(btn => btn.addEventListener('click', () => {
    chosenPlace = results[+btn.dataset.i];
    $('#adresse').value = chosenPlace.label;
    box.hidden = true;
    $('#form-profil').requestSubmit();
  }));
  box.querySelector('.choix').focus();
}

// ---------- Multimodal ----------
function openMultimodal() {
  const jours = parseInt($('#jours').value, 10);
  $('#multi-jours').textContent = jours;
  $('#mode2').value = multimodal?.transport2 || '';
  $('#j1').value = multimodal?.mode1Days ?? Math.ceil(jours / 2);
  $('#j2').value = multimodal?.mode2Days ?? Math.floor(jours / 2);
  $('#dlg-multi').showModal();
}

function onMultimodal(e) {
  e.preventDefault();
  const transport2 = $('#mode2').value;
  const d1 = parseInt($('#j1').value, 10) || 0;
  const d2 = parseInt($('#j2').value, 10) || 0;
  const jours = parseInt($('#jours').value, 10);
  if (!transport2) return toast('Choisissez votre autre mode de transport.', 'error');
  if (transport2 === $('#mode').value) return toast('Choisissez un mode différent du mode principal.', 'error');
  if (d1 + d2 !== jours) return toast(`La répartition doit faire ${jours} jours (actuellement ${d1 + d2}).`, 'error');
  multimodal = { transport2, mode1Days: d1, mode2Days: d2 };
  $('#dlg-multi').close();
  renderMultimodalSummary();
}

function renderMultimodalSummary() {
  const main = MODES[$('#mode').value] || 'Mode principal';
  $('#multi-resume').textContent = `${main} ${multimodal.mode1Days} j, ${MODES[multimodal.transport2]} ${multimodal.mode2Days} j par semaine`;
  $('#multi-bloc').hidden = false;
}

function resetMultimodal() {
  multimodal = null;
  $('#multi').checked = false;
  $('#multi-bloc').hidden = true;
}

// ---------- Prêt ----------
function fillReady() {
  const p = store.get().profile;
  if (!p) return goToStep('step1');
  $('#pseudo').textContent = p.pseudo;
  $('#adresse-retenue').textContent = p.addressLabel;
}

function openInvite() {
  const url = `${location.origin}${location.pathname}?code=${encodeURIComponent(store.get().code)}`;
  const box = $('#qr-invite');
  box.innerHTML = '';
  new window.QRCode(box, { text: url, width: 220, height: 220, colorDark: '#15132A', colorLight: '#ffffff' });
  $('#dlg-invite').showModal();
}
