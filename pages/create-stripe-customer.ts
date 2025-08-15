// pages/api/create-stripe-customer.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { createStripeCustomerForUser } from "@/lib/createStripeCustomerForUser";

// --- Initialize Firebase Admin (once) ---
if (!admin.apps.length) {
  admin.initializeApp({
    // If you switched to the base64 approach, replace the next line with:
    // credential: admin.credential.cert(
    //   JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_KEY_B64!, "base64").toString())
    // ),
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_KEY as string)
    ),
  });
}

// Optional: ensure Stripe key exists early (helps with clearer errors)
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  // Throwing here will surface a clear 500 explaining what's wrong
  throw new Error("Missing STRIPE_SECRET_KEY env");
}

// Types for JSON responses
type Ok = { stripeCustomerId: string };
type Err = { error: string };

// Small helper: extract Bearer token safely
function getBearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    // Verify Firebase ID token and get user info
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || undefined;

    // Create (or reuse) Stripe customer and persist to Firestore inside the helper
    const stripeCustomerId = await createStripeCustomerForUser(uid, email);

    return res.status(200).json({ stripeCustomerId });
  } catch (e: unknown) {
    // ESLint-friendly error handling
    if (e instanceof admin.auth.AuthError) {
      // AuthError (rarely directly thrown here, but just in case)
      console.error("Firebase Auth error:", e);
      return res.status(401).json({ error: e.message });
    }
    if (e instanceof Stripe.errors.StripeError) {
      console.error("Stripe error:", e);
      return res.status(502).json({ error: e.message });
    }
    if (e instanceof Error) {
      console.error(e);
      return res.status(500).json({ error: e.message });
    }
    console.error("Unknown error:", e);
    return res.status(500).json({ error: "Unknown error" });
  }
}
