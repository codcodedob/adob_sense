// pages/login.tsx
import { useState } from "react";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { useRouter } from "next/router";

// Reuse the singleton Firebase app/auth from our client lib (prevents duplicate-app)
import { auth } from "@/lib/firebaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signInEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const signInGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
      <h1 className="mb-6 text-3xl font-bold">Sign In</h1>

      <form onSubmit={signInEmail} className="flex w-72 flex-col space-y-4">
        <input
          type="email"
          placeholder="Email"
          className="rounded border border-gray-700 bg-gray-800 p-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="rounded border border-gray-700 bg-gray-800 p-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button
          type="submit"
          className="rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Loading..." : "Sign In"}
        </button>
      </form>

      <div className="mt-4">
        <button
          onClick={signInGoogle}
          className="rounded bg-red-600 p-2 hover:bg-red-700 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Loading..." : "Sign in with Google"}
        </button>
      </div>

      {error && <p className="mt-4 text-red-400">{error}</p>}
    </div>
  );
}
