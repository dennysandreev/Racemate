import {
  BellRing,
  Bot,
  Check,
  Clock3,
  CloudRain,
  Flag,
  Newspaper,
  Send,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";

import {
  connectTelegram,
  disconnectTelegram,
  saveTelegramPreferences,
  sendTelegramTest,
} from "@/app/account/telegram-actions";
import { Button } from "@/components/ui/button";
import {
  defaultNotificationPreferences,
  type NotificationBooleanKey,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TelegramAccount = {
  username: string | null;
  first_name: string | null;
  is_active: boolean;
  connected_at: string;
};

type SettingItem = {
  key: NotificationBooleanKey;
  label: string;
  hint?: string;
};

const settingGroups: Array<{
  title: string;
  description: string;
  icon: typeof Flag;
  items: SettingItem[];
}> = [
  {
    title: "Сессии",
    description: "Напоминания и результаты гоночного уикенда",
    icon: Flag,
    items: [
      { key: "practice_reminders", label: "Напоминать о практиках" },
      { key: "qualifying_reminders", label: "Напоминать о квалификации" },
      { key: "sprint_reminders", label: "Напоминать о спринте" },
      { key: "race_reminders", label: "Напоминать о гонке" },
      { key: "schedule_changes", label: "Сообщать о переносах и отменах" },
      { key: "practice_results", label: "Присылать результаты практик", hint: "Топ-3 будет виден сразу" },
      { key: "qualifying_results", label: "Сообщать о результатах квалификации" },
      { key: "sprint_results", label: "Сообщать о результатах спринта" },
      { key: "race_results", label: "Сообщать о результатах гонки" },
    ],
  },
  {
    title: "Фэнтези",
    description: "Только моменты, когда прогноз требует внимания",
    icon: Sparkles,
    items: [
      { key: "fantasy_opened", label: "Прогнозы открылись" },
      { key: "fantasy_incomplete", label: "Прогноз остался незаполненным" },
      { key: "fantasy_deadlines", label: "Дедлайн приближается" },
      { key: "fantasy_locked", label: "Приём прогнозов закрыт" },
      { key: "fantasy_scored", label: "Очки рассчитаны" },
    ],
  },
  {
    title: "Новости",
    description: "Выберите темы, ради которых стоит отвлечься",
    icon: Newspaper,
    items: [
      { key: "important_news", label: "Главные новости" },
      { key: "favorite_driver_news", label: "Любимые пилоты" },
      { key: "favorite_team_news", label: "Любимая команда" },
      { key: "transfer_news", label: "Переходы пилотов" },
      { key: "steward_news", label: "Штрафы и решения стюардов" },
      { key: "technical_news", label: "Технические обновления" },
      { key: "daily_digest", label: "Главное за день" },
    ],
  },
  {
    title: "Погода и чемпионат",
    description: "Заметные изменения перед стартом и после этапа",
    icon: CloudRain,
    items: [
      { key: "weather_changes", label: "Важные изменения прогноза" },
      { key: "rain_alerts", label: "Появился дождь" },
      { key: "extreme_heat_alerts", label: "Ожидается сильная жара" },
      { key: "championship_updates", label: "Таблица чемпионата обновилась" },
    ],
  },
];

export async function TelegramSettings({ userId }: { userId: string | null }) {
  const supabase = await createSupabaseServerClient();
  const [accountResult, preferencesResult] = userId && supabase
    ? await Promise.all([
        supabase
          .from("telegram_accounts")
          .select("username, first_name, is_active, connected_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("notification_preferences")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  const account = accountResult.data as TelegramAccount | null;
  const preferences = {
    ...defaultNotificationPreferences,
    ...(preferencesResult.data as Partial<NotificationPreferences> | null),
  };
  const connected = Boolean(account?.is_active);

  return (
    <section className="stitch-panel overflow-hidden p-0" id="telegram">
      <div className="flex flex-col gap-4 border-b stitch-divider p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-secondary/40">
            <Bot aria-hidden="true" className="size-5 text-primary" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold leading-tight">Telegram</h2>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-1 text-[0.68rem] font-bold text-muted-foreground">
                {connected ? <Check aria-hidden="true" className="size-3 text-[var(--success)]" /> : null}
                {connected ? "Подключён" : "Не подключён"}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              RaceMate напомнит о старте, прогнозе и важных изменениях. Результаты квалификации, спринта и гонки всегда скрыты до вашего нажатия.
            </p>
          </div>
        </div>

        {connected ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <form action={sendTelegramTest}>
              <Button type="submit" variant="secondary">
                <Send aria-hidden="true" data-icon="inline-start" />
                Проверить связь
              </Button>
            </form>
            <form action={disconnectTelegram}>
              <Button type="submit" variant="outline">
                <Unplug aria-hidden="true" data-icon="inline-start" />
                Отключить
              </Button>
            </form>
          </div>
        ) : (
          <form action={connectTelegram} className="shrink-0">
            <Button type="submit">
              <Send aria-hidden="true" data-icon="inline-start" />
              Подключить Telegram
            </Button>
          </form>
        )}
      </div>

      {connected ? (
        <form action={saveTelegramPreferences}>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="grid gap-px bg-border/60 sm:grid-cols-2">
              {settingGroups.map((group) => (
                <fieldset className="bg-background p-4 sm:p-5" key={group.title}>
                  <legend className="w-full">
                    <span className="flex items-center gap-2 font-display text-base font-bold">
                      <group.icon aria-hidden="true" className="size-4 text-primary" />
                      {group.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{group.description}</span>
                  </legend>
                  <div className="mt-4 grid gap-1">
                    {group.items.map((item) => (
                      <PreferenceCheckbox
                        defaultChecked={preferences[item.key]}
                        hint={item.hint}
                        key={item.key}
                        label={item.label}
                        name={item.key}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            <aside className="border-t stitch-divider p-4 sm:p-5 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-2">
                <BellRing aria-hidden="true" className="size-4 text-primary" />
                <h3 className="font-display text-base font-bold">Когда писать</h3>
              </div>
              <div className="mt-4 grid gap-1">
                <PreferenceCheckbox defaultChecked={preferences.reminder_24h} label="За 24 часа" name="reminder_24h" />
                <PreferenceCheckbox defaultChecked={preferences.reminder_1h} label="За 1 час" name="reminder_1h" />
                <PreferenceCheckbox defaultChecked={preferences.reminder_15m} label="За 15 минут" name="reminder_15m" />
              </div>

              <label className="mt-5 grid gap-2 text-xs font-bold" htmlFor="delivery_mode">
                Формат сообщений
                <select
                  className="h-10 rounded-md border border-border bg-secondary/50 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  defaultValue={preferences.delivery_mode}
                  id="delivery_mode"
                  name="delivery_mode"
                >
                  <option value="instant">Сразу</option>
                  <option value="digest">Одним дайджестом</option>
                </select>
              </label>

              <div className="mt-5">
                <p className="flex items-center gap-2 text-xs font-bold">
                  <Clock3 aria-hidden="true" className="size-4 text-primary" />
                  Тихие часы
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <TimeField defaultValue={preferences.quiet_hours_start} label="С" name="quiet_hours_start" />
                  <TimeField defaultValue={preferences.quiet_hours_end} label="До" name="quiet_hours_end" />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Время берём из часового пояса профиля.</p>
              </div>

              <div className="mt-5 rounded-md border border-border bg-secondary/35 p-3">
                <p className="flex items-center gap-2 text-xs font-bold">
                  <ShieldCheck aria-hidden="true" className="size-4 text-[var(--success)]" />
                  Без спойлеров
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  Победитель, подиум, очки прогноза и изменения чемпионата откроются только после вашего подтверждения.
                </p>
              </div>

              <input defaultChecked={preferences.telegram_enabled} name="telegram_enabled" type="hidden" value="on" />
              <Button className="mt-5 w-full" type="submit">Сохранить</Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {account?.username ? `@${account.username}` : account?.first_name || "Telegram подключён"}
              </p>
            </aside>
          </div>
        </form>
      ) : (
        <div className="p-5 sm:p-6">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Нажмите «Подключить Telegram», затем запустите бота. Ссылка действует 10 минут и привязывает только текущий аккаунт RaceMate.
          </p>
        </div>
      )}
    </section>
  );
}

function PreferenceCheckbox({
  defaultChecked,
  hint,
  label,
  name,
}: {
  defaultChecked: boolean;
  hint?: string;
  label: string;
  name: NotificationBooleanKey;
}) {
  return (
    <label className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50">
      <input
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
      />
      <span className="min-w-0 text-sm font-semibold leading-5">
        {label}
        {hint ? <span className="block text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

function TimeField({ defaultValue, label, name }: { defaultValue: string | null; label: string; name: string }) {
  return (
    <label className="grid gap-1 text-[0.68rem] font-bold text-muted-foreground">
      {label}
      <input
        className="h-10 min-w-0 rounded-md border border-border bg-secondary/50 px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        defaultValue={defaultValue?.slice(0, 5) ?? ""}
        name={name}
        type="time"
      />
    </label>
  );
}
