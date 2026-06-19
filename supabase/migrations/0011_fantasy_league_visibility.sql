create or replace function public.is_league_member(target_league_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.prediction_league_members members
    where members.league_id = target_league_id
      and members.user_id = (select auth.uid())
  );
$$;

create or replace function public.shares_prediction_league(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.prediction_league_members viewer_membership
    join public.prediction_league_members author_membership
      on author_membership.league_id = viewer_membership.league_id
    where viewer_membership.user_id = (select auth.uid())
      and author_membership.user_id = target_user_id
  );
$$;

drop policy if exists "Users can read league members" on public.prediction_league_members;

create policy "League members can read league members"
on public.prediction_league_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_league_member(league_id)
  or exists (
    select 1
    from public.prediction_leagues leagues
    where leagues.id = prediction_league_members.league_id
      and (leagues.is_public = true or leagues.owner_user_id = (select auth.uid()))
  )
);

drop policy if exists "Users can read own predictions" on public.predictions;

create policy "League members can read shared predictions"
on public.predictions
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.shares_prediction_league(user_id)
);
