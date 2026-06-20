-- Keep current favorites deterministic before enforcing the product limits.
with ranked_teams as (
  select
    ctid,
    row_number() over (partition by user_id order by created_at asc, team_id asc) as position
  from public.user_favorite_teams
)
delete from public.user_favorite_teams
where ctid in (select ctid from ranked_teams where position > 1);

with ranked_drivers as (
  select
    ctid,
    row_number() over (partition by user_id order by created_at asc, driver_id asc) as position
  from public.user_favorite_drivers
)
delete from public.user_favorite_drivers
where ctid in (select ctid from ranked_drivers where position > 2);

create unique index if not exists user_favorite_teams_one_per_user_idx
  on public.user_favorite_teams (user_id);

create or replace function public.enforce_favorite_driver_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  if (
    select count(*)
    from public.user_favorite_drivers
    where user_id = new.user_id
  ) >= 2 then
    raise exception 'A user can have at most two favorite drivers'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_favorite_driver_limit on public.user_favorite_drivers;

create trigger enforce_favorite_driver_limit
before insert on public.user_favorite_drivers
for each row
execute function public.enforce_favorite_driver_limit();
