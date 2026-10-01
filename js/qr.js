// QR codes des participants : génération et lecture du contenu.
// Format identique à la v2 : {"id":"<12 car.>","lat":..,"lon":..,"pseudo":".."}

export function myPayload(profile) {
  return JSON.stringify({ id: profile.id.slice(0, 12), lat: profile.lat, lon: profile.lon, pseudo: profile.pseudo });
}

export function renderQR(el, text, size = 200) {
  el.innerHTML = '';
  new window.QRCode(el, {
    text, width: size, height: size,
    colorDark: '#15132A', colorLight: '#ffffff',
    correctLevel: window.QRCode.CorrectLevel.M
  });
}

// Renvoie les données d'un QR participant, ou null si ce n'en est pas un
export function parsePayload(raw) {
  try {
    const d = JSON.parse(raw);
    if (typeof d.id === 'string' && Number.isFinite(d.lat) && Number.isFinite(d.lon)) {
      return { id: d.id, lat: d.lat, lon: d.lon, pseudo: d.pseudo || 'Anonyme' };
    }
  } catch { /* pas du JSON */ }
  return null;
}
