// pages/api/checkout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-07-30.basil",
});

const PRICE_MAP: Record<string, string> = {
  ADOB_SENSE: process.env.NEXT_PUBLIC_STRIPE_PRICE_ADOBSENSE as string,
  DOBE_ONE:   process.env.NEXT_PUBLIC_STRIPE_PRICE_DOBEONE as string,
  DEMANDX:    process.env.NEXT_PUBLIC_STRIPE_PRICE_DEMANDX as string,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const tier = String(req.query.tier || "ADOB_SENSE");
    const price = PRICE_MAP[tier];
    if (!price) return res.status(400).json({ error: "Unknown tier" });

    // Require a logged-in user (no anonymous purchases)
    const uid = req.query.uid ? String(req.query.uid) : "";
    if (!uid) return res.status(401).json({ error: "Auth required" });

    // Get or create Stripe customer for this user
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : null;

    let customerId = userData?.stripeCustomerId as string | undefined;
    if (!customerId) {
      const email = (userData?.email as string) || undefined;
      const customer = await stripe.customers.create({
        email,
        metadata: { uid },
      });
      customerId = customer.id;
      await userRef.set({ stripeCustomerId: customerId, updatedAt: Date.now() }, { merge: true });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/?purchase=cancel`,
      metadata: { tier, uid },
    });

    // If the user hit this endpoint via a normal link/navigation,
    // send them straight to Stripe with a 303 redirect.
    const wantsHTML = (req.headers.accept || "").includes("text/html");
    const isGET = req.method === "GET";
    if (session.url && wantsHTML && isGET) {
      return res.redirect(303, session.url);
    }

    // Otherwise (e.g. fetch from JS), return the URL in JSON.
    return res.status(200).json({ url: session.url });
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error(e.message);
    } else {
      console.error(String(e));
    }
  }
  
}
