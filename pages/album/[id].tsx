// pages/album/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import type { SoundDoc } from "../index"; // or copy the type

export default function AlbumPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const [tracks, setTracks] = useState<SoundDoc[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const q1 = query(collection(db, "soundsII"), where("enterSound", "==", id));
      const snap = await getDocs(q1);
      let docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SoundDoc, "id">) }));
      if (!docs.length) {
        const q2 = query(collection(db, "soundsII"), where("entersound", "==", id));
        const snap2 = await getDocs(q2);
        docs = snap2.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SoundDoc, "id">) }));
      }
      setTracks(docs as SoundDoc[]);
    })();
  }, [id]);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="mb-4 text-xl font-semibold">Album</h1>
      <ul className="space-y-2">
        {tracks.map((t) => (
          <li key={t.id} className="rounded border p-2">
            {t.name || t.id}
          </li>
        ))}
      </ul>
    </div>
  );
}
