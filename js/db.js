// SEUL fichier qui parle à Firestore. Le schéma des données est entièrement ici.
import { db, ensureAuth } from './firebase.js';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

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

// workshops/{CODE}/participantScans/{id} : MES scans uniquement (champs identiques à la v2)
export async function saveScans(code, profile, contacts) {
  await ensureAuth();
  const mine = contacts.filter(c => c.source === 'scan');
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

// Qui m'a scanné ? Une seule requête ciblée : remplace l'agrégat meta/scansAggregated de la v2
// (qui figeait la liste au premier arrivant et perdait les scans des retardataires).
export async function fetchReciprocal(code, id12) {
  await ensureAuth();
  const q = query(collection(db, 'workshops', code, 'participantScans'), where('scannedIds', 'array-contains', id12));
  const snap = await withRetry(() => getDocs(q));
  return snap.docs.map(d => d.data())
    .filter(d => d.scannerId12 && d.scannerId12 !== id12)
    .map(d => ({ id: d.scannerId12, lat: d.scannerLat, lon: d.scannerLon, pseudo: d.scannerPseudo || 'Anonyme' }));
}
