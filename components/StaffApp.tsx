"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushQueue, listClips, putClip } from "@/lib/queue";

type TodaySlot = { label: string; status: "done" | "missed" | "pending"; by: string | null; at: string | null; timing: string | null };
type BatchToday = { id: string; name: string; slots: TodaySlot[] };

const MAX_SECONDS = 60;
const CACHE_KEY = "vf_today";
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    });
  });
}

function readCache(): BatchToday[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as BatchToday[]) : null;
  } catch {
    return null;
  }
}

function SlotChips({ slots }: { slots: TodaySlot[] }) {
  if (!slots.length) return null;
  return (
    <div className="chips">
      {slots.map((s) => (
        <span key={s.label} className={`chip chip-${s.status}`}>
          {s.label} {s.status === "done" ? "✓" : s.status === "missed" ? "✕" : "·"}
        </span>
      ))}
    </div>
  );
}

export default function StaffApp({ name }: { name: string }) {
  const [mode, setMode] = useState<"home" | "camera" | "saved">("home");
  const [batch, setBatch] = useState<BatchToday | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [batches, setBatches] = useState<BatchToday[] | null>(null);
  const [online, setOnline] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const metaRef = useRef<{ start: number; batch: BatchToday; ticket: Promise<string | null>; pos: Promise<GeolocationPosition | null> } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Attach the live camera to the preview whenever the <video> element mounts
  const previewRef = useCallback((el: HTMLVideoElement | null) => {
    if (!el || !streamRef.current) return;
    if (el.srcObject !== streamRef.current) el.srcObject = streamRef.current;
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute("muted", "");
    el.setAttribute("playsinline", "");
    el.play().catch(() => {});
  }, []);

  const refreshToday = useCallback(async () => {
    try {
      const r = await fetch("/api/today", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setBatches(j.batches);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(j.batches));
      } catch {
        /* storage full or blocked */
      }
    } catch {
      /* offline: keep cached list */
    }
  }, []);

  const sync = useCallback(async () => {
    setUploading(true);
    const left = await flushQueue();
    setWaiting(left);
    setUploading(false);
    refreshToday();
  }, [refreshToday]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    setOnline(navigator.onLine);
    setBatches(readCache());
    listClips().then((c) => setWaiting(c.length));
    refreshToday();
    sync();
    const goOnline = () => {
      setOnline(true);
      sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const visible = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", visible);
    const iv = setInterval(() => navigator.onLine && sync(), 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(iv);
    };
  }, [sync, refreshToday]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const openCamera = async (b: BatchToday) => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record video. Open the app in Chrome.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
        audio: true,
      });
      streamRef.current = stream;
      setBatch(b);
      setMode("camera");
      getPosition(); // warm up GPS
    } catch {
      setError("Camera blocked. Allow camera and microphone for this app in your phone settings, then try again.");
    }
  };

  const closeCamera = () => {
    if (recRef.current?.state === "recording") return;
    stopStream();
    setMode("home");
  };

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const finish = async () => {
    setRecording(false);
    stopStream();
    const meta = metaRef.current!;
    const rec = recRef.current!;
    const mimeType = (rec.mimeType || pickMime() || "video/webm").split(";")[0];
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const [ticket, pos] = await Promise.all([meta.ticket, meta.pos]);
    await putClip({
      clipId: crypto.randomUUID(),
      batchId: meta.batch.id,
      batchName: meta.batch.name,
      blob,
      mimeType,
      deviceRecordedAt: meta.start,
      durationSeconds: Math.round((Date.now() - meta.start) / 100) / 10,
      clockTicket: ticket,
      latitude: pos?.coords.latitude ?? null,
      longitude: pos?.coords.longitude ?? null,
      accuracy: pos?.coords.accuracy ?? null,
      attempts: 0,
    });
    setWaiting((w) => w + 1);
    setMode("saved");
    sync();
  };

  const start = () => {
    const stream = streamRef.current;
    if (!stream || !batch) return;
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 500_000,
      audioBitsPerSecond: 32_000,
    });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = finish;
    recRef.current = rec;
    metaRef.current = {
      start: Date.now(),
      batch,
      ticket: withTimeout(
        fetch("/api/clock", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => j?.ticket ?? null)
          .catch(() => null),
        5000,
      ),
      pos: withTimeout(getPosition(), 15_000),
    };
    rec.start(1000);
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stop();
  }, [recording, seconds, stop]);

  if (mode === "camera" && batch) {
    const left = MAX_SECONDS - seconds;
    return (
      <div className="camera">
        <video ref={previewRef} playsInline muted autoPlay className="camera-view" />
        <div className="camera-top">
          {recording ? (
            <span className="rec-badge">
              ● REC {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
          ) : (
            <button className="link-btn light" onClick={closeCamera}>
              Cancel
            </button>
          )}
          <span className="batch-badge">{batch.name}</span>
        </div>
        <div className="camera-bottom">
          <p className="camera-hint">
            {recording ? (left <= 10 ? `Stopping in ${left}s` : "Show the feed going into the pond. Tap to stop.") : "Point at the pond, then tap to record."}
          </p>
          <button className={`shutter ${recording ? "is-recording" : ""}`} onClick={recording ? stop : start} aria-label={recording ? "Stop" : "Record"}>
            <span />
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="staff">
      <header className="staff-head">
        <div className="brand-mark">V</div>
        <div>
          <div className="muted small">Verank Farms</div>
          <div className="staff-name">Hi, {name}</div>
        </div>
      </header>

      {mode === "saved" && (
        <div className="notice ok">
          <strong>Feeding recorded{metaRef.current ? ` for ${metaRef.current.batch.name}` : ""}.</strong>{" "}
          {waiting === 0 ? "Uploaded." : uploading ? "Uploading now…" : "Saved on this phone. It will upload when it can."}
          <button className="link-btn" onClick={() => setMode("home")}>
            OK
          </button>
        </div>
      )}

      <h2 className="pick-title">Which batch are you feeding?</h2>
      {batches === null && <p className="muted">Loading batches…</p>}
      {batches?.length === 0 && <p className="notice warn">No batches yet. Ask your admin to add one.</p>}
      <div className="batch-list">
        {batches?.map((b) => (
          <button key={b.id} className="batch-btn" onClick={() => openCamera(b)}>
            <span className="batch-btn-top">
              <span className="record-dot" />
              <span className="batch-btn-name">{b.name}</span>
            </span>
            <SlotChips slots={b.slots} />
          </button>
        ))}
      </div>
      {error && <p className="notice err">{error}</p>}

      {waiting > 0 && (
        <p className="notice warn">
          {waiting} video{waiting === 1 ? "" : "s"} waiting to upload.{" "}
          {online ? (uploading ? "Uploading…" : <button className="link-btn" onClick={sync}>Retry now</button>) : "Turn on data and keep the app open."}
        </p>
      )}
      {!online && waiting === 0 && <p className="notice warn">You&apos;re offline. You can still record; it uploads later.</p>}
    </main>
  );
}
