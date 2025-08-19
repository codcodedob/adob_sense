// components/HoverGuideHUD.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type MasterTab = "Hipsession" | "Adob Sense" | "Playlist";
type Sense = "Sound" | "Vision" | "Touch" | "Taste" | "Live";
type Plan = "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX";

type Track = {
  id: string;
  name?: string;
  artists?: string[];
  duration?: number | string | null;
  url?: string | null;
  videoUrl?: string | null;
};

type Props = {
  activeMaster: MasterTab;
  onMasterChange: (tab: MasterTab) => void;
  activeSense: Sense;
  onSenseChange: (sense: Sense) => void;

  isPlaying?: boolean;
  onPlayPause?: () => void;

  onOpenChat?: () => void;
  onCheckout?: (plan: Plan) => void;

  userName?: string | null;
  subscriptionType?: string | null;
  trialEndsAt?: Date | string | null;

  selectedAlbumTitle?: string | null;
  selectedAlbumId?: string | null;
  selectedAlbumTracks?: Track[] | null;

  onPlayTrack?: (track: Track) => void;
  onSubscribeAlbum?: (albumId: string) => void;
  onFavoriteTrack?: (trackId: string) => void;
  onShareAlbum?: (albumId: string) => void;
};

const MASTER_TABS: MasterTab[] = ["Hipsession", "Adob Sense", "Playlist"];
// Use your original icon locations in /public
const SENSES: { key: Sense; icon: string }[] = [
  { key: "Sound",  icon: "/sound.svg"  },
  { key: "Vision", icon: "/vision.svg" },
  { key: "Touch",  icon: "/touch.svg"  },
  { key: "Taste",  icon: "/taste.svg"  },
  { key: "Live",   icon: "/live.svg"   },
];

export default function HoverGuideHUD({
  activeMaster,
  onMasterChange,
  activeSense,
  onSenseChange,
  isPlaying = false,
  onPlayPause,
  onOpenChat,
  onCheckout,
  userName,
  subscriptionType,
  trialEndsAt,
  selectedAlbumTitle,
  selectedAlbumId,
  selectedAlbumTracks,
  onPlayTrack,
  onSubscribeAlbum,
  onFavoriteTrack,
  onShareAlbum,
}: Props) {
  const HUD_SIZE = 72;
  const hudRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const [dragging, setDragging] = useState(false);
  const [touchOffset, setTouchOffset] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);

  const [time, setTime] = useState(
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  );
  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      setPos((prev) => ({
        x: Math.min(Math.max(0, prev.x + e.movementX), window.innerWidth - HUD_SIZE),
        y: Math.min(Math.max(0, prev.y + e.movementY), window.innerHeight - HUD_SIZE),
      }));
    };
    const onMouseUp = () => setDragging(false);

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging || !e.touches.length) return;
      const t = e.touches[0];
      setPos({
        x: Math.min(Math.max(0, t.clientX - touchOffset.x), window.innerWidth - HUD_SIZE),
        y: Math.min(Math.max(0, t.clientY - touchOffset.y), window.innerHeight - HUD_SIZE),
      });
    };
    const onTouchEnd = () => setDragging(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [dragging, touchOffset]);

  const handleMouseDown = () => setDragging(true);
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!hudRef.current) return;
    const rect = hudRef.current.getBoundingClientRect();
    const t = e.touches[0];
    setTouchOffset({ x: t.clientX - rect.left, y: t.clientY - rect.top });
    setDragging(true);
  };

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const trialInfo = useMemo(() => {
    if (!trialEndsAt) return { active: false, expired: false, msLeft: 0 };
    const endMs = typeof trialEndsAt === "string" ? Date.parse(trialEndsAt) : trialEndsAt.getTime();
    const msLeft = Math.max(0, endMs - now);
    return {
      active: subscriptionType === "FREETRIAL" && msLeft > 0,
      expired: subscriptionType === "FREETRIAL" && msLeft <= 0,
      msLeft,
    };
  }, [trialEndsAt, now, subscriptionType]);

  const fmt = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const handleBubbleClick = () => {
    if (dragging) return;
    setExpanded((v) => !v);
  };

  const albumQuicklistVisible =
    !!selectedAlbumId && !!selectedAlbumTitle && (selectedAlbumTracks?.length ?? 0) > 0;

  return (
    <>
      <div
        ref={hudRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleBubbleClick}
        title="Adob Sense HUD — tap to expand"
        style={{
          position: "fixed",
          top: pos.y,
          left: pos.x,
          zIndex: 10000,
          width: HUD_SIZE,
          height: HUD_SIZE,
          borderRadius: "50%",
          background: "linear-gradient(135deg,#00B6FF,#6EE7FF)",
          boxShadow: "0 8px 24px rgba(0,182,255,0.35)",
          color: "#001018",
          fontSize: 13,
          fontWeight: 800,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        {time}
      </div>

      {expanded && (
        <div
          className="fixed z-[10001] w-[340px] max-w-[92vw] rounded-2xl bg-white/95 backdrop-blur-lg shadow-2xl border border-cyan-100 p-3"
          style={{
            top: Math.min(pos.y + HUD_SIZE + 8, window.innerHeight - 320),
            left: Math.min(pos.x, window.innerWidth - 360),
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative h-7 w-7 overflow-hidden rounded-full bg-cyan-100 ring-2 ring-cyan-200">
                <Image src="/live.svg" alt="logo" fill className="object-contain p-1.5" />
              </div>
              <div className="text-sm font-semibold text-gray-800">
                {userName ? `Hello, ${userName}` : "Welcome to Adob Sense"}
              </div>
            </div>

            <button
              className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              onClick={() => setExpanded(false)}
            >
              Close
            </button>
          </div>

          <div className="mt-3 rounded-md border bg-cyan-50/60 px-3 py-2 text-xs text-cyan-900">
            {trialInfo.active && (
              <div className="flex items-center justify-between">
                <span className="font-semibold">Free trial</span>
                <span className="font-mono">{fmt(trialInfo.msLeft)} left</span>
              </div>
            )}
            {trialInfo.expired && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-700">Trial expired</span>
                <span className="font-mono text-amber-700">00:00</span>
              </div>
            )}
            {!trialInfo.active && !trialInfo.expired && (
              <span className="font-semibold">Tier: {subscriptionType || "HIPSESSION"}</span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:shadow"
              onClick={() => onPlayPause?.()}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:shadow"
              onClick={() => onOpenChat?.()}
            >
              Ask Dobe
            </button>
            <button
              className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:shadow"
              onClick={() => onCheckout?.("ADOB_SENSE")}
            >
              Subscribe
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border bg-white px-2 py-1">
            {MASTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => onMasterChange(tab)}
                className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                  activeMaster === tab ? "bg-black text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-5 gap-1">
            {SENSES.map((s) => (
              <button
                key={s.key}
                onClick={() => onSenseChange(s.key)}
                className={`flex flex-col items-center rounded-lg px-1 py-1 ${
                  activeSense === s.key ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
                title={s.key}
              >
                <Image src={s.icon} alt={s.key} width={18} height={18} className="mb-0.5" />
                <span className="text-[10px] leading-none">{s.key}</span>
              </button>
            ))}
          </div>

          {albumQuicklistVisible && (
            <div className="mt-3 rounded-xl border bg-white">
              <div className="flex items-center justify-between px-3 py-2">
                <div className="text-sm font-semibold">
                  {selectedAlbumTitle} — {selectedAlbumTracks?.length ?? 0} tracks
                </div>
                <div className="flex gap-1">
                  <button
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    onClick={() => selectedAlbumId && onSubscribeAlbum?.(selectedAlbumId)}
                  >
                    Subscribe
                  </button>
                  <button
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    onClick={() => selectedAlbumId && onShareAlbum?.(selectedAlbumId)}
                  >
                    Share
                  </button>
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y">
                {(selectedAlbumTracks ?? []).map((t, i) => {
                  const label = t.name || (t.id ? `Track ${i + 1}` : `Untitled ${i + 1}`);
                  const artists =
                    t.artists && t.artists.length ? ` • ${t.artists.join(", ")}` : "";
                  return (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{label}</p>
                        {artists && <p className="truncate text-xs text-gray-500">{artists}</p>}
                      </div>
                      <div className="ml-3 flex items-center gap-1">
                        <button
                          className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                          onClick={() => onPlayTrack?.(t)}
                          title="Play"
                        >
                          ▶
                        </button>
                        <button
                          className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                          onClick={() => onFavoriteTrack?.(t.id)}
                          title="Favorite"
                        >
                          ★
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {trialInfo.expired && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                className="rounded-lg bg-black px-2 py-2 text-xs font-semibold text-white"
                onClick={() => onCheckout?.("ADOB_SENSE")}
              >
                Get Sense
              </button>
              <button
                className="rounded-lg bg-black px-2 py-2 text-xs font-semibold text-white"
                onClick={() => onCheckout?.("DOBE_ONE")}
              >
                Dobe One
              </button>
              <button
                className="rounded-lg bg-black px-2 py-2 text-xs font-semibold text-white"
                onClick={() => onCheckout?.("DEMANDX")}
              >
                Demand X
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
