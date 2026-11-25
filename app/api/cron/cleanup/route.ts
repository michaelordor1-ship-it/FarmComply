import { NextResponse } from "next/server";
import { deleteOldVideos } from "@/lib/cleanup";

export const dynamic = "force-dynamic";

/** Daily job (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>". */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deleted = await deleteOldVideos(40);
  return NextResponse.json({ deleted });
}
