import { FARM, type FeedConfig } from "./config.ts";
import { addDays, assignSlot, dateRange, slotWindowEnd } from "./time.ts";

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
  status: "done" | "missed" | "pending";
  recordings: SlotRecording[]; // earliest first
  first?: SlotRecording;
};

export type DayRow = { dateKey: string; slots: Slot[]; status: "Both" | "One" | "None" | "Pending" };

export type FeedStats = {
  feed: FeedConfig;
  due: number;
  logged: number;
  percent: number;
  onTime: number;
  late: number;
  early: number;
  avgDeviation: number | null;
  avgAbsDeviation: number | null;
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
  firstOnScene: number;
  onTime: number;
  late: number;
  early: number;
  avgDeviation: number | null;
  recordings: number;
  perFeed: Record<string, number>;
};

export type Streak = { length: number; fromLabel: string; toLabel: string; fromDate: string; toDate: string } | null;

export type ReportData = {
  farmName: string;
  from: string;
  to: string;
  generatedAt: Date;
  days: DayRow[];
  dueSlots: number;
  loggedSlots: number;
  overallPercent: number;
  daysCounted: number;
  daysBoth: number;
  daysOne: number;
  daysNone: number;
  daysBothList: string[];
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

export function timingOf(deviation: number): Timing {
  if (Math.abs(deviation) <= FARM.onTimeMinutes) return "on_time";
  return deviation > 0 ? "late" : "early";
}

export function computeReport(opts: {
  from: string;
  to: string;
  recordings: RecordingInput[];
  staff?: StaffInput[];
  now?: Date;
}): ReportData {
  const now = opts.now ?? new Date();
  const days = dateRange(opts.from, opts.to);
  const slotMap = new Map<string, Slot>();
  for (const d of days) {
    for (const feed of FARM.feeds) {
      slotMap.set(`${d}|${feed.key}`, { dateKey: d, feed, status: "missed", recordings: [] });
    }
  }

  const outOfWindow: SlotRecording[] = [];
  const flagCounts: Record<string, number> = {};
  let totalRecordings = 0;
  const sorted = [...opts.recordings]
    .map((r) => ({ ...r, recordedAt: new Date(r.recordedAt) }))
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  for (const r of sorted) {
    const match = assignSlot(r.recordedAt);
    const rec: SlotRecording = {
      id: r.id,
      staffId: r.staffId,
      staffName: r.staffName,
      recordedAt: r.recordedAt,
      deviationMinutes: match ? match.deviationMinutes : 0,
      timing: match ? timingOf(match.deviationMinutes) : "late",
      flags: r.flags ?? [],
      videoUrl: r.videoUrl,
    };
    if (!match) {
      // Only include out-of-window clips recorded inside the report dates
      const key = new Date(r.recordedAt.getTime() + FARM.utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
      if (key >= opts.from && key <= opts.to) {
        outOfWindow.push(rec);
        totalRecordings++;
        for (const f of rec.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
      }
      continue;
    }
    const slot = slotMap.get(`${match.dateKey}|${match.feed.key}`);
    if (!slot) continue;
    slot.recordings.push(rec);
    totalRecordings++;
    for (const f of rec.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  }

  // Resolve slot status
  for (const slot of slotMap.values()) {
    if (slot.recordings.length) {
      slot.status = "done";
      slot.first = slot.recordings[0];
    } else if (slotWindowEnd(slot.dateKey, slot.feed) > now) {
      slot.status = "pending";
    }
  }

  const dayRows: DayRow[] = days.map((d) => {
    const slots = FARM.feeds.map((f) => slotMap.get(`${d}|${f.key}`)!);
    const counted = slots.filter((s) => s.status !== "pending");
    const done = counted.filter((s) => s.status === "done").length;
    let status: DayRow["status"];
    if (counted.length < slots.length) status = "Pending";
    else status = done === slots.length ? "Both" : done === 0 ? "None" : "One";
    return { dateKey: d, slots, status };
  });

  const allSlots = dayRows.flatMap((d) => d.slots);
  const counted = allSlots.filter((s) => s.status !== "pending");
  const logged = counted.filter((s) => s.status === "done");

  const feeds: FeedStats[] = FARM.feeds.map((feed) => {
    const fs = counted.filter((s) => s.feed.key === feed.key);
    const done = fs.filter((s) => s.status === "done").map((s) => s.first!);
    const devs = done.map((r) => r.deviationMinutes);
    const byDev = [...done].sort((a, b) => a.deviationMinutes - b.deviationMinutes);
    return {
      feed,
      due: fs.length,
      logged: done.length,
      percent: pct(done.length, fs.length),
      onTime: done.filter((r) => r.timing === "on_time").length,
      late: done.filter((r) => r.timing === "late").length,
      early: done.filter((r) => r.timing === "early").length,
      avgDeviation: avg(devs),
      avgAbsDeviation: avg(devs.map(Math.abs)),
      earliest: byDev[0] ?? null,
      latest: byDev[byDev.length - 1] ?? null,
    };
  });

  // Weeks of 7 days from the start date
  const weeks: WeekStats[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const wDays = days.slice(i, i + 7);
    const wSlots = counted.filter((s) => wDays.includes(s.dateKey));
    const wLogged = wSlots.filter((s) => s.status === "done").length;
    weeks.push({
      index: weeks.length + 1,
      from: wDays[0],
      to: wDays[wDays.length - 1],
      due: wSlots.length,
      logged: wLogged,
      percent: pct(wLogged, wSlots.length),
      perFeed: FARM.feeds.map((f) => {
        const fs = wSlots.filter((s) => s.feed.key === f.key);
        const fl = fs.filter((s) => s.status === "done").length;
        return { key: f.key, due: fs.length, logged: fl, percent: pct(fl, fs.length) };
      }),
    });
  }

  // Per staff
  const staffMap = new Map<string, StaffStats>();
  const ensure = (id: string, name: string) => {
    if (!staffMap.has(id))
      staffMap.set(id, {
        staffId: id,
        name,
        feedsDone: 0,
        firstOnScene: 0,
        onTime: 0,
        late: 0,
        early: 0,
        avgDeviation: null,
        recordings: 0,
        perFeed: Object.fromEntries(FARM.feeds.map((f) => [f.key, 0])),
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
      st.perFeed[slot.feed.key]++;
      st[r.timing === "on_time" ? "onTime" : r.timing]++;
      devsByStaff.set(r.staffId, [...(devsByStaff.get(r.staffId) ?? []), r.deviationMinutes]);
    }
    ensure(slot.first!.staffId, slot.first!.staffName).firstOnScene++;
  }
  for (const r of outOfWindow) ensure(r.staffId, r.staffName).recordings++;
  for (const st of staffMap.values()) st.avgDeviation = avg(devsByStaff.get(st.staffId) ?? []);

  // Longest run of consecutive missed slots
  let best: Streak = null;
  let runStart = -1;
  const slotLabel = (s: Slot) => `${s.dateKey}|${s.feed.label}`;
  for (let i = 0; i <= counted.length; i++) {
    const missed = i < counted.length && counted[i].status === "missed";
    if (missed && runStart < 0) runStart = i;
    if (!missed && runStart >= 0) {
      const len = i - runStart;
      if (!best || len > best.length) {
        const a = counted[runStart];
        const b = counted[i - 1];
        best = { length: len, fromLabel: slotLabel(a), toLabel: slotLabel(b), fromDate: a.dateKey, toDate: b.dateKey };
      }
      runStart = -1;
    }
  }

  const countedDays = dayRows.filter((d) => d.status !== "Pending");

  return {
    farmName: FARM.name,
    from: opts.from,
    to: opts.to,
    generatedAt: now,
    days: dayRows,
    dueSlots: counted.length,
    loggedSlots: logged.length,
    overallPercent: pct(logged.length, counted.length),
    daysCounted: countedDays.length,
    daysBoth: countedDays.filter((d) => d.status === "Both").length,
    daysOne: countedDays.filter((d) => d.status === "One").length,
    daysNone: countedDays.filter((d) => d.status === "None").length,
    daysBothList: countedDays.filter((d) => d.status === "Both").map((d) => d.dateKey),
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

export const FLAG_LABELS: Record<string, string> = {
  offline_recording: "Recorded offline (time taken from the phone clock, corrected at upload)",
  clock_mismatch: "Phone clock was more than 2 minutes off server time",
  late_upload: "Uploaded more than 3 hours after recording",
  no_location: "No GPS location (permission denied or unavailable)",
  short_clip: "Clip shorter than 3 seconds",
};

export { addDays };
