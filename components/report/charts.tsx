import type { DayRow, ReportData, Slot } from "@/lib/report";
import { FARM } from "@/lib/config";
import type { FeedConfig } from "@/lib/schedule";
import { formatDay, formatDayLong, formatDeviation, formatLocalTime } from "@/lib/time";

// Colors: categorical series for the two feeds, reserved status colors for slot outcomes
// Categorical order for feeds (fixed, never cycled past 8: a schedule allows at most 8 feeds)
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export const C = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
  pending: "#c9ccd1",
  ink: "#0b0b0b",
  ink2: "#52514e",
  grid: "#e4e4e0",
  surface: "#ffffff",
};

export function feedColor(feedList: FeedConfig[], key: string): string {
  const i = feedList.findIndex((f) => f.key === key);
  return SERIES[Math.max(i, 0) % SERIES.length];
}

function slotLook(s: Slot): { fill: string; glyph: string; text: string } {
  if (s.status === "pending") return { fill: C.pending, glyph: "·", text: "not due yet" };
  if (s.status === "missed") return { fill: C.critical, glyph: "✕", text: "no video" };
  if (!s.first) return { fill: C.pending, glyph: "·", text: "" };
  const t = s.first!;
  const who = s.recordings.length > 1 ? `${t.staffName} +${s.recordings.length - 1}` : t.staffName;
  if (t.timing === "on_time") return { fill: C.good, glyph: "✓", text: `${formatLocalTime(t.recordedAt)} by ${who}` };
  return { fill: C.warning, glyph: "!", text: `${formatLocalTime(t.recordedAt)} by ${who} (${formatDeviation(t.deviationMinutes)})` };
}

export function Legend({ items }: { items: { color: string; label: string; glyph?: string }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label} className="legend-item">
          <span className="legend-swatch" style={{ background: i.color }}>
            {i.glyph}
          </span>
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Calendar grid: one cell per day, left half = first feed, right half = second feed. */
export function ComplianceMap({ days }: { days: DayRow[] }) {
  const cols = 7;
  const cw = 98;
  const ch = 54;
  const gap = 6;
  const rows = Math.ceil(days.length / cols);
  const W = cols * cw + (cols - 1) * gap;
  const H = rows * (ch + 18) + 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Daily compliance map">
      {days.map((d, i) => {
        const x = (i % cols) * (cw + gap);
        const y = Math.floor(i / cols) * (ch + 18);
        const n = Math.max(d.slots.length, 1);
        const half = (cw - 2 * (n - 1)) / n;
        return (
          <g key={d.dateKey}>
            <text x={x} y={y + 12} fontSize="11" fill={C.ink2}>
              {formatDayLong(d.dateKey)}
            </text>
            {d.slots.map((s, j) => {
              const look = slotLook(s);
              const sx = x + j * (half + 2);
              return (
                <g key={s.feed.key}>
                  <title>{`${formatDayLong(d.dateKey)} ${s.feed.label}: ${look.text}`}</title>
                  <rect x={sx} y={y + 17} width={half} height={ch - 20} rx="4" fill={look.fill} />
                  {n <= 3 && (
                    <text x={sx + 4} y={y + 30} fontSize={n === 3 ? 8 : 9} fill="#fff" fontWeight="600">
                      {s.feed.label}
                    </text>
                  )}
                  <text x={sx + half / 2} y={y + 46} fontSize="13" fill="#fff" textAnchor="middle" fontWeight="700">
                    {look.glyph}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Day completeness as one 100% bar plus a logged/missed bar per feed. */
export function OverallChart({ r }: { r: ReportData }) {
  const W = 700;
  const labelW = 150;
  const barW = W - labelW - 60;
  const rows: { label: string; segs: { v: number; color: string; name: string }[]; total: number }[] = [
    {
      label: `Days (${r.daysCounted})`,
      total: r.daysCounted,
      segs: [
        { v: r.daysAll, color: C.good, name: "complete" },
        { v: r.daysSome, color: C.warning, name: "partial" },
        { v: r.daysNone, color: C.critical, name: "nothing" },
      ],
    },
    ...r.feeds.map((f) => ({
      label: `${f.feed.label} feed (${f.due})`,
      total: f.due,
      segs: [
        { v: f.onTime, color: C.good, name: "on time" },
        { v: f.late + f.early, color: C.warning, name: "off schedule" },
        { v: f.due - f.logged, color: C.critical, name: "missed" },
      ],
    })),
  ];
  const rowH = 46;
  return (
    <svg viewBox={`0 0 ${W} ${rows.length * rowH + 6}`} className="chart" role="img" aria-label="Overall performance">
      {rows.map((row, i) => {
        let x = labelW;
        const y = i * rowH + 8;
        return (
          <g key={row.label}>
            <text x={0} y={y + 18} fontSize="13" fill={C.ink}>
              {row.label}
            </text>
            {row.segs.map((s) => {
              if (!s.v || !row.total) return null;
              const w = (s.v / row.total) * barW;
              const el = (
                <g key={s.name}>
                  <title>{`${row.label}: ${s.v} ${s.name}`}</title>
                  <rect x={x} y={y} width={Math.max(w - 2, 1)} height={26} rx="4" fill={s.color} />
                  {w > 70 && (
                    <text x={x + 8} y={y + 17} fontSize="11" fill="#fff" fontWeight="600">
                      {s.v} {s.name}
                    </text>
                  )}
                  {w <= 70 && w > 18 && (
                    <text x={x + 6} y={y + 17} fontSize="11" fill="#fff" fontWeight="600">
                      {s.v}
                    </text>
                  )}
                </g>
              );
              x += w;
              return el;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Weekly compliance per feed: grouped bars with direct % labels. */
export function WeeklyChart({ r }: { r: ReportData }) {
  const W = 700;
  const H = 230;
  const top = 26;
  const bottom = 40;
  const left = 36;
  const plotH = H - top - bottom;
  const groupW = (W - left) / Math.max(r.weeks.length, 1);
  const barW = Math.max(6, Math.min(44, (groupW - 30) / Math.max(r.feedList.length, 1)));
  const yOf = (p: number) => top + plotH - (p / 100) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Weekly trend">
      {[0, 50, 100].map((t) => (
        <g key={t}>
          <line x1={left} x2={W} y1={yOf(t)} y2={yOf(t)} stroke={C.grid} />
          <text x={left - 6} y={yOf(t) + 4} fontSize="10" fill={C.ink2} textAnchor="end">
            {t}%
          </text>
        </g>
      ))}
      <line x1={left} x2={W} y1={yOf(FARM.targetPercent)} y2={yOf(FARM.targetPercent)} stroke={C.ink2} strokeDasharray="4 4" />
      <text x={W} y={yOf(FARM.targetPercent) - 4} fontSize="10" fill={C.ink2} textAnchor="end">
        target {FARM.targetPercent}%
      </text>
      {r.weeks.map((w, i) => {
        const gx = left + i * groupW + (groupW - barW * w.perFeed.length - 2) / 2;
        return (
          <g key={w.index}>
            {w.perFeed.map((p, j) => {
              const x = gx + j * (barW + 2);
              const y = yOf(p.percent);
              const label = r.feedList.find((f) => f.key === p.key)!.label;
              return (
                <g key={p.key}>
                  <title>{`Week ${w.index} ${label}: ${p.logged} of ${p.due} (${p.percent}%)`}</title>
                  <rect x={x} y={Math.min(y, yOf(0) - 2)} width={barW} height={Math.max(yOf(0) - y, 2)} rx="4" fill={feedColor(r.feedList, p.key)} />
                  <text x={x + barW / 2} y={Math.min(y, yOf(0) - 2) - 5} fontSize="11" fill={C.ink} textAnchor="middle">
                    {p.percent}%
                  </text>
                </g>
              );
            })}
            <text x={left + i * groupW + groupW / 2} y={H - 22} fontSize="11" fill={C.ink} textAnchor="middle" fontWeight="600">
              Week {w.index}: {w.percent}%
            </text>
            <text x={left + i * groupW + groupW / 2} y={H - 8} fontSize="10" fill={C.ink2} textAnchor="middle">
              {formatDay(w.from)} to {formatDay(w.to)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Minutes early/late against schedule for every counted feed. */
export function TimingChart({ r }: { r: ReportData }) {
  const W = 700;
  const H = 240;
  const left = 64;
  const top = 14;
  const bottom = 30;
  const plotH = H - top - bottom;
  const pts = r.days.flatMap((d, i) => d.slots.filter((s) => s.first).map((s) => ({ i, s, dev: s.first!.deviationMinutes })));
  const maxDev = Math.max(90, ...pts.map((p) => p.dev));
  const minDev = Math.min(-60, ...pts.map((p) => p.dev));
  const yOf = (m: number) => top + ((maxDev - m) / (maxDev - minDev)) * plotH;
  const step = (W - left - 10) / Math.max(r.days.length, 1);
  const xOf = (i: number) => left + step * (i + 0.5);
  const ticks = [minDev, 0, maxDev].map((t) => Math.round(t / 30) * 30);
  const uniq = [...new Set([...ticks, -r.onTimeMinutes, r.onTimeMinutes])].filter((t) => t >= minDev && t <= maxDev);
  const lbl = (t: number) => (t === 0 ? "on time" : `${t > 0 ? "+" : ""}${Math.abs(t) >= 60 ? `${(t / 60).toFixed(t % 60 ? 1 : 0)}h` : `${t}m`}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Timing against schedule">
      <rect x={left} width={W - left - 10} y={yOf(r.onTimeMinutes)} height={yOf(-r.onTimeMinutes) - yOf(r.onTimeMinutes)} fill="#0ca30c" opacity="0.08" />
      {uniq.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - 10} y1={yOf(t)} y2={yOf(t)} stroke={t === 0 ? C.ink2 : C.grid} />
          <text x={left - 6} y={yOf(t) + 4} fontSize="10" fill={C.ink2} textAnchor="end">
            {lbl(t)}
          </text>
        </g>
      ))}
      {r.days.map((d, i) =>
        i % 7 === 0 ? (
          <text key={d.dateKey} x={xOf(i)} y={H - 10} fontSize="10" fill={C.ink2} textAnchor="middle">
            {formatDay(d.dateKey)}
          </text>
        ) : null,
      )}
      {pts.map(({ i, s, dev }) => (
        <g key={`${s.dateKey}${s.feed.key}`}>
          <title>{`${formatDayLong(s.dateKey)} ${s.feed.label}: ${formatLocalTime(s.first!.recordedAt)} (${formatDeviation(dev)})`}</title>
          <circle
            cx={xOf(i) + (r.feedList.findIndex((f) => f.key === s.feed.key) - (r.feedList.length - 1) / 2) * 3}
            cy={yOf(dev)}
            r="5"
            fill={feedColor(r.feedList, s.feed.key)}
            stroke="#fff"
            strokeWidth="2"
          />
        </g>
      ))}
    </svg>
  );
}
