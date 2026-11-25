import Link from "next/link";
import { after } from "next/server";
import { FARM } from "@/lib/config";
import { deleteOldVideos } from "@/lib/cleanup";
import { batchesOverlapping, fetchBatches, fetchRecordings, fetchSchedules, signedVideoUrls, toInputs } from "@/lib/data";
import { computeReport, FLAG_LABELS } from "@/lib/report";
import { addDays, assignSlot, formatDayLong, formatDeviation, formatLocalTime, localDateKey } from "@/lib/time";

export default async function Today() {
  const today = localDateKey(new Date());
  const yesterday = addDays(today, -1);
  const from = addDays(today, -6);
  const [rows, schedules, allBatches] = await Promise.all([fetchRecordings(from, today), fetchSchedules(), fetchBatches(true)]);
  const urls = await signedVideoUrls(rows);
  // Housekeeping: remove videos past the retention period after this page is sent
  after(() => deleteOldVideos().catch(() => {}));
  const batches = batchesOverlapping(allBatches, yesterday, today);
  const list = [...rows].reverse();

  return (
    <main>
      <h1>Today · {formatDayLong(today)}</h1>
      {!allBatches.length && (
        <p className="notice warn">
          No batches yet. <Link href="/admin/batches">Add a batch</Link> so staff can start recording.
        </p>
      )}
      {batches.map((b) => {
        const r = computeReport({
          from: yesterday,
          to: today,
          schedules,
          recordings: toInputs(rows.filter((x) => x.batch_id === b.id), urls),
          activeFrom: b.active_from,
          activeTo: b.closed_on,
        });
        return (
          <section key={b.id} className="card">
            <h2>{b.name}</h2>
            {[...r.days].reverse().map((d) => (
              <div key={d.dateKey} style={{ marginBottom: 12 }}>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  {d.dateKey === today ? "Today" : "Yesterday"}
                </div>
                <div className="today-grid" style={{ gridTemplateColumns: `repeat(${Math.min(d.slots.length, 4)}, 1fr)` }}>
                  {d.slots.map((s) => (
                    <div key={s.feed.key} className={`slot slot-${s.status}`}>
                      <div className="slot-label">{s.feed.label} feed</div>
                      <div className="slot-status">
                        {s.status === "done"
                          ? s.first!.timing === "on_time"
                            ? "Done"
                            : formatDeviation(s.first!.deviationMinutes)
                          : s.status === "missed"
                            ? "Missed"
                            : "Not yet"}
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
              </div>
            ))}
          </section>
        );
      })}

      <section className="card">
        <h2>Videos from the last 7 days ({rows.length})</h2>
        {list.length === 0 && <p className="muted">No videos yet.</p>}
        <div className="video-list">
          {list.map((x) => {
            const at = new Date(x.recorded_at);
            const slot = assignSlot(at, schedules);
            const url = urls.get(x.storage_path);
            return (
              <div key={x.id} className="video-row">
                {url ? (
                  <video src={url} controls preload="none" playsInline className="thumb" />
                ) : (
                  <div className="thumb thumb-empty">{x.video_deleted_at ? "Video deleted" : "No video"}</div>
                )}
                <div>
                  <div>
                    <strong>
                      {formatDayLong(localDateKey(at))}, {formatLocalTime(at)}
                    </strong>{" "}
                    · {x.staff?.name}
                  </div>
                  <div className="small">{x.batch?.name ?? <span className="muted">No batch</span>}</div>
                  <div className="small muted">
                    {slot ? `${slot.feed.label} feed, ${formatDeviation(slot.deviationMinutes)}` : "Outside feeding windows (not counted)"}
                    {x.duration_seconds ? ` · ${Math.round(Number(x.duration_seconds))}s` : ""}
                    {x.duration_seconds != null && Number(x.duration_seconds) < FARM.minCountedSeconds && (
                      <strong className="flag-text"> · Too short, not counted</strong>
                    )}
                    {x.latitude !== null && x.longitude !== null && (
                      <>
                        {" · "}
                        <a href={`https://maps.google.com/?q=${x.latitude},${x.longitude}`} target="_blank" rel="noreferrer">
                          Location
                        </a>
                      </>
                    )}
                  </div>
                  {x.flags?.length ? <div className="small flag-text">⚑ {x.flags.map((f) => FLAG_LABELS[f] ?? f).join("; ")}</div> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
