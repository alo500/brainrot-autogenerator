-- Run this in your Supabase SQL editor to set up the tables

create table if not exists video_jobs (
  id           uuid primary key,
  prompt       text not null,
  model        text not null check (model in ('kling', 'wan')),
  status       text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  video_url    text,
  thumbnail_url text,
  error        text,
  duration     integer,
  aspect_ratio text,
  template_id  uuid references video_templates(id),
  created_at   timestamptz default now(),
  completed_at timestamptz
);

create table if not exists video_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  prompt_template text not null,
  variables       jsonb default '{}',
  model           text not null default 'both',
  aspect_ratio    text not null default '9:16',
  duration        integer not null default 5,
  created_at      timestamptz default now()
);

-- Index for fast status queries
create index if not exists video_jobs_status_idx on video_jobs(status);
create index if not exists video_jobs_created_at_idx on video_jobs(created_at desc);
