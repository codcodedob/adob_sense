// pages/api/stripe-webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { adminDb } from "../../lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { dateFields } from "../../lib/dateFields";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20", // <- use a valid version
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

// Strictly typed buffer helper
async function buffer(
  readable: AsyncIterable<unknown> | NodeJS.ReadableStream
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable as AsyncIterable<unknown>) {
    if (chunk instanceof Buffer) chunks.push(chunk);
    else if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
    else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
    else throw new TypeError("Unsupported chunk type from readable stream");
  }
  return Buffer.concat(chunks);
}

/** Safely read Subscription.current_period_end (snake_case) without `any`. */
function getCurrentPeriodEndUnix(sub: Stripe.Subscription): number | null {
  const raw = (sub as unknown as Record<string, unknown>)["current_period_end"];
  return typeof raw === "number" ? raw : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sig = req.headers["stripe-signature"] as string;
  const buf = await buffer(req);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed.", message);
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  try {
    // 1) Checkout completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid =
        (session.client_reference_id as string) ||
        session.metadata?.uid ||
        "";
      if (!uid) return res.json({ received: true });

      const now = new Date();
      const { day, month, year, iso } = dateFields(now);

      // log a visit
      await adminDb.collection("users").doc(uid).collection("visits").add({
        type: "checkout.session.completed",
        at: Timestamp.fromDate(now),
        day, month, year, iso,
      });

      if (session.mode === "subscription") {
        // baseline fields; subscription events will refine later
        await adminDb.collection("users").doc(uid).set(
          {
            subscriptionType: session.metadata?.tierKey || "ADOB_SENSE",
            status: "ACTIVE",
            stripeId: session.customer as string,
            updatedAt: Timestamp.fromDate(now),
            day, month, year,
          },
          { merge: true }
        );
      } else if (session.mode === "payment") {
        // mirror purchase into user's library
        const productId = session.metadata?.productId || null;
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 50 });

        const batch = adminDb.batch();
        const libCol = adminDb.collection("users").doc(uid).collection("library");

        for (const li of lineItems.data) {
          const priceId = li.price?.id ?? null;
          const docRef = libCol.doc();
          batch.set(docRef, {
            addedAt: Timestamp.fromDate(now),
            day, month, year, iso,
            priceId,
            productId,
            description: li.description,
            quantity: li.quantity ?? 1,
          });
        }

        // touch default playlist doc
        const plItemRef = adminDb
          .collection("users")
          .doc(uid)
          .collection("playlists")
          .doc("default");
        batch.set(plItemRef, { updatedAt: Timestamp.fromDate(now) }, { merge: true });

        await batch.commit();
      }
    }

    // 2) Subscription created/updated
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const uid = (sub.metadata?.uid as string) || "";
      if (!uid) return res.json({ received: true });

      const endUnix = getCurrentPeriodEndUnix(sub);
      const end = endUnix ? new Date(endUnix * 1000) : null;
      const { day, month, year, iso } = dateFields(end ?? new Date());

      await adminDb.collection("users").doc(uid).set(
        {
          subscriptionType: sub.metadata?.tierKey || "ADOB_SENSE",
          status: (sub.status || "active").toUpperCase(),
          subscriptionEndDate: end ? Timestamp.fromDate(end) : null,
          subEndIso: end ? end.toISOString() : null,
          subEndDay: end ? day : null,
          subEndMonth: end ? month : null,
          subEndYear: end ? year : null,
          stripeId: sub.customer as string,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    }

    // 3) Subscription canceled
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = (sub.metadata?.uid as string) || "";
      if (!uid) return res.json({ received: true });

      const now = new Date();
      const { day, month, year, iso } = dateFields(now);

      await adminDb.collection("users").doc(uid).set(
        {
          subscriptionType: "DIGITAL+XIIBIITKEY", // your free/fallback tier
          status: "ACTIVE",
          updatedAt: Timestamp.fromDate(now),
          day, month, year, iso,
        },
        { merge: true }
      );
    }

    res.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Webhook handler error:", message);
    res.status(500).send("Webhook handler failed");
  }
}
