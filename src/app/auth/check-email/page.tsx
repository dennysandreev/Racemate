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

export default async function CheckEmailPage() {
  return (
    <AppShell>
      <PageHeading title="Письмо отправлено" />
      <section className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StitchPanel>
          <StitchPanelHeader
            icon={MailCheck}
            meta="Ссылка для входа уже в почте."
            title="Почти готово"
          />
          <div className="grid gap-4 p-5">
            <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">
              Открой письмо на этом устройстве и перейди по ссылке. Если письма нет, проверь спам или отправь ссылку заново.
            </p>
            <Button asChild className="w-fit" variant="secondary">
              <Link href="/auth">Отправить ещё раз</Link>
            </Button>
          </div>
        </StitchPanel>
        <StitchMetric label="Статус" tone="live" value="Ожидаем переход" />
      </section>
    </AppShell>
  );
}
