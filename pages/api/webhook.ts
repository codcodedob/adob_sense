// pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-07-30.basil",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

// --- Helpers ---------------------------------------------------------------

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = req as unknown as Readable;
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

const PRICE_TO_TIER: Record<string, "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX"> = {
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_ADOBSENSE as string]: "ADOB_SENSE",
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_DOBEONE as string]: "DOBE_ONE",
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_DEMANDX as string]: "DEMANDX",
};

async function getUserRefForCustomer(customerId: string) {
  const q = await adminDb
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (!q.empty) return q.docs[0].ref;

  const customer = await stripe.customers.retrieve(customerId);
  if (customer && typeof customer !== "string" && customer.metadata?.uid) {
    return adminDb.collection("users").doc(customer.metadata.uid);
  }
  return null;
}

async function setUserSubscription(opts: {
  userRef: FirebaseFirestore.DocumentReference;
  tier: "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX";
  currentPeriodEnd: number | null;
  status: string;
  stripeCustomerId?: string;
  subscriptionId?: string;
}) {
  const { userRef, tier, currentPeriodEnd, status, stripeCustomerId, subscriptionId } = opts;
  await userRef.set(
    {
      subscriptionType: tier,
      subscriptionStatus: status,
      subscriptionEndDate: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      stripeCustomerId: stripeCustomerId ?? null,
      stripeSubscriptionId: subscriptionId ?? null,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

async function setUserToFree(opts: {
  userRef: FirebaseFirestore.DocumentReference;
  reason: string;
}) {
  const { userRef, reason } = opts;
  await userRef.set(
    {
      subscriptionType: "HIPSESSION",
      subscriptionStatus: "canceled",
      subscriptionEndDate: null,
      updatedAt: Date.now(),
      lastDowngradeReason: reason,
    },
    { merge: true }
  );
}

async function alreadyProcessed(eventId: string) {
  const ref = adminDb.collection("_stripe_events").doc(eventId);
  const snap = await ref.get();
  if (snap.exists) return true;
  await ref.set({ processedAt: Date.now() });
  return false;
}

// --- Handler ---------------------------------------------------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const raw = await readRawBody(req);
    const signature = req.headers["stripe-signature"] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, WEBHOOK_SECRET);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("⚠️  Webhook signature verification failed", msg);
      return res.status(400).send(`Webhook Error: ${msg}`);
    }

    if (await alreadyProcessed(event.id)) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subId = session.subscription as string | null;

        let sub: Stripe.Subscription | null = null;
        if (subId) sub = await stripe.subscriptions.retrieve(subId);

        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        let tier: "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX" | null = null;
        const priceId = sub?.items?.data?.[0]?.price?.id;
        if (priceId) tier = PRICE_TO_TIER[priceId] ?? null;

        const end = sub?.current_period_end ?? null;
        const status = sub?.status ?? "active";

        if (tier) {
          await setUserSubscription({
            userRef,
            tier,
            currentPeriodEnd: end,
            status,
            stripeCustomerId: customerId,
            subscriptionId: sub?.id,
          });
        } else {
          await userRef.set(
            {
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub?.id ?? null,
              subscriptionStatus: status,
              subscriptionEndDate: end ? new Date(end * 1000) : null,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        const priceId = sub.items.data[0]?.price?.id;
        const tier = priceId ? PRICE_TO_TIER[priceId] : undefined;

        if (sub.cancel_at_period_end) {
          await userRef.set(
            {
              subscriptionCancelAt: sub.cancel_at ?? sub.current_period_end ?? null,
              subscriptionStatus: sub.status,
              subscriptionEndDate: new Date(
                (sub.current_period_end || sub.cancel_at) * 1000
              ),
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        } else if (tier) {
          await setUserSubscription({
            userRef,
            tier,
            currentPeriodEnd: sub.current_period_end,
            status: sub.status,
            stripeCustomerId: customerId,
            subscriptionId: sub.id,
          });
        } else {
          await userRef.set(
            {
              subscriptionStatus: sub.status,
              subscriptionEndDate: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null,
              stripeSubscriptionId: sub.id,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;
        await setUserToFree({ userRef, reason: "subscription.deleted" });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string | null;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const customerId = sub.customer as string;
        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        const priceId = sub.items.data[0]?.price?.id;
        const tier = priceId ? PRICE_TO_TIER[priceId] : undefined;

        if (tier) {
          await setUserSubscription({
            userRef,
            tier,
            currentPeriodEnd: sub.current_period_end,
            status: sub.status,
            stripeCustomerId: customerId,
            subscriptionId: sub.id,
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string | null;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const customerId = sub.customer as string;
        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        await userRef.set(
          { subscriptionStatus: "past_due", updatedAt: Date.now() },
          { merge: true }
        );
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const customerId = charge.customer as string | undefined;
        if (!customerId) break;

        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        const isFullRefund =
          typeof charge.amount_refunded === "number" &&
          typeof charge.amount === "number" &&
          charge.amount_refunded === charge.amount;

        if (isFullRefund) {
          await userRef.set(
            {
              lastRefundAt: Date.now(),
              lastRefundAmount: charge.amount_refunded,
              subscriptionStatus: "refunded",
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        } else {
          await userRef.set(
            {
              lastRefundAt: Date.now(),
              lastRefundAmount: charge.amount_refunded ?? 0,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
        break;
      }

      case "refund.created":
      case "charge.refund.updated": {
        const refund = event.data.object as Stripe.Refund;

        const chargeId =
          typeof refund.charge === "string"
            ? refund.charge
            : (refund.charge as Stripe.Charge).id;

        const ch = await stripe.charges.retrieve(chargeId);
        const customerId = ch.customer as string | undefined;
        if (!customerId) break;

        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        const isFullRefund =
          typeof ch.amount_refunded === "number" &&
          typeof ch.amount === "number" &&
          ch.amount_refunded === ch.amount;

        if (isFullRefund) {
          await userRef.set(
            {
              lastRefundAt: Date.now(),
              lastRefundAmount: ch.amount_refunded,
              subscriptionStatus: "refunded",
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        } else {
          await userRef.set(
            {
              lastRefundAt: Date.now(),
              lastRefundAmount: ch.amount_refunded ?? 0,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Webhook handler error", msg);
    return res.status(500).send(`Webhook handler error: ${msg}`);
  }
}
