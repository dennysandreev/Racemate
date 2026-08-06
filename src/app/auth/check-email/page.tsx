import { MailCheck } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  StitchMetric,
  StitchPanel,
  StitchPanelHeader,
} from "@/components/racemate/stitch-primitives";
import { Button } from "@/components/ui/button";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const isSignup = type === "signup";

  return (
    <AppShell>
      <PageHeading title={isSignup ? "Подтверди почту" : "Письмо отправлено"} />
      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StitchPanel>
          <StitchPanelHeader
            icon={MailCheck}
            meta={
              isSignup
                ? "Ссылка для подтверждения уже в почте."
                : "Ссылка для смены пароля уже в почте."
            }
            title="Почти готово"
          />
          <div className="grid gap-4 p-5">
            <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">
              {isSignup
                ? "Открой письмо в этом браузере и перейди по ссылке, чтобы закончить регистрацию. Если письма нет, проверь спам."
                : "Если аккаунт с такой почтой есть, письмо придёт в ближайшее время. Открой его в этом браузере и перейди по ссылке."}
            </p>
            <Button asChild className="w-fit" variant="secondary">
              <Link href={isSignup ? "/auth" : "/auth/forgot-password"}>
                {isSignup ? "Вернуться ко входу" : "Отправить ещё раз"}
              </Link>
            </Button>
          </div>
        </StitchPanel>
        <StitchMetric label="Статус" tone="warning" value="Ожидаем переход" />
      </section>
    </AppShell>
  );
}
