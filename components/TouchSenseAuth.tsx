// components/TouchSenseAuth.tsx
import { useEffect, useState } from "react";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from "firebase/auth";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return "An unexpected error occurred";
  }
}

export default function TouchSenseAuth() {
  const [uid, setUid] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const off = onAuthStateChanged(getAuth(), (u: User | null) => setUid(u?.uid ?? null));
    return () => off();
  }, []);

  const handleSignIn = async () => {
    setErr(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getAuth(), email.trim(), password);
      setEmail("");
      setPassword("");
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setErr(null);
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(getAuth(), email.trim(), password);
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      setEmail("");
      setPassword("");
      setDisplayName("");
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErr(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(getAuth(), provider);
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setErr(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(getAuth(), email.trim());
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setErr(null);
    setLoading(true);
    try {
      await signOut(getAuth());
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm">
          User: <span className="font-mono">{uid ?? "(signed out)"}</span>
        </p>
        <button
          onClick={handleSignOut}
          disabled={!uid || loading}
          className="text-xs text-gray-600 underline hover:text-gray-900"
        >
          Sign out
        </button>
      </div>

      <div className="mb-3 inline-flex overflow-hidden rounded-full border">
        <button
          className={`px-3 py-1.5 text-sm ${mode === "signin" ? "bg-gray-900 text-white" : "bg-white"}`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          className={`px-3 py-1.5 text-sm ${mode === "signup" ? "bg-gray-900 text-white" : "bg-white"}`}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>

      <div className="grid gap-3">
        {mode === "signup" && (
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}

        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />

        {err && <p className="text-sm text-red-600">{err}</p>}

        {mode === "signin" ? (
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        ) : (
          <button
            onClick={handleSignUp}
            disabled={loading}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        )}

        {mode === "signin" && (
          <button
            onClick={handleReset}
            disabled={loading || !email}
            className="text-left text-xs text-gray-600 underline hover:text-gray-900"
          >
            Forgot password? Send reset link
          </button>
        )}

        <div className="mt-2 grid gap-2">
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            Continue with Google
          </button>

          {/* Anonymous sign-in intentionally removed per your requirement */}
          {/* <button ...>Continue anonymously</button> */}
        </div>
      </div>
    </div>
  );
}
