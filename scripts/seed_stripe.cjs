// scripts/seed_stripe.cjs
const fs = require("fs");
const path = fs.existsSync(".env.local") ? ".env.local" : ".env";
require("dotenv").config({ path });

const Stripe = require("stripe");
const key = process.env.STRIPE_SECRET_KEY;

if (!key) {
  console.error(`Missing STRIPE_SECRET_KEY in ${path}`);
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

const PLANS = [
  {
    code: "ADOB_SENSE",
    name: "ADOB_SENSE",
    features: `Music, Film, Live, Gaming`,
    isFamily: false,
    metadata: { isSubscription: "true", tier: "3", sale: "true" },
  },
  {
    code: "DOBE_ONE",
    name: "DOBE_ONE",
    features: `Adob Sense + Dobe Live exclusives, backstage access`,
    isFamily: false,
    metadata: { isSubscription: "true", tier: "4", sale: "true" },
  },
  {
    code: "DEMANDX",
    name: "DEMANDX",
    features: `Family plan: Prime-like delivery + media bundle + team tools`,
    isFamily: true,
    metadata: { isSubscription: "true", tier: "5", sale: "true" },
  },
];

// $11.00 USD / year for all (sale)
const UNIT_AMOUNT = 1100;
const CURRENCY = "usd";
const INTERVAL = "year";

async function findOrCreateProduct(name, extras = {}) {
  // Try to find by exact name
  const list = await stripe.products.list({ active: true, limit: 100 });
  const existing = list.data.find((p) => p.name === name);
  if (existing) return existing;

  // Create new product
  return await stripe.products.create({
    name,
    active: true,
    metadata: {
      isSubscription: "true",
      ...extras.metadata,
    },
  });
}

async function findOrCreatePrice(productId, lookupKey, nickname) {
  // Reuse an active price with same lookup_key if it exists
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });
  const existing = prices.data.find((p) => p.lookup_key === lookupKey);
  if (existing) return existing;

  // Create new recurring price
  return await stripe.prices.create({
    product: productId,
    currency: CURRENCY,
    unit_amount: UNIT_AMOUNT,
    recurring: { interval: INTERVAL },
    nickname,
    lookup_key: lookupKey,
    active: true,
  });
}

(async () => {
  try {
    console.log(`[dotenv] loaded from ${path}`);
    const envLines = [];

    for (const plan of PLANS) {
      const product = await findOrCreateProduct(plan.name, {
        metadata: {
          features: plan.features,
          isFamily: String(plan.isFamily),
          ...plan.metadata,
        },
      });

      const lookupKey = `yearly_${CURRENCY}_${UNIT_AMOUNT}_${plan.code}`;
      const nickname = `${plan.name} ${INTERVAL}ly ($${(UNIT_AMOUNT / 100).toFixed(2)})`;
      const price = await findOrCreatePrice(product.id, lookupKey, nickname);

      // Build env var name from plan
      let envKey;
      if (plan.code === "ADOB_SENSE") envKey = "NEXT_PUBLIC_STRIPE_PRICE_ADOBSENSE";
      else if (plan.code === "DOBE_ONE") envKey = "NEXT_PUBLIC_STRIPE_PRICE_DOBEONE";
      else if (plan.code === "DEMANDX") envKey = "NEXT_PUBLIC_STRIPE_PRICE_DEMANDX";

      envLines.push(`${envKey}=${price.id}`);

      console.log(`\n✅ ${plan.name}`);
      console.log(`   Product: ${product.id}`);
      console.log(`   Price:   ${price.id}  (${CURRENCY.toUpperCase()} ${(UNIT_AMOUNT / 100).toFixed(2)}/${INTERVAL})`);
      console.log(`   lookup_key: ${lookupKey}`);
    }

    console.log(`\nPaste these into your .env (or .env.local):\n`);
    for (const line of envLines) console.log(line);

    console.log(`\nDone.`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
