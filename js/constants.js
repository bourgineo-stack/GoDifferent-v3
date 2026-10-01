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
