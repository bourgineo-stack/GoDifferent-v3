// Co-construction en groupe.
// Le scribe tient le déroulé sur son téléphone et l'enregistre à chaque changement de phase.
// Le maître du temps et les membres suivent en direct (écoute du document du groupe).
import { store } from '../store.js';
import { show, onEnter } from '../router.js';
import { saveGroup, watchMyGroup } from '../db.js';
import { startScan, stopScan, setScanInfo, cameraError } from '../scanner.js';
import { myPayload, renderQR, parsePayload } from '../qr.js';
import { roadKm } from '../calc.js';
import { $, esc, toast, busy, ecranAllume } from '../ui.js';
import { CONFIG } from '../config.js';
import { THEMES, PHASES, CONTENU, CONSIGNES_SCRIBE, RESSOURCES_COMMUNES } from '../contenu.js';

const THEME_SEC = CONFIG.THEME_DURATION_SECONDS;
const id12 = () => store.get().profile.id.slice(0, 12);
const g = () => store.get().groupe || {};
const setG = patch => store.set({ groupe: { ...g(), ...patch } });
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const since = iso => iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000) : 0;

let tick = null;     // chrono affiché (scribe et maître du temps)
let unsub = null;    // écoute du groupe
let alerted = '';    // phase déjà signalée comme dépassée

export function init() {
  // Règles de désignation
  $('#regle-scribe').textContent = CONFIG.SCRIBE_RULE;
  $('#regle-temps').textContent = CONFIG.TIMER_MASTER_RULE;

  // Choix du rôle
  document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => chooseRole(b.dataset.role)));
  document.querySelectorAll('[data-changer-role]').forEach(b => b.addEventListener('click', () => { stopScan(); setG({ role: null }); show('groupe-roles'); }));

  // Scribe
  $('#btn-scan-groupe').addEventListener('click', toggleScan);
  $('#btn-valider-groupe').addEventListener('click', validateGroup);
  document.querySelectorAll('[data-distance]').forEach(b => b.addEventListener('click', () => chooseDistance(b.dataset.distance)));
  $('#phase-contenu').addEventListener('click', onPhaseClick);
  $('#btn-phase-prec').addEventListener('click', () => movePhase(-1));
  $('#btn-phase-suiv').addEventListener('click', () => movePhase(+1));
  $('#btn-fin-groupe').addEventListener('click', finish);
  $('#btn-attente-suite').addEventListener('click', () => show(g().role === 'timer' ? 'groupe-chrono' : 'groupe-suivi'));

  onEnter('groupe-attente', enterWaiting);
  onEnter('groupe-scan', renderMembers);
  onEnter('groupe-distance', renderDistance);
  onEnter('groupe-discussion', renderPhase);
  onEnter('groupe-synthese', renderSynthese);
  onEnter('groupe-chrono', renderChrono);
  onEnter('groupe-suivi', renderSuivi);

  // Chrono coupé hors des écrans qui l'affichent ; écoute du groupe active pendant la co-construction et les engagements
  document.addEventListener('ecran', () => { clearInterval(tick); tick = null; ecranAllume(false); });
  ['groupe-attente', 'groupe-discussion', 'groupe-chrono', 'groupe-suivi'].forEach(ecr => {
    document.addEventListener('ecran-affiche', () => { if (store.get().screen === ecr) ecranAllume(true); });
  });
  document.addEventListener('ecran-affiche', e => toggleWatch(['stepgroup', 'step6'].includes(e.detail.step)));
}

// ---------- Rôles ----------
function chooseRole(role) {
  setG({ role });
  show(role === 'scribe' ? 'groupe-scan' : 'groupe-attente');
}

function enterWaiting() {
  const role = g().role;
  $('#attente-role').textContent = role === 'timer' ? 'Vous êtes le maître du temps' : 'Vous êtes membre du groupe';
  renderQR($('#qr-groupe'), myPayload(store.get().profile), 200, store.get().profile.pseudo);
  if (g().doc) goToFollowView(); // déjà ajouté : on passe directement à la suite
}

// ---------- Écoute du groupe (membres et maître du temps) ----------
async function toggleWatch(on) {
  const role = g().role;
  if (on && role && role !== 'scribe') {
    if (unsub) return;
    unsub = 'en cours';
    try {
      unsub = await watchMyGroup(store.get().code, id12(), doc => {
        if (!doc) return;
        const wasNew = !g().doc;
        setG({ doc, id: doc.id });
        const screen = store.get().screen;
        if (wasNew && screen === 'groupe-attente') { toast(`Vous avez rejoint le groupe de ${doc.scribePseudo || 'votre scribe'}.`); goToFollowView(); }
        else if (doc.statut === 'termine' && ['groupe-chrono', 'groupe-suivi', 'groupe-attente'].includes(screen)) {
          // Le scribe a terminé : tout le groupe passe aux 5 dernières minutes en même temps que lui
          navigator.vibrate?.([120, 80, 120]);
          toast('Discussion terminée : encore 5 minutes pour échanger.');
          show('groupe-cercles');
        }
        else if (screen === 'groupe-chrono') renderChrono();
        else if (screen === 'groupe-suivi') renderSuivi();
      });
    } catch (err) { console.warn(err); unsub = null; }
  } else if (!on && typeof unsub === 'function') {
    unsub();
    unsub = null;
  }
}

function goToFollowView() {
  show(g().role === 'timer' ? 'groupe-chrono' : 'groupe-suivi');
}

// ---------- Scribe : formation du groupe ----------
const infoGroupe = () => `${(g().membres || []).length + 1} personnes dans le groupe, vous compris`;

async function toggleScan() {
  try { await startScan(onMemberCode, { titre: 'Scannez chaque membre du groupe', info: infoGroupe() }); }
  catch (e) { toast(cameraError(e), 'error'); }
}

function onMemberCode(raw) {
  const d = parsePayload(raw);
  if (!d) { toast("Ce QR code n'est pas celui d'un participant.", 'error'); return; }
  if (d.id === id12()) { toast("C'est votre propre code.", 'error'); return; }
  const membres = g().membres || [];
  if (membres.some(m => m.id === d.id)) { toast(`${d.pseudo} est déjà dans le groupe.`); return; }
  setG({ membres: [...membres, d] });
  toast(`${d.pseudo} ajouté au groupe`);
  renderMembers();
  setScanInfo(infoGroupe());
}

function renderMembers() {
  const membres = g().membres || [];
  $('#liste-membres').innerHTML = membres.length
    ? membres.map(m => `<li><span>${esc(m.pseudo)}</span><button type="button" class="lien" data-retirer="${esc(m.id)}">Retirer</button></li>`).join('')
    : '<li class="vide">Scannez chaque membre, maître du temps compris.</li>';
  $('#liste-membres').querySelectorAll('[data-retirer]').forEach(b => b.addEventListener('click', () => {
    setG({ membres: (g().membres || []).filter(m => m.id !== b.dataset.retirer) });
    renderMembers();
  }));
  $('#btn-valider-groupe').disabled = membres.length < 1;
  $('#btn-valider-groupe').textContent = `Valider le groupe (${membres.length + 1} personnes)`;
}

async function validateGroup(e) {
  stopScan();
  const { profile, code } = store.get();
  const membres = g().membres || [];
  const id = g().id || 'grp_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
  setG({ id, statut: 'formation' });
  await busy(e.currentTarget, 'Enregistrement…', async () => {
    try {
      await saveGroup(code, id, {
        scribeId: profile.id, scribeId12: id12(), scribePseudo: profile.pseudo,
        memberIds: membres.map(m => m.id), members: membres.map(m => m.id).join(','),
        statut: 'formation'
      });
    } catch (err) { console.warn(err); toast("Groupe pas encore enregistré (réseau). L'envoi se fera dès que possible.", 'error'); }
  });
  show('groupe-distance');
}

// Proches ou éloignés : recommandation calculée à partir des domiciles du groupe
function renderDistance() {
  const { profile, workshop } = store.get();
  const work = { lat: workshop.companyLat, lon: workshop.companyLon };
  const seuil = CONFIG.DISTANCE_THRESHOLD_KM;
  document.querySelectorAll('[data-seuil]').forEach(el => { el.textContent = seuil; });
  const box = $('#reco-distance');
  if (!(work.lat || work.lon)) { box.hidden = true; return; }
  const gens = [profile, ...(g().membres || [])];
  const proches = gens.filter(p => roadKm(work, p) < seuil).length;
  const reco = proches > gens.length / 2 ? 'près du travail' : 'loin du travail';
  box.textContent = `${proches} personne${proches > 1 ? 's' : ''} sur ${gens.length} habite${proches > 1 ? 'nt' : ''} à moins de ${seuil} km du travail : parcours « ${reco} » recommandé. Le groupe peut choisir l'autre.`;
  box.hidden = false;
}

function chooseDistance(distance) {
  const now = new Date().toISOString();
  setG({
    distance, themeIdx: 0, phaseIdx: 0, phaseDebut: now, discussionDebut: now, statut: 'discussion',
    votes: { theme1: {}, theme2: {} }, notes: { theme1: {}, theme2: {} }
  });
  push();
  show('groupe-discussion');
}

// ---------- Scribe : discussion ----------
const theme = () => THEMES[g().distance][g().themeIdx];
const phase = () => PHASES[g().phaseIdx];
const tk = () => (g().themeIdx === 0 ? 'theme1' : 'theme2');

function renderPhase() {
  const t = theme(), p = phase(), c = CONTENU[t.key][p.key];
  $('#disc-theme').textContent = `Sujet ${g().themeIdx + 1} sur 2 : ${t.nom}`;
  $('#disc-theme').style.setProperty('--theme', t.couleur);
  $('#disc-phases').innerHTML = PHASES.map((ph, i) =>
    `<li class="${i < g().phaseIdx ? 'fait' : ''}${i === g().phaseIdx ? ' ici' : ''}">${ph.nom}</li>`).join('');
  $('#disc-consigne').textContent = CONSIGNES_SCRIBE[p.key];

  let html = '';
  if (p.key === 'revelation') {
    html = `<div class="carte question"><p class="question-texte">${esc(c.question)}</p>
      <button type="button" class="btn btn-second" data-reveler>Révéler la réponse</button>
      <p class="reponse" hidden>${esc(c.reponse)}</p></div>` + listeQuestions(c.discussion);
  } else if (p.key === 'freins') {
    html = `<h3 class="sous-titre">Les freins du groupe</h3>${compteurs('freins', c.options)}`;
    if (c.valeurs) html += `<h3 class="sous-titre">${esc(c.valeurs.intro)}</h3>${compteurs('valeurs', c.valeurs.options)}`;
    html += listeQuestions(c.discussion);
  } else {
    html = `<h3 class="sous-titre">Qui est prêt à s'engager ?</h3>${compteurs('engagements', c.engagements)}
      <h3 class="sous-titre">Astuces à partager</h3><ul class="puces">${c.astuces.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
  }
  $('#phase-contenu').innerHTML = html;
  $('#phase-notes').value = g().notes?.[tk()]?.[p.key] || '';

  const first = g().themeIdx === 0 && g().phaseIdx === 0;
  const last = g().themeIdx === 1 && g().phaseIdx === 2;
  $('#btn-phase-prec').hidden = first;
  $('#btn-phase-suiv').textContent = last ? 'Voir la synthèse' : p.key === 'action' ? 'Sujet suivant' : 'Phase suivante';
  startTick(() => {
    const dur = THEME_SEC * p.part, el = since(g().phaseDebut);
    $('#disc-chrono').textContent = `${fmt(el)} / ${fmt(dur)}`;
    $('#disc-chrono').classList.toggle('depasse', el > dur);
  });
}

function listeQuestions(qs) {
  return `<h3 class="sous-titre">Questions pour le groupe</h3><ul class="puces">${qs.map(q => `<li>${esc(q)}</li>`).join('')}</ul>`;
}

function compteurs(cat, options) {
  const v = g().votes?.[tk()]?.[cat] || {};
  return `<ul class="compteurs">${options.map((o, i) => `<li><span>${esc(o)}</span>
    <span class="compteur"><button type="button" data-cat="${cat}" data-i="${i}" data-delta="-1" aria-label="Retirer une voix">−</button>
    <strong>${v[i] || 0}</strong>
    <button type="button" data-cat="${cat}" data-i="${i}" data-delta="1" aria-label="Ajouter une voix">+</button></span></li>`).join('')}</ul>`;
}

function onPhaseClick(e) {
  if (e.target.closest('[data-reveler]')) {
    e.target.closest('[data-reveler]').hidden = true;
    $('#phase-contenu .reponse').hidden = false;
    return;
  }
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const votes = structuredClone(g().votes || { theme1: {}, theme2: {} });
  const cat = (votes[tk()][b.dataset.cat] ||= {});
  cat[b.dataset.i] = Math.max(0, (cat[b.dataset.i] || 0) + Number(b.dataset.delta));
  setG({ votes });
  b.parentElement.querySelector('strong').textContent = cat[b.dataset.i];
}

function saveNotes() {
  const notes = structuredClone(g().notes || { theme1: {}, theme2: {} });
  notes[tk()][phase().key] = $('#phase-notes').value.trim();
  setG({ notes });
}

function movePhase(dir) {
  saveNotes();
  let { themeIdx, phaseIdx } = g();
  phaseIdx += dir;
  if (phaseIdx > 2) { if (themeIdx === 1) { setG({ statut: 'synthese' }); push(); return show('groupe-synthese'); } themeIdx = 1; phaseIdx = 0; }
  if (phaseIdx < 0) { if (themeIdx === 0) return; themeIdx = 0; phaseIdx = 2; }
  setG({ themeIdx, phaseIdx, phaseDebut: new Date().toISOString() });
  push();
  renderPhase();
  window.scrollTo(0, 0);
}

// Conversion au format v2 (champs `data` et `phaseNotes`), lu par la suite de la chaîne
function toV2() {
  const data = {}, phaseNotes = {};
  THEMES[g().distance].forEach((t, i) => {
    const k = i === 0 ? 'theme1' : 'theme2', v = g().votes?.[k] || {}, c = CONTENU[t.key];
    const list = (opts, cat, field) => opts.map((text, j) => ({ text, [field]: v[cat]?.[j] || 0 })).filter(x => x[field] > 0);
    data[k] = {
      freins: list(c.freins.options, 'freins', 'votes'),
      valeurs: Object.fromEntries((c.freins.valeurs?.options || []).map((text, j) => [text, v.valeurs?.[j] || 0]).filter(([, n]) => n > 0)),
      engagements: list(c.action.engagements, 'engagements', 'count')
    };
    phaseNotes[k] = { revelation: '', freins: '', action: '', ...(g().notes?.[k] || {}) };
  });
  return { data, phaseNotes };
}

// Enregistrement du groupe (scribe) : silencieux pendant la discussion, renvoie true si confirmé
function push(extra = {}) {
  const { data, phaseNotes } = toV2();
  const s = g();
  const payload = {
    distance: s.distance === 'proche' ? 'proche' : 'eloigne',
    themes: THEMES[s.distance].map(t => t.key).join(','),
    data: JSON.stringify(data), phaseNotes: JSON.stringify(phaseNotes),
    statut: s.statut, themeIdx: s.themeIdx, phaseIdx: s.phaseIdx,
    phaseDebut: s.phaseDebut, discussionDebut: s.discussionDebut,
    ...extra
  };
  setG({ doc: { ...(s.doc || {}), ...payload, id: s.id } }); // même forme que chez les membres (sert au bilan)
  return saveGroup(store.get().code, s.id, payload).then(() => true).catch(err => { console.warn('Groupe pas encore enregistré', err); return false; });
}

// ---------- Scribe : synthèse ----------
function renderSynthese() {
  const { data } = toV2();
  $('#synthese-contenu').innerHTML = THEMES[g().distance].map((t, i) => {
    const d = data[i === 0 ? 'theme1' : 'theme2'];
    const top = [...d.freins].sort((a, b) => b.votes - a.votes).slice(0, 3);
    const val = Object.entries(d.valeurs).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return `<div class="carte synthese" style="--theme:${t.couleur}"><h3>${esc(t.nom)}</h3>
      ${top.length ? `<p class="etiquette">Freins principaux</p><ul class="puces">${top.map(f => `<li>${esc(f.text)} (${f.votes} voix)</li>`).join('')}</ul>` : ''}
      ${val.length ? `<p class="etiquette">Valeurs prioritaires</p><ul class="puces">${val.map(([v, n]) => `<li>${esc(v)} (${n} voix)</li>`).join('')}</ul>` : ''}
      ${d.engagements.length ? `<p class="etiquette">Engagements</p><ul class="puces">${d.engagements.map(x => `<li>${esc(x.text)} : ${x.count} personne${x.count > 1 ? 's' : ''}</li>`).join('')}</ul>` : ''}
      ${!top.length && !val.length && !d.engagements.length ? '<p class="aide">Aucun vote enregistré.</p>' : ''}</div>`;
  }).join('');
  $('#synthese-notes').value = g().synthese || '';
}

async function finish(e) {
  const synthese = $('#synthese-notes').value.trim();
  setG({ synthese, statut: 'termine' });
  await busy(e.currentTarget, 'Enregistrement…', async () => {
    if (!(await push({ notes: synthese }))) toast("Synthèse pas encore envoyée (réseau). Gardez l'application ouverte quelques instants.", 'error');
  });
  show('groupe-cercles');
}

// ---------- Maître du temps ----------
function renderChrono() {
  const d = g().doc;
  const fin = d?.statut === 'termine';
  $('#chrono-fin').hidden = !fin;
  if (!d || !d.distance || d.statut === 'formation') {
    $('#chrono-sujet').textContent = 'En attente du choix des sujets';
    $('#chrono-phase').textContent = '';
    $('#chrono-temps').textContent = '--:--';
    $('#chrono-cible').textContent = '';
    $('#chrono-total').textContent = '';
    return;
  }
  const t = THEMES[d.distance === 'proche' ? 'proche' : 'eloigne'][d.themeIdx || 0];
  const p = PHASES[d.phaseIdx || 0];
  $('#chrono-sujet').textContent = fin ? 'Discussion terminée' : d.statut === 'synthese' ? 'Synthèse en cours' : `Sujet ${d.themeIdx + 1} sur 2 : ${t.nom}`;
  $('#chrono-phase').textContent = fin || d.statut === 'synthese' ? '' : `Phase ${d.phaseIdx + 1} sur 3 : ${p.nom}`;
  if (fin) { clearInterval(tick); $('#chrono-temps').textContent = 'Fin'; $('#chrono-cible').textContent = ''; $('#chrono-alerte').hidden = true; return; }
  startTick(() => {
    const dur = THEME_SEC * p.part, el = since(d.phaseDebut), total = since(d.discussionDebut);
    const over = el > dur && d.statut === 'discussion';
    $('#chrono-temps').textContent = d.statut === 'synthese' ? fmt(total) : fmt(el);
    $('#chrono-cible').textContent = d.statut === 'synthese' ? 'temps total' : `sur ${fmt(dur)} prévues`;
    $('#chrono-temps').classList.toggle('depasse', over);
    $('#chrono-alerte').hidden = !over;
    $('#chrono-total').textContent = `Temps total : ${fmt(total)} sur ${fmt(THEME_SEC * 2)}`;
    $('#chrono-barre').style.width = `${Math.min(100, total / (THEME_SEC * 2) * 100)}%`;
    const key = `${d.themeIdx}-${d.phaseIdx}`;
    if (over && alerted !== key) { alerted = key; navigator.vibrate?.([200, 100, 200]); }
  });
}

function startTick(fn) {
  clearInterval(tick);
  fn();
  tick = setInterval(fn, 1000);
}

// ---------- Membre ----------
function renderSuivi() {
  const d = g().doc;
  $('#suivi-scribe').textContent = d?.scribePseudo || 'votre scribe';
  const fin = d?.statut === 'termine';
  $('#suivi-fin').hidden = !fin;
  const dist = d?.distance === 'proche' ? 'proche' : d?.distance ? 'eloigne' : null;
  if (dist && d.statut === 'discussion') {
    const t = THEMES[dist][d.themeIdx || 0], p = PHASES[d.phaseIdx || 0];
    $('#suivi-etat').textContent = `Sujet ${d.themeIdx + 1} sur 2 : ${t.nom}. Phase : ${p.nom}.`;
  } else {
    $('#suivi-etat').textContent = fin ? 'La discussion est terminée.' : d?.statut === 'synthese' ? 'Le scribe rédige la synthèse.' : 'Le groupe choisit ses sujets.';
  }
  const res = dist ? THEMES[dist].map(t => ({ nom: t.nom, url: t.ressource })) : [];
  $('#suivi-ressources').innerHTML = [...res, ...RESSOURCES_COMMUNES]
    .map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nom)}</a></li>`).join('');
}
