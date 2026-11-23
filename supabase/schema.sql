-- Verank Farms feeding compliance app
-- Run this once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One-time access codes the admin sends to a staff member
create table if not exists invites (
  code text primary key,
  staff_id uuid not null references staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- The phone a staff member is linked to. Only one active device per staff member.
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

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

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  device_id uuid references devices(id),
  batch_id uuid references batches(id),
  -- Id the phone gives the clip, so a retried upload isn't counted twice
  client_clip_id text unique,
  status text not null default 'pending' check (status in ('pending', 'uploaded')),
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  -- Best estimate of when the video was recorded (server time)
  recorded_at timestamptz not null,
  -- How recorded_at was established: 'server_ticket' (online at recording) or 'device_clock' (offline, corrected)
  time_source text not null,
  device_recorded_at timestamptz not null,
  clock_skew_seconds integer not null default 0,
  uploaded_at timestamptz,
  latitude double precision,
  longitude double precision,
  location_accuracy_m double precision,
  flags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists recordings_recorded_at_idx on recordings (recorded_at);
create index if not exists recordings_staff_idx on recordings (staff_id);
create index if not exists recordings_batch_idx on recordings (batch_id);

-- Lock the tables down: the app only talks to them from the server with the service role key.
alter table staff enable row level security;
alter table invites enable row level security;
alter table devices enable row level security;
alter table recordings enable row level security;
alter table batches enable row level security;
alter table schedules enable row level security;

-- Private bucket for feeding videos
insert into storage.buckets (id, name, public)
values ('feeding-videos', 'feeding-videos', false)
on conflict (id) do nothing;
