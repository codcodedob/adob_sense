// components/AudioPlayer.tsx
import { useEffect, useRef, useState } from "react";
import WaveSurfer, { WaveSurferOptions } from "wavesurfer.js";

type Reason = "pause" | "change" | "error" | "end";

type AudioPlayerProps = {
  /** A non-null, playable URL (parent ensures this). */
  src: string;
  /** Autoplay when audio becomes ready. Default: true */
  autoplay?: boolean;
  /** Called when playback actually starts (after ready). */
  onPlayStart?: () => void;
  /** Called once after user has listened for at least 15 seconds. */
  onQualified?: (playedSeconds: number) => void;
  /**
   * Called on pause/end/change/error, with the last known played seconds
   * and a reason.
   */
  onStop?: (playedSeconds: number, reason?: Reason) => void;
  /** Called when the track finishes naturally (reaches end). */
  onFinish?: () => void;
  /** Optional: initial height of the waveform (px). */
  height?: number;
  /** If set, auto-stop once this many seconds have been played (preview gating). */
  maxSeconds?: number;
};

export default function AudioPlayer({
  src,
  autoplay = true,
  onPlayStart,
  onQualified,
  onStop,
  onFinish,
  height = 84,
  maxSeconds,
}: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const playedRef = useRef(0); // seconds listened
  const qualifiedSentRef = useRef(false);

  // Keep the latest callbacks in refs so we don't re-create wavesurfer when they change
  const cbPlayStartRef = useRef<typeof onPlayStart>(onPlayStart);
  const cbQualifiedRef = useRef<typeof onQualified>(onQualified);
  const cbStopRef = useRef<typeof onStop>(onStop);
  const cbFinishRef = useRef<typeof onFinish>(onFinish);

  useEffect(() => { cbPlayStartRef.current = onPlayStart; }, [onPlayStart]);
  useEffect(() => { cbQualifiedRef.current = onQualified; }, [onQualified]);
  useEffect(() => { cbStopRef.current = onStop; }, [onStop]);
  useEffect(() => { cbFinishRef.current = onFinish; }, [onFinish]);

  useEffect(() => {
    if (!containerRef.current) return;

    // If replacing an existing track, log stop before tearing it down
    if (wavesurferRef.current) {
      try {
        cbStopRef.current?.(Math.floor(playedRef.current), "change");
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("onStop(change) failed:", e);
      }
      try {
        wavesurferRef.current.destroy();
      } catch (e) {
        const name =
          e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "";
        if (name !== "AbortError") {
          // eslint-disable-next-line no-console
          console.warn("wavesurfer destroy warning:", e);
        }
      }
      wavesurferRef.current = null;
    }

    setErr(null);
    playedRef.current = 0;
    qualifiedSentRef.current = false;

    const options: WaveSurferOptions = {
      container: containerRef.current,
      height,
      waveColor: "#cbd5e1", // slate-300
      progressColor: "#06b6d4", // cyan-500
      barWidth: 2,
      barRadius: 1,
      cursorWidth: 1,
      normalize: true,
    };

    const ws = WaveSurfer.create(options);
    wavesurferRef.current = ws;

    ws.on("ready", () => {
      if (autoplay) {
        ws.play();
        setIsPlaying(true);
        cbPlayStartRef.current?.();
      } else {
        setIsPlaying(false);
      }
    });

    ws.on("play", () => {
      setIsPlaying(true);
    });

    ws.on("pause", () => {
      setIsPlaying(false);
      cbStopRef.current?.(Math.floor(playedRef.current), "pause");
    });

    ws.on("finish", () => {
      setIsPlaying(false);
      try {
        cbFinishRef.current?.();
      } finally {
        cbStopRef.current?.(Math.floor(playedRef.current), "end");
      }
    });

    ws.on("audioprocess", () => {
      const t = ws.getCurrentTime();
      playedRef.current = t;

      if (!qualifiedSentRef.current && t >= 15) {
        qualifiedSentRef.current = true;
        cbQualifiedRef.current?.(Math.floor(t));
      }

      if (typeof maxSeconds === "number" && t >= maxSeconds) {
        // Soft-stop at preview cap
        ws.pause();
      }
    });

    ws.on("error", (e) => {
      // eslint-disable-next-line no-console
      console.error("WaveSurfer error:", e);
      setErr("Couldn’t load this audio URL.");
      setIsPlaying(false);
      cbStopRef.current?.(Math.floor(playedRef.current), "error");
    });

    // Begin loading after handlers are attached
    ws.load(src);

    // Cleanup on unmount or when `src`/`height` changes
    return () => {
      try {
        ws.destroy();
      } catch (e) {
        const name =
          e && typeof e === "object" && "name" in e ? String((e as { name?: unknown }).name) : "";
        if (name !== "AbortError") {
          // eslint-disable-next-line no-console
          console.warn("wavesurfer destroy warning:", e);
        }
      }
      wavesurferRef.current = null;
    };
    // 👇 only re-create when the actual media or visual height changes
  }, [src, height, autoplay, maxSeconds]);

  const togglePlay = () => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    if (isPlaying) ws.pause();
    else ws.play();
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div ref={containerRef} />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="rounded-md bg-cyan-600 px-3 py-1.5 text-white hover:bg-cyan-700"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span className="text-xs text-gray-500">
          {Math.floor(playedRef.current)}s listened
          {qualifiedSentRef.current ? " • qualified" : ""}
        </span>
      </div>
    </div>
  );
}
