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

-- ─── Scripts (single viral video) ────────────────────────

create table if not exists scripts (
  id         uuid primary key default gen_random_uuid(),
  topic      text not null,
  style      text not null default 'educational',
  hook       text,
  hashtags   text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists script_scenes (
  id            uuid primary key default gen_random_uuid(),
  script_id     uuid references scripts(id) on delete cascade,
  order_index   integer not null,
  narration     text not null,
  visual_prompt text not null,
  setting       text,
  duration      integer not null default 5,
  job_id        uuid references video_jobs(id)
);

create index if not exists script_scenes_script_id_idx on script_scenes(script_id);

-- ─── Series (multi-episode drama) ────────────────────────

create table if not exists series (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  genre         text not null,
  premise       text not null,
  world_context text,
  created_at    timestamptz default now()
);

create table if not exists characters (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid references series(id) on delete cascade,
  name        text not null,
  appearance  text not null,
  personality text not null,
  role        text not null,
  backstory   text,
  voice_style text not null default 'dramatic' check (voice_style in ('terse', 'dramatic', 'sarcastic', 'warm', 'cold', 'chaotic'))
);

create index if not exists characters_series_id_idx on characters(series_id);

create table if not exists episodes (
  id             uuid primary key default gen_random_uuid(),
  series_id      uuid references series(id) on delete cascade,
  episode_number integer not null,
  title          text not null,
  synopsis       text,
  cliffhanger    text,
  hashtags       text[] default '{}',
  status         text not null default 'scripted',
  created_at     timestamptz default now()
);

create index if not exists episodes_series_id_idx on episodes(series_id);

create table if not exists episode_scenes (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid references episodes(id) on delete cascade,
  order_index   integer not null,
  narration     text not null,
  visual_prompt text not null,
  setting       text,
  character_ids uuid[] default '{}',
  duration      integer not null default 5,
  job_id        uuid references video_jobs(id)
);

create index if not exists episode_scenes_episode_id_idx on episode_scenes(episode_id);
