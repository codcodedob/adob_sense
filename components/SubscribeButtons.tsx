// components/SubscribeButtons.tsx
import { getAuth } from "firebase/auth";

export default function SubscribeButtons() {
  const uid = getAuth().currentUser?.uid ?? "";

  const planHref = (tier: "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX") =>
    `/api/checkout?tier=${tier}&uid=${uid}`;

  const gate = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const user = getAuth().currentUser;
    if (!user) {
      e.preventDefault();
      window.location.href = "/login";
    }
  };

  return (
    <div id="subscribe" className="mt-2 flex flex-wrap gap-2">
      <a href={planHref("ADOB_SENSE")} onClick={gate}
         className="rounded-md bg-blue-600 px-4 py-2 text-white">Subscribe to Adob Sense</a>
      <a href={planHref("DOBE_ONE")} onClick={gate}
         className="rounded-md bg-gray-900 px-4 py-2 text-white">Subscribe to Dobe One</a>
      <a href={planHref("DEMANDX")} onClick={gate}
         className="rounded-md bg-black px-4 py-2 text-white">Subscribe to DemandX</a>
    </div>
  );
}
