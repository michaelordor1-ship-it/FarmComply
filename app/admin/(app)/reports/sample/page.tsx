import Link from "next/link";
import { computeReport } from "@/lib/report";
import { sampleRecordings, SAMPLE_FROM, SAMPLE_STAFF, SAMPLE_TO } from "@/lib/sample";
import ReportView from "@/components/report/ReportView";
import PrintButton from "@/components/PrintButton";

export default function SampleReport() {
  const r = computeReport({
    from: SAMPLE_FROM,
    to: SAMPLE_TO,
    recordings: sampleRecordings(),
    staff: SAMPLE_STAFF,
    now: new Date("2026-11-17T09:00:00Z"),
    batchName: "October 2026 (sample)",
  });
  return (
    <>
      <div className="report-actions no-print">
        <Link href="/admin/reports" className="link-btn">
          ← Back
        </Link>
        <PrintButton />
      </div>
      <ReportView r={r} sample />
    </>
  );
}
