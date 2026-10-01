// SEUL fichier qui parle à Firestore. Le schéma des données est entièrement ici.
import { db, ensureAuth } from './firebase.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

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
