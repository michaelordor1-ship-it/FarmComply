"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, adminSessionValue, checkAdminPassword, isAdmin, randomCode } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { FARM } from "@/lib/config";
import { localDateKey } from "@/lib/time";
import { validateFeeds, type FeedInput } from "@/lib/schedule";

export async function login(_: unknown, form: FormData): Promise<{ error: string } | undefined> {
  const pw = String(form.get("password") ?? "");
  if (!checkAdminPassword(pw)) return { error: "Wrong password." };
  const { value, maxAge } = adminSessionValue();
  (await cookies()).set(ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

async function guard() {
  if (!(await isAdmin())) redirect("/admin/login");
}

async function newInvite(staffId: string) {
  const supa = db();
  // Retire any unused codes for this person
  await supa.from("invites").delete().eq("staff_id", staffId).is("used_at", null);
  const code = randomCode();
  await supa.from("invites").insert({
    code,
    staff_id: staffId,
    expires_at: new Date(Date.now() + FARM.inviteValidDays * 86_400_000).toISOString(),
  });
}

export async function addStaff(form: FormData) {
  await guard();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const phone = String(form.get("phone") ?? "").trim().slice(0, 30) || null;
  if (!name) return;
  const { data } = await db().from("staff").insert({ name, phone }).select("id").single();
  if (data) await newInvite(data.id);
  revalidatePath("/admin/staff");
}

export async function regenerateInvite(form: FormData) {
  await guard();
  await newInvite(String(form.get("staffId")));
  revalidatePath("/admin/staff");
}

export async function setActive(form: FormData) {
  await guard();
  const id = String(form.get("staffId"));
  const active = form.get("active") === "true";
  const supa = db();
  await supa.from("staff").update({ active }).eq("id", id);
  if (!active) {
    await supa.from("devices").update({ revoked_at: new Date().toISOString() }).eq("staff_id", id).is("revoked_at", null);
    await supa.from("invites").delete().eq("staff_id", id).is("used_at", null);
  }
  revalidatePath("/admin/staff");
}

export async function unlinkPhone(form: FormData) {
  await guard();
  const id = String(form.get("staffId"));
  await db().from("devices").update({ revoked_at: new Date().toISOString() }).eq("staff_id", id).is("revoked_at", null);
  revalidatePath("/admin/staff");
}

// ---------- Batches ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export async function createBatch(form: FormData) {
  await guard();
  const month = Number(form.get("month"));
  const year = Number(form.get("year"));
  const label = String(form.get("label") ?? "").trim().slice(0, 40);
  if (!(month >= 1 && month <= 12) || !(year >= 2020 && year <= 2100)) return;
  const name = `${MONTHS[month - 1]} ${year}${label ? ` (${label})` : ""}`;
  const today = localDateKey(new Date());
  const startRaw = String(form.get("activeFrom") ?? "");
  const activeFrom = /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : today;
  await db().from("batches").insert({
    name,
    month: `${year}-${String(month).padStart(2, "0")}-01`,
    active_from: activeFrom,
  });
  revalidatePath("/admin/batches");
}

export async function closeBatch(form: FormData) {
  await guard();
  const id = String(form.get("batchId"));
  const raw = String(form.get("closedOn") ?? "");
  const closedOn = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : localDateKey(new Date());
  await db().from("batches").update({ closed_on: closedOn }).eq("id", id);
  revalidatePath("/admin/batches");
}

export async function reopenBatch(form: FormData) {
  await guard();
  await db().from("batches").update({ closed_on: null }).eq("id", String(form.get("batchId")));
  revalidatePath("/admin/batches");
}

export async function deleteBatch(form: FormData) {
  await guard();
  const id = String(form.get("batchId"));
  const { count } = await db().from("recordings").select("id", { count: "exact", head: true }).eq("batch_id", id);
  if (count) return; // never delete a batch that has videos; close it instead
  await db().from("batches").delete().eq("id", id);
  revalidatePath("/admin/batches");
}

// ---------- Feeding schedule ----------

export async function saveSchedule(_: unknown, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await guard();
  let feeds: FeedInput[];
  try {
    feeds = JSON.parse(String(form.get("feeds") ?? "[]"));
  } catch {
    return { error: "Could not read the schedule." };
  }
  feeds = feeds.map((f) => ({ time: String(f.time), windowStart: String(f.windowStart), windowEnd: String(f.windowEnd) }));
  const onTime = Number(form.get("onTimeMinutes"));
  const err = validateFeeds(feeds, onTime);
  if (err) return { error: err };
  const today = localDateKey(new Date());
  const raw = String(form.get("effectiveFrom") ?? "");
  const effectiveFrom = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  if (effectiveFrom < today) return { error: "The new schedule can start today or later, not in the past." };
  const { error } = await db()
    .from("schedules")
    .upsert({ effective_from: effectiveFrom, feeds, on_time_minutes: onTime }, { onConflict: "effective_from" });
  if (error) return { error: "Could not save. Try again." };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function deleteSchedule(form: FormData) {
  await guard();
  const eff = String(form.get("effectiveFrom"));
  if (eff > localDateKey(new Date())) await db().from("schedules").delete().eq("effective_from", eff);
  revalidatePath("/admin/settings");
}
