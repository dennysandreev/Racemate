alter table public.predictions
  add column if not exists dnf_pick_kind text not null default 'driver',
  add column if not exists score_breakdown jsonb;

alter table public.predictions
  drop constraint if exists predictions_dnf_pick_kind_check;

alter table public.predictions
  add constraint predictions_dnf_pick_kind_check
  check (dnf_pick_kind in ('driver', 'none'));

update public.predictions
set dnf_pick_kind = 'driver'
where dnf_pick_kind is null;
