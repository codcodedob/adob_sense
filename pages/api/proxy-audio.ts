// pages/api/proxy-audio.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";

export const config = {
  api: { bodyParser: false }, // we stream
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Simple preflight in dev
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
      return res.status(204).end();
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const src = typeof req.query.src === "string" ? req.query.src : "";
    if (!src) {
      return res.status(400).json({ error: "Missing src" });
    }

    const headers: Record<string, string> = {};
    if (req.headers.range) {
      headers["Range"] = String(req.headers.range);
    }

    const upstream = await fetch(src, {
      headers,
      credentials: "omit",
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      const txt = await safeText(upstream);
      console.error("proxy-audio upstream error", upstream.status, txt?.slice(0, 300));
      res
        .status(upstream.status)
        .json({ error: "upstream_error", status: upstream.status, body: txt });
      return;
    }

    // CORS + cache
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Accept-Ranges, Content-Range, Content-Length, Content-Type"
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    // Pass-through headers needed for scrubbing
    const type = upstream.headers.get("Content-Type") || "audio/mpeg";
    const len = upstream.headers.get("Content-Length");
    const acceptRanges = upstream.headers.get("Accept-Ranges");
    const contentRange = upstream.headers.get("Content-Range");
    if (type) res.setHeader("Content-Type", type);
    if (len) res.setHeader("Content-Length", len);
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
    if (contentRange) res.setHeader("Content-Range", contentRange);

    if (req.method === "HEAD") {
      res.status(upstream.status).end();
      return;
    }

    const body = upstream.body;
    if (!body) {
      res.status(502).end("Upstream had no body");
      return;
    }

    let nodeStream: Readable;

    // Convert Web ReadableStream to Node Readable
    if (typeof (Readable as unknown as { fromWeb?: (stream: ReadableStream<Uint8Array>) => Readable }).fromWeb === "function") {
      nodeStream = (Readable as unknown as { fromWeb: (stream: ReadableStream<Uint8Array>) => Readable }).fromWeb(
        body as ReadableStream<Uint8Array>
      );
    } else {
      
      nodeStream = body as unknown as Readable;
    }

    res.status(upstream.status);
    nodeStream.pipe(res);
  } catch (err) {
    const errorObj = err as Error;
    console.error("proxy-audio fatal", errorObj?.stack || errorObj);
    res.status(500).json({ error: "proxy_failed" });
  }
}

async function safeText(r: Response): Promise<string | null> {
  try {
    return await r.text();
  } catch {
    return null;
  }
}
