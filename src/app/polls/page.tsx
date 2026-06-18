import { BarChart3 } from "lucide-react";

import { votePoll } from "@/app/polls/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
  StitchProgressBar,
} from "@/components/racemate/stitch-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPolls } from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";

export default async function PollsPage({
  searchParams,
}: {
  searchParams: Promise<{ voted?: string }>;
}) {
  const { voted } = await searchParams;
  const user = await getSessionUser();
  const polls = await getPolls();

  return (
    <AppShell>
      <PageHeading title="Опросы" />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid gap-4 lg:grid-cols-2">
          {polls.map((poll) => (
          <Card className="overflow-hidden" key={poll.id ?? poll.question}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 aria-hidden="true" data-icon="inline-start" />
                {poll.question}
              </CardTitle>
              <CardDescription>
                {poll.votes ? `${poll.votes} голосов` : "Будь первым в этом опросе"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {poll.id && poll.options.every((option) => typeof option !== "string") ? (
                <form action={votePoll} className="grid gap-3">
                  <input name="pollId" type="hidden" value={poll.id} />
                  {poll.options.map((option) => (
                    <label
                      className="grid gap-2 rounded-md border border-border/70 bg-background/35 p-3 text-sm"
                      key={option.id}
                    >
                      <span className="flex min-h-6 items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <input
                            defaultChecked={poll.userVote === option.id}
                            disabled={Boolean(poll.userVote) || !user}
                            name="optionId"
                            type="radio"
                            value={option.id}
                          />
                          {option.label}
                        </span>
                        <Badge variant="secondary">{option.votes ?? 0}</Badge>
                      </span>
                      <StitchProgressBar
                        label="Доля голосов"
                        value={getVotePercent(option.votes ?? 0, poll.votes ?? 0)}
                      />
                    </label>
                  ))}
                  {poll.userVote ? (
                    <p className="text-sm text-muted-foreground">
                      Голос принят. Результаты обновятся после следующей загрузки.
                    </p>
                  ) : (
                    <Button disabled={!user} type="submit">
                      {user ? "Проголосовать" : "Войти, чтобы голосовать"}
                    </Button>
                  )}
                </form>
              ) : (
                <div className="grid gap-2">
                  {poll.options.map((option) => (
                    <StitchProgressBar key={String(option)} label={String(option)} value={0} />
                  ))}
                </div>
              )}
              {voted ? (
                <p className="mt-3 text-sm text-muted-foreground">Спасибо, голос записан.</p>
              ) : null}
            </CardContent>
          </Card>
          ))}
        </div>

        <aside className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StitchMetric label="Открыто" tone="live" value={String(polls.filter((poll) => poll.id).length)} />
            <StitchMetric label="Всего" value={String(polls.length)} />
          </div>
          <StitchPanel>
            <StitchPanelHeader icon={BarChart3} title="Недавние результаты" />
            <div className="grid gap-3 p-4">
              {polls.slice(0, 3).map((poll) => (
                <div className="rounded-md border border-border bg-background/35 p-3" key={`recent-${poll.id ?? poll.question}`}>
                  <p className="line-clamp-2 text-sm font-medium">{poll.question}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {poll.votes ? `${poll.votes} голосов` : "Опрос только стартовал"}
                  </p>
                </div>
              ))}
            </div>
          </StitchPanel>
        </aside>
      </section>
    </AppShell>
  );
}

function getVotePercent(votes: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((votes / total) * 100);
}
