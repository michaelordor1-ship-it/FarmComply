import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./supabase";

export const ADMIN_COOKIE = "vf_admin";
export const DEVICE_COOKIE = "vf_device";
const ADMIN_SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  return s;
}

export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** Short access code staff can type: no 0/O/1/I to avoid confusion. */
export function randomCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(len);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

// ---------- Admin ----------

export function checkAdminPassword(pw: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(sha256(pw), sha256(expected));
}

export function adminSessionValue(): { value: string; maxAge: number } {
  const exp = Date.now() + ADMIN_SESSION_DAYS * 86_400_000;
  return { value: `${exp}.${sign(`admin.${exp}`)}`, maxAge: ADMIN_SESSION_DAYS * 86_400 };
}

export async function isAdmin(): Promise<boolean> {
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!c) return false;
  const [exp, sig] = c.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(`admin.${exp}`));
}

// ---------- Staff devices ----------

export type StaffSession = { staffId: string; staffName: string; deviceId: string };

export async function getStaffSession(): Promise<StaffSession | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const { data } = await db()
    .from("devices")
    .select("id, revoked_at, staff:staff_id (id, name, active)")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staff = (data as any)?.staff as { id: string; name: string; active: boolean } | undefined;
  if (!data || data.revoked_at || !staff || !staff.active) return null;
  return { staffId: staff.id, staffName: staff.name, deviceId: data.id };
}

// ---------- Clock tickets ----------
// Issued by the server when the staff member starts recording while online.
// Proves the recording started at that server time.

export function issueClockTicket(): { serverNow: number; ticket: string } {
  const now = Date.now();
  return { serverNow: now, ticket: `${now}.${sign(`clock.${now}`)}` };
}

export function verifyClockTicket(ticket: unknown): number | null {
  if (typeof ticket !== "string") return null;
  const [t, sig] = ticket.split(".");
  if (!t || !sig || !safeEqual(sig, sign(`clock.${t}`))) return null;
  return Number(t);
}
