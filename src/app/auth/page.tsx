import { Mail } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signInWithEmail } from "@/app/auth/actions";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  const { message, next } = await searchParams;

  return (
    <AppShell>
      <PageHeading
        badge="Вход"
        description="Отправим ссылку на почту. Пароль не нужен."
        title="Вернись к прогнозам и лигам"
      />

      <section className="grid gap-5 py-8 lg:grid-cols-[0.58fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail aria-hidden="true" data-icon="inline-start" />
              Почта для входа
            </CardTitle>
            <CardDescription>
              Ссылка действует ограниченное время и откроет RaceMate в этом браузере.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signInWithEmail} className="grid gap-3">
              <input name="next" type="hidden" value={next ?? "/onboarding"} />
              <label className="grid gap-2 text-sm font-medium" htmlFor="email">
                Email
                <input
                  className="min-h-11 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  id="email"
                  name="email"
                  placeholder="you@example.com"
                  required
                  type="email"
                />
              </label>
              {message ? (
                <p className="text-sm text-muted-foreground">
                  Не получилось отправить ссылку. Проверь почту и попробуй еще раз.
                </p>
              ) : null}
              <Button type="submit">Получить ссылку</Button>
            </form>
          </CardContent>
        </Card>

        <div className="rounded-lg border border-border/70 bg-card p-5">
          <h2 className="text-lg font-semibold">Что откроется после входа</h2>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
            <p>Личный прогноз на ближайший этап и история очков.</p>
            <p>Мини-лиги с друзьями и вступление по коду.</p>
            <p>Голосования и реакции к новостям.</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
