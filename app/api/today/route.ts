import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { fetchRecordings, toInputs } from "@/lib/data";
import { computeReport } from "@/lib/report";
import { formatLocalTime, localDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Today's feeds for the staff home screen. */
export async function GET() {
  const s = await getStaffSession();
  if (!s) return NextResponse.json({ error: "Not linked" }, { status: 401 });
  const today = localDateKey(new Date());
  const r = computeReport({ from: today, to: today, recordings: toInputs(await fetchRecordings(today, today)) });
  const slots = r.days[0].slots.map((sl) => ({
    label: sl.feed.label,
    status: sl.status,
    by: sl.first?.staffName ?? null,
    at: sl.first ? formatLocalTime(sl.first.recordedAt) : null,
    timing: sl.first?.timing ?? null,
  }));
  return NextResponse.json({ name: s.staffName, slots }, { headers: { "Cache-Control": "no-store" } });
}
