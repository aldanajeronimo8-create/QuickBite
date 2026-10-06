declare global { interface Window { firebase?: any } }
const config = {
  apiKey: "AIzaSyCsFFs8_5LGNCyQo_3tqblRZlPvysFOXwg",
  authDomain: "quickbite-daf31.firebaseapp.com",
  projectId: "quickbite-daf31",
  storageBucket: "quickbite-daf31.firebasestorage.app",
  messagingSenderId: "678157251455",
  appId: "1:678157251455:web:f6803ebfe250998351604a"
};
function auth() {
  if (!window.firebase) throw new Error('firebase_not_loaded');
  if (!window.firebase.apps.length) window.firebase.initializeApp(config);
  return window.firebase.auth();
}
export function isFirebaseConfigured() { return typeof window !== 'undefined' && Boolean(window.firebase); }
export async function signInWithFirebaseGoogle() {
  const firebaseAuth = auth();
  const provider = new window.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await firebaseAuth.signInWithPopup(provider);
  return { uid: result.user.uid, email: result.user.email?.trim().toLowerCase() ?? '', fullName: result.user.displayName ?? '' };
}
export async function signOutFirebase() { if (window.firebase) await window.firebase.auth().signOut(); }
export {};
