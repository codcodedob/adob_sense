// lib/firebaseAdmin.ts
import * as admin from "firebase-admin";

declare global {
  // eslint-disable-next-line no-var
  var __FIREBASE_ADMIN_APP__: admin.app.App | undefined;
}

if (!global.__FIREBASE_ADMIN_APP__) {
  const b64 = process.env.FIREBASE_SERVICE_KEY_B64;
  if (!b64) throw new Error("FIREBASE_SERVICE_KEY_B64 is missing");

  const serviceKey = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));

  global.__FIREBASE_ADMIN_APP__ = admin.initializeApp({
    credential: admin.credential.cert(serviceKey),
  });
}

export const adminApp = global.__FIREBASE_ADMIN_APP__!;
export const adminDb = admin.firestore();
