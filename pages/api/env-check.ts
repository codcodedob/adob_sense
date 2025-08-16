// pages/api/env-check.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // Server-only var
  const b64 = process.env.FIREBASE_SERVICE_KEY_B64;

  // Client-exposed vars (must be prefixed NEXT_PUBLIC_)
  const keys = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];

  const publicVars = Object.fromEntries(
    keys.map(k => [k, process.env[k] ? "SET" : "MISSING"])
  );

  res.status(200).json({
    FIREBASE_SERVICE_KEY_B64: {
      hasB64: !!b64,
      length: b64?.length ?? 0,
    },
    ...publicVars,
  });
}
