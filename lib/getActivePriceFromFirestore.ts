import { collection, getDocs, query, where } from "firebase/firestore";
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
  const baseQ = query(
    collection(db, "products"),
    where("tierKey", "==", tierKey),
    where("isSubscription", "==", true)
  );

  const snap = await getDocs(baseQ);
  const docs: ProductSub[] = snap.docs.map((d) => {
    const data = d.data() as Omit<ProductSub, "id">;
    return { id: d.id, ...data };
  });

  const sale = docs.find((d) => d.saleActive && d.stripePriceId);
  if (sale) return sale;

  const normal = docs.find((d) => d.stripePriceId);
  if (!normal) throw new Error(`No Stripe price found for tier ${tierKey}`);
  return normal;
}
