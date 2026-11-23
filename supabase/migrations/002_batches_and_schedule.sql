-- Run this once in the Supabase SQL editor if you already ran schema.sql before batches were added.
-- Safe to run more than once.

-- Fish batches, named by stocking month (e.g. October 2026)
create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  month date not null,             -- first day of the batch month
  active_from date not null,       -- first day feeds are expected (farm-local date)
  closed_on date,                  -- last day feeds are expected (set when harvested)
  created_at timestamptz not null default now()
);

-- Feeding schedule history. The row with the latest effective_from on or before a date applies to that date.
create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  feeds jsonb not null,            -- [{ "time": "07:00", "windowStart": "04:00", "windowEnd": "14:00" }, ...]
  on_time_minutes integer not null default 30,
  created_at timestamptz not null default now()
);

alter table recordings add column if not exists batch_id uuid references batches(id);
create index if not exists recordings_batch_idx on recordings (batch_id);

alter table batches enable row level security;
alter table schedules enable row level security;
