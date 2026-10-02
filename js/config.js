// Réglages de l'atelier, modifiables sans toucher au reste du code.
export const CONFIG = {
  CONTACT_EMAIL: 'contact@volt-face.fr',
  RGPD_RETENTION_DAYS: 7,          // doit correspondre à une suppression réellement effectuée
  MIN_SCANS_REQUIRED: 1,           // scans minimum avant de quitter l'étape Rencontres
  THEME_DURATION_SECONDS: 1200,    // durée d'un sujet en co-construction
  SCRIBE_RULE: 'Le plus jeune',
  TIMER_MASTER_RULE: 'Cheveux les plus longs',
  DISTANCE_THRESHOLD_KM: 5,

  // Couleurs des pelotes : à adapter au kit de laine de l'animateur
  PELOTES: [
    { modes: ['car-thermal', 'car-electric'], nom: 'jaune foncé', hex: '#D9A400', pour: 'Voiture seul' },
    { modes: ['carpool'],                     nom: 'jaune pâle',  hex: '#F6E27A', pour: 'Covoiturage' },
    { modes: ['bike', 'ebike', 'walk'],       nom: 'bleue',       hex: '#3B82F6', pour: 'Vélo, marche' },
    { modes: ['train', 'bus'],                nom: 'rose',        hex: '#EC4899', pour: 'Bus, tram, train' }
  ]
};
