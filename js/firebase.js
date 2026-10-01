// Connexion Firebase (même projet que la v2 et l'outil admin).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

const app = initializeApp({
  apiKey: 'AIzaSyA1kCMI8y79U6BIxKfNc-uKUpiouc0HyIM',
  authDomain: 'godifferent-v2.firebaseapp.com',
  projectId: 'godifferent-v2',
  storageBucket: 'godifferent-v2.firebasestorage.app',
  messagingSenderId: '954459641914',
  appId: '1:954459641914:web:55e904e1a05cd2de307d03'
});

export const db = getFirestore(app);
const auth = getAuth(app);

// Garantit une session anonyme AVANT toute lecture/écriture (corrige la course de la v2).
let authPromise = null;
export function ensureAuth() {
  if (!authPromise) {
    authPromise = (async () => {
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser;
      return (await signInAnonymously(auth)).user;
    })().catch(err => { authPromise = null; throw err; });
  }
  return authPromise;
}
