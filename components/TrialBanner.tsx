// components/TrialBanner.tsx
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { db } from "../lib/firebaseClient";
import Countdown from "./Countdown";
import { startFreeTrial } from "../lib/subscriptions"; // isActive handled locally

// ---------- safe localStorage helpers ----------
function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSetItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ---------- types & guards ----------
type MaybeTimestamp = Timestamp | Date | string | null | undefined;

type UserSub = {
  subscriptionType?: string;
  subEndIso?: string;            // new canonical ISO
  subscriptionEndDate?: MaybeTimestamp; // legacy/mobile format or Timestamp
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

function isFirestoreTimestamp(v: unknown): v is Timestamp {
  return !!v && typeof v === "object" && typeof (v as Timestamp).toDate === "function";
}

function parseEnd(val: MaybeTimestamp): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (isFirestoreTimestamp(val)) return val.toDate();
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isActive(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.getTime() > Date.now();
}

// ---------- component ----------
export default function TrialBanner() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userSub, setUserSub] = useState<UserSub | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [justStartedIso, setJustStartedIso] = useState<string | null>(null);

  // 1) Auth listener
  useEffect(() => {
    const off = onAuthStateChanged(getAuth(), (u) => setAuthUser(u));
    return () => off();
  }, []);

  // 2) Subscribe to user doc (seed with localStorage while waiting)
  useEffect(() => {
    if (!authUser) {
      setUserSub(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, "users", authUser.uid);

    const cachedIso = safeGetItem("adob.subEndIso");
    if (cachedIso) {
      setUserSub((prev) => ({ ...(prev || {}), subEndIso: cachedIso }));
    }

    const off = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.data() as UserSub) || {};
        setUserSub(data);

        // keep cache synced for fast UI on revisits
        if (data.subEndIso) safeSetItem("adob.subEndIso", data.subEndIso);
        else if (data.subscriptionEndDate) {
          const d = parseEnd(data.subscriptionEndDate);
          if (d) safeSetItem("adob.subEndIso", d.toISOString());
        }

        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => off();
  }, [authUser]);

  // 3) Compute best available end date (SSR-safe)
  const endDate = useMemo(() => {
    // preference: subEndIso -> legacy subscriptionEndDate -> cached
    const isoFromDoc = userSub?.subEndIso;
    const legacy = userSub?.subscriptionEndDate;
    const cached = safeGetItem("adob.subEndIso");
    return parseEnd(isoFromDoc || legacy || cached);
  }, [userSub]);

  const active = endDate ? endDate.getTime() > Date.now() : false;
  const type = userSub?.subscriptionType || "HIPSESSION";
  const label = TIER_LABELS[type] || type;

  // 4) Start free trial
  const handleStartTrial = async () => {
    setErr(null);
    const u = getAuth().currentUser;
    if (!u) {
      alert("Please sign in first.");
      return;
    }
    try {
      const endIso = await startFreeTrial(u.uid);
      setJustStartedIso(endIso);
      safeSetItem("adob.subEndIso", endIso);

      // Optimistic reflect in user doc for immediate UI
      await setDoc(
        doc(db, "users", u.uid),
        { subscriptionType: "FREETRIAL", subEndIso: endIso, trialUsed: true, status: "ACTIVE" },
        { merge: true }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start trial";
      setErr(msg);
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
          <a
            href="/account"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
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
              onClick={handleStartTrial}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start Free Trial
            </button>
          )}
          <a
            href="#subscribe"
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            See Plans
          </a>
        </div>
      </div>
    </div>
  );
}
