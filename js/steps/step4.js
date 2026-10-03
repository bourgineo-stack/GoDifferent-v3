// Étape 4 : carte humaine. Chacun se place dans la salle comme sur une carte, le travail au centre.
// Aucune lecture ni écriture Firestore : tout est calculé sur le téléphone.
import { store } from '../store.js?v=6i';
import { onEnter } from '../router.js?v=6i';
import { startScan, cameraError } from '../scanner.js?v=6i';
import { myPayload, renderQR } from '../qr.js?v=6i';
import { roadKm, fmtKm, bearing, direction, vers } from '../calc.js?v=6i';
import { $, esc, toast } from '../ui.js?v=6i';
import { CONFIG } from '../config.js?v=6i';

export function init() {
  onEnter('step4', enter);
  $('#btn-scan4').addEventListener('click', toggleScan);
}

function enter() {
  const { profile, workshop } = store.get();
  renderQR($('#qr4'), myPayload(profile), 130, profile.pseudo);
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
  try { await startScan(onCode, { titre: 'Scannez un voisin de salle ou un repère' }); }
  catch (e) { toast(cameraError(e), 'error'); }
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
    v.innerHTML = `<strong>Placez-vous ${direction(bearing(d, me))} de ce repère (${esc(d.nom)})</strong><br>Votre domicile en est à ${fmtKm(km)}.`;
  } else if (km < CONFIG.DISTANCE_THRESHOLD_KM) {
    v.className = 'verdict ok';
    v.innerHTML = `<strong>Restez à côté de ${esc(d.nom)}</strong><br>Vos domiciles sont à ${fmtKm(km)} l'un de l'autre.`;
  } else {
    const cap = bearing(me, d);
    v.className = 'verdict ko';
    v.innerHTML = `<strong>Écartez-vous de ${esc(d.nom)} : ${fmtKm(km)} entre vos domiciles</strong><br>` +
      `${esc(d.nom)} habite ${direction(cap)} de chez vous : lui va ${vers(cap)}, vous ${vers((cap + 180) % 360)}.`;
  }
  v.hidden = false;
  return false; // un verdict à la fois : on lit, on bouge, on rescanne
}
