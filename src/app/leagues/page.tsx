import { Users } from "lucide-react";
import Link from "next/link";

import { createLeague, joinLeague } from "@/app/leagues/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { DataRow } from "@/components/racemate/data-row";
import { PageHeading } from "@/components/racemate/page-heading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLeagues } from "@/data/racemate-repository";
import { getSessionUser } from "@/lib/auth";

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; joined?: string; message?: string }>;
}) {
  const status = await searchParams;
  const user = await getSessionUser();
  const leagues = await getLeagues(user?.id);

  return (
    <AppShell>
      <PageHeading
        badge="Мини-лиги"
        description="Лиги превращают прогнозы в дружеское соревнование: приглашения, общий счет и лидерборд по этапам."
        title="Сравни прогнозы с друзьями, а не со всем интернетом"
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[0.7fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users aria-hidden="true" data-icon="inline-start" />
              Быстрый старт
            </CardTitle>
            <CardDescription>
              Создай лигу или войди по коду приглашения.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <form action={createLeague} className="grid gap-3">
              <label className="grid gap-2 text-sm font-medium" htmlFor="name">
                Название лиги
                <input
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  id="name"
                  name="name"
                  placeholder="Поздний пит-стоп"
                  required
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input name="isPublic" type="checkbox" />
                Показывать в общем списке
              </label>
              <Button disabled={!user} type="submit">
                {user ? "Создать лигу" : "Войти, чтобы создать"}
              </Button>
            </form>

            <form action={joinLeague} className="grid gap-3">
              <label className="grid gap-2 text-sm font-medium" htmlFor="inviteCode">
                Код приглашения
                <input
                  className="min-h-11 rounded-md border border-input bg-background px-3 font-mono text-sm uppercase outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  id="inviteCode"
                  name="inviteCode"
                  placeholder="RACE24"
                  required
                />
              </label>
              <Button disabled={!user} type="submit" variant="secondary">
                {user ? "Войти по коду" : "Войти, чтобы вступить"}
              </Button>
            </form>
            {status.created ? (
              <p className="text-sm text-muted-foreground">Лига создана.</p>
            ) : null}
            {status.joined ? (
              <p className="text-sm text-muted-foreground">Ты в лиге.</p>
            ) : null}
            {status.message ? (
              <p className="text-sm text-muted-foreground">
                Не получилось выполнить действие. Проверь данные и попробуй еще раз.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {leagues.map((league) => (
            <Card
              className="transition-colors hover:border-primary/60 hover:bg-accent/35"
              key={league.name}
            >
              <CardHeader>
                <CardTitle>
                  <Link
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={league.id ? `/fantasy/leagues/${league.id}` : "/fantasy?tab=leagues"}
                  >
                    {league.name}
                  </Link>
                </CardTitle>
                <CardDescription>
                  {league.members} участников, лидер — {league.leader}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataRow label="Очки лидера" value={String(league.score)} />
                {league.inviteCode ? (
                  <DataRow label="Код" value={league.inviteCode} />
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
