import { MailCheck } from "lucide-react";

import { AppShell } from "@/components/racemate/app-shell";
import { PageHeading } from "@/components/racemate/page-heading";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AppShell>
      <PageHeading
        badge="Письмо отправлено"
        description={email ? `Ссылка для входа ушла на ${email}.` : "Ссылка для входа уже в почте."}
        title="Открой письмо и вернись в RaceMate"
      />
      <section className="py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailCheck aria-hidden="true" data-icon="inline-start" />
              Почти готово
            </CardTitle>
            <CardDescription>
              Если письма нет, проверь спам или отправь ссылку заново через страницу входа.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </AppShell>
  );
}
