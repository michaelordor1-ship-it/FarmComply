import { NextResponse } from "next/server";
import { getStaffSession, issueClockTicket } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getStaffSession();
  if (!s) return NextResponse.json({ error: "Not linked" }, { status: 401 });
  return NextResponse.json(issueClockTicket(), { headers: { "Cache-Control": "no-store" } });
}
