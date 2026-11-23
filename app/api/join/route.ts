import { NextResponse } from "next/server";
import { DEVICE_COOKIE, randomToken, sha256 } from "@/lib/auth";
import { db } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 6) return NextResponse.json({ error: "Enter the access code your admin sent you." }, { status: 400 });

  const supa = db();
  const { data: invite } = await supa
    .from("invites")
    .select("code, staff_id, expires_at, used_at, staff:staff_id (id, name, active)")
    .eq("code", code)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staff = (invite as any)?.staff as { id: string; name: string; active: boolean } | undefined;
  if (!invite || !staff) return NextResponse.json({ error: "That code isn't valid. Ask your admin for a new one." }, { status: 400 });
  if (invite.used_at) return NextResponse.json({ error: "That code has already been used. Ask your admin for a new one." }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: "That code has expired. Ask your admin for a new one." }, { status: 400 });
  if (!staff.active) return NextResponse.json({ error: "Your access has been turned off. Speak to your admin." }, { status: 403 });

  // Claim the code (guard against two phones using it at once)
  const { data: claimed } = await supa
    .from("invites")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_at", null)
    .select("code");
  if (!claimed?.length) return NextResponse.json({ error: "That code has already been used." }, { status: 400 });

  // One phone per staff member: switch off any previous phone
  await supa.from("devices").update({ revoked_at: new Date().toISOString() }).eq("staff_id", staff.id).is("revoked_at", null);

  const token = randomToken();
  const { error } = await supa.from("devices").insert({
    staff_id: staff.id,
    token_hash: sha256(token),
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    last_seen_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "Could not link this phone. Try again." }, { status: 500 });

  const res = NextResponse.json({ ok: true, name: staff.name });
  res.cookies.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 400 * 86_400,
  });
  return res;
}
