import Link from "next/link";
import { addDays, formatDay, localDateKey } from "@/lib/time";
import { batchSummaries, fetchBatches } from "@/lib/data";

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = localDateKey(new Date());
  const to = isDate(sp.to) ? sp.to : addDays(today, -1);
  const from = isDate(sp.from) ? sp.from : addDays(to, -27);
  const [batches, summaries] = await Promise.all([fetchBatches(true), batchSummaries(from, to)]);
  const presets = [
    { label: "Last 7 days", from: addDays(today, -7), to: addDays(today, -1) },
    { label: "Last 28 days", from: addDays(today, -28), to: addDays(today, -1) },
    { label: "This month so far", from: today.slice(0, 8) + "01", to: today },
  ];

  return (
    <main>
      <h1>Reports</h1>
      <section className="card">
        <h2>Generate a report</h2>
        <form action="/admin/reports/view" className="inline-form">
          <select name="batch" defaultValue={batches[0]?.id} required>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.closed_on && b.closed_on < today ? " (closed)" : ""}
              </option>
            ))}
          </select>
          <label>
            From <input type="date" name="from" defaultValue={from} max={today} required />
          </label>
          <label>
            To <input type="date" name="to" defaultValue={to} max={today} required />
          </label>
          <button className="primary-btn" disabled={!batches.length}>
            Generate report
          </button>
        </form>
        {!batches.length && <p className="muted small">Add a batch first.</p>}
      </section>

      <section className="card">
        <h2>
          All batches, {formatDay(from)} to {formatDay(to)}
        </h2>
        <div className="presets" style={{ marginTop: 0, marginBottom: 12 }}>
          {presets.map((p) => (
            <Link key={p.label} className="secondary-btn sm" href={`/admin/reports?from=${p.from}&to=${p.to}`}>
              {p.label}
            </Link>
          ))}
        </div>
        {summaries.length ? (
          <table className="tbl compare">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Compliance</th>
                <th>Feeds recorded</th>
                {summaries[0].report.feedList.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th>Days with nothing</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ batch, report: r }) => (
                <tr key={batch.id}>
                  <td>{batch.name}</td>
                  <td className="num">
                    <strong>{r.overallPercent}%</strong>
                  </td>
                  <td className="num">
                    {r.loggedSlots} of {r.dueSlots}
                  </td>
                  {summaries[0].report.feedList.map((f) => {
                    const fs = r.feeds.find((x) => x.feed.key === f.key);
                    return (
                      <td key={f.key} className="num">
                        {fs ? `${fs.percent}%` : "–"}
                      </td>
                    );
                  })}
                  <td className="num">{r.daysNone}</td>
                  <td>
                    <Link href={`/admin/reports/view?batch=${batch.id}&from=${from}&to=${to}`}>Full report</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No batches were open in this period.</p>
        )}
      </section>

      <section className="card">
        <h2>Preview</h2>
        <p className="muted">
          See the report built from the handwritten log for 18 Oct to 14 Nov, as if each entry had been a video.{" "}
          <Link href="/admin/reports/sample">Open sample report</Link>
        </p>
      </section>
    </main>
  );
}
