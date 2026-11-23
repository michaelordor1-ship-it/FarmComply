import { FARM } from "./config.ts";
import { scheduleFor, hmToMinutes, type FeedConfig, type Schedule } from "./schedule.ts";
import { addDays, assignSlot, dateRange, localDateKey, slotWindowEnd } from "./time.ts";

export type RecordingInput = {
  id: string;
  staffId: string;
  staffName: string;
  recordedAt: string | Date;
  flags?: string[];
  videoUrl?: string | null;
};

export type StaffInput = { id: string; name: string };

export type Timing = "on_time" | "late" | "early";

export type SlotRecording = {
  id: string;
  staffId: string;
  staffName: string;
  recordedAt: Date;
  deviationMinutes: number;
  timing: Timing;
  flags: string[];
  videoUrl?: string | null;
};

export type Slot = {
  dateKey: string;
  feed: FeedConfig;
  onTimeMinutes: number;
  status: "done" | "missed" | "pending";
  recordings: SlotRecording[]; // earliest first
  first?: SlotRecording;
};

export type DayStatus = "All" | "Some" | "None" | "Pending";
export type DayRow = { dateKey: string; slots: Slot[]; status: DayStatus };

export type FeedStats = {
  feed: FeedConfig;
  due: number;
  logged: number;
  percent: number;
  onTime: number;
  late: number;
  early: number;
  avgDeviation: number | null;
  earliest: SlotRecording | null;
  latest: SlotRecording | null;
};

export type WeekStats = {
  index: number;
  from: string;
  to: string;
  due: number;
  logged: number;
  percent: number;
  perFeed: { key: string; due: number; logged: number; percent: number }[];
};

export type StaffStats = {
  staffId: string;
  name: string;
  feedsDone: number;
  onTime: number;
  late: number;
  early: number;
  avgDeviation: number | null;
  recordings: number;
  perFeed: Record<string, number>;
};

export type Streak = { length: number; fromDate: string; fromFeed: string; toDate: string; toFeed: string } | null;

export type ReportData = {
  farmName: string;
  batchName: string | null;
  from: string;
  to: string;
  requestedFrom: string;
  requestedTo: string;
  generatedAt: Date;
  days: DayRow[];
  feedList: FeedConfig[];
  onTimeMinutes: number;
  scheduleChanged: boolean;
  dueSlots: number;
  loggedSlots: number;
  overallPercent: number;
  daysCounted: number;
  daysAll: number;
  daysSome: number;
  daysNone: number;
  daysAllList: string[];
  daysNoneList: string[];
  pendingSlots: number;
  feeds: FeedStats[];
  weeks: WeekStats[];
  staff: StaffStats[];
  longestGap: Streak;
  outOfWindow: SlotRecording[];
  flagCounts: Record<string, number>;
  totalRecordings: number;
};

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function timingOf(deviation: number, onTimeMinutes: number = FARM.defaultOnTimeMinutes): Timing {
  if (Math.abs(deviation) <= onTimeMinutes) return "on_time";
  return deviation > 0 ? "late" : "early";
}

export function computeReport(opts: {
  from: string;
  to: string;
  recordings: RecordingInput[];
  schedules?: Schedule[];
  staff?: StaffInput[];
  now?: Date;
  /** Batch life: days outside it are not counted */
  activeFrom?: string | null;
  activeTo?: string | null;
  batchName?: string | null;
}): ReportData {
  const now = opts.now ?? new Date();
  const schedules = opts.schedules ?? [];
  const from = opts.activeFrom && opts.activeFrom > opts.from ? opts.activeFrom : opts.from;
  const to = opts.activeTo && opts.activeTo < opts.to ? opts.activeTo : opts.to;
  const days = from <= to ? dateRange(from, to) : [];

  const slotMap = new Map<string, Slot>();
  const feedByKey = new Map<string, FeedConfig>();
  const scheduleIds = new Set<string>();
  let onTimeMinutes = FARM.defaultOnTimeMinutes;
  for (const d of days) {
    const sch = scheduleFor(schedules, d);
    scheduleIds.add(sch.effectiveFrom);
    onTimeMinutes = sch.onTimeMinutes;
    for (const feed of sch.feeds) {
      feedByKey.set(feed.key, feed);
      slotMap.set(`${d}|${feed.key}`, { dateKey: d, feed, onTimeMinutes: sch.onTimeMinutes, status: "missed", recordings: [] });
    }
  }
  const feedList = [...feedByKey.values()].sort((a, b) => hmToMinutes(a.time) - hmToMinutes(b.time));

  const outOfWindow: SlotRecording[] = [];
  const flagCounts: Record<string, number> = {};
  let totalRecordings = 0;
  const sorted = [...opts.recordings]
    .map((r) => ({ ...r, recordedAt: new Date(r.recordedAt) }))
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  for (const r of sorted) {
    const match = assignSlot(r.recordedAt, schedules);
    const rec: SlotRecording = {
      id: r.id,
      staffId: r.staffId,
      staffName: r.staffName,
      recordedAt: r.recordedAt,
      deviationMinutes: match ? match.deviationMinutes : 0,
      timing: match ? timingOf(match.deviationMinutes, match.onTimeMinutes) : "late",
      flags: r.flags ?? [],
      videoUrl: r.videoUrl,
    };
    const slot = match ? slotMap.get(`${match.dateKey}|${match.feed.key}`) : undefined;
    if (!slot) {
      if (!match) {
        const key = localDateKey(r.recordedAt);
        if (key >= from && key <= to) {
          outOfWindow.push(rec);
          totalRecordings++;
          for (const f of rec.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
        }
      }
      continue;
    }
    slot.recordings.push(rec);
    totalRecordings++;
    for (const f of rec.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  }

  for (const slot of slotMap.values()) {
    if (slot.recordings.length) {
      slot.status = "done";
      slot.first = slot.recordings[0];
    } else if (slotWindowEnd(slot.dateKey, slot.feed) > now) {
      slot.status = "pending";
    }
  }

  const dayRows: DayRow[] = days.map((d) => {
    const slots = [...slotMap.values()].filter((s) => s.dateKey === d);
    const done = slots.filter((s) => s.status === "done").length;
    let status: DayStatus;
    if (slots.some((s) => s.status === "pending")) status = "Pending";
    else status = done === slots.length ? "All" : done === 0 ? "None" : "Some";
    return { dateKey: d, slots, status };
  });

  const allSlots = dayRows.flatMap((d) => d.slots);
  const counted = allSlots.filter((s) => s.status !== "pending");
  const logged = counted.filter((s) => s.status === "done");

  const feeds: FeedStats[] = feedList.map((feed) => {
    const fs = counted.filter((s) => s.feed.key === feed.key);
    const done = fs.filter((s) => s.status === "done").map((s) => s.first!);
    const byDev = [...done].sort((a, b) => a.deviationMinutes - b.deviationMinutes);
    return {
      feed,
      due: fs.length,
      logged: done.length,
      percent: pct(done.length, fs.length),
      onTime: done.filter((r) => r.timing === "on_time").length,
      late: done.filter((r) => r.timing === "late").length,
      early: done.filter((r) => r.timing === "early").length,
      avgDeviation: avg(done.map((r) => r.deviationMinutes)),
      earliest: byDev[0] ?? null,
      latest: byDev[byDev.length - 1] ?? null,
    };
  });

  const weeks: WeekStats[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const wDays = new Set(days.slice(i, i + 7));
    const wSlots = counted.filter((s) => wDays.has(s.dateKey));
    const wLogged = wSlots.filter((s) => s.status === "done").length;
    weeks.push({
      index: weeks.length + 1,
      from: days[i],
      to: days[Math.min(i + 6, days.length - 1)],
      due: wSlots.length,
      logged: wLogged,
      percent: pct(wLogged, wSlots.length),
      perFeed: feedList.map((f) => {
        const fs = wSlots.filter((s) => s.feed.key === f.key);
        const fl = fs.filter((s) => s.status === "done").length;
        return { key: f.key, due: fs.length, logged: fl, percent: pct(fl, fs.length) };
      }),
    });
  }

  const staffMap = new Map<string, StaffStats>();
  const ensure = (id: string, name: string) => {
    if (!staffMap.has(id))
      staffMap.set(id, {
        staffId: id,
        name,
        feedsDone: 0,
        onTime: 0,
        late: 0,
        early: 0,
        avgDeviation: null,
        recordings: 0,
        perFeed: Object.fromEntries(feedList.map((f) => [f.key, 0])),
      });
    return staffMap.get(id)!;
  };
  for (const s of opts.staff ?? []) ensure(s.id, s.name);
  const devsByStaff = new Map<string, number[]>();
  for (const slot of logged) {
    const seen = new Set<string>();
    for (const r of slot.recordings) {
      const st = ensure(r.staffId, r.staffName);
      st.recordings++;
      if (seen.has(r.staffId)) continue;
      seen.add(r.staffId);
      st.feedsDone++;
      st.perFeed[slot.feed.key] = (st.perFeed[slot.feed.key] ?? 0) + 1;
      if (r.timing === "on_time") st.onTime++;
      else st[r.timing]++;
      devsByStaff.set(r.staffId, [...(devsByStaff.get(r.staffId) ?? []), r.deviationMinutes]);
    }
  }
  for (const r of outOfWindow) ensure(r.staffId, r.staffName).recordings++;
  for (const st of staffMap.values()) st.avgDeviation = avg(devsByStaff.get(st.staffId) ?? []);

  let best: Streak = null;
  let runStart = -1;
  for (let i = 0; i <= counted.length; i++) {
    const missed = i < counted.length && counted[i].status === "missed";
    if (missed && runStart < 0) runStart = i;
    if (!missed && runStart >= 0) {
      const len = i - runStart;
      if (!best || len > best.length) {
        const a = counted[runStart];
        const b = counted[i - 1];
        best = { length: len, fromDate: a.dateKey, fromFeed: a.feed.label, toDate: b.dateKey, toFeed: b.feed.label };
      }
      runStart = -1;
    }
  }

  const countedDays = dayRows.filter((d) => d.status !== "Pending");

  return {
    farmName: FARM.name,
    batchName: opts.batchName ?? null,
    from,
    to,
    requestedFrom: opts.from,
    requestedTo: opts.to,
    generatedAt: now,
    days: dayRows,
    feedList,
    onTimeMinutes,
    scheduleChanged: scheduleIds.size > 1,
    dueSlots: counted.length,
    loggedSlots: logged.length,
    overallPercent: pct(logged.length, counted.length),
    daysCounted: countedDays.length,
    daysAll: countedDays.filter((d) => d.status === "All").length,
    daysSome: countedDays.filter((d) => d.status === "Some").length,
    daysNone: countedDays.filter((d) => d.status === "None").length,
    daysAllList: countedDays.filter((d) => d.status === "All").map((d) => d.dateKey),
    daysNoneList: countedDays.filter((d) => d.status === "None").map((d) => d.dateKey),
    pendingSlots: allSlots.length - counted.length,
    feeds,
    weeks,
    staff: [...staffMap.values()].sort((a, b) => b.feedsDone - a.feedsDone),
    longestGap: best,
    outOfWindow,
    flagCounts,
    totalRecordings,
  };
}

/** Word for "every feed in the day", given how many feeds there are. */
export function allWord(n: number) {
  return n === 2 ? "both feeds" : n === 1 ? "the feed" : "every feed";
}

export function dayStatusLabel(s: DayStatus, feedsInDay: number): string {
  if (feedsInDay === 2) return s === "All" ? "Both" : s === "Some" ? "One" : s;
  if (feedsInDay === 1) return s === "All" ? "Done" : s === "None" ? "Missed" : s;
  return s;
}

export const FLAG_LABELS: Record<string, string> = {
  offline_recording: "Recorded offline (time taken from the phone clock, corrected at upload)",
  clock_mismatch: "Phone clock was more than 2 minutes off server time",
  late_upload: "Uploaded more than 3 hours after recording",
  no_location: "No GPS location (permission denied or unavailable)",
  short_clip: "Clip shorter than 3 seconds",
};

export { addDays };
