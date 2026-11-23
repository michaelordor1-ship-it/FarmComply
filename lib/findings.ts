import { FARM } from "./config.ts";
import { allWord, type ReportData } from "./report.ts";
import { formatDay, formatDeviation, formatLocalTime } from "./time.ts";

export type Finding = { lead: string; detail: string };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function trendWord(ws: number[]): string | null {
  if (ws.length < 3) return null;
  const last = ws[ws.length - 1];
  const prev = ws[ws.length - 2];
  if (last < prev && last < Math.max(...ws)) return "declining";
  if (last > prev) return "improving";
  return "flat";
}

export function buildFindings(r: ReportData): Finding[] {
  const out: Finding[] = [];
  if (r.dueSlots === 0) return [{ lead: "No completed feeding windows in this period.", detail: "" }];
  const tol = r.onTimeMinutes;

  out.push({
    lead: r.overallPercent >= FARM.targetPercent ? "Target met." : `${r.overallPercent >= 50 ? "At least half" : "Fewer than half"} of the scheduled feeds were recorded.`,
    detail: `${r.loggedSlots} of ${r.dueSlots} scheduled feeds (${r.overallPercent}%) have a video. A feed with no video counts as non-compliance.`,
  });

  const active = r.feeds.filter((f) => f.due > 0);
  const top = Math.max(...active.map((f) => f.percent));
  const bottom = Math.min(...active.map((f) => f.percent));
  for (const f of active) {
    const role = active.length < 2 || top === bottom ? "" : f.percent === top ? "the strongest" : f.percent === bottom ? "the weakest" : "";
    const roleTxt = role ? (active.length === 2 ? role.replace("est", "er") : role) + " routine" : "";
    const runsLate = f.avgDeviation !== null && f.avgDeviation > tol && f.onTime < f.logged / 2;
    let timing = "";
    if (f.logged > 0 && f.avgDeviation !== null) {
      timing =
        f.onTime === f.logged
          ? ` Every recorded feed was within ${tol} minutes (average ${formatDeviation(f.avgDeviation)}).`
          : ` Average ${formatDeviation(f.avgDeviation)}; ${f.onTime} of ${f.logged} within ${tol} minutes.`;
    }
    out.push({
      lead:
        `The ${f.feed.label} feed` +
        (roleTxt ? ` is ${roleTxt}` : active.length > 1 && top === bottom ? " is level with the others" : "") +
        (runsLate ? `${roleTxt || (active.length > 1 && top === bottom) ? " and" : ""} runs late` : "") +
        ".",
      detail: `${f.logged} of ${f.due} recorded (${f.percent}%).${timing}`,
    });
  }

  const ws = r.weeks.filter((w) => w.due > 0).map((w) => w.percent);
  const word = trendWord(ws);
  if (word) out.push({ lead: `Compliance is ${word}.`, detail: `Weekly compliance went ${ws.map((p) => `${p}%`).join(" → ")}.` });

  if (r.longestGap && r.longestGap.length >= 3) {
    const g = r.longestGap;
    out.push({
      lead: "Gaps run in streaks.",
      detail: `The longest run was ${g.length} feeds in a row with no video, from ${formatDay(g.fromDate)} (${g.fromFeed}) to ${formatDay(g.toDate)} (${g.toFeed}).`,
    });
  }

  const nFeeds = r.feedList.length;
  out.push({
    lead: `${r.daysAll} of ${r.daysCounted} days had ${allWord(nFeeds)} recorded.`,
    detail:
      (r.daysAll && r.daysAll <= 8 ? `Complete days: ${list(r.daysAllList.map(formatDay))}. ` : "") +
      (r.daysNone
        ? `${r.daysNone} day${r.daysNone === 1 ? "" : "s"} had nothing${r.daysNone <= 10 ? `: ${list(r.daysNoneList.map(formatDay))}` : ""}.`
        : "No day was left completely blank."),
  });

  const doers = r.staff.filter((s) => s.feedsDone > 0);
  if (doers.length >= 2) {
    out.push({
      lead: "Workload by staff.",
      detail: doers.map((s) => `${s.name} recorded ${s.feedsDone} feed${s.feedsDone === 1 ? "" : "s"} (${s.onTime} on time)`).join("; ") + ".",
    });
  } else if (doers.length === 1 && r.staff.length > 1) {
    out.push({ lead: "One person is carrying the routine.", detail: `Only ${doers[0].name} recorded feeds in this period.` });
  }

  const bits: string[] = [];
  if (r.outOfWindow.length) bits.push(`${r.outOfWindow.length} video${r.outOfWindow.length === 1 ? " was" : "s were"} recorded outside every feeding window and not counted`);
  if (r.flagCounts.clock_mismatch) bits.push(`${r.flagCounts.clock_mismatch} came from a phone with the wrong clock`);
  if (r.flagCounts.late_upload) bits.push(`${r.flagCounts.late_upload} were uploaded hours after recording`);
  if (bits.length) out.push({ lead: "Check these videos.", detail: bits.join("; ") + ". See the log below." });
  return out;
}

export function buildRecommendations(r: ReportData): string[] {
  const recs: string[] = [];
  if (r.dueSlots === 0) return recs;
  const active = r.feeds.filter((f) => f.due > 0);
  const weakest = [...active].sort((a, b) => a.percent - b.percent)[0];
  if (weakest && weakest.percent < FARM.targetPercent) {
    const lastWeek = r.weeks[r.weeks.length - 1]?.perFeed.find((p) => p.key === weakest.feed.key);
    recs.push(
      `Fix the ${weakest.feed.label} feed first (${weakest.percent}% overall${lastWeek && lastWeek.due ? `, ${lastWeek.logged} of ${lastWeek.due} in the last week` : ""}): name one person responsible for it.`,
    );
  }
  for (const f of active) {
    if (f.logged >= 3 && f.avgDeviation !== null && f.avgDeviation > 60) {
      recs.push(
        `Decide on the real ${f.feed.label} time. Videos average ${formatDeviation(f.avgDeviation)}${f.latest ? ` (latest ${formatLocalTime(f.latest.recordedAt)})` : ""}. Either change the time in Settings or move the habit earlier.`,
      );
    }
  }
  if (r.daysNone > 0) recs.push("Agree a backup: if one staff member can't make a feed, the other records it.");
  const total = r.staff.reduce((a, s) => a + s.feedsDone, 0);
  if (r.staff.length >= 2 && total >= 6 && r.staff[0].feedsDone / total >= 0.75)
    recs.push(`${r.staff[0].name} is recording most feeds. Check the other staff member is still doing their share.`);
  recs.push(`Review weekly against the targets: each feed at or above ${FARM.targetPercent}%, within ${r.onTimeMinutes} minutes of schedule.`);
  return recs;
}
