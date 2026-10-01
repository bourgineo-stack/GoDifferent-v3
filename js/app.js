// Point d'entrée.
import { store } from './store.js';
import { show, next, prev } from './router.js';
import * as step1 from './steps/step1.js';

step1.init();

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
