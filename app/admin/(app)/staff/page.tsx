import { db } from "@/lib/supabase";
import { addStaff, regenerateInvite, setActive, unlinkPhone } from "../../actions";
import CopyButton from "@/components/CopyButton";
import { formatDayLong, formatLocalTime, localDateKey } from "@/lib/time";

type Row = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  invites: { code: string; expires_at: string; used_at: string | null }[];
  devices: { id: string; created_at: string; last_seen_at: string | null; revoked_at: string | null; user_agent: string | null }[];
};

function phoneLabel(ua: string | null) {
  if (!ua) return "Phone";
  if (/iPhone/i.test(ua)) return "iPhone";
  const m = ua.match(/Android[^;)]*;\s*([^;)]+)/);
  return m ? m[1].replace(/Build.*/, "").trim() : /Android/i.test(ua) ? "Android phone" : "Phone";
}

const when = (iso: string) => `${formatDayLong(localDateKey(new Date(iso)))} ${formatLocalTime(new Date(iso))}`;

export default async function Staff() {
  const { data } = await db()
    .from("staff")
    .select("id, name, phone, active, invites (code, expires_at, used_at), devices (id, created_at, last_seen_at, revoked_at, user_agent)")
    .order("created_at");
  const rows = (data ?? []) as Row[];
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");

  return (
    <main>
      <h1>Staff</h1>
      <section className="card">
        <h2>Add staff member</h2>
        <form action={addStaff} className="inline-form">
          <input name="name" placeholder="Name" required />
          <input name="phone" placeholder="WhatsApp number (optional)" inputMode="tel" />
          <button className="primary-btn">Add and create access code</button>
        </form>
      </section>

      {rows.map((s) => {
        const invite = s.invites.find((i) => !i.used_at && new Date(i.expires_at) > new Date());
        const device = s.devices.find((d) => !d.revoked_at);
        const link = invite ? `${base}/join/${invite.code}` : "";
        const msg = invite
          ? `Hi ${s.name}, this is your link for the Verank feeding app: ${link}\nOpen it on your phone and tap "Link this phone". Your code is ${invite.code}.`
          : "";
        const wa = s.phone ? `https://wa.me/${s.phone.replace(/[^0-9]/g, "").replace(/^0/, "234")}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
        return (
          <section key={s.id} className={`card ${s.active ? "" : "inactive"}`}>
            <div className="staff-row-head">
              <h2>
                {s.name} {!s.active && <span className="pill">Access off</span>}
              </h2>
              <div className="muted small">{s.phone}</div>
            </div>
            <p className="small">
              {device ? (
                <>
                  Linked phone: <strong>{phoneLabel(device.user_agent)}</strong>, since {when(device.created_at)}
                  {device.last_seen_at ? `, last upload ${when(device.last_seen_at)}` : ""}
                </>
              ) : (
                <span className="muted">No phone linked.</span>
              )}
            </p>
            {s.active && invite && (
              <div className="invite">
                <div>
                  Access code <strong className="code">{invite.code}</strong> <span className="muted small">(single use, expires {formatDayLong(localDateKey(new Date(invite.expires_at)))})</span>
                </div>
                <div className="invite-actions">
                  <a className="primary-btn sm" href={wa} target="_blank" rel="noreferrer">
                    Send on WhatsApp
                  </a>
                  <CopyButton text={link} label="Copy link" />
                </div>
              </div>
            )}
            <div className="row-actions">
              {s.active && (
                <form action={regenerateInvite}>
                  <input type="hidden" name="staffId" value={s.id} />
                  <button className="link-btn">{device ? "New code (moves them to a new phone)" : "New access code"}</button>
                </form>
              )}
              {s.active && device && (
                <form action={unlinkPhone}>
                  <input type="hidden" name="staffId" value={s.id} />
                  <button className="link-btn">Unlink phone</button>
                </form>
              )}
              <form action={setActive}>
                <input type="hidden" name="staffId" value={s.id} />
                <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                <button className="link-btn danger">{s.active ? "Turn off access" : "Turn access back on"}</button>
              </form>
            </div>
          </section>
        );
      })}
    </main>
  );
}
