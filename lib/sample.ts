// Sample data: the handwritten Verank feeding log for 18 Oct to 14 Nov 2026,
// replayed as if each entry had been a video. Used for the report preview and tests.
import { localToUtc } from "./time.ts";
import type { RecordingInput, StaffInput } from "./report.ts";

// [date, 7am entry, 7pm entry] as local times ("" = no entry)
const LOG: [string, string, string][] = [
  ["2026-10-18", "7:26", ""],
  ["2026-10-19", "", ""],
  ["2026-10-20", "", ""],
  ["2026-10-21", "", ""],
  ["2026-10-22", "", ""],
  ["2026-10-23", "6:35", ""],
  ["2026-10-24", "6:52", ""],
  ["2026-10-25", "7:36", "20:17"],
  ["2026-10-26", "6:53", ""],
  ["2026-10-27", "", "21:22"],
  ["2026-10-28", "7:06", ""],
  ["2026-10-29", "7:22", "21:56"],
  ["2026-10-30", "6:57", ""],
  ["2026-10-31", "7:21", ""],
  ["2026-11-01", "", ""],
  ["2026-11-02", "6:32", ""],
  ["2026-11-03", "6:58", "21:16"],
  ["2026-11-04", "7:10", "19:55"],
  ["2026-11-05", "", "19:20"],
  ["2026-11-06", "", ""],
  ["2026-11-07", "", "22:40"],
  ["2026-11-08", "", ""],
  ["2026-11-09", "7:03", ""],
  ["2026-11-10", "", "21:11"],
  ["2026-11-11", "", ""],
  ["2026-11-12", "", "20:33"],
  ["2026-11-13", "", "20:30"],
  ["2026-11-14", "", "19:59"],
];

export const SAMPLE_FROM = "2026-10-18";
export const SAMPLE_TO = "2026-11-14";

export const SAMPLE_STAFF: StaffInput[] = [
  { id: "s1", name: "Staff A (sample)" },
  { id: "s2", name: "Staff B (sample)" },
];

export function sampleRecordings(): RecordingInput[] {
  const out: RecordingInput[] = [];
  let n = 0;
  for (const [date, am, pm] of LOG) {
    for (const t of [am, pm]) {
      if (!t) continue;
      const [h, m] = t.split(":").map(Number);
      n++;
      // Alternate staff so the per-staff section has something to show
      const staff = SAMPLE_STAFF[n % 3 === 0 ? 1 : 0];
      out.push({
        id: `sample-${n}`,
        staffId: staff.id,
        staffName: staff.name,
        recordedAt: localToUtc(date, h * 60 + m),
        flags: [],
      });
    }
  }
  return out;
}
