import { fetchSchedules } from "@/lib/data";
import { scheduleFor, DEFAULT_SCHEDULE } from "@/lib/schedule";
import { formatDayLong, localDateKey } from "@/lib/time";
import ScheduleEditor from "@/components/ScheduleEditor";
import { deleteSchedule } from "../../actions";

export default async function Settings() {
  const today = localDateKey(new Date());
  const schedules = await fetchSchedules();
  const current = schedules.length ? scheduleFor(schedules, today) : DEFAULT_SCHEDULE;
  const upcoming = schedules.filter((s) => s.effectiveFrom > today);
  const latest = upcoming[upcoming.length - 1] ?? current;
  const describe = (s: typeof current) =>
    s.feeds.map((f) => `${f.label} (${f.windowStart} to ${f.windowEnd})`).join(", ") + `; on time within ${s.onTimeMinutes} min`;

  return (
    <main>
      <h1>Feeding schedule</h1>
      <section className="card">
        <h2>In force today</h2>
        <p>{describe(current)}</p>
        {!schedules.length && <p className="muted small">This is the default schedule. Save one below to make it your own.</p>}
        {upcoming.map((s) => (
          <div key={s.effectiveFrom} className="batch-row">
            <div>
              <strong>From {formatDayLong(s.effectiveFrom)}:</strong> {describe(s)}
            </div>
            <form action={deleteSchedule}>
              <input type="hidden" name="effectiveFrom" value={s.effectiveFrom} />
              <button className="link-btn danger">Cancel this change</button>
            </form>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Change the schedule</h2>
        <p className="muted small">
          Changes apply from the start date onwards. Reports for earlier days keep using the schedule that was in force at the time.
        </p>
        <ScheduleEditor
          initial={latest.feeds.map(({ time, windowStart, windowEnd }) => ({ time, windowStart, windowEnd }))}
          initialOnTime={latest.onTimeMinutes}
          today={today}
        />
      </section>

      {schedules.filter((s) => s.effectiveFrom <= today).length > 1 && (
        <section className="card">
          <h2>History</h2>
          {schedules
            .filter((s) => s.effectiveFrom <= today)
            .reverse()
            .map((s) => (
              <p key={s.effectiveFrom} className="small">
                <strong>From {formatDayLong(s.effectiveFrom)} {s.effectiveFrom.slice(0, 4)}:</strong> {describe(s)}
              </p>
            ))}
        </section>
      )}
    </main>
  );
}
