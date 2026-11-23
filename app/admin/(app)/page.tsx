import { fetchRecordings, fetchStaff, signedVideoUrls, toInputs } from "@/lib/data";
import { computeReport, FLAG_LABELS } from "@/lib/report";
import { addDays, assignSlot, formatDayLong, formatDeviation, formatLocalTime, localDateKey } from "@/lib/time";

export default async function Today() {
  const today = localDateKey(new Date());
  const from = addDays(today, -6);
  const [rows, staff] = await Promise.all([fetchRecordings(from, today), fetchStaff()]);
  const urls = await signedVideoUrls(rows.map((r) => r.storage_path));
  const r = computeReport({ from, to: today, recordings: toInputs(rows, urls), staff });
  const recent = [...r.days].reverse().slice(0, 2);
  const byId = new Map(rows.map((x) => [x.id, x]));
  const list = [...rows].reverse();

  return (
    <main>
      <h1>Today</h1>
      {recent.map((d) => (
        <section key={d.dateKey} className="card">
          <h2>{d.dateKey === today ? "Today" : "Yesterday"} · {formatDayLong(d.dateKey)}</h2>
          <div className="today-grid">
            {d.slots.map((s) => (
              <div key={s.feed.key} className={`slot slot-${s.status}`}>
                <div className="slot-label">{s.feed.label} feed</div>
                <div className="slot-status">
                  {s.status === "done" ? (s.first!.timing === "on_time" ? "Done, on time" : `Done, ${formatDeviation(s.first!.deviationMinutes)}`) : s.status === "missed" ? "Missed" : "Not yet"}
                </div>
                {s.first && (
                  <div className="small">
                    {formatLocalTime(s.first.recordedAt)} by {s.first.staffName}
                    {s.first.videoUrl && (
                      <>
                        {" · "}
                        <a href={s.first.videoUrl} target="_blank" rel="noreferrer">
                          Watch
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card">
        <h2>Last 7 days: {r.overallPercent}% ({r.loggedSlots} of {r.dueSlots} feeds)</h2>
        {list.length === 0 && <p className="muted">No videos yet.</p>}
        <div className="video-list">
          {list.map((x) => {
            const at = new Date(x.recorded_at);
            const slot = assignSlot(at);
            const url = urls.get(x.storage_path);
            return (
              <div key={x.id} className="video-row">
                {url ? <video src={url} controls preload="none" playsInline className="thumb" /> : <div className="thumb" />}
                <div>
                  <div>
                    <strong>{formatDayLong(localDateKey(at))}, {formatLocalTime(at)}</strong> · {x.staff?.name}
                  </div>
                  <div className="small muted">
                    {slot ? `${slot.feed.label} feed, ${formatDeviation(slot.deviationMinutes)}` : "Outside feeding windows (not counted)"}
                    {x.duration_seconds ? ` · ${Math.round(Number(x.duration_seconds))}s` : ""}
                    {x.latitude !== null && x.longitude !== null && (
                      <>
                        {" · "}
                        <a href={`https://maps.google.com/?q=${x.latitude},${x.longitude}`} target="_blank" rel="noreferrer">
                          Location
                        </a>
                      </>
                    )}
                  </div>
                  {byId.get(x.id)?.flags?.length ? (
                    <div className="small flag-text">⚑ {x.flags.map((f) => FLAG_LABELS[f] ?? f).join("; ")}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
