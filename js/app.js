// Point d'entrée.
import { store } from './store.js?v=6i';
import { show, next, prev } from './router.js?v=6i';
import { fetchWorkshop } from './db.js?v=6i';
import * as step1 from './steps/step1.js?v=6i';
import * as step2 from './steps/step2.js?v=6i';
import * as step3 from './steps/step3.js?v=6i';
import * as step4 from './steps/step4.js?v=6i';
import * as step5 from './steps/step5.js?v=6i';
import * as stepgroup from './steps/stepgroup.js?v=6i';
import * as step6 from './steps/step6.js?v=6i';

step1.init();
step2.init();
step3.init();
step4.init();
step5.init();
stepgroup.init();
step6.init();

// Boutons de navigation génériques : data-action="next" | "prev" | "reset"
document.addEventListener('click', e => {
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'next') next();
  if (act === 'prev') prev();
  if (act === 'goto') show(a.dataset.target);
  if (act === 'reset' && confirm("Effacer vos données sur ce téléphone et recommencer l'atelier ?")) {
    store.reset();
    location.href = location.pathname;
  }
});

// Fermeture des fenêtres par leur bouton [data-close]
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c) c.closest('dialog')?.close();
});

// Reprise de session (onglet rechargé, téléphone verrouillé...)
const s = store.get();
if (s.workshop && s.profile && s.screen) show(s.screen);
else if (s.workshop) show('step1-profil');
else show('step1-accueil');

// Si l'animateur a corrigé l'atelier (adresse, étapes), on récupère la version à jour (1 lecture)
if (s.code && s.workshop) {
  fetchWorkshop(s.code).then(ws => {
    if (ws) store.set({ workshop: { companyLat: ws.companyLat, companyLon: ws.companyLon, steps: ws.steps || {}, capacity: ws.capacity || null, expirationDate: ws.expirationDate } });
  }).catch(e => console.warn('Atelier non actualisé', e));
}
