// pages/api/subscription/refund.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

type Body = {
  uid: string;
  amount?: number;   // cents; omit for full refund
  chargeId?: string; // optional explicit charge id
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { uid, amount, chargeId } = req.body as Body;
    if (!uid) return res.status(400).json({ error: "Missing uid" });

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const user = userSnap.data() as { stripeCustomerId?: string } | undefined;
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: "No stripeCustomerId" });
    }

    // Determine charge to refund
    let chargeToRefund: string | undefined = chargeId;

    if (!chargeToRefund) {
      // Pull the most recent charge for the customer
      const charges = await stripe.charges.list({
        customer: user.stripeCustomerId,
        limit: 1,
      });

      chargeToRefund = charges.data[0]?.id;

      if (!chargeToRefund) {
        return res.status(400).json({ error: "No recent charge to refund" });
      }
    }

    // Create the refund
    const refund = await stripe.refunds.create({
      charge: chargeToRefund,
      ...(typeof amount === "number" ? { amount } : {}),
      reason: "requested_by_customer",
    });

    // Persist a small audit trail
    await adminDb.collection("users").doc(uid).set(
      {
        lastRefundId: refund.id,
        lastRefundAmount: refund.amount,
        lastRefundAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ refund });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("refund endpoint error:", message);
    return res.status(500).json({ error: message || "Refund error" });
  }
}
