// Carnet de rencontres partagé par les étapes 2 et 3.
// Quand A scanne B, B reçoit A automatiquement (écoute Firestore en temps réel),
// et les deux voient le MÊME mini-défi.
import { store } from './store.js';
import { saveScans, saveRencontre, watchReciprocal } from './db.js';
import { roadKm } from './calc.js';
import { DEFIS } from './constants.js';
import { CONFIG } from './config.js';

let unsub = null;

// Ajoute un contact s'il est nouveau, prévient l'écran via l'événement 'rencontre'
export function addContact(d, source) {
  const { profile, contacts } = store.get();
  if (d.id === profile.id.slice(0, 12) || contacts.some(c => c.id === d.id)) return null;
  const contact = { ...d, distance: roadKm(profile, d), source };
  store.set({ contacts: [...contacts, contact] });
  if (source === 'scan') {
    // Envoi immédiat du scan : c'est ce que reçoit l'autre téléphone
    saveRencontre(store.get().code, profile, d.id).catch(e => console.warn('Scan pas encore envoyé (réseau)', e));
  }
  document.dispatchEvent(new CustomEvent('rencontre', { detail: { contact, recu: source === 'reciproque' } }));
  return contact;
}

export const isNear = c => c.distance < CONFIG.DISTANCE_THRESHOLD_KM;

// Même paire de personnes = même défi, des deux côtés
export function pairDefi(idA, idB) {
  const key = [idA, idB].sort().join('|');
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEFIS[h % DEFIS.length];
}

// Bilan complet de mes rencontres (participantScans, format v2), envoyé en quittant l'étape 2
export function flushScans() {
  const { code, profile, contacts } = store.get();
  return saveScans(code, profile, contacts);
}

// L'écoute tourne pendant les étapes 2 et 3 uniquement
document.addEventListener('ecran-affiche', async e => {
  const { profile, code } = store.get();
  if (['step2', 'step3'].includes(e.detail.step) && profile) {
    if (unsub) return;
    unsub = 'en cours';
    try { unsub = await watchReciprocal(code, profile.id.slice(0, 12), list => list.forEach(d => addContact(d, 'reciproque'))); }
    catch (err) { console.warn(err); unsub = null; }
  } else if (typeof unsub === 'function') {
    unsub();
    unsub = null;
  }
});
