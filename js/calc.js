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
