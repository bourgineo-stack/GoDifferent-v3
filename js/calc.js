// Calculs purs (aucun accès à l'écran ni à la base).
import { DISTANCE_CORRECTION_FACTOR, VEHICULES, FACTEURS, SEMAINES_TRAVAILLEES, COUT_KM_VOITURE } from './constants.js?v=6i';

export const round3 = x => Math.round(x * 1000) / 1000; // ~100 m : suffisant, et moins intrusif

// Distance routière estimée entre deux points (km)
export function roadKm(a, b) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * DISTANCE_CORRECTION_FACTOR;
}

// 3,2 km / 850 m
export function fmtKm(km) {
  return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}

// Cap (0-360°, 0 = nord) pour aller du point a vers le point b
export function bearing(a, b) {
  const rad = d => d * Math.PI / 180;
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// « au nord-est », « à l'ouest »...
export function direction(deg) {
  const noms = ['au nord', 'au nord-est', "à l'est", 'au sud-est', 'au sud', 'au sud-ouest', "à l'ouest", 'au nord-ouest'];
  return noms[Math.round(deg / 45) % 8];
}

// « vers le nord », « vers l'est »...
export function vers(deg) {
  return direction(deg).replace(/^au /, 'vers le ').replace(/^à l'/, "vers l'");
}

// ===================== Bilan CO2 et euros =====================

// kg CO2e par km et par personne
export function facteurKm(mode) {
  const v = VEHICULES[mode];
  if (v) return v.usage + (v.dureeVie ? v.fabrication / v.dureeVie : 0);
  if (mode === 'carpool') return facteurKm('car-thermal') / 2;
  return FACTEURS[mode] ?? 0;
}

// Part des km faits en voiture (covoiturage compté pour moitié)
const PART_VOITURE = { 'car-thermal': 1, 'car-electric': 1, carpool: 0.5 };

// Situation actuelle : distance, km par an, facteur moyen (pondéré si deux modes), émissions
export function trajetActuel(profile, work) {
  const distanceKm = roadKm(work, profile);
  const kmAn = distanceKm * 2 * profile.nbTrajetsAR * profile.joursPresence * SEMAINES_TRAVAILLEES;
  const multi = profile.transport2 && profile.mode1Days > 0 && profile.mode2Days > 0;
  const moyenne = f => multi
    ? (f(profile.transport) * profile.mode1Days + f(profile.transport2) * profile.mode2Days) / (profile.mode1Days + profile.mode2Days)
    : f(profile.transport);
  const facteur = moyenne(facteurKm);
  const partVoiture = moyenne(m => PART_VOITURE[m] || 0);
  return { distanceKm, kmAn, facteur, partVoiture, emissions: kmAn * facteur };
}

const CIBLE = { covoiturage: 'carpool', velo: 'bike', tc: 'train', electrique: 'car-electric', teletravail: 'remote' };

// Gain annuel si l'alternative remplaçait 100 % des trajets (kg CO2e et euros)
export function gainAlternative(alt, t) {
  if (!CIBLE[alt]) return { kg: 0, euros: 0 };
  const cible = alt === 'teletravail' ? 0 : facteurKm(CIBLE[alt]); // télétravail : pas de trajet
  const partCible = alt === 'electrique' ? t.partVoiture : (PART_VOITURE[CIBLE[alt]] || 0);
  return {
    kg: Math.max(0, t.kmAn * (t.facteur - cible)),
    euros: Math.max(0, t.kmAn * (t.partVoiture - partCible) * COUT_KM_VOITURE) // électrique : non chiffré
  };
}

// Fréquence exprimée en jours par semaine -> part des trajets
export const partTrajets = (joursParSemaine, joursPresence) => Math.min(1, joursParSemaine / joursPresence);
