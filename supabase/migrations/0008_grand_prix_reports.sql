-- RaceMate Grand Prix reports.

create table if not exists public.grand_prix_reports (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  round integer not null,
  race_slug text not null unique,
  race_name text not null,
  circuit_name text,
  country text,
  race_date timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'collecting', 'processing', 'summary_pending', 'ready', 'partial', 'failed')),
  is_hidden boolean not null default false,
  source_updated_at timestamptz,
  generated_at timestamptz,
  summary_status text not null default 'pending'
    check (summary_status in ('pending', 'generated', 'edited', 'failed')),
  ai_summary text,
  weather jsonb not null default '{}'::jsonb,
  race_statistics jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  key_events jsonb not null default '[]'::jsonb,
  pit_stops jsonb not null default '[]'::jsonb,
  strategies jsonb not null default '[]'::jsonb,
  teammate_comparisons jsonb not null default '[]'::jsonb,
  highlights jsonb not null default '{}'::jsonb,
  championship_impact jsonb not null default '{}'::jsonb,
  source_errors jsonb not null default '{}'::jsonb,
  last_error text,
  refresh_stage integer not null default 0,
  next_refresh_at timestamptz,
  structured_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season, round)
);

create index if not exists idx_grand_prix_reports_public
on public.grand_prix_reports (is_hidden, status, race_date desc);

create index if not exists idx_grand_prix_reports_refresh
on public.grand_prix_reports (next_refresh_at)
where next_refresh_at is not null and status in ('ready', 'partial', 'summary_pending');

drop trigger if exists grand_prix_reports_touch_updated_at on public.grand_prix_reports;
create trigger grand_prix_reports_touch_updated_at
before update on public.grand_prix_reports
for each row execute function public.touch_updated_at();

alter table public.grand_prix_reports enable row level security;

drop policy if exists "Public can read visible grand prix reports" on public.grand_prix_reports;
create policy "Public can read visible grand prix reports" on public.grand_prix_reports
for select using (
  is_hidden = false
  and status in ('ready', 'partial')
);

drop policy if exists "Admins can manage grand prix reports" on public.grand_prix_reports;
create policy "Admins can manage grand prix reports" on public.grand_prix_reports
for all using (public.is_admin())
with check (public.is_admin());
