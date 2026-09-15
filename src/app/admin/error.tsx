"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { AdminErrorState, AdminPage, AdminPageHeader } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <AdminPage>
      <AdminPageHeader
        description="Раздел не загрузился. Данные не менялись."
        title="Не удалось открыть админку"
      />
      <AdminErrorState message="Попробуй загрузить раздел ещё раз. Если ошибка повторится, проверь последние фоновые задачи." />
      <div><Button onClick={reset}>Попробовать ещё раз</Button></div>
    </AdminPage>
  );
}
