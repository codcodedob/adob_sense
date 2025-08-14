// pages/index.tsx
// Waveform player + dual bottom nav
// Albums drilldown (enterSounds0 & enterSoundsII); Singles/New Releases autoplay; Artists route
// Ads side panel; Ratings modal; Touch tab panels; Free Trial banner.

import Head from "next/head";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Geist, Geist_Mono } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

import AudioPlayer from "../components/AudioPlayer";
import TouchSensePanels from "../components/TouchSensePanels";
import TrialBanner from "../components/TrialBanner";
import SubscribeButtons from "@/components/SubscribeButtons";
import {
  collection,
  getDocs,
  query as fsQuery,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebaseClient";
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";

import { startAlbumView, startView, saveRating } from "../lib/views";

// HUD must be client-only to avoid SSR time drift hydration errors
const HoverGuideHUD = dynamic(() => import("@/components/HoverGuideHUD"), { ssr: false });

// Fonts
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Master & sense tabs
const MASTER_TABS = ["Playlist", "Adob Sense", "Hipsession"] as const;
const SENSES = [
  { key: "Sound",  icon: "/sound.svg"  },
  { key: "Vision", icon: "/vision.svg" },
  { key: "Touch",  icon: "/touch.svg"  },
  { key: "Taste",  icon: "/taste.svg"  },
  { key: "Live",   icon: "/live.svg"   },
] as const;

// Latest mapping you asked for
const enterSoundGroups = [
  { id: "enterSoundsI",   label: "Artists",       soundCollection: "soundsI"   },
  { id: "enterSounds0",   label: "Albums (A)",    soundCollection: "sounds"    },
  { id: "enterSoundsII",  label: "Albums (B)",    soundCollection: "soundsII"  },
  { id: "enterSoundsIII", label: "New Releases",  soundCollection: "soundsIII" },
  { id: "enterSoundsIV",  label: "Singles",       soundCollection: "soundsIV"  },
  { id: "entersoundsV",   label: "Ads",           soundCollection: "soundsV"       },
] as const;

// ---------- Types ----------
export type SoundDoc = {
  id: string;
  name?: string;
  imageUrl?: string;
  imgUrl?: string;
  price?: number;
  soundDescription?: string;
  stock?: number;
  timeStamp?: unknown;
  url?: string;
  videoUrl?: string;
  enterSound?: string;
  entersound?: string;
  type?: string;
  artists?: string[];
  duration?: string | number | null;
};

export type EnterSoundDoc = {
  id: string;
  title?: string;
  type?: string;
  imgUrl?: string;
  imageUrl?: string;
  _soundList?: SoundDoc[];
};

export type SoundsByRow = Record<(typeof enterSoundGroups)[number]["label"], EnterSoundDoc[]>;

// ---------- Helpers ----------
const AUDIO_EXTS = [".mp3", ".m4a", ".wav", ".ogg", ".webm", ".aac", ".flac"];
const looksLikeAudio = (url: string) => AUDIO_EXTS.some((ext) => url.toLowerCase().includes(ext));
const getPlayableFromDoc = (s?: SoundDoc | null) => {
  if (!s) return null;
  if (s.url && looksLikeAudio(s.url)) return s.url;
  if (s.videoUrl && looksLikeAudio(s.videoUrl)) return s.videoUrl;
  return s.videoUrl || s.url || null;
};

const useProxy = process.env.NEXT_PUBLIC_USE_AUDIO_PROXY === "1";
const wrapViaProxy = (u: string | null) => (u && useProxy ? `/api/proxy-audio?src=${encodeURIComponent(u)}` : u);

// Mount gate to avoid hydration mismatch for any time-based UI you add
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

// ---------- Rating modal ----------
function RatingModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number) => void;
}) {
  const [rating, setRating] = useState(0);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="w-[320px] rounded-xl bg-white p-4 shadow">
        <h3 className="mb-2 text-base font-semibold text-gray-900">Rate this experience</h3>
        <div className="mb-4 flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className={`h-10 w-10 rounded-full border text-sm font-semibold ${
                rating === n ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
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
            onClick={() => (rating > 0 ? onSubmit(rating) : onClose())}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Tiles & Rows ----------
function SoundTile({
  sound,
  onPick,
}: {
  sound: SoundDoc;
  onPick: (url: string | null, meta?: SoundDoc) => void;
}) {
  const cover = sound.imageUrl || sound.imgUrl;
  const display = sound.name || sound.id;
  const playUrl = getPlayableFromDoc(sound);
  return (
    <button
      onClick={() => onPick(wrapViaProxy(playUrl), sound)}
      title={display}
      className="shrink-0 w-40 rounded-lg bg-white border border-gray-200 shadow hover:shadow-md hover:border-gray-300 transition text-left snap-start"
    >
      <div className="w-40 h-24 relative rounded-t-lg overflow-hidden bg-gray-100">
        {cover ? (
          <Image src={cover} alt={display} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">No cover</div>
        )}
      </div>
      <div className="px-2 py-2">
        <p className="truncate text-sm font-medium text-gray-900">{display}</p>
      </div>
    </button>
  );
}

function HorizontalRow({
  title,
  items,
  onPick,
  onDrill,
  router,
  playAndReveal,
  fetchTracksForEnterSound,
  onAlbumSelect,
  selectedAlbumId,
  captureTrackMeta,
}: {
  title: string;
  items: EnterSoundDoc[];
  onPick: (soundUrl: string | null, enter?: EnterSoundDoc) => void;
  onDrill: (fromRow: string, sounds: SoundDoc[] | null) => void;
  router: ReturnType<typeof useRouter>;
  playAndReveal: (url: string | null) => void;
  fetchTracksForEnterSound: (enterId: string) => Promise<SoundDoc[]>;
  onAlbumSelect: (title: string, id: string) => void;
  selectedAlbumId?: string | null;
  captureTrackMeta: (meta: {
    soundId: string;
    enterSoundId?: string | null;
    artists?: string[];
    duration?: string | number | null;
    sourceUrl?: string;
  }) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollingDirRef = useRef<1 | -1 | 0>(0);

  const scrollStep = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft += (scrollingDirRef.current || 0) * 12;
    rafRef.current = requestAnimationFrame(scrollStep);
  };
  const startHoldScroll = (dir: 1 | -1) => {
    scrollingDirRef.current = dir;
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(scrollStep);
  };
  const stopHoldScroll = () => {
    scrollingDirRef.current = 0;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };
  const nudge = (delta: number) => scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nudge(280);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nudge(-280);
    }
  };

  const handleTileClick = async (it: EnterSoundDoc) => {
    if (title === "Artists") {
      router.push(`/artist/${it.id}`);
      return;
    }

    const isAlbum = title.startsWith("Albums");
    if (isAlbum) {
      onAlbumSelect(it.title || it.id, it.id);
      try {
        const u = getAuth().currentUser;
        if (u) await startAlbumView(it.id, u.uid, []);
      } catch {}
      const tracks = await fetchTracksForEnterSound(it.id);
      onDrill("Albums", tracks.length ? tracks : null);
      return;
    }

    if (title === "New Releases" || title === "Singles") {
      const first = it._soundList?.[0] || null;
      const urlRaw = getPlayableFromDoc(first);
      const url = wrapViaProxy(urlRaw);
      if (first)
        captureTrackMeta({
          soundId: first.id,
          enterSoundId: null,
          artists: first.artists ?? [],
          duration: first.duration ?? null,
          sourceUrl: urlRaw ?? undefined,
        });
      playAndReveal(url);
      return;
    }

    // Fallback
    const first = it._soundList?.[0] || null;
    const url = wrapViaProxy(getPlayableFromDoc(first));
    onPick(url, it);
  };

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <div className="flex gap-2">
          <button
            onMouseDown={() => startHoldScroll(-1)}
            onMouseUp={stopHoldScroll}
            onMouseLeave={stopHoldScroll}
            onTouchStart={() => startHoldScroll(-1)}
            onTouchEnd={stopHoldScroll}
            onClick={() => nudge(-280)}
            className="grid h-8 w-8 place-items-center rounded-full border border-gray-300 bg-white hover:bg-gray-50"
            aria-label={`Scroll ${title} left`}
          >
            ◀
          </button>
          <button
            onMouseDown={() => startHoldScroll(1)}
            onMouseUp={stopHoldScroll}
            onMouseLeave={stopHoldScroll}
            onTouchStart={() => startHoldScroll(1)}
            onTouchEnd={stopHoldScroll}
            onClick={() => nudge(280)}
            className="grid h-8 w-8 place-items-center rounded-full border border-gray-300 bg-white hover:bg-gray-50"
            aria-label={`Scroll ${title} right`}
          >
            ▶
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="scroll-smooth snap-x snap-mandatory overflow-x-auto focus:outline-none"
      >
        <div className="flex flex-nowrap gap-4 pr-2">
          {items.map((it: EnterSoundDoc) => {
            const cover = it.imageUrl || it.imgUrl;
            const display = it.title || it.id;
            const isSelected = title.startsWith("Albums") && selectedAlbumId === it.id;
            return (
              <div key={it.id} className="flex flex-col items-center">
                <button
                  onClick={() => void handleTileClick(it)}
                  className={`shrink-0 w-40 rounded-lg border bg-white text-left shadow transition snap-start ${
                    isSelected ? "border-cyan-500 ring-2 ring-cyan-200" : "border-gray-200 hover:border-gray-300 hover:shadow-md"
                  }`}
                  title={display}
                >
                  <div className="relative h-24 w-40 overflow-hidden rounded-t-lg bg-gray-100">
                    {cover ? (
                      <Image src={cover} alt={display} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">No cover</div>
                    )}
                  </div>
                  <div className="px-2 py-2">
                    <p className="truncate text-sm font-medium text-gray-900">{display}</p>
                    {it.type && <p className="truncate text-xs text-gray-500">{it.type}</p>}
                  </div>
                </button>
                {isSelected && <span className="mt-1 text-xl">⬇</span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- Page ----------
export default function Home() {
  const router = useRouter();
  const mounted = useMounted();

  const [activeSense, setActiveSense] = useState<(typeof SENSES)[number]["key"]>("Sound");
  const [activeMaster, setActiveMaster] = useState<(typeof MASTER_TABS)[number]>("Adob Sense");

  const [soundsByRow, setSoundsByRow] = useState<Partial<SoundsByRow>>({});
  const [selectedSoundUrl, setSelectedSoundUrl] = useState<string | null>(null);

  // Drilldown state
  const [drilledFrom, setDrilledFrom] = useState<string | null>(null);
  const [drilledSounds, setDrilledSounds] = useState<SoundDoc[] | null>(null);
  const [selectedAlbumTitle, setSelectedAlbumTitle] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  // Playback meta for startView
  const [currentSoundMeta, setCurrentSoundMeta] = useState<{
    soundId: string;
    enterSoundId?: string | null;
    artists?: string[];
    duration?: string | number | null;
    sourceUrl?: string;
  } | null>(null);

  // HUD + auth bits
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [playerIsPlaying, setPlayerIsPlaying] = useState(false);
  const [userDoc, setUserDoc] = useState<{ subscriptionType?: string | null; subscriptionEndDate?: string | Date | null; username?: string | null } | null>(null);

  const handleDrill = (fromRow: string, sounds: SoundDoc[] | null) => {
    setDrilledFrom(fromRow);
    setDrilledSounds(sounds);
  };

  const [searchTerm, setSearchTerm] = useState("");

  // player scroll/reveal on autoplay
  const playerSectionRef = useRef<HTMLDivElement | null>(null);
  const playAndReveal = (url: string | null) => {
    setSelectedSoundUrl(url);
    setTimeout(() => {
      playerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  const captureTrackMeta = (meta: {
    soundId: string;
    enterSoundId?: string | null;
    artists?: string[];
    duration?: string | number | null;
    sourceUrl?: string;
  }) => setCurrentSoundMeta(meta);

  // auth (keeps your current anonymous flow if user isn't signed in yet)
  useEffect(() => {
    const auth = getAuth();
    const off = onAuthStateChanged(auth, async (u: User | null) => {
      setCurrentUser(u);
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn("Anonymous sign-in failed", e);
        }
      }
      // If you fetch user doc for countdown/subscription, do it here and setUserDoc(...)
    });
    return () => off();
  }, []);

  // Album tracks fetch (testing in soundsII)
  const fetchTracksForEnterSound = async (enterId: string): Promise<SoundDoc[]> => {
    try {
      let q1 = fsQuery(collection(db, "soundsII"), where("enterSound", "==", enterId));
      let snap = await getDocs(q1);
      let docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SoundDoc, "id">) }));
      if (docs.length > 0) return docs as SoundDoc[];
      let q2 = fsQuery(collection(db, "soundsII"), where("entersound", "==", enterId));
      snap = await getDocs(q2);
      docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SoundDoc, "id">) }));
      return docs as SoundDoc[];
    } catch (e) {
      console.warn("fetchTracksForEnterSound failed", e);
      return [];
    }
  };

  // Fetch rows for Sound sense
  useEffect(() => {
    if (activeSense !== "Sound") return;
    const fetchAll = async () => {
      const result: Partial<SoundsByRow> = {};
      for (const group of enterSoundGroups) {
        try {
          const enterSnap = await getDocs(collection(db, group.id));
          const soundSnap = await getDocs(collection(db, group.soundCollection));
          const enter = enterSnap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
            id: d.id,
            ...(d.data() as Omit<EnterSoundDoc, "id">),
          }));
          const sounds = soundSnap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
            id: d.id,
            ...(d.data() as Omit<SoundDoc, "id">),
          }));
          const hydrated: EnterSoundDoc[] = (enter as EnterSoundDoc[]).map((es: EnterSoundDoc) => ({
            ...es,
            _soundList: (sounds as SoundDoc[]).filter((s: SoundDoc) => (s.enterSound || s.entersound) === es.id),
          }));
          (result as any)[group.label] = hydrated;
        } catch (err) {
          console.error("Fetch error for group:", group.id, err);
          (result as any)[group.label] = [];
        }
      }
      setSoundsByRow(result);
    };
    fetchAll();
  }, [activeSense]);

  const orderedRows = useMemo(() => {
    const rows = enterSoundGroups.map((g) => ({
      title: g.label,
      items: ((soundsByRow as any)[g.label] || []) as EnterSoundDoc[],
    }));
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.map(({ title, items }) => ({
      title,
      items: items.filter((it) => (it.title || it.id || "").toLowerCase().includes(q)),
    }));
  }, [soundsByRow, searchTerm]);

  // rating modal state
  const [showRating, setShowRating] = useState(false);

  // HUD checkout stub (plug your Stripe flow)
  const startCheckout = (plan: "ADOB_SENSE" | "DOBE_ONE" | "DEMANDX") => {
    console.log("startCheckout:", plan);
    // route to your checkout page or call an API to create a session
  };

  // Convert user subscriptionEndDate (string or Date) to Date for HUD (client-only rendering via dynamic import avoids hydration)
  const trialEndsAt =
    userDoc?.subscriptionEndDate
      ? (typeof userDoc.subscriptionEndDate === "string"
          ? new Date(userDoc.subscriptionEndDate)
          : (userDoc.subscriptionEndDate as Date))
      : null;

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col`}>
      <Head>
        <title>Adob Sense</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* HUD (client-only) */}
      <HoverGuideHUD
        activeMaster={activeMaster}
        onMasterChange={setActiveMaster}
        activeSense={activeSense}
        onSenseChange={setActiveSense}
        isPlaying={playerIsPlaying}
        onPlayPause={() => {}}
        onOpenChat={() => {}}
        onCheckout={(plan: any) => startCheckout(plan)}
        userName={userDoc?.username ?? null}
        subscriptionType={userDoc?.subscriptionType ?? null}
        trialEndsAt={trialEndsAt}
      />

      {/* Trial banner (top) */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-4">
        <TrialBanner />
        <SubscribeButtons />
        {/* Example spot for a live countdown — guard with mounted to avoid hydration */}
        {mounted && trialEndsAt && (
          <div className="mt-2 rounded-lg border bg-white p-3 text-sm text-gray-800">
            <div className="font-semibold">Trial time left</div>
            {/* wire your countdown text here safely, e.g. from a useCountdown hook */}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-4">
        <input
          type="text"
          placeholder="Search…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-[20rem]">
        {/* Touch sense page */}
        {activeSense === "Touch" && (
          <section className="mx-auto mt-2 w-full max-w-6xl">
            <TouchSensePanels />
          </section>
        )}

        {/* Sound page */}
        {activeSense === "Sound" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
            <div>
              {orderedRows.map(({ title, items }: { title: string; items: EnterSoundDoc[] }) => (
                <div key={title}>
                  <HorizontalRow
                    title={title}
                    items={items}
                    onPick={(url) => setSelectedSoundUrl(url)}
                    onDrill={(from, sounds) => {
                      // Only one album drilldown at a time
                      setDrilledFrom(from);
                      setDrilledSounds(sounds);
                    }}
                    router={router}
                    playAndReveal={playAndReveal}
                    fetchTracksForEnterSound={fetchTracksForEnterSound}
                    onAlbumSelect={(t, id) => {
                      setSelectedAlbumTitle(t);
                      setSelectedAlbumId(id);
                    }}
                    selectedAlbumId={selectedAlbumId}
                    captureTrackMeta={(meta) => setCurrentSoundMeta(meta)}
                  />

                  {/* Albums drilldown under Albums rows */}
                  {title.startsWith("Albums") && drilledFrom === "Albums" && drilledSounds && (
                    <section className="mt-2">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">
                          {selectedAlbumTitle ? `${selectedAlbumTitle} Tracks` : "Album Tracks"}
                        </h3>
                        <button
                          onClick={() => {
                            setDrilledSounds(null);
                            setSelectedAlbumId(null);
                            setSelectedAlbumTitle(null);
                          }}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Close
                        </button>
                      </div>
                      <div className="flex snap-x snap-mandatory flex-nowrap gap-4 overflow-x-auto">
                        {drilledSounds.map((s) => (
                          <SoundTile
                            key={s.id}
                            sound={s}
                            onPick={(url, soundMeta) => {
                              setCurrentSoundMeta({
                                soundId: soundMeta?.id || "unknown",
                                enterSoundId: selectedAlbumId ?? null,
                                artists: soundMeta?.artists ?? [],
                                duration: soundMeta?.duration ?? null,
                                sourceUrl: url ?? undefined,
                              });
                              playAndReveal(url);
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              ))}
            </div>

            {/* Ads side panel (desktop only) */}
            <aside className="sticky top-4 hidden self-start lg:block">
              <div className="rounded-xl border bg-white p-3 shadow">
                <h3 className="mb-2 text-sm font-semibold">Sponsored</h3>
                <div className="flex flex-col gap-3">
                  {(soundsByRow as any)["Ads"]?.slice(0, 4).map((ad: EnterSoundDoc) => {
                    const cover = ad.imageUrl || ad.imgUrl;
                    const label = ad.title || ad.id;
                    const url = ad._soundList?.[0]?.url || ad._soundList?.[0]?.videoUrl || null;
                    return (
                      <button
                        key={ad.id}
                        className="rounded-lg border p-2 text-left hover:shadow"
                        onClick={() => url && playAndReveal(wrapViaProxy(url))}
                      >
                        {cover && (
                          <div className="relative mb-2 h-24 w-full overflow-hidden rounded bg-gray-100">
                            <Image src={cover} alt={label} fill className="object-cover" unoptimized />
                          </div>
                        )}
                        <p className="text-sm font-medium">{label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Player anchored above sense bar */}
      <div ref={playerSectionRef} className="fixed bottom-24 left-0 right-0 z-30">
        <div className="mx-auto max-w-6xl px-3">
          {selectedSoundUrl && (
            <AudioPlayer
              src={selectedSoundUrl}
              onPlayStart={async () => {
                setPlayerIsPlaying(true);
                const u = getAuth().currentUser;
                if (!u) return;
                try {
                  await startView(
                    currentSoundMeta?.soundId || "unknown",
                    u.uid,
                    currentSoundMeta?.artists || []
                  );
                } catch (e) {
                  console.warn("startView failed:", e);
                }
              }}
              onFinish={async () => {
                setPlayerIsPlaying(false);
                // Show rating modal at end; if you add a "finishView" later you can call it here.
                setShowRating(true);
              }}
              onPause={() => setPlayerIsPlaying(false)}
            />
          )}
        </div>
      </div>

      {/* Rating modal */}
      <RatingModal
        open={showRating}
        onClose={() => setShowRating(false)}
        onSubmit={async (rating) => {
          try {
            const u = getAuth().currentUser;
            if (!u) return;
            await saveRating(currentSoundMeta?.soundId || "unknown", rating, u.uid);
          } finally {
            setShowRating(false);
          }
        }}
      />

      {/* Sense nav bar (icons small) */}
      <nav
        className="supports-[backdrop-filter]:bg-white/75 fixed bottom-16 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur"
        aria-label="Sense navigation"
      >
        <div className="mx-auto max-w-6xl px-3">
          <ul className="grid grid-cols-5">
            {SENSES.map((s) => (
              <li key={s.key}>
                <button
                  onClick={() => setActiveSense(s.key)}
                  className={`flex w-full items-center justify-center py-0.5 ${
                    activeSense === s.key ? "opacity-100" : "opacity-60 hover:opacity-80"
                  }`}
                  aria-label={s.key}
                  title={s.key}
                >
                  <Image src={s.icon} alt={s.key} width={10} height={10} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Master nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white" aria-label="Master navigation">
        <div className="mx-auto max-w-6xl px-3">
          <ul className="grid grid-cols-3">
            {MASTER_TABS.map((label) => (
              <li key={label}>
                <button
                  className={`w-full py-4 text-base font-semibold hover:bg-gray-50 ${
                    label === "Adob Sense" ? "text-gray-900" : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
