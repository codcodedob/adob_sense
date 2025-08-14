// components/RatingModal.tsx
import { useState } from "react";

export default function RatingModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number) => void;
}) {
  const [rating, setRating] = useState<number>(0);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="w-[320px] rounded-xl bg-white p-4 shadow">
        <h3 className="mb-2 text-base font-semibold text-gray-900">
          Rate this experience
        </h3>
        <div className="mb-4 flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className={`h-10 w-10 rounded-full border text-sm font-semibold ${
                rating === n
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
              aria-label={`Rate ${n}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button className="rounded-md border px-3 py-1.5 text-sm" onClick={onClose}>
            Later
          </button>
          <button
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white"
            onClick={() => {
              if (rating > 0) onSubmit(rating);
              else onClose();
            }}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
