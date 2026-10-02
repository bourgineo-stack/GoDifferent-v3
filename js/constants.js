// Constantes métier. Chaque valeur chiffrée devra porter sa source avant le lot 5.
export const DISTANCE_CORRECTION_FACTOR = 1.3; // vol d'oiseau -> route

export const MODES = {
  'car-thermal':  'Voiture thermique',
  'car-electric': 'Voiture électrique',
  'carpool':      'Covoiturage',
  'train':        'Train, TER, tram',
  'bus':          'Bus',
  'bike':         'Vélo',
  'ebike':        'Vélo électrique',
  'walk':         'Marche',
  'remote':       'Télétravail'
};

// Pseudos : mot + 3 chiffres (sans accent pour le PDF)
export const PSEUDO_WORDS = [
  'Covoiturage', 'Velo', 'Trottinette', 'Train', 'Bus', 'Cheval',
  'Marche', 'Tram', 'Pieton', 'Metro', 'VeloElectrique', 'Monoroue'
];

// Mini-défis proposés quand on scanne quelqu'un qui habite près de chez soi
export const DEFIS = [
  { titre: 'Connecteurs', tache: 'Présentez-vous mutuellement à une troisième personne, puis scannez-la ensemble.' },
  { titre: "Chasseurs d'initiales", tache: 'Scannez deux personnes dont les prénoms commencent par la même lettre.' },
  { titre: 'Devine mon adresse', tache: "Essayez de deviner le quartier ou la rue de la personne que vous venez de scanner." },
  { titre: 'Entraide', tache: "Repérez quelqu'un qui a peu scanné ou qui semble perdu, et aidez-le." },
  { titre: 'Selfie mobilité', tache: 'Prenez ensemble un selfie sur le thème du transport : devant un vélo, un panneau, un abri de bus...' }
];

// ===================== CALCULS CO2 ET EUROS (lot 5) =====================
// Valeurs reprises de la v2 en attendant ton arbitrage : chacune est À SOURCER.

// Voitures : facteur par km = usage + fabrication / durée de vie.
// Par défaut fabrication = 0, ce qui reproduit exactement la v2. Pour appliquer ta méthode,
// renseigne la fabrication (kg CO2e) et la durée de vie (km) des deux motorisations, de façon symétrique.
export const VEHICULES = {
  'car-thermal':  { usage: 0.218, fabrication: 0, dureeVie: 200000 }, // À SOURCER (0.218 inclut-il déjà la fabrication ?)
  'car-electric': { usage: 0.022, fabrication: 0, dureeVie: 200000 }  // À SOURCER
};

// Autres modes, kg CO2e par km et par personne. Le covoiturage est calculé (voiture thermique / 2).
export const FACTEURS = {
  train: 0.025, // À SOURCER (sert aussi pour l'alternative « transports en commun »)
  bus: 0.103,   // À SOURCER
  bike: 0, ebike: 0.002, walk: 0, remote: 0
};

export const SEMAINES_TRAVAILLEES = 44; // 44 × 5 jours = 220 jours, comme le générateur de PDME
export const COUT_KM_VOITURE = 0.25;    // euros par km parcouru en voiture (valeur du PDF v2). À SOURCER

// Clés enregistrées dans Firestore (identiques à la v2) : ne pas les renommer.
export const ALTERNATIVES = {
  covoiturage: 'Covoiturage', velo: 'Vélo ou vélo électrique', tc: 'Transports en commun',
  electrique: 'Voiture électrique', teletravail: 'Télétravail', aucun: 'Aucune pour l\'instant'
};
export const FREINS = {
  horaires: 'Horaires incompatibles', distance: 'Distance trop grande',
  infrastructure: "Manque d'équipements (stationnement vélo, bornes, pistes)",
  famille: 'Contraintes familiales (enfants, courses)', info: "Manque d'information (équipement, aides)",
  autre_frein: 'Autre'
};
export const LEVIERS = {
  prime: 'Forfait mobilités durables', infra: 'Équipements (stationnement vélo, bornes, douches)',
  covoit_interne: 'Groupe de covoiturage interne', horaires_flex: 'Horaires flexibles',
  formation: 'Information ou formation', autre_levier: 'Autre'
};
export const ENGAGEMENTS = {
  pret: 'Prêt à tester dès maintenant', interesse: 'Intéressé, sous conditions', pas_maintenant: "Pas pour l'instant"
};
