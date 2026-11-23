import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReport } from "../lib/report.ts";
import { assignSlot, localToUtc } from "../lib/time.ts";
import { makeSchedule, validateFeeds, suggestWindow } from "../lib/schedule.ts";
import { sampleRecordings, SAMPLE_FROM, SAMPLE_TO, SAMPLE_STAFF } from "../lib/sample.ts";

const at = (d: string, hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return localToUtc(d, h * 60 + m);
};

test("paper log reproduces the numbers in the existing compliance report", () => {
  const r = computeReport({
    from: SAMPLE_FROM,
    to: SAMPLE_TO,
    recordings: sampleRecordings(),
    staff: SAMPLE_STAFF,
    now: new Date("2026-11-17T12:00:00Z"),
  });
  assert.equal(r.dueSlots, 56);
  assert.equal(r.loggedSlots, 24);
  assert.equal(r.overallPercent, 43);
  assert.equal(r.feeds[0].logged, 13);
  assert.equal(r.feeds[0].percent, 46);
  assert.equal(r.feeds[1].logged, 11);
  assert.equal(r.feeds[1].percent, 39);
  assert.equal(r.daysAll, 4);
  assert.equal(r.daysNone, 8);
  assert.deepEqual(r.weeks.map((w) => w.percent), [21, 64, 50, 36]);
  assert.deepEqual(r.daysAllList, ["2026-10-25", "2026-10-29", "2026-11-03", "2026-11-04"]);
  assert.equal(r.longestGap?.length, 9);
  assert.equal(r.longestGap?.fromDate, "2026-10-18");
});

test("default slot windows", () => {
  assert.equal(assignSlot(at("2026-11-20", "04:00"))?.feed.key, "07:00");
  assert.equal(assignSlot(at("2026-11-20", "13:59"))?.feed.key, "07:00");
  assert.equal(assignSlot(at("2026-11-20", "14:30")), null);
  assert.equal(assignSlot(at("2026-11-20", "16:00"))?.feed.key, "19:00");
  const lateNight = assignSlot(at("2026-11-21", "01:30"));
  assert.equal(lateNight?.feed.key, "19:00");
  assert.equal(lateNight?.dateKey, "2026-11-20");
  assert.equal(lateNight?.deviationMinutes, 390);
  assert.equal(assignSlot(at("2026-11-21", "02:30")), null);
  assert.equal(assignSlot(at("2026-11-20", "07:30"))?.deviationMinutes, 30);
});

test("custom three-feed schedule, changed mid-period", () => {
  const two = makeSchedule("2026-11-01", [
    { time: "07:00", windowStart: "04:00", windowEnd: "14:00" },
    { time: "19:00", windowStart: "16:00", windowEnd: "02:00" },
  ], 30);
  const three = makeSchedule("2026-11-10", [
    { time: "06:00", windowStart: "04:00", windowEnd: "10:00" },
    { time: "12:00", windowStart: "10:00", windowEnd: "15:00" },
    { time: "18:00", windowStart: "15:00", windowEnd: "23:00" },
  ], 20);
  const schedules = [three, two];
  assert.equal(assignSlot(at("2026-11-09", "11:00"), schedules)?.feed.key, "07:00");
  assert.equal(assignSlot(at("2026-11-10", "11:00"), schedules)?.feed.key, "12:00");
  const late = assignSlot(at("2026-11-10", "12:25"), schedules)!;
  assert.equal(late.deviationMinutes, 25);
  const r = computeReport({
    from: "2026-11-08",
    to: "2026-11-11",
    schedules,
    recordings: [
      { id: "a", staffId: "s", staffName: "S", recordedAt: at("2026-11-10", "12:25") },
      { id: "b", staffId: "s", staffName: "S", recordedAt: at("2026-11-08", "07:05") },
    ],
    now: new Date("2026-12-01T00:00:00Z"),
  });
  assert.equal(r.dueSlots, 2 * 2 + 2 * 3);
  assert.equal(r.loggedSlots, 2);
  assert.equal(r.scheduleChanged, true);
  assert.equal(r.feedList.length, 5);
  const noonFeed = r.days.find((d) => d.dateKey === "2026-11-10")!.slots.find((s) => s.feed.key === "12:00")!;
  assert.equal(noonFeed.first?.timing, "late"); // 25 min > 20 min allowance
});

test("batch active range limits the counted days", () => {
  const r = computeReport({
    from: "2026-11-01",
    to: "2026-11-30",
    recordings: [],
    activeFrom: "2026-11-20",
    activeTo: "2026-11-24",
    now: new Date("2026-12-05T00:00:00Z"),
  });
  assert.equal(r.days.length, 5);
  assert.equal(r.dueSlots, 10);
});

test("open slots are pending, not missed", () => {
  const r = computeReport({ from: "2026-11-20", to: "2026-11-20", recordings: [], now: at("2026-11-20", "15:00") });
  assert.equal(r.dueSlots, 1);
  assert.equal(r.pendingSlots, 1);
});

test("schedule validation", () => {
  assert.equal(validateFeeds([{ time: "07:00", windowStart: "04:00", windowEnd: "14:00" }], 30), null);
  assert.match(
    validateFeeds([
      { time: "07:00", windowStart: "04:00", windowEnd: "14:00" },
      { time: "12:00", windowStart: "11:00", windowEnd: "15:00" },
    ], 30)!,
    /overlap/,
  );
  assert.match(validateFeeds([{ time: "07:00", windowStart: "08:00", windowEnd: "10:00" }], 30)!, /must include/);
  assert.match(
    validateFeeds([
      { time: "19:00", windowStart: "16:00", windowEnd: "05:00" },
      { time: "07:00", windowStart: "04:00", windowEnd: "14:00" },
    ], 30)!,
    /overlap/,
  );
  assert.deepEqual(suggestWindow("01:00"), { time: "01:00", windowStart: "22:00", windowEnd: "04:00" });
});

test("split windows evenly", async () => {
  const { splitWindowsEvenly } = await import("../lib/schedule.ts");
  const out = splitWindowsEvenly([
    { time: "19:00", windowStart: "00:00", windowEnd: "00:00" },
    { time: "07:00", windowStart: "00:00", windowEnd: "00:00" },
    { time: "12:00", windowStart: "00:00", windowEnd: "00:00" },
  ]);
  assert.deepEqual(out, [
    { time: "07:00", windowStart: "01:00", windowEnd: "09:30" },
    { time: "12:00", windowStart: "09:30", windowEnd: "15:30" },
    { time: "19:00", windowStart: "15:30", windowEnd: "01:00" },
  ]);
  assert.equal(validateFeeds(out, 30), null);
});
