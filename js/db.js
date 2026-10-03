// SEUL fichier qui parle à Firestore. Le schéma des données est entièrement ici.
import { db, ensureAuth } from './firebase.js?v=6i';
import { doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('Délai dépassé'), { code: 'timeout' })), ms))
  ]);
}

// 3 tentatives ; on n'insiste pas sur un refus de permission (inutile).
async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await withTimeout(fn()); }
    catch (e) {
      last = e;
      if (e.code === 'permission-denied') break;
      await sleep(800 * (i + 1));
    }
  }
  throw last;
}

// workshops/{CODE}
export async function fetchWorkshop(code) {
  await ensureAuth();
  const snap = await withRetry(() => getDoc(doc(db, 'workshops', code)));
  return snap.exists() ? snap.data() : null;
}

// workshops/{CODE}/participants/{id}
// Champs identiques à la v2 ; ajout de `uid` (préparation du durcissement des règles).
export async function saveParticipant(code, p) {
  const user = await ensureAuth();
  await withRetry(() => setDoc(doc(db, 'workshops', code, 'participants', p.id), {
    pseudo: p.pseudo,
    lat: p.lat,
    lon: p.lon,
    transport: p.transport,
    transport2: p.transport2 || '',
    mode1Days: p.mode1Days || 0,
    mode2Days: p.mode2Days || 0,
    nbTrajetsAR: p.nbTrajetsAR,
    joursPresence: p.joursPresence,
    departureTime: p.departureTime,
    timestamp: new Date().toISOString(),
    uid: user.uid
  }));
}

// workshops/{CODE}/participantScans/{id} : toutes MES rencontres (champs identiques à la v2).
// Une rencontre est mutuelle : celles reçues par scan de l'autre sont incluses.
export async function saveScans(code, profile, contacts) {
  await ensureAuth();
  const mine = contacts;
  await withRetry(() => setDoc(doc(db, 'workshops', code, 'participantScans', profile.id), {
    scannerId12: profile.id.slice(0, 12),
    scannerLat: profile.lat,
    scannerLon: profile.lon,
    scannerPseudo: profile.pseudo,
    scannedIds: mine.map(c => c.id),
    scannedParticipants: mine.map(c => ({ id: c.id, lat: c.lat, lon: c.lon, pseudo: c.pseudo })),
    timestamp: new Date().toISOString()
  }));
}

// workshops/{CODE}/rencontres/{de}_{vers} : UN petit document par scan.
// Seule la personne scannée le lit : le coût en lectures croît comme le nombre de scans,
// et non comme son carré (ce qu'aurait coûté l'écoute des listes complètes).
// Identifiant fixe : rescanner la même personne ne crée pas de doublon.
export async function saveRencontre(code, profile, toId12) {
  await ensureAuth();
  const from = profile.id.slice(0, 12);
  await withRetry(() => setDoc(doc(db, 'workshops', code, 'rencontres', `${from}_${toId12}`), {
    fromId12: from,
    fromLat: profile.lat,
    fromLon: profile.lon,
    fromPseudo: profile.pseudo,
    toId12,
    timestamp: new Date().toISOString()
  }));
}

const rencontresVers = (code, id12) =>
  query(collection(db, 'workshops', code, 'rencontres'), where('toId12', '==', id12));

const versContact = d => ({ id: d.fromId12, lat: d.fromLat, lon: d.fromLon, pseudo: d.fromPseudo || 'Anonyme' });

// Qui m'a scanné ? (lecture ponctuelle, bouton « Actualiser »)
export async function fetchReciprocal(code, id12) {
  await ensureAuth();
  const snap = await withRetry(() => getDocs(rencontresVers(code, id12)));
  return snap.docs.map(d => versContact(d.data()));
}

// Même chose en temps réel : cb(liste) à chaque nouveau scan me concernant
export async function watchReciprocal(code, id12, cb) {
  await ensureAuth();
  return onSnapshot(rencontresVers(code, id12),
    snap => cb(snap.docChanges().filter(ch => ch.type === 'added').map(ch => versContact(ch.doc.data()))),
    err => console.warn('Écoute des rencontres interrompue', err));
}

// workshops/{CODE}/groups/{id} : écrit par le scribe à chaque étape de la discussion
// (champs v2 conservés, plus statut/themeIdx/phaseIdx/phaseDebut/discussionDebut/scribePseudo).
export async function saveGroup(code, id, data) {
  await ensureAuth();
  await withRetry(() => setDoc(doc(db, 'workshops', code, 'groups', id), { ...data, timestamp: new Date().toISOString() }, { merge: true }));
}

// Le groupe dont je fais partie, en temps réel (membres et maître du temps)
export async function watchMyGroup(code, id12, cb) {
  await ensureAuth();
  const q = query(collection(db, 'workshops', code, 'groups'), where('memberIds', 'array-contains', id12));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    cb(docs[0] || null);
  }, err => console.warn('Écoute du groupe interrompue', err));
}

// workshops/{CODE}/responses/{id} : engagements individuels (27 champs identiques à la v2)
export async function saveResponse(code, id, data) {
  await ensureAuth();
  await withRetry(() => setDoc(doc(db, 'workshops', code, 'responses', id), data));
}

// workshops/{CODE}/retrouvailles/{de}_{vers} : A a retrouvé B au jeu des voisins.
// B l'écoute : si A fait aussi partie de ses voisins, il est compté trouvé sans second scan.
export async function saveRetrouvaille(code, profile, toId12) {
  await ensureAuth();
  const from = profile.id.slice(0, 12);
  await withRetry(() => setDoc(doc(db, 'workshops', code, 'retrouvailles', `${from}_${toId12}`), {
    fromId12: from, fromPseudo: profile.pseudo, toId12, timestamp: new Date().toISOString()
  }));
}

export async function watchRetrouvailles(code, id12, cb) {
  await ensureAuth();
  const q = query(collection(db, 'workshops', code, 'retrouvailles'), where('toId12', '==', id12));
  return onSnapshot(q,
    snap => cb(snap.docChanges().filter(ch => ch.type === 'added').map(ch => ch.doc.data())),
    err => console.warn('Écoute du jeu interrompue', err));
}
