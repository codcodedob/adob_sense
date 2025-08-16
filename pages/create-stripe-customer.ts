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
  throw new Error("Missing STRIPE_SECRET_KEY env");
}

// Response types
type Ok = { stripeCustomerId: string };
type Err = { error: string; code?: string }; // ✅ allow `code` here

// Extract Bearer token
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
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    // Verify Firebase ID token
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || undefined;

    // Create or reuse Stripe customer
    const stripeCustomerId = await createStripeCustomerForUser(uid, email);

    return res.status(200).json({ stripeCustomerId });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };

    const isAuthError =
      typeof err?.code === "string" && err.code.startsWith("auth/");

    if (isAuthError) {
      console.error("Firebase Auth error:", err);
      return res.status(401).json({
        error: err.message ?? "Authentication error",
        code: err.code, // ✅ now allowed by type
      });
    }

    const message = e instanceof Error ? e.message : String(e);
    console.error("Unexpected error creating Stripe customer:", e);
    return res.status(500).json({ error: message });
  }
}
