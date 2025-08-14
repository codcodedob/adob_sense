// pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";

// 1) Next must receive the raw body for webhook signature verification
export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

// ---- Helpers --------------------------------------------------------------

/** Read raw body for stripe.signature validation */
async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = req as unknown as Readable;
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Map Stripe price IDs -> internal tier names you use in UI/Firestore
const PRICE_TO_TIER: Record<string, "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX"> = {
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_ADOBSENSE as string]: "ADOB_SENSE",
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_DOBEONE as string]:   "DOBE_ONE",
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_DEMANDX as string]:   "DEMANDX",
};

/** Resolve user doc ref for a given Stripe customer ID */
async function getUserRefForCustomer(customerId: string) {
  // primary lookup: users where stripeCustomerId == customerId
  const q = await adminDb
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (!q.empty) return q.docs[0].ref;

  // fallback: try customer.metadata.uid if present
  const customer = await stripe.customers.retrieve(customerId);
  if (customer && typeof customer !== "string" && customer.metadata?.uid) {
    return adminDb.collection("users").doc(customer.metadata.uid);
  }

  return null;
}

/** Set plan + end date (+ status) for user */
async function setUserSubscription({
  userRef,
  tier,
  currentPeriodEnd, // unix seconds
  status,           // 'active' | 'trialing' | 'canceled' | 'past_due' | etc.
  stripeCustomerId,
  subscriptionId,
}: {
  userRef: FirebaseFirestore.DocumentReference;
  tier: "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX";
  currentPeriodEnd: number | null;
  status: string;
  stripeCustomerId?: string;
  subscriptionId?: string;
}) {
  await userRef.set(
    {
      subscriptionType: tier, // <- this is what your UI checks
      subscriptionStatus: status,
      subscriptionEndDate: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      stripeCustomerId: stripeCustomerId ?? null,
      stripeSubscriptionId: subscriptionId ?? null,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

/** Downgrade to free (HIPSESSION) */
async function setUserToFree({
  userRef,
  reason,
}: {
  userRef: FirebaseFirestore.DocumentReference;
  reason: string;
}) {
  await userRef.set(
    {
      subscriptionType: "HIPSESSION", // your free tier label
      subscriptionStatus: "canceled",
      subscriptionEndDate: null,
      updatedAt: Date.now(),
      lastDowngradeReason: reason,
    },
    { merge: true }
  );
}

/** Idempotency: store processed event IDs */
async function alreadyProcessed(eventId: string) {
  const ref = adminDb.collection("_stripe_events").doc(eventId);
  const snap = await ref.get();
  if (snap.exists) return true;
  await ref.set({ processedAt: Date.now() });
  return false;
}

// ---- Handler --------------------------------------------------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const raw = await readRawBody(req);
    const signature = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(raw, signature, WEBHOOK_SECRET);
    } catch (err: any) {
      console.error("⚠️  Webhook signature verification failed", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ensure idempotency
    if (await alreadyProcessed(event.id)) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    switch (event.type) {
      // 1) Checkout completed – set plan immediately
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = session.customer as string;
        const subId = session.subscription as string | null;
        const line = session.line_items?.data?.[0]; // only if expanded, usually not
        // We'll fetch the subscription to get price + period end.
        let sub: Stripe.Subscription | null = null;
        if (subId) {
          sub = await stripe.subscriptions.retrieve(subId);
        }

        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        // Choose tier using the subscription's default price:
        let tier: "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX" | null = null;
        if (sub?.items?.data?.[0]?.price?.id) {
          const priceId = sub.items.data[0].price.id;
          tier = PRICE_TO_TIER[priceId] ?? null;
        }

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
          // We couldn't map tier; still remember stripe ids
          await userRef.set(
            {
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub?.id ?? null,
              subscriptionStatus: sub?.status ?? "active",
              subscriptionEndDate: end ? new Date(end * 1000) : null,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
        break;
      }

      // 2) Subscription lifecycle changes (created/updated/deleted)
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        const customerId = sub.customer as string;
        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        const priceId = sub.items.data[0]?.price?.id;
        const tier = priceId ? PRICE_TO_TIER[priceId] : undefined;

        // cancel_at_period_end means user keeps access until period end, then downgrades
        if (sub.cancel_at_period_end) {
          await userRef.set(
            {
              subscriptionCancelAt: sub.cancel_at ?? sub.current_period_end ?? null,
              subscriptionStatus: sub.status,
              subscriptionEndDate: new Date((sub.current_period_end || sub.cancel_at) * 1000),
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

        // Immediate downgrade on deletion
        await setUserToFree({ userRef, reason: "subscription.deleted" });
        break;
      }

      // 3) Payments/refunds
      case "invoice.payment_succeeded": {
        // successful renewal → extend end date
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
        // Mark as past_due; do not immediately downgrade
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string | null;
        if (!subId) break;
        const sub = await stripe.subscriptions.retrieve(subId);
        const customerId = sub.customer as string;
        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        await userRef.set(
          {
            subscriptionStatus: "past_due",
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        break;
      }

      case "charge.refunded":
      case "charge.refund.updated":
      case "refund.created": {
        // Refunds can be partial or full. For full refunds on a first term, you may choose to downgrade now.
        const obj = event.data.object as any;
        const charge = event.type === "refund.created" ? obj.charge : obj;
        const ch =
          typeof charge === "string" ? await stripe.charges.retrieve(charge) : charge;

        const customerId = ch.customer as string | undefined;
        if (!customerId) break;
        const userRef = await getUserRefForCustomer(customerId);
        if (!userRef) break;

        // If full refund & there is an active subscription, you may cancel immediately:
        const isFullRefund = ch.amount_refunded && ch.amount_refunded === ch.amount;
        if (isFullRefund) {
          // Optional: cancel subscription immediately
          // If you prefer to leave access until period end, skip cancellation and just mark status.
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
        // For visibility while you iterate
        // console.log(`Unhandled event type ${event.type}`);
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error", err);
    return res.status(500).send(`Webhook handler error: ${err.message}`);
  }
}
