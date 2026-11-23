import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <div className="admin">
      <nav className="admin-nav no-print">
        <div className="admin-brand">
          <div className="brand-mark sm">V</div> Verank Feeding
        </div>
        <Link href="/admin">Today</Link>
        <Link href="/admin/reports">Reports</Link>
        <Link href="/admin/staff">Staff</Link>
        <form action={logout}>
          <button className="link-btn light">Sign out</button>
        </form>
      </nav>
      <div className="admin-body">{children}</div>
    </div>
  );
}
