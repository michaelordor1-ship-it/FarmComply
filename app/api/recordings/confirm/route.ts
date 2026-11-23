import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { FARM } from "@/lib/config";

export async function POST(req: Request) {
  const s = await getStaffSession();
  if (!s) return NextResponse.json({ error: "Not linked" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const id = typeof b?.id === "string" ? b.id : null;
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const supa = db();
  const { data: rec } = await supa
    .from("recordings")
    .select("id, staff_id, storage_path, status")
    .eq("id", id)
    .maybeSingle();
  if (!rec || rec.staff_id !== s.staffId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rec.status === "uploaded") return NextResponse.json({ ok: true });

  // Make sure the video actually landed in storage before counting it
  const dir = rec.storage_path.split("/").slice(0, -1).join("/");
  const file = rec.storage_path.split("/").pop()!;
  const { data: listed } = await supa.storage.from(FARM.videoBucket).list(dir, { search: file });
  const obj = listed?.find((o) => o.name === file);
  if (!obj) return NextResponse.json({ error: "Video not received yet" }, { status: 409 });

  await supa
    .from("recordings")
    .update({
      status: "uploaded",
      uploaded_at: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      size_bytes: (obj.metadata as any)?.size ?? undefined,
    })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
