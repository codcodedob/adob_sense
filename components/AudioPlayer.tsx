import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import WaveSurfer, { WaveSurferOptions } from "wavesurfer.js";

export type Reason = "pause" | "change" | "error" | "end";

export type AudioPlayerHandle = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  isPlaying: () => boolean;
};

type AudioPlayerProps = {
  src: string;
  onPlayStart?: () => void;
  onQualified?: (playedSeconds: number) => void;
  onStop?: (playedSeconds: number, reason?: Reason) => void;
  onFinish?: () => void;
  height?: number;
};

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer(
  { src, onPlayStart, onQualified, onStop, onFinish, height = 84 },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const playedRef = useRef(0);
  const qualifiedSentRef = useRef(false);

  useImperativeHandle(ref, () => ({
    play() {
      const ws = wavesurferRef.current;
      if (!ws) return;
      ws.play();
    },
    pause() {
      const ws = wavesurferRef.current;
      if (!ws) return;
      ws.pause();
    },
    toggle() {
      const ws = wavesurferRef.current;
      if (!ws) return;
      ws.isPlaying() ? ws.pause() : ws.play();
    },
    isPlaying() {
      return isPlaying;
    },
  }), [isPlaying]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (wavesurferRef.current) {
      try { onStop?.(Math.floor(playedRef.current), "change"); } catch {}
      try { wavesurferRef.current.destroy(); } catch {}
      wavesurferRef.current = null;
    }

    setErr(null);
    playedRef.current = 0;
    qualifiedSentRef.current = false;

    const options: WaveSurferOptions = {
      container: containerRef.current,
      height,
      waveColor: "#cbd5e1",
      progressColor: "#06b6d4",
      barWidth: 2,
      barRadius: 1,
      cursorWidth: 1,
      normalize: true,
    };

    const ws = WaveSurfer.create(options);
    wavesurferRef.current = ws;

    ws.on("ready", () => { ws.play(); setIsPlaying(true); onPlayStart?.(); });
    ws.on("play",  () => setIsPlaying(true));
    ws.on("pause", () => { setIsPlaying(false); onStop?.(Math.floor(playedRef.current), "pause"); });
    ws.on("finish", () => {
      setIsPlaying(false);
      try { onFinish?.(); } finally { onStop?.(Math.floor(playedRef.current), "end"); }
    });
    ws.on("audioprocess", () => {
      const t = ws.getCurrentTime();
      playedRef.current = t;
      if (!qualifiedSentRef.current && t >= 15) {
        qualifiedSentRef.current = true;
        onQualified?.(Math.floor(t));
      }
    });
    ws.on("error", () => {
      setErr("Couldn’t load this audio URL.");
      setIsPlaying(false);
      onStop?.(Math.floor(playedRef.current), "error");
    });

    ws.load(src);

    return () => {
      try { ws.destroy(); } catch {}
      wavesurferRef.current = null;
    };
  }, [src, height, onPlayStart, onQualified, onStop, onFinish]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div ref={containerRef} />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {/* Local play/pause button is still useful */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (wavesurferRef.current?.isPlaying() ? wavesurferRef.current.pause() : wavesurferRef.current?.play())}
          className="rounded-md bg-cyan-600 px-3 py-1.5 text-white hover:bg-cyan-700"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span className="text-xs text-gray-500">
          {Math.floor(playedRef.current)}s listened{qualifiedSentRef.current ? " • qualified" : ""}
        </span>
      </div>
    </div>
  );
});

export default AudioPlayer;
