import { FARM, type FeedConfig } from "./config.ts";

const DAY_MS = 86_400_000;

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Shift a UTC instant into farm-local "wall clock" (as a UTC Date carrying local fields). */
function toLocal(d: Date): Date {
  return new Date(d.getTime() + FARM.utcOffsetMinutes * 60_000);
}

/** YYYY-MM-DD of the farm-local date for an instant. */
export function localDateKey(d: Date): string {
  return toLocal(d).toISOString().slice(0, 10);
}

/** Minutes since farm-local midnight. */
export function localMinutes(d: Date): number {
  const l = toLocal(d);
  return l.getUTCHours() * 60 + l.getUTCMinutes() + l.getUTCSeconds() / 60;
}

export function addDays(key: string, n: number): string {
  const d = new Date(key + "T00:00:00Z");
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** UTC instant for a farm-local date + minutes after midnight. */
export function localToUtc(key: string, minutes: number): Date {
  const midnightUtc = new Date(key + "T00:00:00Z").getTime() - FARM.utcOffsetMinutes * 60_000;
  return new Date(midnightUtc + minutes * 60_000);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export type SlotMatch = { dateKey: string; feed: FeedConfig; deviationMinutes: number };

/** Work out which scheduled feed a recording counts for. Null if it falls outside every window. */
export function assignSlot(recordedAt: Date): SlotMatch | null {
  const m = localMinutes(recordedAt);
  const today = localDateKey(recordedAt);
  for (const feed of FARM.feeds) {
    const s = hmToMinutes(feed.windowStart);
    const e = hmToMinutes(feed.windowEnd);
    const sched = hmToMinutes(feed.time);
    if (s < e) {
      if (m >= s && m < e) return { dateKey: today, feed, deviationMinutes: m - sched };
    } else {
      // Window crosses midnight
      if (m >= s) return { dateKey: today, feed, deviationMinutes: m - sched };
      if (m < e) return { dateKey: addDays(today, -1), feed, deviationMinutes: m + 1440 - sched };
    }
  }
  return null;
}

/** When the window for a given feed on a given date closes. */
export function slotWindowEnd(dateKey: string, feed: FeedConfig): Date {
  const s = hmToMinutes(feed.windowStart);
  const e = hmToMinutes(feed.windowEnd);
  return localToUtc(dateKey, s < e ? e : e + 1440);
}

export function slotScheduledAt(dateKey: string, feed: FeedConfig): Date {
  return localToUtc(dateKey, hmToMinutes(feed.time));
}

/** "7:04am" style local time. */
export function formatLocalTime(d: Date): string {
  const l = toLocal(d);
  let h = l.getUTCHours();
  const m = l.getUTCMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "18 Oct" */
export function formatDay(key: string): string {
  const d = new Date(key + "T00:00:00Z");
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "Sun 18 Oct" */
export function formatDayLong(key: string): string {
  const d = new Date(key + "T00:00:00Z");
  return `${DOW[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`;
}

/** "18 Oct 2026" */
export function formatDayYear(key: string): string {
  return `${formatDay(key)} ${key.slice(0, 4)}`;
}

export function formatDeviation(min: number): string {
  const r = Math.round(min);
  if (r === 0) return "on the dot";
  const abs = Math.abs(r);
  const txt = abs >= 60 ? `${Math.floor(abs / 60)}h ${String(abs % 60).padStart(2, "0")}m` : `${abs} min`;
  return r > 0 ? `${txt} late` : `${txt} early`;
}
