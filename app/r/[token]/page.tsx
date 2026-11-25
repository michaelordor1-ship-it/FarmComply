import type { Metadata } from "next";
import { buildBatchReport, fetchBatches } from "@/lib/data";
import { readShareToken } from "@/lib/share";
import { formatDayYear, localDateKey } from "@/lib/time";
import ReportView from "@/components/report/ReportView";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Feeding report · Verank Farms", robots: { index: false, follow: false } };

function Message({ text }: { text: string }) {
  return (
    <main className="staff">
      <section className="card">
        <h2>Verank Farms report</h2>
        <p>{text}</p>
      </section>
    </main>
  );
}

/** Read-only report opened from a shared WhatsApp link. No login needed until the link expires. */
export default async function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = readShareToken(token);
  if (t === "expired") return <Message text="This report link has expired. Ask the farm admin to share a new one." />;
  if (!t) return <Message text="This report link isn't valid." />;
  const batch = (await fetchBatches(true)).find((b) => b.id === t.batchId);
  if (!batch) return <Message text="This batch no longer exists." />;
  const r = await buildBatchReport(t.from, t.to, batch, true);
  return (
    <div className="admin-body">
      <div className="report-actions no-print">
        <span className="muted small">Shared report · link valid until {formatDayYear(localDateKey(t.expires))}</span>
        <PrintButton />
      </div>
      <ReportView r={r} />
    </div>
  );
}
