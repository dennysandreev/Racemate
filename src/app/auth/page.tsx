import { Mail } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Button } from "@/components/ui/button";
import { signInWithEmail } from "@/app/auth/actions";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; next?: string }>;
}) {
  const { message, next } = await searchParams;

  return (
    <AppShell>
      <PageHeading title="Вход в RaceMate" />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(22rem,0.58fr)]">
        <StitchPanel>
          <StitchPanelHeader
            icon={Mail}
            meta="Ссылка действует ограниченное время и откроет RaceMate в этом браузере."
            title="Почта для входа"
          />
          <div className="p-5">
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
              <Button type="submit">Отправить ссылку</Button>
            </form>
          </div>
        </StitchPanel>

        <aside className="grid content-start gap-4">
          <StitchMetric label="Доступ" tone="live" value="Без пароля" />
          <StitchPanel>
            <div className="p-5">
              <h2 className="font-display text-xl font-bold">Что откроется после входа</h2>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground">
                <p>Личный прогноз на ближайший этап и история очков.</p>
                <p>Мини-лиги с друзьями и вступление по коду.</p>
                <p>Голосования и реакции к новостям.</p>
              </div>
            </div>
          </StitchPanel>
        </aside>
      </section>
    </AppShell>
  );
}
