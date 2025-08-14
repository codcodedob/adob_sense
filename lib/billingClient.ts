// lib/billingClient.ts
export async function startCheckoutClient(tier: "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX", uid?: string) {
    const qs = new URLSearchParams({ tier, ...(uid ? { uid } : {}) });
    const r = await fetch(`/api/checkout?${qs.toString()}`);
    if (!r.ok) throw new Error(await r.text());
    const { url } = await r.json();
    window.location.href = url; // redirect to Stripe Checkout
  }
  
  export async function openPortalClient(uid: string) {
    const r = await fetch(`/api/subscription/portal?uid=${encodeURIComponent(uid)}`);
    if (!r.ok) throw new Error(await r.text());
    const { url } = await r.json();
    window.location.href = url; // redirect to portal
  }
  
  export async function cancelSubscription(uid: string, immediate = false, reason = "") {
    const qs = new URLSearchParams({ uid, immediate: String(immediate), reason });
    const r = await fetch(`/api/subscription/cancel?${qs.toString()}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  
  export async function refundLastCharge(uid: string, amountCents?: number) {
    const r = await fetch(`/api/subscription/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid, ...(amountCents ? { amount: amountCents } : {}) }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  