// Étape 2 : Rencontres. On scanne ses collègues pour découvrir la distance entre domiciles.
import { store } from '../store.js';
import { onEnter, next } from '../router.js';
import { saveScans } from '../db.js';
import { startScan, stopScan, isScanning, cameraError } from '../scanner.js';
import { myPayload, renderQR, parsePayload } from '../qr.js';
import { roadKm, fmtKm } from '../calc.js';
import { $, esc, toast, busy } from '../ui.js';
import { DEFIS } from '../constants.js';
import { CONFIG } from '../config.js';

let syncTimer = null;
let lastDefi = -1;

export function init() {
  onEnter('step2', enter);
  $('#btn-scan2').addEventListener('click', toggleScan);
  $('#btn-suivant2').addEventListener('click', leave);
  $('#defi-ok').addEventListener('click', () => { $('#defi').hidden = true; });
  document.addEventListener('scan-stop', () => { $('#btn-scan2').textContent = 'Scanner un collègue'; });
}

function enter() {
  const p = store.get().profile;
  renderQR($('#qr2'), myPayload(p), 210);
  $('#pseudo2').textContent = p.pseudo;
  render();
}

async function toggleScan() {
  if (isScanning()) return stopScan();
  try {
    $('#defi').hidden = true;
    await startScan($('#cam2'), onCode);
    $('#btn-scan2').textContent = 'Arrêter le scan';
  } catch (e) { toast(cameraError(e), 'error'); }
}

function onCode(raw) {
  const d = parsePayload(raw);
  if (!d) { toast("Ce QR code n'est pas celui d'un participant.", 'error'); return; }
  const { profile, contacts } = store.get();
  if (d.id === profile.id.slice(0, 12)) { toast("C'est votre propre code.", 'error'); return; }
  if (contacts.some(c => c.id === d.id)) { toast(`${d.pseudo} fait déjà partie de vos rencontres.`); return; }

  const distance = roadKm(profile, d);
  store.set({ contacts: [...contacts, { ...d, distance, source: 'scan' }] });
  render();
  toast(`${d.pseudo} habite à ${fmtKm(distance)} de chez vous`);
  syncSoon();

  if (distance < CONFIG.DISTANCE_THRESHOLD_KM) { showDefi(); return false; } // on coupe la caméra pour lire le défi
}

function showDefi() {
  let i;
  do { i = Math.floor(Math.random() * DEFIS.length); } while (i === lastDefi && DEFIS.length > 1);
  lastDefi = i;
  $('#defi-titre').textContent = `Vous êtes presque voisins ! Défi : ${DEFIS[i].titre}`;
  $('#defi-tache').textContent = DEFIS[i].tache;
  $('#defi').hidden = false;
  $('#defi').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function render() {
  const contacts = store.get().contacts.filter(c => c.source === 'scan');
  $('#nb-rencontres').textContent = contacts.length;
  $('#liste-rencontres').innerHTML = contacts.length
    ? [...contacts].sort((a, b) => a.distance - b.distance).map(c =>
        `<li><span>${esc(c.pseudo)}</span><span class="km${c.distance < CONFIG.DISTANCE_THRESHOLD_KM ? ' proche' : ''}">${fmtKm(c.distance)}</span></li>`).join('')
    : '<li class="vide">Personne pour l\'instant. Montrez votre code, scannez celui des autres.</li>';
  $('#btn-suivant2').disabled = contacts.length < CONFIG.MIN_SCANS_REQUIRED;
}

// Envoi en arrière-plan quelques secondes après le dernier scan
function syncSoon() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { code, profile, contacts } = store.get();
    saveScans(code, profile, contacts).catch(e => console.warn('Synchro scans différée', e));
  }, 3000);
}

// En quittant l'étape, envoi confirmé (les autres en ont besoin pour le jeu des voisins)
async function leave(e) {
  clearTimeout(syncTimer);
  await busy(e.currentTarget, 'Envoi…', async () => {
    const { code, profile, contacts } = store.get();
    try { await saveScans(code, profile, contacts); }
    catch (err) {
      console.error(err);
      toast("Rencontres pas encore envoyées (réseau). L'envoi se fera automatiquement dès que possible.", 'error');
    }
  });
  next();
}
