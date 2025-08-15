// lib/createStripeCustomerForUser.ts
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2025-07-30.basil" });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_KEY as string)
    ),
  });
}

const db = getFirestore();

export async function createStripeCustomerForUser(uid: string, email?: string) {
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  if (snap.exists && snap.data()?.stripeCustomerId) {
    return snap.data()?.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: email,
    metadata: { uid },
  });

  await userRef.set(
    {
      stripeCustomerId: customer.id,
      email: email || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return customer.id;
}
