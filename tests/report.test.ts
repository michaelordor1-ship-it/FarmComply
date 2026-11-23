import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReport } from "../lib/report.ts";
import { assignSlot, localToUtc } from "../lib/time.ts";
import { sampleRecordings, SAMPLE_FROM, SAMPLE_TO, SAMPLE_STAFF } from "../lib/sample.ts";

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
  assert.equal(r.daysBoth, 4);
  assert.equal(r.daysNone, 8);
  assert.deepEqual(r.weeks.map((w) => w.percent), [21, 64, 50, 36]);
  assert.deepEqual(r.daysBothList, ["2026-10-25", "2026-10-29", "2026-11-03", "2026-11-04"]);
  // 18 Oct 7pm through 22 Oct 7pm = 9 missed slots in a row
  assert.equal(r.longestGap?.length, 9);
  assert.equal(r.longestGap?.fromDate, "2026-10-18");
});

test("slot windows", () => {
  const at = (d: string, hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    return localToUtc(d, h * 60 + m);
  };
  assert.equal(assignSlot(at("2026-11-20", "04:00"))?.feed.key, "am");
  assert.equal(assignSlot(at("2026-11-20", "13:59"))?.feed.key, "am");
  assert.equal(assignSlot(at("2026-11-20", "14:30")), null);
  assert.equal(assignSlot(at("2026-11-20", "16:00"))?.feed.key, "pm");
  const lateNight = assignSlot(at("2026-11-21", "01:30"));
  assert.equal(lateNight?.feed.key, "pm");
  assert.equal(lateNight?.dateKey, "2026-11-20");
  assert.equal(lateNight?.deviationMinutes, 390);
  assert.equal(assignSlot(at("2026-11-21", "02:30")), null);
  assert.equal(assignSlot(at("2026-11-20", "07:30"))?.deviationMinutes, 30);
});

test("open slots are pending, not missed", () => {
  const r = computeReport({
    from: "2026-11-20",
    to: "2026-11-20",
    recordings: [],
    now: localToUtc("2026-11-20", 15 * 60),
  });
  assert.equal(r.dueSlots, 1);
  assert.equal(r.pendingSlots, 1);
});
