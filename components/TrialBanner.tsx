// components/TrialBanner.tsx
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { db } from "../lib/firebaseClient";
import Countdown from "./Countdown";
import { startFreeTrial } from "../lib/subscriptions";

// ----- SSR-safe localStorage helpers -----
function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

// ----- Minimal Timestamp interface to avoid runtime import -----
type MinimalTimestamp = { toDate: () => Date };

// ----- Firestore user doc shape used by the banner -----
type MaybeEndField = string | Date | MinimalTimestamp | null | undefined;

type UserSub = {
  subscriptionType?: string | null;
  subEndIso?: string | null;               // canonical ISO mirror
  subscriptionEndDate?: MaybeEndField;     // legacy/mobile or Timestamp
  trialUsed?: boolean | null;
  username?: string | null;
};

const TIER_LABELS: Record<string, string> = {
  HIPSESSION: "Hipsession",
  FREETRIAL: "Free Trial",
  ADOB_SENSE: "Adob Sense",
  DOBE_ONE: "Dobe One",
  DEMANDX: "Demand X",
};

function looksLikeTimestamp(v: unknown): v is MinimalTimestamp {
  return !!v && typeof v === "object" && typeof (v as MinimalTimestamp).toDate === "function";
}

function parseEnd(val: MaybeEndField): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (looksLikeTimestamp(val)) return val.toDate();
  if (typeof val === "string") {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

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

  // 2) Subscribe to user doc; seed from localStorage for snappy UI
  useEffect(() => {
    if (!authUser) {
      setUserSub(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const ref = doc(db, "users", authUser.uid);

    // optimistic seed
    const cachedIso = safeGet("adob.subEndIso");
    if (cachedIso) setUserSub((prev) => ({ ...(prev ?? {}), subEndIso: cachedIso }));

    const off = onSnapshot(
      ref,
      (snap) => {
        const data = (snap.data() as UserSub | undefined) ?? {};
        setUserSub(data);

        // keep cache in sync
        if (data.subEndIso) {
          safeSet("adob.subEndIso", data.subEndIso);
        } else if (data.subscriptionEndDate) {
          const d = parseEnd(data.subscriptionEndDate);
          if (d) safeSet("adob.subEndIso", d.toISOString());
        }

        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => off();
  }, [authUser]);

  // 3) Compute the best available end date
  const endDate = useMemo(() => {
    const iso = userSub?.subEndIso;
    const legacy = userSub?.subscriptionEndDate;
    const cached = safeGet("adob.subEndIso");
    return parseEnd(iso || legacy || cached);
  }, [userSub]);

  const active = endDate ? endDate.getTime() > Date.now() : false;
  const type = userSub?.subscriptionType ?? "HIPSESSION";
  const label = TIER_LABELS[type] ?? type;

  // 4) Start free trial
  const handleStartTrial = async (): Promise<void> => {
    setErr(null);
    const u = getAuth().currentUser;
    if (!u) {
      alert("Please sign in first.");
      return;
    }
    try {
      const endIso = await startFreeTrial(u.uid);
      setJustStartedIso(endIso);
      safeSet("adob.subEndIso", endIso);

      // Optimistic write so UI updates instantly
      await setDoc(
        doc(db, "users", u.uid),
        { subscriptionType: "FREETRIAL", subEndIso: endIso, trialUsed: true, status: "ACTIVE" },
        { merge: true }
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not start trial";
      setErr(msg);
    }
  };

  if (loading) return null;

  // Already active (paid or trial)
  if (active && type !== "HIPSESSION") {
    return (
      <div className="mb-4 rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{label} active</p>
            <p className="text-xs text-gray-600">
              Time left: {endDate && <Countdown endIso={endDate.toISOString()} />}
            </p>
          </div>
          <Link href="/account" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
            Manage
          </Link>
        </div>
      </div>
    );
  }

  // No active plan → show trial CTA
  const trialUsed = Boolean(userSub?.trialUsed);
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
          <Link href="#subscribe" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
            See Plans
          </Link>
        </div>
      </div>
    </div>
  );
}
