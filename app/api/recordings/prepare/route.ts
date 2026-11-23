import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getStaffSession, verifyClockTicket } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { FARM } from "@/lib/config";
import { localDateKey } from "@/lib/time";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function POST(req: Request) {
  const s = await getStaffSession();
  if (!s) return NextResponse.json({ error: "This phone is not linked. Ask your admin for an access code." }, { status: 401 });

  const b = await req.json().catch(() => null);
  const clipId = typeof b?.clipId === "string" ? b.clipId.slice(0, 64) : null;
  const deviceRecordedAt = num(b?.deviceRecordedAt);
  const deviceNow = num(b?.deviceNow);
  if (!clipId || deviceRecordedAt === null || deviceNow === null)
    return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const batchId = typeof b?.batchId === "string" ? b.batchId : null;
  const supa = db();
  if (!batchId) return NextResponse.json({ error: "Choose a batch before recording." }, { status: 400 });
  const { data: batch } = await supa.from("batches").select("id").eq("id", batchId).maybeSingle();
  if (!batch) return NextResponse.json({ error: "That batch no longer exists. Ask your admin." }, { status: 400 });

  // Retried upload of a clip we already know about
  const { data: existing } = await supa
    .from("recordings")
    .select("id, status, storage_path")
    .eq("client_clip_id", clipId)
    .maybeSingle();
  if (existing?.status === "uploaded") return NextResponse.json({ alreadyDone: true, id: existing.id });

  const serverNow = Date.now();
  // Difference between the server clock and the phone clock right now
  const skewMs = serverNow - deviceNow;
  const corrected = deviceRecordedAt + skewMs;
  const ticketTime = verifyClockTicket(b?.clockTicket);

  const flags: string[] = [];
  let recordedAt: number;
  let timeSource: "server_ticket" | "device_clock";
  if (ticketTime !== null && ticketTime <= serverNow) {
    recordedAt = ticketTime;
    timeSource = "server_ticket";
    // Phone clock was changed between recording and upload
    if (Math.abs(corrected - ticketTime) > FARM.clockSkewFlagSeconds * 1000) flags.push("clock_mismatch");
  } else {
    recordedAt = Math.min(corrected, serverNow);
    timeSource = "device_clock";
    flags.push("offline_recording");
  }
  if (Math.abs(skewMs) > FARM.clockSkewFlagSeconds * 1000 && !flags.includes("clock_mismatch")) flags.push("clock_mismatch");
  if (serverNow - recordedAt > FARM.lateUploadFlagHours * 3_600_000) flags.push("late_upload");

  const lat = num(b?.latitude);
  const lng = num(b?.longitude);
  if (lat === null || lng === null) flags.push("no_location");
  const duration = num(b?.durationSeconds);
  if (duration !== null && duration < FARM.minClipSeconds) flags.push("short_clip");

  const mime = typeof b?.mimeType === "string" ? b.mimeType.slice(0, 80) : "video/webm";
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const path = existing?.storage_path ?? `${s.staffId}/${localDateKey(new Date(recordedAt))}/${randomUUID()}.${ext}`;

  const { data: signed, error: signErr } = await supa.storage.from(FARM.videoBucket).createSignedUploadUrl(path, { upsert: true });
  if (signErr || !signed) return NextResponse.json({ error: "Storage unavailable, will retry." }, { status: 503 });

  const row = {
    staff_id: s.staffId,
    device_id: s.deviceId,
    batch_id: batchId,
    client_clip_id: clipId,
    status: "pending",
    storage_path: path,
    mime_type: mime,
    size_bytes: num(b?.sizeBytes),
    duration_seconds: duration,
    recorded_at: new Date(recordedAt).toISOString(),
    time_source: timeSource,
    device_recorded_at: new Date(deviceRecordedAt).toISOString(),
    clock_skew_seconds: Math.round(skewMs / 1000),
    latitude: lat,
    longitude: lng,
    location_accuracy_m: num(b?.accuracy),
    flags,
  };

  let id = existing?.id as string | undefined;
  if (id) {
    await supa.from("recordings").update(row).eq("id", id);
  } else {
    const { data, error } = await supa.from("recordings").insert(row).select("id").single();
    if (error || !data) return NextResponse.json({ error: "Could not save, will retry." }, { status: 500 });
    id = data.id;
  }

  await supa.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", s.deviceId);

  return NextResponse.json({ id, uploadUrl: signed.signedUrl });
}
