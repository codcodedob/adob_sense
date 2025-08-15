// components/TouchSensePanels.tsx
// Touch sense page composed of multiple panels (rows):
// 1) Auth
// 2) Transcription (placeholder UI)
// 3) Translation (placeholder UI)
// 4) Upload + Fingerprinting (placeholder UI)
// 5) Exec Dashboard (temporary views snapshot)

import {  useState } from "react";
import TouchSenseAuth from "./TouchSenseAuth";

// Small section shell
function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border bg-white p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

// 2) Transcription UI (placeholder)
export function TranscriptionPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("Idle");
  return (
    <Panel title="Transcription">
      <div className="grid gap-3">
        <input type="file" accept="audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div className="flex gap-2">
          <button
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            disabled={!file}
            onClick={() => setStatus("Queued (stub) – wire to API")}
          >
            Transcribe
          </button>
          <span className="text-xs text-gray-500 self-center">{status}</span>
        </div>
        <textarea className="h-24 w-full rounded-md border p-2 text-sm" placeholder="Transcript output (stub)" />
      </div>
    </Panel>
  );
}

// 3) Translation UI (placeholder)
export function TranslationPanel() {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("es");
  return (
    <Panel title="Translation">
      <div className="grid gap-3">
        <textarea className="h-24 w-full rounded-md border p-2 text-sm" placeholder="Enter text to translate" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Target</label>
          <select className="rounded-md border p-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
          </select>
          <button className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black">Translate</button>
        </div>
        <textarea className="h-24 w-full rounded-md border p-2 text-sm" placeholder="Translation output (stub)" />
      </div>
    </Panel>
  );
}

// 4) Upload + Fingerprinting (placeholder)
export function FingerprintPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  return (
    <Panel title="Upload & Fingerprinting">
      <div className="grid gap-3">
        <input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input className="w-full rounded-md border p-2 text-sm" placeholder="Notes / metadata (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <button className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50" disabled={!file}>Upload</button>
          <button className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black" disabled={!file}>Generate Fingerprint</button>
        </div>
        <div className="rounded-md border p-2 text-xs text-gray-600">Fingerprint result (stub)</div>
      </div>
    </Panel>
  );
}

// 5) Executive Views Dashboard (temporary snapshot)
export function ExecDashboardPanel() {
  // In a follow-up we can query Firestore (`views`, `albumViews`) for real data.
  const [since] = useState<string>(new Date(Date.now() - 24*3600*1000).toLocaleString());
  return (
    <Panel title="Executive Snapshot: Views & Plays" right={<span className="text-xs text-gray-500">Since {since}</span>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-gray-500">Total Plays</p>
          <p className="text-2xl font-semibold">—</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-gray-500">Unique Listeners</p>
          <p className="text-2xl font-semibold">—</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-gray-500">Avg. Listen Time</p>
          <p className="text-2xl font-semibold">—</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-gray-500">Top Artist</p>
          <p className="text-2xl font-semibold">—</p>
        </div>
      </div>
      <div className="mt-3 rounded-md border p-3 text-xs text-gray-600">Graph placeholders (wire Recharts later)</div>
    </Panel>
  );
}

export default function TouchSensePanels() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Panel title="Sign in / Create account">
        <TouchSenseAuth />
      </Panel>
      <TranscriptionPanel />
      <TranslationPanel />
      <FingerprintPanel />
      <ExecDashboardPanel />
    </div>
  );
}
