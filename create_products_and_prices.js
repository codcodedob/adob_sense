// scripts/seed_stripe.cjs
require("dotenv").config();
const Stripe = require("stripe");

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY in .env");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/**
 * Idempotent helpers:
 * - We use product.lookup_key and price.lookup_key so reruns won't create dupes.
 * - All three plans are $11/year (sale).
 */

const PLANS = [
  { code: "ADOB_SENSE", name: "ADOB SENSE", features: ["Music", "Film", "Live", "Gaming"] },
  { code: "DOBE_ONE",   name: "DOBE ONE",   features: ["Sense + Exclusives + Storage"] },
  { code: "DEMANDX",    name: "DEMANDX",    features: ["Family plan + Enterprise tools"] },
];

async function upsertProduct({ code, name, features }) {
  // Try find by lookup_key
  const existing = await stripe.products.search({
    query: `active:'true' AND metadata['lookup_key']:'${code}'`,
    limit: 1,
  });

  if (existing.data.length) return existing.data[0];

  return await stripe.products.create({
    name,
    active: true,
    metadata: { lookup_key: code, features: JSON.stringify(features) },
  });
}

async function upsertYearlyPrice({ product, code }) {
  const priceLookup = `${code}_YEARLY_SALE_11`;
  // Try find by lookup_key
  const found = await stripe.prices.search({
    query: `active:'true' AND lookup_key:'${priceLookup}'`,
    limit: 1,
  });

  if (found.data.length) return found.data[0];

  return await stripe.prices.create({
    currency: "usd",
    unit_amount: 1100, // $11.00
    recurring: { interval: "year" },
    product: product.id,
    lookup_key: priceLookup,
    nickname: `${code} Yearly Sale ($11)`,
  });
}

(async () => {
  try {
    const results = {};
    for (const plan of PLANS) {
      const product = await upsertProduct(plan);
      const price = await upsertYearlyPrice({ product, code: plan.code });
      results[plan.code] = price.id;
    }

    console.log("\n✅ Created/Found Stripe prices. Paste these into your .env:");
    console.log(`NEXT_PUBLIC_STRIPE_PRICE_ADOBSENSE=${results.ADOB_SENSE}`);
    console.log(`NEXT_PUBLIC_STRIPE_PRICE_DOBEONE=${results.DOBE_ONE}`);
    console.log(`NEXT_PUBLIC_STRIPE_PRICE_DEMANDX=${results.DEMANDX}\n`);
    console.log("Tip: Restart your dev server after updating .env.");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
