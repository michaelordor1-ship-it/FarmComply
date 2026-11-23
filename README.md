# Verank Feeding

Feeding compliance app for Verank Farms. Staff open the app and record a short video when they feed the fish. The app stamps the time, works out which feed it counts for, and gives the admin a compliance report for any period.

- **Staff app** (`/`): one big "Record feeding" button. Records inside the app only (no gallery uploads), up to 30 seconds, about 2 MB per clip. Works offline: clips wait on the phone and upload when there is data.
- **Admin** (`/admin`): today's feeds, recent videos, staff access, and reports.
- **Report** (`/admin/reports`): same layout as the paper-log report. Headline numbers, key findings, daily map, overall performance, weekly trend, timing, per-staff table, recommendations and the full log with video links. "Save as PDF / Print" produces an A4 PDF.

## Rules (edit in `lib/config.ts`)

| Setting | Value |
| --- | --- |
| Feeds | 7am and 7pm (WAT, UTC+1) |
| Counts for 7am | videos from 04:00 to 14:00 |
| Counts for 7pm | videos from 16:00 to 02:00 (after midnight counts for the previous day) |
| On time | within 30 minutes; off-schedule feeds still count as done |
| Missed | a feed with no video once its window has closed |
| Two videos for one feed | counts once for the farm, credited to both staff |

## How the time is proven

1. When recording starts and the phone has data, the server issues a signed timestamp. That becomes the recording time.
2. If the phone is offline, the app uses the phone's clock and corrects it at upload by comparing the phone clock to the server clock. These are flagged "recorded offline".
3. Flags shown in the report: phone clock more than 2 minutes off, upload more than 3 hours late, no GPS, very short clip, recorded outside both windows.

Each staff member is tied to one phone. A new access code moves them to a new phone and switches the old one off.

## Setup (about 15 minutes)

1. **Supabase**: create a project. In the SQL editor, run `supabase/schema.sql`. This creates the tables and a private `feeding-videos` bucket.
2. **GitHub**: upload this folder to a new repo.
3. **Vercel**: import the repo and add these environment variables (see `.env.example`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase > Settings > API)
   - `ADMIN_PASSWORD`: the admin's login password
   - `SESSION_SECRET`: 64 random characters (`openssl rand -hex 32`)
   - `APP_URL`: the deployed URL, e.g. `https://verank-feeding.vercel.app`
4. Deploy, open `/admin`, sign in, go to **Staff**, add each staff member and tap **Send on WhatsApp**.
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

- Storage: about 2 MB per clip, so 2 feeds a day is roughly 120 MB a month. The Supabase free plan includes 1 GB; delete old videos from the bucket (or upgrade) after about 8 months.
- The app proves which phone recorded a video, not who held it.
- Uploads only run while the app is open. Clips recorded offline stay on the phone until the app is opened with data.
