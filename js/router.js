// Navigation entre écrans. Chaque écran est une <section data-screen="..." data-step="...">.
import { store } from './store.js';
import { $ } from './ui.js';

const ORDER = ['step1', 'step2', 'step3', 'step4', 'step5', 'stepgroup', 'step6'];

export const STEP_NAMES = {
  step1: 'Profil',
  step2: 'Rencontres',
  step3: 'Voisins',
  step4: 'Carte humaine',
  step5: 'Pelotes',
  stepgroup: 'En groupe',
  step6: 'Engagements'
};

const hooks = {};
// Fonction appelée à chaque affichage d'un écran
export function onEnter(screen, fn) { hooks[screen] = fn; }

// Étapes 1 et 2 toujours actives, les autres selon l'atelier
export function activeSteps() {
  const steps = store.get().workshop?.steps || {};
  return ORDER.filter(s => s === 'step1' || s === 'step2' || steps[s]);
}

const screenEl = id => document.querySelector(`[data-screen="${id}"]`);

export function show(id) {
  const el = screenEl(id) || screenEl('bientot');
  document.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s !== el; });
  const step = el.dataset.step || store.get().step;
  store.set({ screen: el.dataset.screen, step });
  hooks[el.dataset.screen]?.();
  renderThread();
  window.scrollTo(0, 0);
}

// Va au premier écran d'une étape (ou au provisoire si l'étape n'est pas encore construite)
export function goToStep(step) {
  const first = document.querySelector(`[data-step="${step}"]`);
  if (first) return show(first.dataset.screen);
  store.set({ step });
  show('bientot');
}

export function next() {
  const seq = activeSteps();
  const i = seq.indexOf(store.get().step);
  if (i >= 0 && i < seq.length - 1) goToStep(seq[i + 1]); // pas de retour circulaire à l'étape 1
}

export function prev() {
  const seq = activeSteps();
  const i = seq.indexOf(store.get().step);
  if (i > 0) goToStep(seq[i - 1]);
}

// Le fil de progression : un arrêt par étape active
function renderThread() {
  const nav = $('#fil');
  const { workshop, step } = store.get();
  nav.hidden = !workshop;
  if (!workshop) return;
  const seq = activeSteps();
  const cur = seq.indexOf(step);
  nav.querySelector('ol').innerHTML = seq.map((s, i) =>
    `<li class="${i < cur ? 'fait' : ''}${i === cur ? ' ici' : ''}" style="--c: var(--fil-${i % 4})"${i === cur ? ' aria-current="step"' : ''}>
       <span class="sr">${STEP_NAMES[s]}</span>
     </li>`).join('');
  $('#fil-nom').textContent = `Étape ${cur + 1} sur ${seq.length} : ${STEP_NAMES[step]}`;
  const b = $('#bientot-nom');
  if (b) b.textContent = STEP_NAMES[step];
}
