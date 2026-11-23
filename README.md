# Verank Feeding

Feeding compliance app for Verank Farms. Staff open the app and record a short video when they feed the fish. The app stamps the time, works out which feed it counts for, and gives the admin a compliance report for any period.

- **Staff app** (`/`): staff tap the batch they are feeding, then record. Records inside the app only (no gallery uploads), up to 60 seconds, about 4 MB at most per clip. Works offline: clips wait on the phone and upload when there is data.
- **Admin** (`/admin`): Today (per batch), Reports, Batches, Staff, Schedule.
- **Batches** (`/admin/batches`): add a batch by month and year (e.g. October 2026, with an optional label such as "Pond 2"); close it when harvested. Every open batch is expected at every feeding time.
- **Schedule** (`/admin/settings`): set any number of feeds a day (up to 8), each with its time and the window in which a video counts, plus the on-time allowance. Changes start from a chosen date; earlier days keep the schedule that was in force then.
- **Reports** (`/admin/reports`): a comparison of all batches for a period, and a full report per batch in the same layout as the paper-log report. "Save as PDF / Print" produces an A4 PDF.

## Rules

| Setting | Value |
| --- | --- |
| Default schedule (until the admin saves one) | 7am (videos 04:00 to 14:00) and 7pm (16:00 to 02:00), WAT |
| On time | within the allowance set on the Schedule page (default 30 minutes); off-schedule feeds still count as done |
| Missed | a feed with no video for that batch once its window has closed |
| Two videos for one feed and batch | counts once, credited to both staff |
| Batch | counted from its start date until its close date |

## How the time is proven

1. When recording starts and the phone has data, the server issues a signed timestamp. That becomes the recording time.
2. If the phone is offline, the app uses the phone's clock and corrects it at upload by comparing the phone clock to the server clock. These are flagged "recorded offline".
3. Flags shown in the report: phone clock more than 2 minutes off, upload more than 3 hours late, no GPS, very short clip, recorded outside both windows.

Each staff member is tied to one phone. A new access code moves them to a new phone and switches the old one off.

## Setup (about 15 minutes)

1. **Supabase**: create a project. In the SQL editor, run `supabase/schema.sql`. This creates the tables and a private `feeding-videos` bucket.
   - **Already ran schema.sql before batches existed?** Run `supabase/migrations/002_batches_and_schedule.sql` once instead.
2. **GitHub**: upload this folder to a new repo.
3. **Vercel**: import the repo and add these environment variables (see `.env.example`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase > Settings > API)
   - `ADMIN_PASSWORD`: the admin's login password
   - `SESSION_SECRET`: 64 random characters (`openssl rand -hex 32`)
   - `APP_URL`: the deployed URL, e.g. `https://verank-feeding.vercel.app`
4. Deploy, open `/admin` and sign in. Set the **Schedule**, add your **Batches**, then go to **Staff**, add each staff member and tap **Send on WhatsApp**.
5. Staff open the link on their phone, tap **Link this phone**, allow camera, microphone and location, then add the app to their home screen.
   - iPhone: add to Home Screen first, open the app from the home screen, then enter the code (iPhone keeps home screen apps separate from Safari).

The camera needs HTTPS, which Vercel provides.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
npm test                     # report logic tests (replays the paper log: 43% / 46% / 39% / weekly 21-64-50-36)
```

## Notes

- Storage: a 30-second clip is about 2 MB (4 MB at the 60-second limit). Each batch at 2 feeds a day adds roughly 120 to 240 MB a month. The Supabase free plan includes 1 GB, so with several batches plan to upgrade or delete old videos within a few months.
- The app proves which phone recorded a video, not who held it.
- Uploads only run while the app is open. Clips recorded offline stay on the phone until the app is opened with data.
