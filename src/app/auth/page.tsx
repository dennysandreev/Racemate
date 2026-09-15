import { KeyRound, UserPlus } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/racemate/app-shell";
import { AuthSubmitButton } from "@/components/racemate/auth-submit-button";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
  StitchSegmentedLinks,
} from "@/components/racemate/stitch-primitives";
import { TurnstileWidget } from "@/components/racemate/turnstile-widget";
import { Input } from "@/components/ui/input";
import {
  signInWithPassword,
  signUpWithPassword,
} from "@/app/auth/actions";

const authMessages: Record<string, string> = {
  "link-invalid": "Ссылка устарела или уже использована. Войди с паролем или запроси новую ссылку.",
  "login-failed": "Не получилось войти. Проверь почту и пароль.",
  "missing-credentials": "Заполни почту и пароль.",
  "password-mismatch": "Пароли не совпадают. Введи их ещё раз.",
  "password-too-short": "Пароль должен содержать не меньше 8 символов.",
  "required-consents": "Подтверди соглашение и согласие на обработку персональных данных.",
  "service-unavailable": "Вход временно недоступен. Попробуй ещё раз через несколько минут.",
  "signup-failed": "Не получилось создать аккаунт. Проверь данные или попробуй позже.",
};

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; mode?: string; next?: string }>;
}) {
  const { message, mode: requestedMode, next } = await searchParams;
  const mode = requestedMode === "signup" ? "signup" : "signin";
  const isSignup = mode === "signup";
  const messageCopy = message ? authMessages[message] : null;
  const fieldInvalid = Boolean(
    message &&
      [
        "login-failed",
        "missing-credentials",
        "password-mismatch",
        "password-too-short",
        "required-consents",
        "signup-failed",
      ].includes(message),
  );
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const encodedNext = encodeURIComponent(next ?? "/account");

  return (
    <AppShell hideAds>
      <PageHeading title={isSignup ? "Регистрация в RaceSide" : "Вход в RaceSide"} />

      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(22rem,0.58fr)]">
        <StitchPanel>
          <StitchPanelHeader
            icon={isSignup ? UserPlus : KeyRound}
            title={isSignup ? "Создать аккаунт" : "Войти с паролем"}
          />
          <div className="grid gap-5 p-5">
            <StitchSegmentedLinks
              className="w-full sm:w-fit"
              items={[
                {
                  active: !isSignup,
                  href: `/auth?next=${encodedNext}`,
                  label: "Вход",
                },
                {
                  active: isSignup,
                  href: `/auth?mode=signup&next=${encodedNext}`,
                  label: "Регистрация",
                },
              ]}
              linkClassName="flex-1 text-center sm:flex-none"
            />

            <form
              action={isSignup ? signUpWithPassword : signInWithPassword}
              className="grid gap-4"
            >
              <input name="next" type="hidden" value={next ?? "/account"} />
              <label className="grid gap-2 text-sm font-semibold" htmlFor="email">
                Почта
                <Input
                  aria-invalid={fieldInvalid}
                  autoComplete="email"
                  id="email"
                  name="email"
                  placeholder="name@example.com"
                  required
                  type="email"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold" htmlFor="password">
                Пароль
                <Input
                  aria-invalid={fieldInvalid}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  id="password"
                  minLength={isSignup ? 8 : undefined}
                  name="password"
                  required
                  type="password"
                />
                {isSignup ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    Не меньше 8 символов
                  </span>
                ) : null}
              </label>
              {isSignup ? (
                <>
                  <label
                    className="grid gap-2 text-sm font-semibold"
                    htmlFor="passwordConfirmation"
                  >
                    Повтори пароль
                    <Input
                      aria-invalid={fieldInvalid}
                      autoComplete="new-password"
                      id="passwordConfirmation"
                      minLength={8}
                      name="passwordConfirmation"
                      required
                      type="password"
                    />
                  </label>
                  <fieldset className="grid gap-3 rounded-md border border-border bg-muted/25 p-4">
                    <legend className="px-1 text-sm font-semibold">Согласия</legend>
                    <ConsentCheckbox id="acceptTerms" name="acceptTerms" required>
                      Принимаю <Link className="underline underline-offset-4 hover:text-foreground" href="/legal/terms">пользовательское соглашение</Link>
                    </ConsentCheckbox>
                    <ConsentCheckbox id="personalDataConsent" name="personalDataConsent" required>
                      Соглашаюсь на обработку персональных данных согласно <Link className="underline underline-offset-4 hover:text-foreground" href="/legal/privacy">политике конфиденциальности</Link>
                    </ConsentCheckbox>
                    <ConsentCheckbox id="marketingConsent" name="marketingConsent">
                      Хочу получать новости и предложения RaceSide
                    </ConsentCheckbox>
                  </fieldset>
                </>
              ) : null}
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
                  key={`${mode}:${message ?? "initial"}`}
                  siteKey={turnstileSiteKey}
                />
              ) : null}
              <AuthSubmitButton pendingLabel={isSignup ? "Создаём аккаунт…" : "Входим…"}>
                {isSignup ? "Создать аккаунт" : "Войти"}
              </AuthSubmitButton>
              {!isSignup ? (
                <Link
                  className="w-fit text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  href="/auth/forgot-password"
                >
                  Не помнишь пароль?
                </Link>
              ) : null}
            </form>
          </div>
        </StitchPanel>

        <aside className="grid content-start gap-4">
          <StitchMetric label="Способ входа" tone="red" value="Почта и пароль" />
        </aside>
      </section>
    </AppShell>
  );
}

function ConsentCheckbox({
  children,
  id,
  name,
  required = false,
}: {
  children: React.ReactNode;
  id: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-muted-foreground" htmlFor={id}>
      <input
        className="mt-0.5 size-4 shrink-0 accent-primary"
        id={id}
        name={name}
        required={required}
        type="checkbox"
      />
      <span>{children}</span>
    </label>
  );
}
