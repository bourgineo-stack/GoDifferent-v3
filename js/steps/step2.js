// Étape 2 : Rencontres. On scanne ses collègues pour découvrir la distance entre domiciles.
import { store } from '../store.js';
import { onEnter, next } from '../router.js';
import { startScan, stopScan, isScanning, cameraError } from '../scanner.js';
import { myPayload, renderQR, parsePayload } from '../qr.js';
import { addContact, isNear, pairDefi, flushScans } from '../rencontres.js';
import { fmtKm } from '../calc.js';
import { $, esc, toast, busy } from '../ui.js';
import { CONFIG } from '../config.js';

export function init() {
  onEnter('step2', enter);
  $('#btn-scan2').addEventListener('click', toggleScan);
  $('#btn-suivant2').addEventListener('click', leave);
  $('#defi-ok').addEventListener('click', () => { $('#defi').hidden = true; });
  document.addEventListener('scan-stop', () => { $('#btn-scan2').textContent = 'Scanner un collègue'; });
  document.addEventListener('rencontre', onRencontre);
}

const onScreen = () => store.get().screen === 'step2';

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
  if (d.id === store.get().profile.id.slice(0, 12)) { toast("C'est votre propre code.", 'error'); return; }
  const c = addContact(d, 'scan'); // l'affichage se fait dans onRencontre
  if (!c) { toast(`${d.pseudo} fait déjà partie de vos rencontres.`); return; }
  if (isNear(c)) return false; // on coupe la caméra pour lire le défi
}

// Nouvelle rencontre : scannée par moi, ou reçue parce que l'autre m'a scanné
function onRencontre(e) {
  if (!onScreen()) return;
  const { contact: c, recu } = e.detail;
  render();
  toast(recu
    ? `${c.pseudo} vous a scanné : ${fmtKm(c.distance)} entre vos domiciles`
    : `${c.pseudo} habite à ${fmtKm(c.distance)} de chez vous`);
  if (isNear(c)) showDefi(c);
  else if (recu) navigator.vibrate?.(60);
}

function showDefi(c) {
  const defi = pairDefi(store.get().profile.id.slice(0, 12), c.id);
  $('#defi-titre').textContent = `Presque voisin de ${c.pseudo} ! Défi : ${defi.titre}`;
  $('#defi-tache').textContent = defi.tache;
  $('#defi').hidden = false;
  navigator.vibrate?.([60, 80, 60]);
  $('#defi').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function render() {
  const contacts = store.get().contacts;
  $('#nb-rencontres').textContent = contacts.length;
  $('#liste-rencontres').innerHTML = contacts.length
    ? [...contacts].sort((a, b) => a.distance - b.distance).map(c =>
        `<li><span>${esc(c.pseudo)}</span><span class="km${isNear(c) ? ' proche' : ''}">${fmtKm(c.distance)}</span></li>`).join('')
    : '<li class="vide">Personne pour l\'instant. Montrez votre code, scannez celui des autres.</li>';
  $('#btn-suivant2').disabled = contacts.length < CONFIG.MIN_SCANS_REQUIRED;
}

// En quittant l'étape, envoi confirmé
async function leave(e) {
  await busy(e.currentTarget, 'Envoi…', async () => {
    try { await flushScans(); }
    catch (err) {
      console.error(err);
      toast("Rencontres pas encore envoyées (réseau). L'envoi se fera automatiquement dès que possible.", 'error');
    }
  });
  next();
}
