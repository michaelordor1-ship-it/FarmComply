import "server-only";
import { db } from "./supabase";
import { FARM } from "./config";
import { localDateKey, localToUtc } from "./time";
import { computeReport, type RecordingInput, type StaffInput } from "./report";
import { makeSchedule, type FeedInput, type Schedule } from "./schedule";

export type RecordingRow = {
  id: string;
  staff_id: string;
  batch_id: string | null;
  storage_path: string;
  recorded_at: string;
  uploaded_at: string | null;
  time_source: string;
  clock_skew_seconds: number;
  duration_seconds: number | null;
  latitude: number | null;
  longitude: number | null;
  flags: string[];
  staff: { name: string } | null;
  batch: { name: string } | null;
};

export type Batch = { id: string; name: string; month: string; active_from: string; closed_on: string | null; created_at: string };

export async function fetchStaff(): Promise<(StaffInput & { phone: string | null; active: boolean; created_at: string })[]> {
  const { data } = await db().from("staff").select("id, name, phone, active, created_at").order("created_at");
  return data ?? [];
}

export async function fetchSchedules(): Promise<Schedule[]> {
  const { data } = await db().from("schedules").select("effective_from, feeds, on_time_minutes").order("effective_from");
  return (data ?? []).map((r) => makeSchedule(r.effective_from, r.feeds as FeedInput[], r.on_time_minutes));
}

/** Batches, newest month first. Without includeClosed: only batches open today. */
export async function fetchBatches(includeClosed = false): Promise<Batch[]> {
  let q = db().from("batches").select("id, name, month, active_from, closed_on, created_at").order("month", { ascending: false }).order("name");
  if (!includeClosed) {
    const today = localDateKey(new Date());
    q = q.lte("active_from", today).or(`closed_on.is.null,closed_on.gte.${today}`);
  }
  const { data } = await q;
  return (data ?? []) as Batch[];
}

/** Batches that were open on any day between two dates. */
export function batchesOverlapping(batches: Batch[], from: string, to: string): Batch[] {
  return batches.filter((b) => b.active_from <= to && (!b.closed_on || b.closed_on >= from));
}

/**
 * Uploaded recordings that could fall into feeding slots between two local dates.
 * batchId: a batch id to filter on, or undefined for every recording.
 */
export async function fetchRecordings(from: string, to: string, batchId?: string): Promise<RecordingRow[]> {
  const start = localToUtc(from, 0).toISOString();
  // A window can end up to 44 hours after its feed day starts
  const end = localToUtc(to, 44 * 60).toISOString();
  let q = db()
    .from("recordings")
    .select(
      "id, staff_id, batch_id, storage_path, recorded_at, uploaded_at, time_source, clock_skew_seconds, duration_seconds, latitude, longitude, flags, staff:staff_id (name), batch:batch_id (name)",
    )
    .eq("status", "uploaded")
    .gte("recorded_at", start)
    .lt("recorded_at", end)
    .order("recorded_at");
  if (batchId) q = q.eq("batch_id", batchId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as RecordingRow[];
}

export async function signedVideoUrls(paths: string[], expiresSeconds = 3600): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await db().storage.from(FARM.videoBucket).createSignedUrls(paths, expiresSeconds);
  for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  return map;
}

export function toInputs(rows: RecordingRow[], urls?: Map<string, string>): RecordingInput[] {
  return rows.map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    staffName: r.staff?.name ?? "Unknown",
    recordedAt: r.recorded_at,
    flags: r.flags ?? [],
    videoUrl: urls?.get(r.storage_path) ?? null,
  }));
}

export async function buildBatchReport(from: string, to: string, batch: Batch, withVideos = false) {
  const [rows, staff, schedules] = await Promise.all([fetchRecordings(from, to, batch.id), fetchStaff(), fetchSchedules()]);
  const urls = withVideos ? await signedVideoUrls(rows.map((r) => r.storage_path), 7 * 86_400) : undefined;
  return computeReport({
    from,
    to,
    recordings: toInputs(rows, urls),
    staff,
    schedules,
    activeFrom: batch.active_from,
    activeTo: batch.closed_on,
    batchName: batch.name,
  });
}

/** Compliance for every batch open during the period, from one query. */
export async function batchSummaries(from: string, to: string) {
  const [batches, rows, schedules] = await Promise.all([fetchBatches(true), fetchRecordings(from, to), fetchSchedules()]);
  return batchesOverlapping(batches, from, to).map((b) => {
    const r = computeReport({
      from,
      to,
      recordings: toInputs(rows.filter((x) => x.batch_id === b.id)),
      schedules,
      activeFrom: b.active_from,
      activeTo: b.closed_on,
      batchName: b.name,
    });
    return { batch: b, report: r };
  });
}
