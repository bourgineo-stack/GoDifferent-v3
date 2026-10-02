// QR codes des participants : génération et lecture du contenu.
// Format identique à la v2 : {"id":"<12 car.>","lat":..,"lon":..,"pseudo":".."}

export function myPayload(profile) {
  return JSON.stringify({ id: profile.id.slice(0, 12), lat: profile.lat, lon: profile.lon, pseudo: profile.pseudo });
}

// Un QR affiché dans la page s'ouvre en grand au toucher (plus facile à scanner pour les autres)
export function renderQR(el, text, size = 200, nom = '') {
  el.innerHTML = '';
  el.dataset.qr = text;
  el.dataset.nom = nom;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Afficher le QR code en grand');
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

function ouvrirEnGrand(source) {
  const taille = Math.min(window.innerWidth, window.innerHeight) - 64;
  new window.QRCode(Object.assign(document.getElementById('qr-plein-code'), { innerHTML: '' }), {
    text: source.dataset.qr, width: taille, height: taille,
    colorDark: '#15132A', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M
  });
  document.getElementById('qr-plein-nom').textContent = source.dataset.nom || '';
  document.getElementById('qr-plein').hidden = false;
}

document.addEventListener('click', e => {
  const q = e.target.closest('[data-qr]');
  if (q) return ouvrirEnGrand(q);
  if (e.target.closest('#qr-plein-fermer') || e.target.id === 'qr-plein') document.getElementById('qr-plein').hidden = true;
});
document.addEventListener('ecran', () => { document.getElementById('qr-plein').hidden = true; });
