// lib/firebaseClient.ts
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Guard so we never initialize with partial/undefined values (causes “different options”)
function must(name: string): string {
  const v = process.env[`NEXT_PUBLIC_${name}`];
  if (!v) throw new Error(`Missing NEXT_PUBLIC_${name}`);
  return v;
}

const firebaseConfig = {
  apiKey:            must("FIREBASE_API_KEY"),
  authDomain:        must("FIREBASE_AUTH_DOMAIN"),
  projectId:         must("FIREBASE_PROJECT_ID"),
  storageBucket:     must("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: must("FIREBASE_MESSAGING_SENDER_ID"),
  appId:             must("FIREBASE_APP_ID"),
};

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);
export const storage: FirebaseStorage = getStorage(app);
export default app;
