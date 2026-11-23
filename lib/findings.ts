import { FARM } from "./config.ts";
import type { ReportData } from "./report.ts";
import { formatDay, formatDeviation, formatLocalTime } from "./time.ts";

export type Finding = { lead: string; detail: string };

const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

function trendWord(ws: number[]): string | null {
  if (ws.length < 3) return null;
  const last = ws[ws.length - 1];
  const prev = ws[ws.length - 2];
  const best = Math.max(...ws);
  if (last < prev && last < best) return "declining";
  if (last > prev) return "improving";
  return "flat";
}

export function buildFindings(r: ReportData): Finding[] {
  const out: Finding[] = [];
  if (r.dueSlots === 0) return [{ lead: "No completed feeding windows in this period.", detail: "" }];

  const half = r.overallPercent >= 50 ? "At least half" : "Fewer than half";
  out.push({
    lead: `${r.overallPercent >= FARM.targetPercent ? "Target met." : `${half} of the scheduled feeds were recorded.`}`,
    detail: `${r.loggedSlots} of ${r.dueSlots} scheduled feeds (${r.overallPercent}%) have a video. A feed with no video counts as non-compliance.`,
  });

  const [a, b] = [...r.feeds].sort((x, y) => y.percent - x.percent);
  for (const f of r.feeds) {
    const strong = f === a && a.percent !== b.percent;
    const timed = f.logged;
    let timing = "";
    if (timed > 0 && f.avgDeviation !== null) {
      const avgTxt = formatDeviation(f.avgDeviation);
      timing =
        f.onTime === timed
          ? ` Every recorded feed was within ${FARM.onTimeMinutes} minutes (average ${avgTxt}).`
          : ` Average ${avgTxt} against ${f.feed.label}; ${f.onTime} of ${timed} within ${FARM.onTimeMinutes} minutes.`;
    }
    out.push({
      lead: `The ${f.feed.label} feed is ${a.percent === b.percent ? "level with the other" : strong ? "the stronger routine" : "the weaker routine"}${f.avgDeviation !== null && f.avgDeviation > FARM.onTimeMinutes && f.onTime < timed / 2 ? " and runs late" : ""}.`,
      detail: `${f.logged} of ${f.due} recorded (${f.percent}%).${timing}`,
    });
  }

  if (r.weeks.length >= 2) {
    const ws = r.weeks.filter((w) => w.due > 0).map((w) => w.percent);
    const word = trendWord(ws);
    if (word) {
      out.push({
        lead: `Compliance is ${word}.`,
        detail: `Weekly compliance went ${ws.map((p) => `${p}%`).join(" → ")}.`,
      });
    }
  }

  if (r.longestGap && r.longestGap.length >= 3) {
    const [fd, ff] = r.longestGap.fromLabel.split("|");
    const [td, tf] = r.longestGap.toLabel.split("|");
    out.push({
      lead: "Gaps run in streaks.",
      detail: `The longest run was ${r.longestGap.length} feeds in a row with no video, from ${formatDay(fd)} (${ff}) to ${formatDay(td)} (${tf}).`,
    });
  }

  out.push({
    lead: `${r.daysBoth} of ${r.daysCounted} days had both feeds recorded.`,
    detail:
      (r.daysBoth && r.daysBoth <= 8 ? `Complete days: ${list(r.daysBothList.map(formatDay))}. ` : "") +
      (r.daysNone
        ? `${r.daysNone} day${r.daysNone === 1 ? "" : "s"} had nothing${r.daysNone <= 10 ? `: ${list(r.daysNoneList.map(formatDay))}` : ""}.`
        : "No day was left completely blank."),
  });

  const active = r.staff.filter((s) => s.feedsDone > 0);
  if (active.length >= 2) {
    out.push({
      lead: "Workload by staff.",
      detail: active.map((s) => `${s.name} recorded ${s.feedsDone} feed${s.feedsDone === 1 ? "" : "s"} (${s.onTime} on time)`).join("; ") + ".",
    });
  } else if (active.length === 1 && r.staff.length > 1) {
    out.push({ lead: "One person is carrying the routine.", detail: `Only ${active[0].name} recorded feeds in this period.` });
  }

  const flagTotal = Object.values(r.flagCounts).reduce((x, y) => x + y, 0);
  if (r.outOfWindow.length || flagTotal) {
    const bits: string[] = [];
    if (r.outOfWindow.length) bits.push(`${r.outOfWindow.length} video${r.outOfWindow.length === 1 ? " was" : "s were"} recorded outside both feeding windows and not counted`);
    if (r.flagCounts.clock_mismatch) bits.push(`${r.flagCounts.clock_mismatch} came from a phone with the wrong clock`);
    if (r.flagCounts.late_upload) bits.push(`${r.flagCounts.late_upload} were uploaded hours after recording`);
    if (bits.length) out.push({ lead: "Check these videos.", detail: bits.join("; ") + ". See the log below." });
  }
  return out;
}

export function buildRecommendations(r: ReportData): string[] {
  const recs: string[] = [];
  if (r.dueSlots === 0) return recs;
  const weakest = [...r.feeds].sort((a, b) => a.percent - b.percent)[0];
  if (weakest.percent < FARM.targetPercent) {
    const lastWeek = r.weeks[r.weeks.length - 1]?.perFeed.find((p) => p.key === weakest.feed.key);
    recs.push(
      `Fix the ${weakest.feed.label} feed first (${weakest.percent}% overall${lastWeek && lastWeek.due ? `, ${lastWeek.logged} of ${lastWeek.due} in the last week` : ""}): name one person responsible for it.`,
    );
  }
  for (const f of r.feeds) {
    if (f.logged >= 3 && f.avgDeviation !== null && f.avgDeviation > 60) {
      recs.push(
        `Decide on the real ${f.feed.label} time. Videos average ${formatDeviation(f.avgDeviation)}${f.latest ? ` (latest ${formatLocalTime(f.latest.recordedAt)})` : ""}. Either move the schedule in the app or move the habit earlier.`,
      );
    }
  }
  if (r.daysNone > 0) recs.push("Agree a backup: if one staff member can't make a feed, the other records it.");
  const active = r.staff.filter((s) => s.feedsDone > 0);
  if (r.staff.length >= 2 && active.length >= 1) {
    const total = r.staff.reduce((a, s) => a + s.feedsDone, 0);
    const top = r.staff[0];
    if (total >= 6 && top.feedsDone / total >= 0.75) recs.push(`${top.name} is recording most feeds. Check the other staff member is still doing their share.`);
  }
  recs.push(`Review weekly against the targets: each feed at or above ${FARM.targetPercent}%, within ${FARM.onTimeMinutes} minutes of schedule.`);
  return recs;
}
