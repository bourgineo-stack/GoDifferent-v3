// Étape 3 : retrouver dans la salle 3 de ses 5 voisins géographiques.
import { store } from '../store.js?v=6i';
import { onEnter, show } from '../router.js?v=6i';
import { fetchReciprocal, saveRetrouvaille, watchRetrouvailles } from '../db.js?v=6i';
import { startScan, setScanInfo, cameraError } from '../scanner.js?v=6i';
import { myPayload, renderQR, parsePayload } from '../qr.js?v=6i';
import { roadKm, fmtKm } from '../calc.js?v=6i';
import { addContact } from '../rencontres.js?v=6i';
import { $, esc, toast, busy } from '../ui.js?v=6i';

const NB_CIBLES = 5, NB_ESSAIS = 5;

export function init() {
  onEnter('step3-jeu', enterGame);
  $('#btn-start3').addEventListener('click', start);
  $('#btn-scan3').addEventListener('click', toggleScan);
  // Écoute des « il vous a retrouvé » pendant le jeu uniquement
  document.addEventListener('ecran-affiche', () => toggleWatch(store.get().screen === 'step3-jeu'));
}

const goal = g => Math.min(3, g.targets.length);
const finished = g => g.found.length >= goal(g) || g.attempts <= 0;

async function start(e) {
  await busy(e.currentTarget, 'Chargement des contacts…', loadReciprocal);
  show('step3-jeu');
}

function enterGame() {
  renderQR($('#qr3'), myPayload(store.get().profile), 130, store.get().profile.pseudo);
  if (!store.get().game) buildTargets();
  render();
}

// Ajoute aux contacts les personnes qui m'ont scanné
async function loadReciprocal() {
  const { code, profile } = store.get();
  try {
    const found = await fetchReciprocal(code, profile.id.slice(0, 12));
    const added = found.map(f => addContact(f, 'reciproque')).filter(Boolean);
    if (added.length) {
      toast(`${added.length} personne${added.length > 1 ? 's' : ''} vous avai${added.length > 1 ? 'ent' : 't'} scanné : ajoutée${added.length > 1 ? 's' : ''} à vos contacts.`);
    }
  } catch (err) {
    console.error(err);
    toast('Contacts non récupérés. Appuyez sur « Actualiser mes contacts ».', 'error');
  }
}

// Les 5 plus proches ; on garde ceux déjà trouvés s'ils restent dans le lot
function buildTargets() {
  const { contacts, game } = store.get();
  const targets = [...contacts].sort((a, b) => a.distance - b.distance).slice(0, NB_CIBLES).map(c => c.id);
  store.set({ game: {
    targets,
    found: (game?.found || []).filter(id => targets.includes(id)),
    attempts: game?.attempts ?? NB_ESSAIS
  } });
}

const infoJeu = () => { const g = store.get().game; return `${g.found.length} sur ${goal(g)} trouvés, ${g.attempts} essais restants`; };

async function toggleScan() {
  try { await startScan(onCode, { titre: 'Scannez un de vos voisins', info: infoJeu() }); }
  catch (e) { toast(cameraError(e), 'error'); }
}

function onCode(raw) {
  const d = parsePayload(raw);
  if (!d) { toast("Ce QR code n'est pas celui d'un participant.", 'error'); return; }
  const { profile, game } = store.get();
  if (finished(game)) return false;
  if (d.id === profile.id.slice(0, 12)) { toast("C'est votre propre code.", 'error'); return; }
  if (game.found.includes(d.id)) { toast(`${d.pseudo} est déjà trouvé.`); return; }

  if (game.targets.includes(d.id)) {
    game.found.push(d.id);
    toast(`Trouvé : ${d.pseudo} !`);
    // Prévient l'autre : s'il me cherchait aussi, je compte pour lui sans qu'il me scanne
    saveRetrouvaille(store.get().code, profile, d.id).catch(e => console.warn('Retrouvaille pas encore envoyée', e));
  } else {
    game.attempts--;
    toast(`${d.pseudo} habite à ${fmtKm(roadKm(profile, d))} : pas dans vos 5 voisins.`, 'error');
  }
  store.set({ game });
  render();
  setScanInfo(infoJeu());
  if (finished(game)) return false;
}

function render() {
  const { contacts, game } = store.get();
  const byId = Object.fromEntries(contacts.map(c => [c.id, c]));
  const g = goal(game);

  $('#score3').textContent = `${game.found.length} sur ${g}`;
  $('#essais3').textContent = game.attempts;
  $('#cibles').innerHTML = game.targets.length
    ? game.targets.map(id => {
        const c = byId[id], ok = game.found.includes(id);
        return `<li class="${ok ? 'trouve' : ''}"><span>${ok ? '✓ ' : ''}${esc(c.pseudo)}</span><span class="km">${fmtKm(c.distance)}</span></li>`;
      }).join('')
    : '<li class="vide">Aucun contact pour l\'instant. Revenez à l\'étape Rencontres ou actualisez vos contacts.</li>';

  const res = $('#resultat3');
  if (g > 0 && game.found.length >= g) { res.textContent = 'Bravo, vous avez retrouvé vos voisins ! Restez près d\'eux pour la suite.'; res.className = 'resultat gagne'; res.hidden = false; }
  else if (game.attempts <= 0) { res.textContent = 'Plus d\'essais. Demandez à vos voisins de se signaler : leurs pseudos sont dans la liste.'; res.className = 'resultat'; res.hidden = false; }
  else res.hidden = true;

  $('#btn-scan3').hidden = finished(game) || !game.targets.length;
}

// ---------- Réciprocité : on m'a retrouvé ----------
let unsub = null;
async function toggleWatch(on) {
  if (on && !unsub) {
    unsub = 'en cours';
    try {
      unsub = await watchRetrouvailles(store.get().code, store.get().profile.id.slice(0, 12), list => list.forEach(r => {
        const { game, contacts } = store.get();
        if (!game || finished(game) || !game.targets.includes(r.fromId12) || game.found.includes(r.fromId12)) return;
        game.found.push(r.fromId12);
        store.set({ game });
        const c = contacts.find(x => x.id === r.fromId12);
        toast(`${c?.pseudo || r.fromPseudo} vous a retrouvé : compté pour vous aussi !`);
        navigator.vibrate?.(80);
        render();
        setScanInfo(infoJeu());
      }));
    } catch (err) { console.warn(err); unsub = null; }
  } else if (!on && typeof unsub === 'function') { unsub(); unsub = null; }
}
