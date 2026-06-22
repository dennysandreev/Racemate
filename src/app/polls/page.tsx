import { BarChart3, CalendarDays, History, Trophy } from "lucide-react";
import Link from "next/link";

import { votePoll } from "@/app/polls/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPolls } from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { PollSummary } from "@/types/racemate";

type PollView = "active" | "archive";

export default async function PollsPage({
  searchParams,
}: {
  searchParams: Promise<{ voted?: string; error?: string; view?: PollView }>;
}) {
  const search = await searchParams;
  const view: PollView = search.view === "archive" ? "archive" : "active";
  const [user, polls] = await Promise.all([getSessionUser(), getPolls({ view })]);
  const groups = groupPollsByRace(polls);

  return (
    <AppShell>
      <section className="grid gap-5 py-6">
        <PageHeading title="Опросы" />

        <nav aria-label="Режим опросов" className="flex w-full border-b stitch-divider">
          <PollTab active={view === "active"} href="/polls" icon={BarChart3} label="Текущие" />
          <PollTab active={view === "archive"} href="/polls?view=archive" icon={History} label="Архив" />
        </nav>

        {search.voted ? <Notice tone="success">Голос учтен</Notice> : null}
        {search.error === "closed" ? <Notice tone="warning">Этот опрос уже завершен</Notice> : null}
        {search.error === "already-voted" ? <Notice tone="warning">Ты уже проголосовал в этом опросе</Notice> : null}
        {search.error === "vote" ? <Notice tone="warning">Не удалось сохранить голос. Попробуй еще раз.</Notice> : null}

        {groups.length ? (
          <div className="grid gap-8">
            {groups.map((group) => (
              <section className="grid gap-4" key={group.key}>
                <PollGroupHeader group={group} isArchive={view === "archive"} />
                <div className="grid gap-4 xl:grid-cols-3">
                  {group.polls.map((poll) => (
                    <PollCard
                      archived={view === "archive"}
                      key={poll.id ?? poll.question}
                      poll={poll}
                      userSignedIn={Boolean(user)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyPolls archive={view === "archive"} />
        )}
      </section>
    </AppShell>
  );
}

function PollTab({
  active,
  href,
  icon: Icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: typeof BarChart3;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
      href={href}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}

function PollGroupHeader({
  group,
  isArchive,
}: {
  group: ReturnType<typeof groupPollsByRace>[number];
  isArchive: boolean;
}) {
  const race = group.polls[0]?.race;

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="font-telemetry text-xs font-bold uppercase tracking-[0.1em] text-primary">
          {isArchive ? "Прошедший этап" : "Следующий этап"}
        </p>
        <h2 className="mt-2 font-display text-balance text-2xl font-bold sm:text-3xl">
          {race?.name ?? "Опросы RaceMate"}
        </h2>
        {race ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-4" />
            {race.country} · {race.circuit} · раунд {race.round}
          </p>
        ) : null}
      </div>
      {isArchive ? <Badge variant="secondary">Результаты</Badge> : <Badge variant="success">Голосование открыто</Badge>}
    </div>
  );
}

function PollCard({
  archived,
  poll,
  userSignedIn,
}: {
  archived: boolean;
  poll: PollSummary;
  userSignedIn: boolean;
}) {
  const options = poll.options.filter((option): option is { id: string; label: string; votes?: number } =>
    typeof option !== "string",
  );
  const isClosed = archived || poll.status === "closed";
  const kind = pollKindLabel(poll.kind);

  return (
    <article className="stitch-panel grid min-w-0 content-start gap-5 p-5">
      <div className="flex items-start justify-between gap-4">
        <Badge variant={kind.variant}>{kind.label}</Badge>
        <span className="font-telemetry text-xs font-bold text-muted-foreground">
          {poll.votes ? `${poll.votes} голосов` : "Новый опрос"}
        </span>
      </div>
      <h3 className="text-balance font-display text-xl font-bold leading-tight">{poll.question}</h3>

      <form action={votePoll} className="grid gap-3">
        <input name="pollId" type="hidden" value={poll.id ?? ""} />
        {options.map((option) => {
          const percent = getVotePercent(option.votes ?? 0, poll.votes);

          return (
            <label
              className={cn(
                "relative grid min-h-12 cursor-pointer overflow-hidden rounded-md border border-border bg-background/45 px-3 py-2 transition-colors hover:border-primary/60",
                (isClosed || Boolean(poll.userVote) || !userSignedIn) && "cursor-default",
              )}
              key={option.id}
            >
              {isClosed || poll.userVote ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-primary/13"
                  style={{ width: `${percent}%` }}
                />
              ) : null}
              <span className="relative flex min-h-6 items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    defaultChecked={poll.userVote === option.id}
                    disabled={isClosed || Boolean(poll.userVote) || !userSignedIn}
                    name="optionId"
                    type="radio"
                    value={option.id}
                  />
                  <span className="min-w-0">{option.label}</span>
                </span>
                {isClosed || poll.userVote ? (
                  <span className="font-telemetry shrink-0 text-xs font-bold text-muted-foreground">{percent}%</span>
                ) : null}
              </span>
            </label>
          );
        })}
        {!isClosed && poll.id && options.length === 3 ? (
          poll.userVote ? (
            <p className="text-sm text-muted-foreground">Твой голос сохранен</p>
          ) : (
            <Button disabled={!userSignedIn} type="submit" variant="secondary">
              {userSignedIn ? "Проголосовать" : "Войти, чтобы голосовать"}
            </Button>
          )
        ) : null}
      </form>
    </article>
  );
}

function EmptyPolls({ archive }: { archive: boolean }) {
  return (
    <section className="stitch-panel grid min-h-56 place-items-center p-6 text-center">
      <div className="max-w-md">
        <Trophy aria-hidden="true" className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 font-display text-2xl font-bold">
          {archive ? "Архив пока пуст" : "Опросы скоро появятся"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {archive
            ? "Здесь будут результаты фанатских опросов после завершения этапов."
            : "RaceMate подготовит три опроса для следующего Гран-при, как только появятся подтвержденные результаты предыдущей гонки."}
        </p>
      </div>
    </section>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "success" | "warning" }) {
  return (
    <p className={cn("rounded-md border px-4 py-3 text-sm", tone === "success" ? "border-success/40 bg-success/10 text-foreground" : "border-warning/40 bg-warning/10 text-foreground")}>
      {children}
    </p>
  );
}

function groupPollsByRace(polls: PollSummary[]) {
  const groups = new Map<string, PollSummary[]>();

  for (const poll of polls) {
    const key = poll.race?.id ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), poll]);
  }

  return [...groups.entries()].map(([key, items]) => ({ key, polls: items }));
}

function pollKindLabel(kind: PollSummary["kind"]) {
  switch (kind) {
    case "sport":
      return { label: "Спорт", variant: "danger" as const };
    case "strategy":
      return { label: "Стратегия", variant: "warning" as const };
    case "fan":
      return { label: "Интрига", variant: "secondary" as const };
    default:
      return { label: "Опрос", variant: "secondary" as const };
  }
}

function getVotePercent(votes: number, total: number) {
  return total ? Math.round((votes / total) * 100) : 0;
}
