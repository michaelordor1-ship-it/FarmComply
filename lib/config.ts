// Farm settings. Change these to adjust the schedule or rules.

export type FeedConfig = {
  key: "am" | "pm";
  label: string; // shown in reports, e.g. "7am"
  time: string; // scheduled time, HH:MM local
  windowStart: string; // recordings from this local time...
  windowEnd: string; // ...up to (not including) this time count for this feed. May cross midnight.
};

export const FARM = {
  name: "Verank Farms",
  // Africa/Lagos is UTC+1 all year (no daylight saving)
  utcOffsetMinutes: 60,
  timezoneLabel: "WAT",
  feeds: [
    { key: "am", label: "7am", time: "07:00", windowStart: "04:00", windowEnd: "14:00" },
    { key: "pm", label: "7pm", time: "19:00", windowStart: "16:00", windowEnd: "02:00" },
  ] as FeedConfig[],
  onTimeMinutes: 30,
  targetPercent: 90,
  maxClipSeconds: 30,
  minClipSeconds: 3,
  // A device clock this far from server time gets flagged
  clockSkewFlagSeconds: 120,
  // A video uploaded this long after recording gets flagged
  lateUploadFlagHours: 3,
  inviteValidDays: 7,
  videoBucket: "feeding-videos",
};
