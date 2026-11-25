-- Run once in the Supabase SQL editor. Safe to run more than once.
-- Marks recordings whose video file was deleted after the retention period (records are kept).
alter table recordings add column if not exists video_deleted_at timestamptz;
create index if not exists recordings_cleanup_idx on recordings (recorded_at) where video_deleted_at is null;
