// pages/account.tsx
import { useEffect, useState } from "react";
import Head from "next/head";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "@/lib/firebaseClient";
import { doc, getDoc } from "firebase/firestore";

type UserSub = {
  subscriptionType?: string;
  subEndIso?: string;
  stripeCustomerId?: string;
  trialUsed?: boolean;
};

function timeLeft(endIso?: string) {
  if (!endIso) return null;
  const diff = new Date(endIso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${d}d ${h}h ${m}m ${s}s`;
}

export default function AccountPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [userSub, setUserSub] = useState<UserSub | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const off = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        window.location.href = "/login";
        return;
      }
      setUid(u.uid);
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        setUserSub((snap.data() as UserSub) || {});
      } finally {
        setLoading(false);
      }
    });
    return () => off();
  }, []);

  const openPortal = async () => {
    try {
      setPortalLoading(true);
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert(json.error || "Unable to open billing portal.");
      }
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return null;

  const plan = userSub?.subscriptionType || "HIPSESSION";
  const left = timeLeft(userSub?.subEndIso || undefined);

  return (
    <>
      <Head><title>Account</title></Head>
      <main className="mx-auto max-w-3xl p-4">
        <h1 className="mb-4 text-2xl font-semibold">Account</h1>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm">Current plan: <b>{plan}</b></p>
          {userSub?.subEndIso && (
            <p className="mt-1 text-sm text-gray-600">
              Time left: <span className="tabular-nums">{left}</span>
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="rounded-md bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
            >
              {portalLoading ? "Opening…" : "Manage billing"}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
