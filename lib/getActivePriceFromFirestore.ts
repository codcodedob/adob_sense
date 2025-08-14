// lib/getActivePriceFromFirestore.ts
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "./firebaseClient";

export type ProductSub = {
  id: string;
  tierKey: "HIPSESSION" | "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX";
  isSubscription: boolean;
  saleActive?: boolean;
  stripePriceId?: string;
  billingInterval?: "month" | "year";
  isFamily?: boolean;
};

export async function getActivePriceForTier(tierKey: ProductSub["tierKey"]) {
  // Prefer sale-active for this tier
  const baseQ = query(
    collection(db, "products"),
    where("tierKey", "==", tierKey),
    where("isSubscription", "==", true)
  );

  const snap = await getDocs(baseQ);
  // Prefer a saleActive doc if present
  const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ProductSub[];
  const sale = docs.find(d => d.saleActive && d.stripePriceId);
  if (sale) return sale;

  // else take any with a price
  const normal = docs.find(d => d.stripePriceId);
  if (!normal) throw new Error(`No Stripe price found for tier ${tierKey}`);
  return normal;
}
