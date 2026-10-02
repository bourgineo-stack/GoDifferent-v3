// Petits outils d'interface partagés.
export const $ = sel => document.querySelector(sel);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, type = 'ok') {
  const zone = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = msg;
  zone.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 3000);
}

// Désactive un bouton pendant une action asynchrone
export async function busy(btn, label, fn) {
  const old = btn.innerHTML; // innerHTML : garde l'icône éventuelle
  btn.disabled = true;
  btn.textContent = label;
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

// Empêche l'écran de se mettre en veille (chrono, discussion) : une veille coupe la synchronisation
let verrou = null;
export async function ecranAllume(on) {
  try {
    if (on && !verrou && 'wakeLock' in navigator) {
      verrou = await navigator.wakeLock.request('screen');
      verrou.addEventListener('release', () => { verrou = null; });
    } else if (!on && verrou) { await verrou.release(); verrou = null; }
  } catch { /* navigateur sans prise en charge : sans conséquence */ }
}
