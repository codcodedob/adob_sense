// pages/api/stripe-webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { db } from "../../lib/firebaseAdmin"; // Firestore Admin SDK
import { Timestamp } from "firebase-admin/firestore";
import { dateFields } from "../../lib/dateFields";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

async function buffer(readable: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sig = req.headers["stripe-signature"] as string;
  const buf = await buffer(req);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // 1) Checkout completed (both subscription + one-time)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = (session.client_reference_id as string) || session.metadata?.uid || "";
      if (!uid) return res.json({ received: true });

      const now = new Date();
      const { day, month, year, iso } = dateFields(now);

      // (Optional) log a successful purchase/visit
      await db.collection("users").doc(uid).collection("visits").add({
        type: "checkout.session.completed",
        at: Timestamp.fromDate(now),
        day, month, year, iso,
      });

      if (session.mode === "subscription") {
        // handled again in the sub.created/updated events for period_end,
        // but we can set baseline fields here
        await db.collection("users").doc(uid).set(
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
        // Add purchased products to user's library/playlist
        const productId = session.metadata?.productId || null;
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 50 });

        // store each purchased price -> map to your Firestore product by priceId if you wish
        const batch = db.batch();
        const libCol = db.collection("users").doc(uid).collection("library");

        for (const li of lineItems.data) {
          const priceId = (li.price?.id as string) || null;
          const docRef = libCol.doc(); // new item
          batch.set(docRef, {
            addedAt: Timestamp.fromDate(now),
            day, month, year, iso,
            priceId,
            productId,          // if you passed it via metadata
            description: li.description,
            quantity: li.quantity || 1,
          });
        }

        // Optional: also mirror to a default playlist
        const plItemRef = db.collection("users").doc(uid).collection("playlists").doc("default");
        batch.set(plItemRef, { updatedAt: Timestamp.fromDate(now) }, { merge: true });

        await batch.commit();
      }
    }

    // 2) Sub created/updated => set end date + date parts
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = (sub.metadata?.uid as string) || ""; // set this in your product/price metadata or session metadata
      if (!uid) return res.json({ received: true });

      const end = new Date(sub.current_period_end * 1000);
      const { day, month, year, iso } = dateFields(end);

      await db.collection("users").doc(uid).set(
        {
          subscriptionType: sub.metadata?.tierKey || "ADOB_SENSE",
          status: sub.status?.toUpperCase() || "ACTIVE",
          subscriptionEndDate: Timestamp.fromDate(end),
          subEndIso: iso,
          subEndDay: day,
          subEndMonth: month,
          subEndYear: year,
          stripeId: sub.customer as string,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    }

    // 3) Sub canceled => fall back to HIPSESSION
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const uid = (sub.metadata?.uid as string) || "";
      if (!uid) return res.json({ received: true });

      const now = new Date();
      const { day, month, year, iso } = dateFields(now);

      await db.collection("users").doc(uid).set(
        {
          subscriptionType: "DIGITAL+XIIBIITKEY",
          status: "ACTIVE",
          updatedAt: Timestamp.fromDate(now),
          day, month, year, iso,
        },
        { merge: true }
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Webhook handler failed");
  }
}
