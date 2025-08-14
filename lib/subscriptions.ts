// lib/subscriptions.ts
import { addDays } from "./time";
import { db } from "../lib/firebaseClient";
import { doc, setDoc, getDoc } from "firebase/firestore";

export async function startFreeTrial(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const user = snap.data() || {};

  if (user.trialUsed === true) {
    throw new Error("Free trial already used.");
  }

  const end = addDays(new Date(), 7);
  const endIso = end.toISOString();

  await setDoc(
    ref,
    {
      subscriptionType: "FREETRIAL",
      subEndIso: endIso,               // our canonical string
      subscriptionEndDate: endIso,     // keep legacy field useful too
      status: "ACTIVE",
      trialUsed: true,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return endIso;
}

export function isActive(endIso?: string | null) {
  if (!endIso) return false;
  return new Date(endIso).getTime() > Date.now();
}
