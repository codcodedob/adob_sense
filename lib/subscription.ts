import { addDays } from "./time";
import { db } from "../lib/firebaseClient";
import { doc, setDoc, getDoc } from "firebase/firestore";

export async function startFreeTrial(uid: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const user = snap.data() || {};

  // prevent re-using trial if already used in the past
  if (user.trialUsed === true) {
    throw new Error("Free trial already used.");
  }

  const end = addDays(new Date(), 7).toISOString();

  await setDoc(
    ref,
    {
      subscriptionType: "FREETRIAL",
      subEndIso: end,
      status: "ACTIVE",
      trialUsed: true, // mark as consumed immediately
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return end;
}

// tiny util
export function isActive(endIso?: string | null) {
  if (!endIso) return false;
  return new Date(endIso).getTime() > Date.now();
}
