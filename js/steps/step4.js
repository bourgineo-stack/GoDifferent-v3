// Étape 4 : carte humaine. Chacun se place dans la salle comme sur une carte, le travail au centre.
// Aucune lecture ni écriture Firestore : tout est calculé sur le téléphone.
import { store } from '../store.js';
import { onEnter } from '../router.js';
import { startScan, stopScan, isScanning, cameraError } from '../scanner.js';
import { myPayload, renderQR } from '../qr.js';
import { roadKm, fmtKm, bearing, direction } from '../calc.js';
import { $, esc, toast } from '../ui.js';
import { CONFIG } from '../config.js';

export function init() {
  onEnter('step4', enter);
  $('#btn-scan4').addEventListener('click', toggleScan);
  document.addEventListener('scan-stop', () => { $('#btn-scan4').textContent = 'Vérifier ma place'; });
}

function enter() {
  const { profile, workshop } = store.get();
  renderQR($('#qr4'), myPayload(profile), 150);
  $('#verdict4').hidden = true;

  // Boussole : où se trouve mon domicile par rapport au travail
  const work = { lat: workshop.companyLat, lon: workshop.companyLon };
  const known = Number.isFinite(work.lat) && Number.isFinite(work.lon) && (work.lat || work.lon);
  $('#boussole').hidden = !known;
  if (!known) return;
  const cap = bearing(work, profile);
  $('#boussole-fleche').setAttribute('transform', `rotate(${cap.toFixed(0)} 60 60)`);
  $('#boussole-texte').textContent = `Vous habitez à ${fmtKm(roadKm(work, profile))} du travail, ${direction(cap)}.`;
}

async function toggleScan() {
  if (isScanning()) return stopScan();
  try {
    await startScan($('#cam4'), onCode);
    $('#btn-scan4').textContent = 'Arrêter le scan';
  } catch (e) { toast(cameraError(e), 'error'); }
}

// QR d'un participant ou d'un repère fixe : seules lat et lon sont indispensables
function parseAny(raw) {
  try {
    const d = JSON.parse(raw);
    if (Number.isFinite(d.lat) && Number.isFinite(d.lon)) {
      return { ...d, nom: d.pseudo || d.nom || d.name || d.label || 'Repère', repere: !d.id };
    }
  } catch { /* pas du JSON */ }
  return null;
}

function onCode(raw) {
  const d = parseAny(raw);
  if (!d) { toast("Ce QR code n'est pas reconnu.", 'error'); return; }
  const me = store.get().profile;
  if (d.id && d.id === me.id.slice(0, 12)) { toast("C'est votre propre code.", 'error'); return; }

  const km = roadKm(me, d);
  const v = $('#verdict4');
  if (d.repere) {
    v.className = 'verdict';
    v.innerHTML = `Vous habitez à ${fmtKm(km)} de <strong>${esc(d.nom)}</strong>, ${direction(bearing(d, me))} : placez-vous de ce côté du repère.`;
  } else if (km < CONFIG.DISTANCE_THRESHOLD_KM) {
    v.className = 'verdict ok';
    v.innerHTML = `<strong>${esc(d.nom)}</strong> habite à ${fmtKm(km)} de chez vous : restez côte à côte.`;
  } else {
    v.className = 'verdict ko';
    v.innerHTML = `<strong>${esc(d.nom)}</strong> habite à ${fmtKm(km)} de chez vous, ${direction(bearing(me, d))} : il devrait se trouver de ce côté par rapport à vous. Écartez-vous.`;
  }
  v.hidden = false;
  return false; // un verdict à la fois : on lit, on bouge, on rescanne
}
