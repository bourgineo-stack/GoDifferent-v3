// Réglages de l'atelier, modifiables sans toucher au reste du code.
export const CONFIG = {
  CONTACT_EMAIL: 'contact@volt-face.fr',
  RGPD_RETENTION_DAYS: 7,          // doit correspondre à une suppression réellement effectuée
  MIN_SCANS_REQUIRED: 1,           // scans minimum avant de quitter l'étape Rencontres
  THEME_DURATION_SECONDS: 1200,    // durée d'un sujet en co-construction
  SCRIBE_RULE: 'Le plus jeune',
  TIMER_MASTER_RULE: 'Cheveux les plus longs',
  DISTANCE_THRESHOLD_KM: 5,

  // Tableau de bord animateur : les jalons de la séance (modifiables)
  OBJECTIFS: {
    inscriptionPart: 0.9,      // part de la capacité de l'atelier inscrite
    rencontresParPersonne: 5,  // rencontres moyennes par participant
    defisParPersonne: 0.25,    // mini-défis déclenchés, rapportés au nombre d'inscrits
    reponsesPart: 0.8,         // part des inscrits ayant validé leurs engagements
    reductionCO2: 0.10         // gain espéré total / empreinte actuelle du groupe
  },

  // Couleurs des pelotes : à adapter au kit de laine de l'animateur
  PELOTES: [
    { modes: ['car-thermal', 'car-electric'], nom: 'jaune foncé', hex: '#D9A400', pour: 'Voiture seul' },
    { modes: ['carpool'],                     nom: 'jaune pâle',  hex: '#F6E27A', pour: 'Covoiturage' },
    { modes: ['bike', 'ebike', 'walk'],       nom: 'bleue',       hex: '#3B82F6', pour: 'Vélo, marche' },
    { modes: ['train', 'bus'],                nom: 'rose',        hex: '#EC4899', pour: 'Bus, tram, train' }
  ]
};
