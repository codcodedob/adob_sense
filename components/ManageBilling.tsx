// components/ManageBilling.tsx
import React from "react";
import { startCheckoutClient, openPortalClient, cancelSubscription, refundLastCharge } from "@/lib/billingClient";

type Props = {
  uid: string;
  subscriptionType?: "HIPSESSION" | "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX" | null;
};

export default function ManageBilling({ uid, subscriptionType }: Props) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow">
      <div className="mb-3 text-sm text-gray-700">
        <b>Plan:</b> {subscriptionType ?? "—"}
      </div>

      <div className="flex flex-wrap gap-8 text-sm">
        <div className="flex flex-col gap-2">
          <div className="font-semibold">Purchase</div>
          <button className="rounded bg-black px-3 py-1.5 text-white"
            onClick={() => startCheckoutClient("ADOB_SENSE", uid)}>
            Buy Adob Sense
          </button>
          <button className="rounded border px-3 py-1.5"
            onClick={() => startCheckoutClient("DOBE_ONE", uid)}>
            Buy Dobe One
          </button>
          <button className="rounded border px-3 py-1.5"
            onClick={() => startCheckoutClient("DEMANDX", uid)}>
            Buy DemandX
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="font-semibold">Manage</div>
          <button className="rounded border px-3 py-1.5" onClick={() => openPortalClient(uid)}>
            Open Customer Portal
          </button>
          <button className="rounded border px-3 py-1.5"
            onClick={() => cancelSubscription(uid, false, "user_request")}>
            Cancel at Period End
          </button>
          <button className="rounded border px-3 py-1.5"
            onClick={() => cancelSubscription(uid, true, "user_request_immediate")}>
            Cancel Immediately
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="font-semibold">Refunds (admin)</div>
          <button className="rounded border px-3 py-1.5"
            onClick={() => refundLastCharge(uid)}>
            Refund Last Charge (full)
          </button>
          {/* example partial refund $5.00 */}
          <button className="rounded border px-3 py-1.5"
            onClick={() => refundLastCharge(uid, 500)}>
            Refund $5.00
          </button>
        </div>
      </div>
    </div>
  );
}
