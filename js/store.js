// État du participant, sauvegardé dans le téléphone (survit au rechargement de l'onglet).
const KEY = 'gd3';

const defaults = () => ({
  code: '',          // code atelier normalisé
  workshop: null,    // { companyLat, companyLon, steps, capacity, expirationDate }
  profile: null,     // profil validé et enregistré dans Firestore
  step: 'step1',     // étape courante (sert au fil de progression)
  screen: '',        // écran courant
  contacts: [],      // personnes rencontrées { id, lat, lon, pseudo, distance, source }
  game: null,        // jeu des voisins { targets, found, attempts }
  groupe: null,      // co-construction : rôle, membres, votes, notes (voir stepgroup.js)
  reponse: null      // engagements enregistrés (sert au bilan et au PDF, même après rechargement)
});

function load() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return defaults(); }
}

let state = load();

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Sauvegarde locale impossible', e); }
  },
  reset() {
    localStorage.removeItem(KEY);
    state = defaults();
  }
};
