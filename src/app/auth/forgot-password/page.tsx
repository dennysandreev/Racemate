import { MailQuestion } from "lucide-react";
import Link from "next/link";

import { requestPasswordReset } from "@/app/auth/actions";
import { AppShell } from "@/components/racemate/app-shell";
import { AuthSubmitButton } from "@/components/racemate/auth-submit-button";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { TurnstileWidget } from "@/components/racemate/turnstile-widget";
import { Input } from "@/components/ui/input";

const recoveryMessages: Record<string, string> = {
  "link-invalid": "Ссылка устарела или уже использована. Отправь новое письмо.",
  "missing-email": "Укажи почту, с которой входишь в RaceSide.",
  "send-failed": "Не получилось отправить письмо. Попробуй ещё раз немного позже.",
  "service-unavailable": "Восстановление временно недоступно. Попробуй ещё раз через несколько минут.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const messageCopy = message ? recoveryMessages[message] : null;
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <AppShell>
      <PageHeading title="Восстановление доступа" />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StitchPanel>
          <StitchPanelHeader
            icon={MailQuestion}
            meta="Пришлём ссылку, по которой можно задать новый пароль."
            title="Сбросить пароль"
          />
          <form action={requestPasswordReset} className="grid gap-4 p-5">
            <label className="grid gap-2 text-sm font-semibold" htmlFor="email">
              Почта
              <Input
                aria-invalid={Boolean(messageCopy)}
                autoComplete="email"
                id="email"
                name="email"
                placeholder="name@example.com"
                required
                type="email"
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
            {turnstileSiteKey ? (
              <TurnstileWidget
                key={message ?? "initial"}
                siteKey={turnstileSiteKey}
              />
            ) : null}
            <AuthSubmitButton pendingLabel="Отправляем…">
              Отправить письмо
            </AuthSubmitButton>
            <Link
              className="w-fit text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              href="/auth"
            >
              Вернуться ко входу
            </Link>
          </form>
        </StitchPanel>

        <StitchMetric label="Безопасность" tone="warning" value="Ссылка одноразовая" />
      </section>
    </AppShell>
  );
}
