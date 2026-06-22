-- AI-generated fan polls for each upcoming Grand Prix.
alter table public.polls
  add column if not exists poll_kind text,
  add column if not exists generated_by_ai boolean not null default false,
  add column if not exists generated_at timestamptz;

do $$
begin
  alter table public.polls
    add constraint polls_poll_kind_check
    check (poll_kind is null or poll_kind in ('sport', 'strategy', 'fan'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists polls_ai_kind_per_race_idx
  on public.polls (race_id, poll_kind)
  where poll_kind is not null;

drop policy if exists "Public can read active polls" on public.polls;
create policy "Public can read published and closed polls" on public.polls
for select using (status in ('published', 'closed'));

drop policy if exists "Public can read poll options" on public.poll_options;
create policy "Public can read visible poll options" on public.poll_options
for select using (
  exists (
    select 1
    from public.polls
    where polls.id = poll_options.poll_id
      and polls.status in ('published', 'closed')
  )
);

drop policy if exists "Users can vote as themselves" on public.poll_votes;
create policy "Users can vote in open polls as themselves" on public.poll_votes
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.polls
    where polls.id = poll_votes.poll_id
      and polls.status = 'published'
      and (polls.closes_at is null or polls.closes_at > now())
  )
);
