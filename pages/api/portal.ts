// pages/api/portal.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    const { uid } = req.body as { uid?: string };
    if (!uid) return res.status(400).json({ error: "Missing uid" });

    // 1) Load user doc
    const userRef = adminDb.collection("users").doc(uid);
    const snap = await userRef.get();
    const userDoc = snap.data() || {};

    // 2) Ensure we have a Stripe customer
    let customerId: string | undefined = userDoc.stripeCustomerId;
    if (!customerId) {
      // get email from Firestore, else from Firebase Auth
      const emailFromDoc: string | undefined = userDoc.email;
      let email = emailFromDoc;
      if (!email) {
        const authUser = await admin.auth().getUser(uid).catch(() => null);
        email = authUser?.email || undefined;
      }

      const customer = await stripe.customers.create({
        email,
        metadata: { uid },
      });
      customerId = customer.id;

      await userRef.set({ stripeCustomerId: customerId, updatedAt: new Date().toISOString() }, { merge: true });
    }

    // 3) Create a Billing Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId!,
      return_url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001",
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Stripe error" });
  }
}
