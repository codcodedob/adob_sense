// pages/api/create-stripe-customer.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createStripeCustomerForUser } from "@/lib/createStripeCustomerForUser";
import { getAuth } from "firebase-admin/auth";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_KEY as string)
    ),
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).end();
    }

    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || undefined;

    const stripeCustomerId = await createStripeCustomerForUser(uid, email);

    res.status(200).json({ stripeCustomerId });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
