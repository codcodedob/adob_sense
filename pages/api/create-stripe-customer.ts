// pages/api/create-stripe-customer.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getAuth } from "firebase-admin/auth";
import * as admin from "firebase-admin";
import { createStripeCustomerForUser } from "@/lib/createStripeCustomerForUser";

export const config = { api: { bodyParser: true } };

// Initialize Admin once (skip if you already do this in a shared module)
if (!admin.apps.length) {
  admin.initializeApp({
    // If you use base64 creds in prod, swap to:
    // credential: admin.credential.cert(
    //   JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_KEY_B64!, "base64").toString("utf8"))
    // ),
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_KEY as string)
    ),
  });
}

type Ok = { stripeCustomerId: string };
type Err = { error: string };

function getBearerToken(req: NextApiRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || undefined;

    const stripeCustomerId = await createStripeCustomerForUser(uid, email);
    return res.status(200).json({ stripeCustomerId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Authentication error";
    return res.status(401).json({ error: msg });
  }
}
