// Farm-wide settings. The feeding schedule itself is set by the admin in the app (Settings);
// DEFAULT_FEEDS is only used until the admin saves one.

export const FARM = {
  name: "Verank Farms",
  // Africa/Lagos is UTC+1 all year (no daylight saving)
  utcOffsetMinutes: 60,
  timezoneLabel: "WAT",
  defaultFeeds: [
    { time: "07:00", windowStart: "04:00", windowEnd: "14:00" },
    { time: "19:00", windowStart: "16:00", windowEnd: "02:00" },
  ],
  defaultOnTimeMinutes: 30,
  targetPercent: 90,
  maxClipSeconds: 60,
  // A video shorter than this does not count as a feed
  minCountedSeconds: 45,
  // A device clock this far from server time gets flagged
  clockSkewFlagSeconds: 120,
  // A video uploaded this long after recording gets flagged
  lateUploadFlagHours: 3,
  inviteValidDays: 7,
  videoBucket: "feeding-videos",
  // Videos older than this are deleted from storage; their records stay so reports are unchanged
  videoRetentionDays: 40,
};
