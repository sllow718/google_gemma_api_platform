begin;

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null,
  last_login_at timestamptz,
  is_active boolean not null default true,
  tier text not null default 'shared' check (tier in ('shared', 'byok')),
  total_call_count integer not null default 0,
  daily_call_count integer not null default 0,
  daily_call_reset_at date,
  refresh_token text,
  refresh_token_expires_at timestamptz,
  platform_api_key text
);

create unique index if not exists users_refresh_token_unique
  on public.users (refresh_token)
  where refresh_token is not null;

create unique index if not exists users_platform_api_key_unique
  on public.users (platform_api_key)
  where platform_api_key is not null;

create table if not exists public.user_api_keys (
  user_id uuid primary key references public.users (id) on delete cascade,
  encrypted_key text not null,
  iv text not null,
  key_hint text not null,
  created_at timestamptz not null,
  is_valid boolean not null default true
);

create table if not exists public.saved_apis (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  model text not null,
  temperature numeric,
  top_p numeric,
  top_k integer,
  max_output_tokens integer,
  stop_sequences jsonb not null default '[]'::jsonb,
  safety_settings jsonb not null default '[]'::jsonb,
  system_prompt text not null default '',
  call_count integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists saved_apis_user_id_idx
  on public.saved_apis (user_id);

create table if not exists public.call_logs (
  id uuid primary key,
  saved_api_id uuid not null references public.saved_apis (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  prompt text not null,
  response_text text not null,
  model text not null,
  prompt_token_count integer not null,
  response_token_count integer not null,
  total_token_count integer not null,
  finish_reason text not null,
  tier text not null check (tier in ('shared', 'byok')),
  latency_ms integer not null,
  created_at timestamptz not null
);

create index if not exists call_logs_saved_api_id_created_at_idx
  on public.call_logs (saved_api_id, created_at desc);

create index if not exists call_logs_user_id_idx
  on public.call_logs (user_id);

alter table public.users enable row level security;
alter table public.user_api_keys enable row level security;
alter table public.saved_apis enable row level security;
alter table public.call_logs enable row level security;

create or replace function public.increment_call_counts(p_user_id uuid, p_current_date date)
returns void
language plpgsql
as $$
begin
  update public.users
  set total_call_count = total_call_count + 1,
      daily_call_count = case
        when daily_call_reset_at = p_current_date then daily_call_count + 1
        else 1
      end,
      daily_call_reset_at = p_current_date
  where id = p_user_id;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.increment_api_call_count(p_api_id uuid)
returns void
language plpgsql
as $$
begin
  update public.saved_apis
  set call_count = call_count + 1
  where id = p_api_id;

  if not found then
    raise exception 'Saved API not found' using errcode = 'P0002';
  end if;
end;
$$;

commit;
