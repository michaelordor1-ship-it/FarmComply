// Offline queue for recorded clips, kept in the phone's IndexedDB until uploaded.

export type QueuedClip = {
  clipId: string;
  blob: Blob;
  mimeType: string;
  deviceRecordedAt: number;
  durationSeconds: number;
  clockTicket: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  attempts: number;
  lastError?: string;
};

const DB_NAME = "verank-feeding";
const STORE = "clips";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "clipId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const putClip = (c: QueuedClip) => tx("readwrite", (s) => s.put(c));
export const deleteClip = (id: string) => tx("readwrite", (s) => s.delete(id));
export const listClips = () => tx<QueuedClip[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedClip[]>);

let running = false;

/** Upload everything in the queue, oldest first. Returns how many are still waiting. */
export async function flushQueue(onProgress?: (msg: string) => void): Promise<number> {
  if (running) return (await listClips()).length;
  running = true;
  try {
    const clips = (await listClips()).sort((a, b) => a.deviceRecordedAt - b.deviceRecordedAt);
    for (const clip of clips) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      try {
        onProgress?.("Uploading video…");
        const prep = await fetch("/api/recordings/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clipId: clip.clipId,
            deviceRecordedAt: clip.deviceRecordedAt,
            deviceNow: Date.now(),
            clockTicket: clip.clockTicket,
            durationSeconds: clip.durationSeconds,
            mimeType: clip.mimeType,
            sizeBytes: clip.blob.size,
            latitude: clip.latitude,
            longitude: clip.longitude,
            accuracy: clip.accuracy,
          }),
        });
        const p = await prep.json();
        if (!prep.ok) throw new Error(p.error ?? `prepare ${prep.status}`);
        if (!p.alreadyDone) {
          const form = new FormData();
          form.append("cacheControl", "3600");
          form.append("", clip.blob);
          const up = await fetch(p.uploadUrl, { method: "PUT", body: form, headers: { "x-upsert": "true" } });
          if (!up.ok) throw new Error(`upload ${up.status}`);
          const conf = await fetch("/api/recordings/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: p.id }),
          });
          if (!conf.ok) throw new Error(`confirm ${conf.status}`);
        }
        await deleteClip(clip.clipId);
      } catch (e) {
        await putClip({ ...clip, attempts: clip.attempts + 1, lastError: String(e) });
        break; // try again later
      }
    }
    return (await listClips()).length;
  } finally {
    running = false;
  }
}
