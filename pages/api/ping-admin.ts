// pages/api/ping-admin.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const t = await adminDb.collection("_health").doc("ping").set({ at: new Date() }, { merge: true });
    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
