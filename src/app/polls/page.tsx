import { BarChart3 } from "lucide-react";

import { votePoll } from "@/app/polls/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
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
      <PageHeading
        badge="Опросы"
        description="Быстрые вопросы вокруг уикенда, новостей и формы команд."
        title="Сверь свою интуицию с остальными"
      />

      <section className="grid gap-5 py-8 lg:grid-cols-2">
        {polls.map((poll) => (
          <Card key={poll.id ?? poll.question}>
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
                      className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-border/70 px-3 text-sm"
                      key={option.id}
                    >
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
                    <Badge key={String(option)} variant="secondary">
                      {String(option)}
                    </Badge>
                  ))}
                </div>
              )}
              {voted ? (
                <p className="mt-3 text-sm text-muted-foreground">Спасибо, голос записан.</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>
    </AppShell>
  );
}
