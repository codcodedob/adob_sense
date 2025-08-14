import { useEffect, useMemo, useState } from "react";

export default function Countdown({ endIso }: { endIso: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const text = useMemo(() => {
    if (!endIso) return "";
    const end = new Date(endIso).getTime();
    const diff = Math.max(0, end - now);
    const s = Math.floor(diff / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${d}d ${h}h ${m}m ${sec}s`;
  }, [endIso, now]);

  if (!endIso) return null;
  return <span className="font-mono text-sm text-gray-700">{text}</span>;
}
