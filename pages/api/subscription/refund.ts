// pages/api/subscription/refund.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

type RefundBody = {
  uid: string;
  /** Amount in cents. If omitted, Stripe issues a full refund of the charge. */
  amount?: number;
  /** Optional: specific charge ID to refund. If omitted, refunds the most recent invoice charge. */
  chargeId?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid, amount, chargeId } = (req.body || {}) as RefundBody;
    if (!uid) return res.status(400).json({ error: "Missing uid" });

    // 1) Load user (for stripeCustomerId)
    const userSnap = await adminDb.collection("users").doc(uid).get();
    const user = userSnap.data() as { stripeCustomerId?: string } | undefined;
    if (!user?.stripeCustomerId) return res.status(400).json({ error: "No stripeCustomerId" });

    // 2) Decide which charge to refund
    let chargeToRefund: string | undefined = chargeId;

    if (!chargeToRefund) {
      // Grab most recent invoice and refund its charge (typical for subscription billing)
      const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit: 1,
      });

      const inv = invoices.data[0];
      if (!inv?.charge) {
        return res.status(400).json({ error: "No recent charge to refund" });
      }
      chargeToRefund = String(inv.charge);
    }

    // 3) Normalize amount (cents) if provided
    const amountCents =
      typeof amount === "number" && Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : undefined;

    // 4) Create refund
    const refund = await stripe.refunds.create({
      charge: chargeToRefund,
      ...(typeof amountCents === "number" ? { amount: amountCents } : {}),
      reason: "requested_by_customer",
    });

    // 5) Persist last refund info on user
    await adminDb.collection("users").doc(uid).set(
      {
        lastRefundId: refund.id,
        lastRefundAmount: refund.amount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ refund });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Refund error";
    console.error("refund.ts error:", err);
    return res.status(500).json({ error: message });
  }
}
