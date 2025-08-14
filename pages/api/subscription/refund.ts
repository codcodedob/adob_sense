// pages/api/subscription/refund.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-06-20" });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_KEY as string)),
  });
}
const db = admin.firestore();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { uid, amount, chargeId } = req.body as { uid: string; amount?: number; chargeId?: string };
    if (!uid) return res.status(400).json({ error: "Missing uid" });

    const user = (await db.collection("users").doc(uid).get()).data();
    if (!user?.stripeCustomerId) return res.status(400).json({ error: "No stripeCustomerId" });

    // If chargeId is provided, refund that; else refund the most recent paid invoice charge
    let chargeToRefund = chargeId;
    if (!chargeToRefund) {
      const invoices = await stripe.invoices.list({ customer: user.stripeCustomerId, limit: 1 });
      const inv = invoices.data[0];
      if (!inv?.charge) return res.status(400).json({ error: "No recent charge to refund" });
      chargeToRefund = String(inv.charge);
    }

    const refund = await stripe.refunds.create({
      charge: chargeToRefund,
      ...(amount ? { amount } : {}), // in cents; omit for full refund
      reason: "requested_by_customer",
    });

    await db.collection("users").doc(uid).set(
      {
        lastRefundId: refund.id,
        lastRefundAmount: refund.amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.status(200).json({ refund });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Refund error" });
  }
}
