import type { ReportData, SlotRecording } from "@/lib/report";
import { FLAG_LABELS, allWord, dayStatusLabel } from "@/lib/report";
import { buildFindings, buildRecommendations } from "@/lib/findings";
import { FARM } from "@/lib/config";
import { formatDayLong, formatDayYear, formatDeviation, formatLocalTime, formatDay, localDateKey } from "@/lib/time";
import { C, ComplianceMap, Legend, OverallChart, TimingChart, WeeklyChart, feedColor } from "./charts";

function Tile({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
      <div className="tile-sub">{sub}</div>
    </div>
  );
}

function Cell({ rec, extra }: { rec?: SlotRecording; extra: number }) {
  if (!rec) return <span className="muted">–</span>;
  const mark = rec.timing === "on_time" ? "" : rec.timing === "late" ? " (late)" : " (early)";
  return (
    <span>
      {rec.videoUrl ? (
        <a href={rec.videoUrl} target="_blank" rel="noreferrer">
          {formatLocalTime(rec.recordedAt)}
        </a>
      ) : (
        formatLocalTime(rec.recordedAt)
      )}
      {mark}
      <span className="muted"> · {rec.staffName}{extra > 0 ? ` +${extra}` : ""}</span>
      {rec.flags.length > 0 && <span className="flag-dot" title={rec.flags.map((f) => FLAG_LABELS[f] ?? f).join("; ")}> ⚑</span>}
    </span>
  );
}

const minutes = (m: number | null) => (m === null ? "–" : formatDeviation(m));

export default function ReportView({ r, sample = false }: { r: ReportData; sample?: boolean }) {
  const findings = buildFindings(r);
  const recs = buildRecommendations(r);
  const nDays = r.days.length;
  const dayCount = (n: number) => `${n} of ${r.daysCounted} days`;
  const feedTimes = r.feedList.map((f) => f.label).join(", ");
  const nFeeds = r.feedList.length;
  const perDay = nFeeds === 1 ? "Once-daily" : nFeeds === 2 ? "Twice-daily" : `${nFeeds}-times-daily`;
  const tol = r.onTimeMinutes;
  const pctDays = (n: number) => (r.daysCounted ? Math.round((n / r.daysCounted) * 100) : 0);
  const flagEntries = Object.entries(r.flagCounts);

  return (
    <article className="report">
      <header className="report-head">
        <h1>Feeding Routine Compliance Report</h1>
        <p className="muted">
          {r.farmName}
          {r.batchName ? ` | Batch: ${r.batchName}` : ""} | {perDay} feeding ({feedTimes}) | Period: {formatDay(r.from)} to {formatDayYear(r.to)} ({nDays} days) | Prepared{" "}
          {formatDayYear(new Date(r.generatedAt.getTime() + FARM.utcOffsetMinutes * 60_000).toISOString().slice(0, 10))}
        </p>
        {(r.from !== r.requestedFrom || r.to !== r.requestedTo) && r.batchName && (
          <p className="muted small">
            Only days while this batch was open are counted ({formatDay(r.from)} to {formatDay(r.to)}).
          </p>
        )}
        {r.scheduleChanged && <p className="muted small">The feeding schedule changed during this period; each day is measured against the schedule in force that day.</p>}
        {sample && <p className="notice warn">Sample preview: built from the handwritten log for 18 Oct to 14 Nov, replayed as videos. Staff names are placeholders.</p>}
      </header>

      <section className="tiles">
        <Tile value={`${r.overallPercent}%`} label="Overall compliance" sub={`${r.loggedSlots} of ${r.dueSlots} feeds recorded`} />
        {nFeeds <= 3 &&
          r.feeds.map((f) => (
            <Tile key={f.feed.key} value={`${f.percent}%`} label={`${f.feed.label} compliance`} sub={`${f.logged} of ${f.due} days`} />
          ))}
        <Tile value={`${pctDays(r.daysAll)}%`} label={`Days with ${allWord(nFeeds)}`} sub={dayCount(r.daysAll)} />
        <Tile value={`${pctDays(r.daysNone)}%`} label="Days with no video" sub={dayCount(r.daysNone)} />
      </section>
      {r.pendingSlots > 0 && (
        <p className="muted small">
          {r.pendingSlots} feed{r.pendingSlots === 1 ? " is" : "s are"} still within its recording window and not counted yet.
        </p>
      )}

      <section>
        <h2>Key findings</h2>
        <ul className="findings">
          {findings.map((f) => (
            <li key={f.lead}>
              <strong>{f.lead}</strong> {f.detail}
            </li>
          ))}
        </ul>
      </section>

      <section className="avoid-break">
        <h2>1. Daily compliance map</h2>
        <Legend
          items={[
            { color: C.good, glyph: "✓", label: `Recorded within ${tol} min` },
            { color: C.warning, glyph: "!", label: "Recorded, off schedule" },
            { color: C.critical, glyph: "✕", label: "No video" },
            { color: C.pending, glyph: "·", label: "Not due yet" },
          ]}
        />
        <ComplianceMap days={r.days} />
        <p className="caption">Each date shows its feeds in time order ({feedTimes}), left to right. Hover a block for time and staff.</p>
      </section>

      <section className="avoid-break">
        <h2>2. Overall performance</h2>
        <Legend
          items={[
            { color: C.good, label: "Complete / on time" },
            { color: C.warning, label: "Partial / off schedule" },
            { color: C.critical, label: "Nothing / missed" },
          ]}
        />
        <OverallChart r={r} />
        <p className="caption">
          {r.daysAll} of {r.daysCounted} days ({pctDays(r.daysAll)}%) were fully complete; {r.daysSome} were partly complete and {r.daysNone} had no video
          at all.
        </p>
      </section>

      <section className="avoid-break">
        <h2>3. Weekly trend</h2>
        <Legend items={r.feedList.map((f) => ({ color: feedColor(r.feedList, f.key), label: `${f.label} feed` }))} />
        <WeeklyChart r={r} />
        <p className="caption">
          {r.weeks
            .map((w) => `Week ${w.index} (${formatDay(w.from)} to ${formatDay(w.to)}): ${w.logged} of ${w.due}`)
            .join(". ")}
          .
        </p>
      </section>

      <section className="avoid-break">
        <h2>4. Timing against schedule</h2>
        <Legend items={r.feedList.map((f) => ({ color: feedColor(r.feedList, f.key), label: `${f.label} feed` }))} />
        <TimingChart r={r} />
        <p className="caption">
          {r.feeds
            .map((f) =>
              f.logged
                ? `${f.feed.label}: average ${minutes(f.avgDeviation)}, ${f.onTime} of ${f.logged} within ${tol} minutes (earliest ${formatLocalTime(f.earliest!.recordedAt)}, latest ${formatLocalTime(f.latest!.recordedAt)})`
                : `${f.feed.label}: no videos`,
            )
            .join(". ")}
          . The shaded band is ±{tol} minutes.
        </p>
      </section>

      <section className="avoid-break">
        <h2>5. Staff</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Feeds recorded</th>
              {r.feedList.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th>On time</th>
              <th>Off schedule</th>
              <th>Average timing</th>
            </tr>
          </thead>
          <tbody>
            {r.staff.map((s) => (
              <tr key={s.staffId}>
                <td>{s.name}</td>
                <td>{s.feedsDone}</td>
                {r.feedList.map((f) => (
                  <td key={f.key}>{s.perFeed[f.key] ?? 0}</td>
                ))}
                <td>{s.onTime}</td>
                <td>{s.late + s.early}</td>
                <td>{minutes(s.avgDeviation)}</td>
              </tr>
            ))}
            {!r.staff.length && (
              <tr>
                <td colSpan={5 + nFeeds}>No staff yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="caption">If both staff record the same feed, it counts once for the farm and appears under both names.</p>
      </section>

      <section>
        <h2>6. Recommendations</h2>
        <ul className="findings">
          {recs.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Method</h2>
        <ul className="findings small">
          <li>Source: videos recorded in the Verank Feeding app. Each has a server timestamp, the staff member&apos;s linked phone and, where allowed, GPS.</li>
          <li>
            A video between {r.feedList.map((f) => `${f.windowStart} and ${f.windowEnd} counts for the ${f.label} feed`).join("; ")} ({FARM.timezoneLabel}). One video is
            enough; a feed with no video counts as non-compliance. Feeds whose window had not closed when the report was prepared are not counted.
          </li>
          {r.batchName && <li>Only videos tagged with batch {r.batchName} are counted.</li>}
          <li>On time means within {tol} minutes of the scheduled time. Off-schedule feeds still count as done.</li>
          <li>A video must be at least {r.minSeconds} seconds long to count.</li>
          {r.outOfWindow.length + r.tooShort.length > 0 && (
            <li>{r.outOfWindow.length + r.tooShort.length} video(s) were not counted (too short or outside every window) and are listed below.</li>
          )}
          {flagEntries.map(([k, v]) => (
            <li key={k}>
              ⚑ {v} × {FLAG_LABELS[k] ?? k}
            </li>
          ))}
        </ul>
      </section>

      <section className="appendix">
        <h2>Appendix: feeding log</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              {r.feedList.map((f) => (
                <th key={f.key}>{f.label} feed</th>
              ))}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {r.days.map((d) => (
              <tr key={d.dateKey}>
                <td>{formatDayLong(d.dateKey)}</td>
                {r.feedList.map((f) => {
                  const s = d.slots.find((x) => x.feed.key === f.key);
                  return (
                    <td key={f.key}>
                      {!s ? <span className="muted">not scheduled</span> : s.status === "pending" ? <span className="muted">not due</span> : <Cell rec={s.first} extra={s.recordings.length - 1} />}
                    </td>
                  );
                })}
                <td>{dayStatusLabel(d.status, d.slots.length)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.outOfWindow.length + r.tooShort.length > 0 && (
          <>
            <h3>Videos not counted</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Staff</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {[...r.tooShort, ...r.outOfWindow]
                  .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
                  .map((o) => (
                    <tr key={o.id}>
                      <td>{formatDayLong(localDateKey(o.recordedAt))}</td>
                      <td>{o.videoUrl ? <a href={o.videoUrl}>{formatLocalTime(o.recordedAt)}</a> : formatLocalTime(o.recordedAt)}</td>
                      <td>{o.staffName}</td>
                      <td>
                        {o.feedLabel
                          ? `Only ${Math.round(o.durationSeconds ?? 0)}s long (${o.feedLabel} feed needs ${r.minSeconds}s)`
                          : "Outside every feeding window"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
        <p className="caption">Times link to the video (links expire after 7 days; regenerate the report for fresh links). Videos are kept for {FARM.videoRetentionDays} days, then deleted; the record of the feed stays. ⚑ marks a flagged video.</p>
      </section>
    </article>
  );
}
