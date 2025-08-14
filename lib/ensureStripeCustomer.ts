// lib/ensureStripeCustomer.ts (server-only)
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-06-20" });

export async function ensureStripeCustomer(email: string, uid?: string) {
  // search by email to avoid dupes (works if you’ve enabled Search in your account; fallback to list otherwise)
  const existing = await stripe.customers.search({ query: `email:'${email}'` }).catch(() => null);
  const customer = existing?.data?.[0] ?? await stripe.customers.create({
    email,
    metadata: uid ? { uid } : undefined,
  });
  return customer.id;
}
