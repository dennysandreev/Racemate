import { AdminScheduleList } from "@/components/admin/admin-schedule-list";
import {
  AdminMetric,
  AdminPage,
  AdminPageHeader,
  AdminSection,
} from "@/components/admin/admin-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { loadAdminSchedules } from "@/data/admin-repository";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export default async function AdminSchedulesPage() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Серверный клиент админки недоступен");
  const data = await loadAdminSchedules(admin);

  return (
    <AdminPage>
      <AdminPageHeader
        description="Все автоматические проверки RaceSide. Здесь можно изменить время запуска, поставить задачу на паузу или безопасно запустить её сейчас."
        title="Расписания"
      />
      <section className="grid grid-cols-2 gap-y-5 border-b border-border pb-5 lg:grid-cols-4">
        <AdminMetric label="Работают" tone="success" value={String(data.metrics.enabled)} />
        <AdminMetric label="На паузе" tone={data.metrics.paused ? "warning" : "default"} value={String(data.metrics.paused)} />
        <AdminMetric label="Пора запускать" tone={data.metrics.due ? "warning" : "default"} value={String(data.metrics.due)} />
        <AdminMetric label="Последняя ошибка" tone={data.metrics.failed ? "danger" : "default"} value={String(data.metrics.failed)} />
      </section>
      <Alert>
        <AlertTitle>Без произвольных cron-команд</AlertTitle>
        <AlertDescription>
          Каждое расписание связано с одной разрешённой задачей. Команды, секреты
          и служебные параметры нельзя подменить из браузера.
        </AlertDescription>
      </Alert>
      <AdminSection
        description="Изменение расписания записывается в аудит. Ручной запуск не сдвигает следующий плановый запуск."
        title="Автоматические проверки"
      >
        <AdminScheduleList schedules={data.schedules} />
      </AdminSection>
    </AdminPage>
  );
}
