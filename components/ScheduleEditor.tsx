"use client";

import { useActionState, useState } from "react";
import { saveSchedule } from "@/app/admin/actions";
import { labelForTime, splitWindowsEvenly, suggestWindow, validateFeeds, type FeedInput } from "@/lib/schedule";

export default function ScheduleEditor({ initial, initialOnTime, today }: { initial: FeedInput[]; initialOnTime: number; today: string }) {
  const [feeds, setFeeds] = useState<FeedInput[]>(initial);
  const [onTime, setOnTime] = useState(initialOnTime);
  const [state, action, pending] = useActionState(saveSchedule, {});
  const problem = validateFeeds(feeds, onTime);

  const update = (i: number, key: keyof FeedInput, value: string) =>
    setFeeds((fs) => fs.map((f, j) => (j === i ? (key === "time" && f.time !== value ? { ...suggestWindow(value), time: value } : { ...f, [key]: value }) : f)));

  const add = () => {
    const used = new Set(feeds.map((f) => f.time));
    const candidate = ["12:00", "15:00", "10:00", "17:00", "09:00", "21:00", "05:00", "23:00"].find((t) => !used.has(t)) ?? "12:00";
    setFeeds((fs) => splitWindowsEvenly([...fs, suggestWindow(candidate)]));
  };

  return (
    <form action={action}>
      <input type="hidden" name="feeds" value={JSON.stringify(feeds)} />
      <table className="sched-table">
        <thead>
          <tr>
            <th>Feeding time</th>
            <th>Videos count from</th>
            <th>until</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {feeds.map((f, i) => (
            <tr key={i}>
              <td>
                <input type="time" value={f.time} onChange={(e) => update(i, "time", e.target.value)} required />
              </td>
              <td>
                <input type="time" value={f.windowStart} onChange={(e) => update(i, "windowStart", e.target.value)} required />
              </td>
              <td>
                <input type="time" value={f.windowEnd} onChange={(e) => update(i, "windowEnd", e.target.value)} required />
              </td>
              <td>
                {feeds.length > 1 && (
                  <button type="button" className="link-btn danger" onClick={() => setFeeds((fs) => splitWindowsEvenly(fs.filter((_, j) => j !== i)))}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="presets" style={{ marginTop: 0 }}>
        <button type="button" className="secondary-btn sm" onClick={add} disabled={feeds.length >= 8}>
          + Add a feeding time
        </button>
        <button type="button" className="secondary-btn sm" onClick={() => setFeeds((fs) => splitWindowsEvenly(fs))}>
          Split windows evenly
        </button>
      </div>
      <p className="muted small">
        Adding or removing a feed splits the windows evenly between feeds. Changing a time suggests 3 hours either side; adjust if needed. A window can run past midnight (for example 16:00 until 02:00).
      </p>

      <div className="field-row">
        <label>
          On time means within
          <input className="small-input" type="number" name="onTimeMinutes" min={5} max={180} value={onTime} onChange={(e) => setOnTime(Number(e.target.value))} />
          minutes
        </label>
        <label>
          Starts from
          <input type="date" name="effectiveFrom" defaultValue={today} min={today} />
        </label>
      </div>

      <p className="small">
        <strong>Summary:</strong> {feeds.length} feed{feeds.length === 1 ? "" : "s"} a day at {feeds.map((f) => labelForTime(f.time)).join(", ")}.
      </p>
      {problem && <p className="notice err">{problem}</p>}
      {state?.error && <p className="notice err">{state.error}</p>}
      {state?.ok && <p className="notice ok">Schedule saved.</p>}
      <button className="primary-btn" disabled={pending || !!problem}>
        {pending ? "Saving…" : "Save schedule"}
      </button>
    </form>
  );
}
