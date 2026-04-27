begin;

-- Allow Google-only accounts that have no password
alter table public.users alter column password_hash drop not null;

-- Store Google's stable user ID for OAuth lookup
alter table public.users add column if not exists google_id text;
create unique index if not exists users_google_id_unique
  on public.users (google_id)
  where google_id is not null;

commit;
