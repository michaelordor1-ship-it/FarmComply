import "server-only";
import { db } from "./supabase";
import { FARM } from "./config";
import { addDays, hmToMinutes, localToUtc } from "./time";
import { computeReport, type RecordingInput, type StaffInput } from "./report";

export type RecordingRow = {
  id: string;
  staff_id: string;
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
};

export async function fetchStaff(): Promise<(StaffInput & { phone: string | null; active: boolean; created_at: string })[]> {
  const { data } = await db().from("staff").select("id, name, phone, active, created_at").order("created_at");
  return data ?? [];
}

/** Uploaded recordings that could fall into feeding slots between two local dates. */
export async function fetchRecordings(from: string, to: string): Promise<RecordingRow[]> {
  const latestWindowEnd = Math.max(...FARM.feeds.map((f) => hmToMinutes(f.windowEnd)));
  const start = localToUtc(from, 0).toISOString();
  const end = localToUtc(addDays(to, 1), latestWindowEnd).toISOString();
  const { data, error } = await db()
    .from("recordings")
    .select("id, staff_id, storage_path, recorded_at, uploaded_at, time_source, clock_skew_seconds, duration_seconds, latitude, longitude, flags, staff:staff_id (name)")
    .eq("status", "uploaded")
    .gte("recorded_at", start)
    .lt("recorded_at", end)
    .order("recorded_at");
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

export async function buildReport(from: string, to: string, withVideos = false) {
  const [rows, staff] = await Promise.all([fetchRecordings(from, to), fetchStaff()]);
  const urls = withVideos ? await signedVideoUrls(rows.map((r) => r.storage_path), 7 * 86_400) : undefined;
  return computeReport({ from, to, recordings: toInputs(rows, urls), staff });
}
