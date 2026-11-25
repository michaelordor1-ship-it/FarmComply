import type { ReportData } from "./report.ts";
import { formatDay, formatDayYear } from "./time.ts";

/** Short plain-text summary for a WhatsApp message. */
export function reportSummary(r: ReportData): string {
  const lines = [
    `*${r.farmName} feeding report*`,
    r.batchName ? `Batch: ${r.batchName}` : null,
    `${formatDay(r.from)} to ${formatDayYear(r.to)} (${r.days.length} days)`,
    "",
    `Overall: *${r.overallPercent}%* (${r.loggedSlots} of ${r.dueSlots} feeds recorded)`,
    r.feeds.map((f) => `${f.feed.label}: ${f.percent}%`).join(" · "),
    `Days with no video: ${r.daysNone}`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}
