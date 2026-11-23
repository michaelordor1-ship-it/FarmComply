"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ADMIN_COOKIE, adminSessionValue, checkAdminPassword, isAdmin, randomCode } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { FARM } from "@/lib/config";

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
