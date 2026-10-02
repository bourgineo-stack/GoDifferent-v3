// Scanner QR unique, en plein écran (la caméra n'est plus jamais tronquée par le reste de la page).
// startScan(onResult, { titre, info }) : onResult(texte) renvoie false pour fermer le scanner.
// setScanInfo(texte) met à jour la ligne d'information (compteur, score...).

let active = null;
const el = id => document.getElementById(id);

export const isScanning = () => !!active;

export function setScanInfo(texte) {
  if (active) el('scanner-info').textContent = texte || '';
}

export async function startScan(onResult, { titre = 'Scannez un QR code', info = '', cooldown = 4000 } = {}) {
  stopScan();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  const zone = el('scanner-video');
  zone.innerHTML = '';
  zone.appendChild(video);
  el('scanner-titre').textContent = titre;
  el('scanner-info').textContent = info;
  el('scanner').hidden = false;
  document.body.classList.add('scan-ouvert');
  await video.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const state = { stream, running: true };
  active = state;
  let lastFrame = 0, lastText = '', lastTime = 0;

  const loop = t => {
    if (!state.running) return;
    // ~7 analyses par seconde sur une image réduite : suffisant, et épargne la batterie
    if (t - lastFrame > 150 && video.readyState >= 2 && video.videoWidth) {
      lastFrame = t;
      const k = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * k);
      canvas.height = Math.round(video.videoHeight * k);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (code?.data && !(code.data === lastText && t - lastTime < cooldown)) {
        lastText = code.data;
        lastTime = t;
        navigator.vibrate?.(60);
        el('scanner').classList.remove('flash'); void el('scanner').offsetWidth; el('scanner').classList.add('flash');
        if (onResult(code.data) === false) return stopScan();
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function stopScan() {
  if (!active) return;
  active.running = false;
  active.stream.getTracks().forEach(t => t.stop());
  el('scanner-video').innerHTML = '';
  el('scanner').hidden = true;
  document.body.classList.remove('scan-ouvert');
  active = null;
  document.dispatchEvent(new Event('scan-stop'));
}

export function cameraError(e) {
  if (e?.name === 'NotAllowedError') return "Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, puis réessayez.";
  if (e?.name === 'NotFoundError') return 'Aucune caméra détectée sur cet appareil.';
  return "Impossible d'ouvrir la caméra. Fermez les autres applications qui l'utilisent, puis réessayez.";
}

// Bouton « Terminé », changement d'écran, téléphone verrouillé : on coupe la caméra
document.addEventListener('click', e => { if (e.target.closest('#scanner-fermer')) stopScan(); });
document.addEventListener('ecran', stopScan);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopScan(); });
