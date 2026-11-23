import JoinForm from "@/components/JoinForm";

export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
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
        <p className="muted">
          <strong>Android:</strong> tap <em>Link this phone</em>, then use Chrome&apos;s menu and choose <em>Add to Home screen</em>.
        </p>
        <p className="muted">
          <strong>iPhone:</strong> first tap Share, then <em>Add to Home Screen</em>. Open the app from your home screen and enter this code: <strong className="code">{code.toUpperCase()}</strong>
        </p>
        <JoinForm initialCode={code.toUpperCase()} />
      </section>
    </main>
  );
}
