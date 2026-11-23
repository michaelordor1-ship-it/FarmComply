import Link from "next/link";
import { buildReport } from "@/lib/data";
import { localDateKey } from "@/lib/time";
import ReportView from "@/components/report/ReportView";
import PrintButton from "@/components/PrintButton";

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ViewReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const today = localDateKey(new Date());
  let { from, to } = sp;
  if (!isDate(from) || !isDate(to)) return <p className="notice err">Pick a start and end date.</p>;
  if (to > today) to = today;
  if (from > to) [from, to] = [to, from];
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 + 1;
  if (days > 366) return <p className="notice err">Choose a period of a year or less.</p>;

  const r = await buildReport(from, to, true);
  return (
    <>
      <div className="report-actions no-print">
        <Link href="/admin/reports" className="link-btn">
          ← Change period
        </Link>
        <PrintButton />
      </div>
      <ReportView r={r} />
    </>
  );
}
