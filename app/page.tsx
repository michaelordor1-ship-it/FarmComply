import { getStaffSession } from "@/lib/auth";
import StaffApp from "@/components/StaffApp";
import JoinForm from "@/components/JoinForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getStaffSession();
  if (s) return <StaffApp name={s.staffName} />;
  return (
    <main className="staff">
      <header className="staff-head">
        <div className="brand-mark">V</div>
        <div>
          <div className="muted small">Verank Farms</div>
          <div className="staff-name">Feeding app</div>
        </div>
      </header>
      <section className="card">
        <h2>Link this phone</h2>
        <p className="muted">Enter the access code your admin sent you on WhatsApp.</p>
        <JoinForm />
      </section>
    </main>
  );
}
