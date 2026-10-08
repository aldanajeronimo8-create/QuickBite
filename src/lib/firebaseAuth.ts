declare global {
  interface Window {
    firebase?: any;
  }
}

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const FIREBASE_SDK_VERSION = '12.19.0';
let sdkPromise: Promise<void> | null = null;

function hasFirebaseConfig() {
  return Object.values(FIREBASE_CONFIG).every(Boolean);
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('firebase_sdk_load_failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.loaded = 'false';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('firebase_sdk_load_failed'));
    };
    document.head.appendChild(script);
  });
}

async function loadSdk() {
  if (typeof window === 'undefined') throw new Error('firebase_browser_required');
  if (window.firebase?.auth) return;
  if (!hasFirebaseConfig()) throw new Error('firebase_config_missing');

  sdkPromise ??= (async () => {
    await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`);
    await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js`);
  })();

  try {
    await sdkPromise;
  } catch (error) {
    sdkPromise = null;
    throw error;
  }
}

async function getFirebaseAuth() {
  await loadSdk();
  if (!window.firebase) throw new Error('firebase_not_loaded');
  if (!window.firebase.apps.length) window.firebase.initializeApp(FIREBASE_CONFIG);
  return window.firebase.auth();
}

export function isFirebaseConfigured() {
  return hasFirebaseConfig();
}

export async function signInWithFirebaseGoogle() {
  const firebaseAuth = await getFirebaseAuth();
  const provider = new window.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await firebaseAuth.signInWithPopup(provider);
    const credential = window.firebase.auth.GoogleAuthProvider.credentialFromResult(result) ?? result.credential ?? null;
    const idToken = credential?.idToken ?? '';

    if (!idToken) throw new Error('google_id_token_missing');

    return {
      uid: result.user.uid,
      email: result.user.email?.trim().toLowerCase() ?? '',
      fullName: result.user.displayName ?? '',
      idToken,
      accessToken: credential?.accessToken ?? '',
    };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user') throw new Error('google_popup_closed');
    if (error?.code === 'auth/popup-blocked') throw new Error('google_popup_blocked');
    if (error?.code === 'auth/unauthorized-domain') throw new Error('google_domain_not_authorized');
    if (error?.code === 'auth/account-exists-with-different-credential') {
      throw new Error('google_account_exists_with_different_credential');
    }
    throw error;
  }
}

export async function signOutFirebase() {
  if (typeof window !== 'undefined' && window.firebase) {
    await window.firebase.auth().signOut();
  }
}

export {};
