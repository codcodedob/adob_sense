import { useState } from "react";

export default function DobeHUD() {
  const [open, setOpen] = useState(false);
  const goCheckout = (tier: "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX") => {
    window.location.href = `/api/checkout?tier=${tier}`;
  };

  return (
    <div className="fixed right-4 bottom-24 z-40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-12 w-12 rounded-full bg-fuchsia-600 text-white shadow-lg hover:bg-fuchsia-700"
        title="Dobe"
      >
        DO
      </button>

      {open && (
        <div className="mt-2 w-56 rounded-xl border bg-white p-2 shadow-lg">
          <p className="px-2 pb-2 text-xs text-gray-500">Subscribe</p>
          <div className="flex flex-col gap-2">
            <button onClick={() => goCheckout("ADOB_SENSE")} className="w-full rounded-md bg-gray-900 px-3 py-2 text-left text-sm text-white hover:bg-black">Adob Sense</button>
            <button onClick={() => goCheckout("DOBE_ONE")} className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-gray-50">Dobe One</button>
            <button onClick={() => goCheckout("DEMANDX")} className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-gray-50">Demand X</button>
          </div>
        </div>
      )}
    </div>
  );
}
