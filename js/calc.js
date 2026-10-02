// Calculs purs (aucun accès à l'écran ni à la base). Les calculs CO2 et euros arrivent au lot 5.
import { DISTANCE_CORRECTION_FACTOR } from './constants.js';

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
