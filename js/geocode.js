// Géocodage : IGN Géoplateforme d'abord, OpenStreetMap en secours.
// Appelé uniquement à la validation (pas pendant la frappe) : dans une salle, tout le monde
// partage la même IP publique et l'IGN limite à 50 requêtes/s par IP.

export async function geocode(query) {
  const q = encodeURIComponent(query);
  try {
    const r = await fetch(`https://data.geopf.fr/geocodage/search/?q=${q}&limit=5`);
    if (r.ok) {
      const d = await r.json();
      const res = (d.features || []).map(f => ({
        label: f.properties.label,
        score: f.properties.score ?? 0,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0]
      }));
      if (res.length) return res;
    }
  } catch (e) { console.warn('IGN indisponible, bascule OSM', e); }

  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=fr&q=${q}`);
    if (r.ok) {
      const d = await r.json();
      return d.map((x, i) => ({
        label: x.display_name.split(',').slice(0, 3).join(','),
        score: i === 0 ? 0.7 : 0.5,
        lat: parseFloat(x.lat),
        lon: parseFloat(x.lon)
      }));
    }
  } catch (e) { console.error('OSM indisponible', e); }
  return [];
}

// Le 1er résultat est-il assez sûr pour ne pas demander de choisir ?
export function isConfident(results) {
  if (results.length === 1) return true;
  const [a, b] = results;
  return a.score >= 0.75 && (a.score - (b?.score ?? 0)) >= 0.1;
}
