alter table public.predictions
  add column if not exists top_scoring_team_id uuid references public.teams(id) on delete set null,
  add column if not exists fastest_pit_stop_team_id uuid references public.teams(id) on delete set null;
