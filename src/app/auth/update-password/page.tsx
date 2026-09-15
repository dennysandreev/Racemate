import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { updatePassword } from "@/app/auth/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { AuthSubmitButton } from "@/components/racemate/auth-submit-button";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSessionUser } from "@/lib/auth";

const updateMessages: Record<string, string> = {
  "missing-password": "Введи новый пароль дважды.",
  "password-mismatch": "Пароли не совпадают. Введи их ещё раз.",
  "password-too-short": "Пароль должен содержать не меньше 8 символов.",
  "service-unavailable": "Смена пароля временно недоступна. Попробуй ещё раз через несколько минут.",
  "update-failed": "Не получилось сохранить пароль. Запроси новую ссылку и попробуй ещё раз.",
};

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ message }, user] = await Promise.all([searchParams, getSessionUser()]);

  if (!user) {
    redirect("/auth/forgot-password?message=link-invalid");
  }

  const passwordUpdated = message === "password-updated";
  const messageCopy = message ? updateMessages[message] : null;

  return (
    <AppShell hideAds>
      <PageHeading title={passwordUpdated ? "Пароль сохранён" : "Новый пароль"} />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StitchPanel>
          <StitchPanelHeader
            icon={passwordUpdated ? ShieldCheck : KeyRound}
            meta={
              passwordUpdated
                ? "Теперь можно продолжить работу в RaceSide."
                : "Придумай новый пароль для входа в аккаунт."
            }
            title={passwordUpdated ? "Готово" : "Задать пароль"}
          />
          {passwordUpdated ? (
            <div className="grid gap-4 p-5">
              <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">
                Новый пароль уже действует. Текущая сессия останется открытой на этом устройстве.
              </p>
              <Button asChild className="w-fit">
                <Link href="/account">Перейти в профиль</Link>
              </Button>
            </div>
          ) : (
            <form action={updatePassword} className="grid gap-4 p-5">
              <label className="grid gap-2 text-sm font-semibold" htmlFor="password">
                Новый пароль
                <Input
                  aria-invalid={Boolean(messageCopy)}
                  autoComplete="new-password"
                  id="password"
                  minLength={8}
                  name="password"
                  required
                  type="password"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Не меньше 8 символов
                </span>
              </label>
              <label
                className="grid gap-2 text-sm font-semibold"
                htmlFor="passwordConfirmation"
              >
                Повтори пароль
                <Input
                  aria-invalid={Boolean(messageCopy)}
                  autoComplete="new-password"
                  id="passwordConfirmation"
                  minLength={8}
                  name="passwordConfirmation"
                  required
                  type="password"
                />
              </label>
              {messageCopy ? (
                <p
                  className="rounded-md border border-danger/35 bg-danger/10 px-3 py-2.5 text-sm leading-6 text-danger"
                  role="alert"
                >
                  {messageCopy}
                </p>
              ) : null}
              <AuthSubmitButton pendingLabel="Сохраняем…">
                Сохранить пароль
              </AuthSubmitButton>
            </form>
          )}
        </StitchPanel>

        <StitchMetric
          label="Статус"
          tone={passwordUpdated ? "live" : "warning"}
          value={passwordUpdated ? "Пароль обновлён" : "Ожидаем новый пароль"}
        />
      </section>
    </AppShell>
  );
}
