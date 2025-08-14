// pages/api/env-check.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const b64 = process.env.FIREBASE_SERVICE_KEY_B64;
  res.status(200).json({ hasB64: !!b64, length: b64?.length ?? 0 });
}
