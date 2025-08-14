// lib/views.ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebaseClient";

/** Sound-level: create a view at play start */
export async function startView(soundId: string, uid: string, artists: string[] = []) {
  await addDoc(collection(db, "views"), {
    kind: "sound",
    soundId,
    uid,
    artists,
    startedAt: serverTimestamp(),
  });
}

/** Sound-level: mark a finishing event (optionally with a reason) */
export async function finishView(
  soundId: string,
  uid: string,
  artists: string[] = [],
  opts?: { reason?: "end" | "pause" | "change" | "error" }
) {
  await addDoc(collection(db, "viewsTime"), {
    kind: "sound",
    soundId,
    uid,
    artists,
    reason: opts?.reason ?? "end",
    finishedAt: serverTimestamp(),
  });
}

/** Append time events like “qualified”, “stop/change/pause/error”, with seconds listened */
export async function logViewTime(params: {
  soundId: string;
  uid: string;
  artists?: string[];
  action: "qualified" | "stop";
  playedSeconds?: number;
  reason?: "pause" | "change" | "error" | "end";
}) {
  const { soundId, uid, artists = [], action, playedSeconds = 0, reason } = params;
  await addDoc(collection(db, "viewsTime"), {
    kind: "sound",
    soundId,
    uid,
    artists,
    action,
    reason: reason ?? null,
    playedSeconds,
    at: serverTimestamp(),
  });
}

/** Optional ratings */
export async function saveRating(soundId: string, rating: number, uid: string) {
  await addDoc(collection(db, "ratings"), {
    soundId,
    rating,
    uid,
    createdAt: serverTimestamp(),
  });
}

/** Album-level: start a drill-down session */
export async function startAlbumView(
  albumEnterSoundId: string,
  uid: string,
  artists: string[] = []
) {
  await addDoc(collection(db, "albumViews"), {
    enterSoundId: albumEnterSoundId,
    uid,
    artists,
    startedAt: serverTimestamp(),
  });
}

/** Album-level: finish a drill-down session (with optional reason) */
export async function finishAlbumView(
  albumEnterSoundId: string,
  uid: string,
  artists: string[] = [],
  opts?: { reason?: "end" | "pause" | "change" | "error" }
) {
  await addDoc(collection(db, "albumViewsTime"), {
    enterSoundId: albumEnterSoundId,
    uid,
    artists,
    reason: opts?.reason ?? "end",
    finishedAt: serverTimestamp(),
  });
}
