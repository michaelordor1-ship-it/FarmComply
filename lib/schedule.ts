import { FARM } from "./config.ts";

export type FeedInput = { time: string; windowStart: string; windowEnd: string };

export type FeedConfig = FeedInput & {
  key: string; // stable id = scheduled time "HH:MM"
  label: string; // "7am", "12:30pm"
};

export type Schedule = {
  effectiveFrom: string; // YYYY-MM-DD
  feeds: FeedConfig[]; // sorted by time
  onTimeMinutes: number;
};

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToHm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function labelForTime(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${ampm}` : `${h12}${ampm}`;
}

export function toFeedConfig(f: FeedInput): FeedConfig {
  return { ...f, key: f.time, label: labelForTime(f.time) };
}

export function makeSchedule(effectiveFrom: string, feeds: FeedInput[], onTimeMinutes: number): Schedule {
  return {
    effectiveFrom,
    feeds: feeds.map(toFeedConfig).sort((a, b) => hmToMinutes(a.time) - hmToMinutes(b.time)),
    onTimeMinutes,
  };
}

export const DEFAULT_SCHEDULE = makeSchedule("2000-01-01", FARM.defaultFeeds, FARM.defaultOnTimeMinutes);

/** The schedule in force on a date. `schedules` may be in any order. */
export function scheduleFor(schedules: Schedule[], dateKey: string): Schedule {
  let best: Schedule | null = null;
  for (const s of schedules) if (s.effectiveFrom <= dateKey && (!best || s.effectiveFrom > best.effectiveFrom)) best = s;
  return best ?? schedules.reduce<Schedule | null>((a, s) => (!a || s.effectiveFrom < a.effectiveFrom ? s : a), null) ?? DEFAULT_SCHEDULE;
}

/** Window as [start, end) in minutes from the feed day's midnight; end may exceed 1440. */
export function windowRange(f: FeedInput): [number, number] {
  const s = hmToMinutes(f.windowStart);
  let e = hmToMinutes(f.windowEnd);
  if (e <= s) e += 1440;
  return [s, e];
}

/** Scheduled time in minutes from the feed day's midnight, placed inside its window. */
export function scheduledMinute(f: FeedInput): number {
  const [s] = windowRange(f);
  let t = hmToMinutes(f.time);
  if (t < s) t += 1440;
  return t;
}

/** Suggested window for a new feed time: 3 hours either side. */
export function suggestWindow(time: string): FeedInput {
  const t = hmToMinutes(time);
  return { time, windowStart: minutesToHm(t - 180), windowEnd: minutesToHm(t + 180) };
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Returns an error message, or null if the feeds are valid. */
export function validateFeeds(feeds: FeedInput[], onTimeMinutes: number): string | null {
  if (!feeds.length) return "Add at least one feeding time.";
  if (feeds.length > 8) return "At most 8 feeds a day.";
  if (!(onTimeMinutes >= 5 && onTimeMinutes <= 180)) return "On-time allowance must be between 5 and 180 minutes.";
  const times = new Set<string>();
  for (const f of feeds) {
    if (![f.time, f.windowStart, f.windowEnd].every((x) => HM.test(x))) return "Use times like 07:00.";
    if (times.has(f.time)) return `${labelForTime(f.time)} is listed twice.`;
    times.add(f.time);
    const [s, e] = windowRange(f);
    const t = scheduledMinute(f);
    if (t >= e) return `The window for ${labelForTime(f.time)} must include ${labelForTime(f.time)}.`;
    if (e - s > 20 * 60) return `The window for ${labelForTime(f.time)} is too long (max 20 hours).`;
  }
  // Windows must not overlap (check on a 48h line, each window also shifted by a day)
  const ranges = feeds.flatMap((f) => {
    const [s, e] = windowRange(f);
    return [
      { f, s, e },
      { f, s: s + 1440, e: e + 1440 },
    ];
  });
  for (let i = 0; i < ranges.length; i++)
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (a.f === b.f) continue;
      if (a.s < b.e && b.s < a.e) return `The windows for ${labelForTime(a.f.time)} and ${labelForTime(b.f.time)} overlap.`;
    }
  return null;
}

/** Give every feed a window running halfway to the feed before and halfway to the feed after. */
export function splitWindowsEvenly(feeds: FeedInput[]): FeedInput[] {
  const sorted = [...feeds].sort((a, b) => hmToMinutes(a.time) - hmToMinutes(b.time));
  if (sorted.length === 1) {
    const t = hmToMinutes(sorted[0].time);
    return [{ time: sorted[0].time, windowStart: minutesToHm(t - 360), windowEnd: minutesToHm(t + 360) }];
  }
  return sorted.map((f, i) => {
    const t = hmToMinutes(f.time);
    const prev = hmToMinutes(sorted[(i - 1 + sorted.length) % sorted.length].time);
    const next = hmToMinutes(sorted[(i + 1) % sorted.length].time);
    const gapBefore = (t - prev + 1440) % 1440 || 1440;
    const gapAfter = (next - t + 1440) % 1440 || 1440;
    return { time: f.time, windowStart: minutesToHm(t - Math.floor(gapBefore / 2)), windowEnd: minutesToHm(t + Math.ceil(gapAfter / 2)) };
  });
}
