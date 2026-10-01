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
