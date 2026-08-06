import { BellRing } from "lucide-react";

import {
  disconnectTelegramAction,
  sendTestNotificationAction,
} from "@/app/admin/operations";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { AdminConfirmedAction } from "@/components/admin/admin-confirmed-action";
import { AdminFilters } from "@/components/admin/admin-filters";
import {
  AdminEmpty,
  AdminPage,
  AdminPageHeader,
  AdminPagination,
  AdminSection,
  AdminStatusBadge,
} from "@/components/admin/admin-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadAdminUsers, parseAdminTableQuery } from "@/data/admin-repository";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Серверный клиент админки недоступен");
  const query = parseAdminTableQuery(await searchParams);
  const data = await loadAdminUsers(admin, query);

  return (
    <AdminPage>
      <AdminPageHeader
        description="Профиль, onboarding, избранное, прогнозы, лиги и состояние Telegram. Email и пароль здесь не меняются."
        title="Пользователи"
      />
      <AdminSection description={`${data.total} профилей по текущему запросу.`} title="Поддержка пользователей">
        <AdminFilters search={query.search} />
        {data.items.length ? (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Профиль</TableHead>
                    <TableHead>Onboarding</TableHead>
                    <TableHead>Избранное</TableHead>
                    <TableHead>Прогнозы</TableHead>
                    <TableHead>Лиги</TableHead>
                    <TableHead>Telegram</TableHead>
                    <TableHead className="text-right">Поддержка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <p className="font-medium">{profile.display_name || "Без имени"}</p>
                        <p className="text-xs text-muted-foreground">{profile.email || "Email не указан"}</p>
                      </TableCell>
                      <TableCell><AdminStatusBadge status={profile.onboarding_completed ? "success" : "pending"} /></TableCell>
                      <TableCell className="font-mono tabular-nums">{profile.favoriteDrivers + profile.favoriteTeams}</TableCell>
                      <TableCell className="font-mono tabular-nums">{profile.predictions}</TableCell>
                      <TableCell className="font-mono tabular-nums">{profile.leagues}</TableCell>
                      <TableCell>
                        <AdminStatusBadge status={profile.telegram?.is_active ? "active" : profile.telegram ? "warning" : "unknown"} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {profile.telegram?.is_active ? (
                            <>
                              <AdminActionForm action={sendTestNotificationAction} submitLabel="Проверить" submitVariant="secondary">
                                <input name="userId" type="hidden" value={profile.id} />
                              </AdminActionForm>
                              <AdminConfirmedAction
                                action={disconnectTelegramAction}
                                confirmLabel="Отключить связь"
                                description="Пользовательский аккаунт RaceSide останется активным. Отключится только проблемная Telegram-связь."
                                title="Отключить Telegram?"
                                triggerLabel="Отключить"
                                triggerVariant="ghost"
                              >
                                <input name="userId" type="hidden" value={profile.id} />
                              </AdminConfirmedAction>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid xl:hidden">
              {data.items.map((profile) => (
                <article className="grid gap-4 border-b border-border p-4 last:border-b-0" key={profile.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-medium">{profile.display_name || "Без имени"}</h2>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{profile.email || "Email не указан"}</p>
                    </div>
                    <AdminStatusBadge status={profile.onboarding_completed ? "success" : "pending"} />
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Избранное</dt><dd className="mt-1 font-mono">{profile.favoriteDrivers + profile.favoriteTeams}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Прогнозы</dt><dd className="mt-1 font-mono">{profile.predictions}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Лиги</dt><dd className="mt-1 font-mono">{profile.leagues}</dd></div>
                  </dl>
                  <div className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Telegram</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {profile.telegram?.username ? `@${profile.telegram.username}` : profile.telegram ? "Подключение без username" : "Не подключён"}
                        </p>
                      </div>
                      <AdminStatusBadge status={profile.telegram?.is_active ? "active" : profile.telegram ? "warning" : "unknown"} />
                    </div>
                    {profile.telegram?.last_error ? <p className="mt-2 text-xs text-danger">{profile.telegram.last_error}</p> : null}
                    {profile.telegram?.is_active ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <AdminActionForm action={sendTestNotificationAction} submitLabel="Отправить тест" submitVariant="secondary">
                          <input name="userId" type="hidden" value={profile.id} />
                          <BellRing aria-hidden="true" className="size-4" />
                        </AdminActionForm>
                        <AdminConfirmedAction
                          action={disconnectTelegramAction}
                          confirmLabel="Отключить связь"
                          description="Пользовательский аккаунт RaceSide останется активным. Отключится только проблемная Telegram-связь."
                          title="Отключить Telegram?"
                          triggerLabel="Отключить"
                          triggerVariant="ghost"
                        >
                          <input name="userId" type="hidden" value={profile.id} />
                        </AdminConfirmedAction>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <AdminPagination page={query.page} pageSize={query.pageSize} pathname="/admin/users" search={query.search} total={data.total} />
          </>
        ) : (
          <AdminEmpty description="Проверь имя или email в строке поиска." title="Профиль не найден" />
        )}
      </AdminSection>
    </AdminPage>
  );
}
