// Étape 5 : pelotes de laine. Chacun déroule son trajet, du domicile vers le centre.
import { store } from '../store.js?v=6i';
import { onEnter } from '../router.js?v=6i';
import { roadKm, fmtKm } from '../calc.js?v=6i';
import { $, esc } from '../ui.js?v=6i';
import { CONFIG } from '../config.js?v=6i';

export function init() {
  onEnter('step5', enter);
  // Légende générée depuis la config, pour qu'elle corresponde toujours au kit
  $('#legende-pelotes').innerHTML = CONFIG.PELOTES.map(p =>
    `<li><span class="pastille" style="background:${p.hex}"></span><span><strong>Pelote ${esc(p.nom)}</strong><br>${esc(p.pour)}</span></li>`).join('');
}

function enter() {
  const { profile, workshop } = store.get();
  const pelote = CONFIG.PELOTES.find(p => p.modes.includes(profile.transport));
  const box = $('#ma-pelote');

  if (!pelote) { // télétravail ou mode non couvert
    box.style.setProperty('--pelote', 'var(--trait)');
    $('#ma-pelote-titre').textContent = 'Pas de pelote pour vous';
    $('#ma-pelote-detail').textContent = 'Vous ne vous déplacez pas : restez à votre place et observez la toile se former.';
    return;
  }
  box.style.setProperty('--pelote', pelote.hex);
  $('#ma-pelote-titre').textContent = `Votre pelote : ${pelote.nom}`;
  const work = { lat: workshop.companyLat, lon: workshop.companyLon };
  const [h, m] = profile.departureTime.split(':');
  const dist = (work.lat || work.lon) ? `, trajet de ${fmtKm(roadKm(work, profile))}` : '';
  $('#ma-pelote-detail').textContent = `Départ à ${+h} h ${m}${dist}. Attendez que l'animateur annonce votre heure.`;
}
