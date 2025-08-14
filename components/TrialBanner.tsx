// components/TrialBanner.tsx
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, getDoc, setDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { db } from "../lib/firebaseClient";
import Countdown from "./Countdown";
import { startFreeTrial, isActive } from "../lib/subscriptions";

// Safe parser for any sub end field we might have
function parseEnd(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "object" && typeof val.toDate === "function") return val.toDate(); // Firestore Timestamp
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

type UserSub = {
  subscriptionType?: string;
  subEndIso?: string;             // our ISO mirror
  subscriptionEndDate?: any;      // legacy/mobile string or Timestamp
  trialUsed?: boolean;
  username?: string;
};

const TIER_LABELS: Record<string, string> = {
  HIPSESSION: "Hipsession",
  FREETRIAL: "Free Trial",
  ADOB_SENSE: "Adob Sense",
  DOBE_ONE: "Dobe One",
  DEMANDX: "Demand X",
};

export default function TrialBanner() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userSub, setUserSub] = useState<UserSub | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [justStartedIso, setJustStartedIso] = useState<string | null>(null);

  // 1) Auth listener
  useEffect(() => {
    const off = onAuthStateChanged(getAuth(), (u) => {
      setAuthUser(u);
    });
    return () => off();
  }, []);

  // 2) Subscribe to user doc (and seed from localStorage while loading)
  useEffect(() => {
    if (!authUser) {
      setUserSub(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, "users", authUser.uid);

    // seed from localStorage in case Firestore is slow
    const cachedIso = localStorage.getItem("adob.subEndIso");
    if (cachedIso) {
      setUserSub((prev) => ({ ...(prev || {}), subEndIso: cachedIso }));
    }

    const off = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.data() as UserSub) || {};
        setUserSub(data);
        // keep cache in sync if we have an ISO
        if (data.subEndIso) localStorage.setItem("adob.subEndIso", data.subEndIso);
        else if (data.subscriptionEndDate) {
          const d = parseEnd(data.subscriptionEndDate);
          if (d) localStorage.setItem("adob.subEndIso", d.toISOString());
        }
        setLoading(false);
      },
      (e) => {
        console.warn("user doc snapshot error", e);
        setLoading(false);
      }
    );
    return () => off();
  }, [authUser]);

  // 3) Compute best available end date
  const endDate = useMemo(() => {
    // Order of preference: subEndIso, subscriptionEndDate, localStorage fallback
    const iso = userSub?.subEndIso || localStorage.getItem("adob.subEndIso");
    const legacy = userSub?.subscriptionEndDate;

    return parseEnd(iso || legacy);
  }, [userSub]);

  const active = endDate ? endDate.getTime() > Date.now() : false;
  const type = userSub?.subscriptionType || "HIPSESSION";
  const label = TIER_LABELS[type] || type;

  const startTrial = async () => {
    setErr(null);
    const u = getAuth().currentUser;
    if (!u) return alert("Please sign in first.");
    try {
      const endIso = await startFreeTrial(u.uid);
      setJustStartedIso(endIso);
      localStorage.setItem("adob.subEndIso", endIso);
      // Optimistically reflect in user doc (server is truth; this helps instant UI)
      await setDoc(
        doc(db, "users", u.uid),
        { subscriptionType: "FREETRIAL", subEndIso: endIso, trialUsed: true, status: "ACTIVE" },
        { merge: true }
      );
    } catch (e: any) {
      setErr(e?.message || "Could not start trial");
    }
  };

  if (loading) return null;

  // Active paid or trial
  if (active && type !== "HIPSESSION") {
    return (
      <div className="mb-4 rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{label} active</p>
            <p className="text-xs text-gray-600">
              Time left: <Countdown endIso={endDate!.toISOString()} />
            </p>
          </div>
          <a href="/account" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
            Manage
          </a>
        </div>
      </div>
    );
  }

  // No active plan
  const trialUsed = !!userSub?.trialUsed;
  return (
    <div className="mb-4 rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">No active subscription</p>
          {trialUsed ? (
            <p className="text-xs text-gray-600">Your free trial has expired.</p>
          ) : (
            <p className="text-xs text-gray-600">Start your 7-day free trial.</p>
          )}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          {justStartedIso && (
            <p className="mt-1 text-xs text-emerald-700">
              Trial started. Ends in <Countdown endIso={justStartedIso} />.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!trialUsed && (
            <button
              onClick={startTrial}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start Free Trial
            </button>
          )}
          <a href="#subscribe" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
            See Plans
          </a>
        </div>
      </div>
    </div>
  );
}
