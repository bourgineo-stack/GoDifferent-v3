// Scanner QR unique pour toute l'application (remplace les 4 variantes de la v2).
// onResult(texte) : renvoyer false pour arrêter le scan, sinon il continue.

let active = null;

export const isScanning = () => !!active;

export async function startScan(container, onResult, { cooldown = 4000 } = {}) {
  stopScan();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  container.innerHTML = '';
  container.appendChild(video);
  container.hidden = false;
  await video.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const state = { stream, container, running: true };
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
      // Même code relu dans la foulée : ignoré
      if (code?.data && !(code.data === lastText && t - lastTime < cooldown)) {
        lastText = code.data;
        lastTime = t;
        navigator.vibrate?.(60);
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
  active.container.innerHTML = '';
  active.container.hidden = true;
  active = null;
  document.dispatchEvent(new Event('scan-stop'));
}

export function cameraError(e) {
  if (e?.name === 'NotAllowedError') return "Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, puis réessayez.";
  if (e?.name === 'NotFoundError') return 'Aucune caméra détectée sur cet appareil.';
  return "Impossible d'ouvrir la caméra. Fermez les autres applications qui l'utilisent, puis réessayez.";
}

// Caméra coupée au changement d'écran et quand le téléphone se verrouille
document.addEventListener('ecran', stopScan);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopScan(); });
