import { fetchBatches, videoCountsByBatch } from "@/lib/data";
import { formatDayLong, localDateKey } from "@/lib/time";
import { closeBatch, createBatch, deleteBatch, reopenBatch } from "../../actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function Batches() {
  const today = localDateKey(new Date());
  const [y, m] = today.split("-").map(Number);
  const batches = await fetchBatches(true);
  const videos = await videoCountsByBatch(batches.map((b) => b.id));
  const open = batches.filter((b) => !b.closed_on || b.closed_on >= today);
  const closed = batches.filter((b) => b.closed_on && b.closed_on < today);
  const years = [y - 1, y, y + 1];

  return (
    <main>
      <h1>Batches</h1>
      <section className="card">
        <h2>Add a batch</h2>
        <form action={createBatch} className="inline-form">
          <select name="month" defaultValue={m}>
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select name="year" defaultValue={y}>
            {years.map((yr) => (
              <option key={yr}>{yr}</option>
            ))}
          </select>
          <input name="label" placeholder="Label (optional, e.g. Pond 2)" maxLength={40} />
          <label>
            Feeds counted from <input type="date" name="activeFrom" defaultValue={today} />
          </label>
          <button className="primary-btn">Add batch</button>
        </form>
        <p className="muted small">Staff see every open batch and pick one before recording. Every open batch is expected at every feeding time.</p>
      </section>

      <section className="card">
        <h2>Open batches ({open.length})</h2>
        {!open.length && <p className="muted">No open batches. Staff can&apos;t record until you add one.</p>}
        {open.map((b) => (
          <div key={b.id} className="batch-row">
            <div>
              <strong>{b.name}</strong>
              <div className="small muted">
                Counted from {formatDayLong(b.active_from)} · {videos.get(b.id) ?? 0} videos
                {b.closed_on ? ` · closes after ${formatDayLong(b.closed_on)}` : ""}
              </div>
            </div>
            <form action={closeBatch} className="inline-form">
              <input type="hidden" name="batchId" value={b.id} />
              <label className="small">
                Last feed day <input type="date" name="closedOn" defaultValue={today} min={b.active_from} />
              </label>
              <button className="secondary-btn sm">Close batch (harvested)</button>
            </form>
            {!videos.get(b.id) && (
              <form action={deleteBatch}>
                <input type="hidden" name="batchId" value={b.id} />
                <button className="link-btn danger">Delete</button>
              </form>
            )}
          </div>
        ))}
      </section>

      {closed.length > 0 && (
        <section className="card">
          <h2>Closed batches</h2>
          {closed.map((b) => (
            <div key={b.id} className="batch-row">
              <div>
                <strong>{b.name}</strong>
                <div className="small muted">
                  {formatDayLong(b.active_from)} to {formatDayLong(b.closed_on!)} · {videos.get(b.id) ?? 0} videos
                </div>
              </div>
              <form action={reopenBatch}>
                <input type="hidden" name="batchId" value={b.id} />
                <button className="link-btn">Reopen</button>
              </form>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
