import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { fetchBatches, fetchRecordings, fetchSchedules, toInputs } from "@/lib/data";
import { computeReport } from "@/lib/report";
import { formatLocalTime, localDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Open batches and today's feeds for each, for the staff home screen. */
export async function GET() {
  const s = await getStaffSession();
  if (!s) return NextResponse.json({ error: "Not linked" }, { status: 401 });
  const today = localDateKey(new Date());
  const [batches, rows, schedules] = await Promise.all([fetchBatches(false), fetchRecordings(today, today), fetchSchedules()]);
  const out = batches.map((b) => {
    const r = computeReport({
      from: today,
      to: today,
      schedules,
      recordings: toInputs(rows.filter((x) => x.batch_id === b.id)),
      activeFrom: b.active_from,
    });
    const day = r.days[0];
    return {
      id: b.id,
      name: b.name,
      slots: (day?.slots ?? []).map((sl) => ({
        label: sl.feed.label,
        status: sl.status,
        by: sl.first?.staffName ?? null,
        at: sl.first ? formatLocalTime(sl.first.recordedAt) : null,
        timing: sl.first?.timing ?? null,
      })),
    };
  });
  return NextResponse.json({ name: s.staffName, batches: out }, { headers: { "Cache-Control": "no-store" } });
}
