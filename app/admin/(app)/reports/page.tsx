import Link from "next/link";
import { addDays, localDateKey } from "@/lib/time";

export default async function Reports() {
  const today = localDateKey(new Date());
  const to = addDays(today, -1);
  const from = addDays(to, -27);
  const presets = [
    { label: "Last 7 days", from: addDays(to, -6), to },
    { label: "Last 28 days", from, to },
    { label: "This month so far", from: today.slice(0, 8) + "01", to: today },
  ];
  return (
    <main>
      <h1>Reports</h1>
      <section className="card">
        <h2>Choose a period</h2>
        <form action="/admin/reports/view" className="inline-form">
          <label>
            From <input type="date" name="from" defaultValue={from} max={today} required />
          </label>
          <label>
            To <input type="date" name="to" defaultValue={to} max={today} required />
          </label>
          <button className="primary-btn">Generate report</button>
        </form>
        <div className="presets">
          {presets.map((p) => (
            <Link key={p.label} className="secondary-btn sm" href={`/admin/reports/view?from=${p.from}&to=${p.to}`}>
              {p.label}
            </Link>
          ))}
        </div>
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
