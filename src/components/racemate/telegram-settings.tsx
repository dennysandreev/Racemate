import type { ReactNode } from "react";

import {
  BellRing,
  Bot,
  Check,
  ChevronDown,
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
  normalizeSessionNotificationPreferences,
  type NotificationBooleanKey,
  type NotificationPreferences,
  type SessionNotificationKey,
  type SessionNotificationSetting,
} from "@/lib/notification-preferences";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type TelegramAccount = {
  username: string | null;
  first_name: string | null;
  is_active: boolean;
  connected_at: string;
};

const sessionRows: Array<{
  key: SessionNotificationKey;
  label: string;
  shortLabel: string;
}> = [
  { key: "practice", label: "Практики", shortLabel: "П" },
  { key: "sprint_qualifying", label: "Спринт-квалификация", shortLabel: "СК" },
  { key: "qualifying", label: "Квалификация", shortLabel: "К" },
  { key: "sprint", label: "Спринт", shortLabel: "С" },
  { key: "race", label: "Гонка", shortLabel: "Г" },
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
  const savedPreferences = preferencesResult.data as Partial<NotificationPreferences> | null;
  const preferences: NotificationPreferences = {
    ...defaultNotificationPreferences,
    ...savedPreferences,
    session_notifications: normalizeSessionNotificationPreferences(savedPreferences?.session_notifications),
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
              Живые напоминания о сессиях, дедлайнах прогнозов и новостях в удобном формате.
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
        <details className="group/telegram-settings">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <BellRing aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-sm font-bold">Настройки уведомлений</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Только нужные события, без лишнего шума</span>
              </span>
            </span>
            <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open/telegram-settings:rotate-180" />
          </summary>

          <form action={saveTelegramPreferences} className="border-t stitch-divider">
            <div className="grid md:grid-cols-2">
              <PreferenceSection
                description="Можно получать всю ленту или только материалы об избранных."
                icon={Newspaper}
                title="Новости"
              >
                <PreferenceToggle defaultChecked={preferences.important_news} label="Все новости" name="important_news" />
                <PreferenceToggle defaultChecked={preferences.favorite_driver_news} label="Любимые пилоты" name="favorite_driver_news" />
                <PreferenceToggle defaultChecked={preferences.favorite_team_news} label="Любимая команда" name="favorite_team_news" />
              </PreferenceSection>

              <PreferenceSection
                className="border-t md:border-l md:border-t-0"
                description="Напомним за 4 часа и за 15 минут, только если прогноз не заполнен."
                icon={Sparkles}
                title="Фентази"
              >
                <PreferenceToggle defaultChecked={preferences.fantasy_deadlines} label="Дедлайн по прогнозам" name="fantasy_deadlines" />
                <div className="mt-3 flex flex-wrap gap-2 pl-2">
                  <TimingBadge label="За 4 часа" />
                  <TimingBadge label="За 15 минут" />
                  <span className="self-center text-xs text-muted-foreground">для квалификации и гонки</span>
                </div>
              </PreferenceSection>
            </div>

            <div className="border-t stitch-divider p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 font-display text-base font-bold">
                    <Flag aria-hidden="true" className="size-4 text-primary" />
                    Сессии
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Для каждой сессии выберите время напоминаний и формат сообщения после финиша.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <ShieldCheck aria-hidden="true" className="size-4 text-[var(--success)]" />
                  Без спойлеров скрывает результаты
                </span>
              </div>

              <div className="mt-4 divide-y divide-border/70 border-y border-border/70">
                {sessionRows.map((session) => (
                  <SessionPreferenceRow
                    key={session.key}
                    label={session.label}
                    name={session.key}
                    setting={preferences.session_notifications[session.key]}
                    shortLabel={session.shortLabel}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t stitch-divider bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-muted-foreground">
                {account?.username ? `Уведомления для @${account.username}` : account?.first_name || "Telegram подключён"}
              </p>
              <input name="telegram_enabled" type="hidden" value="on" />
              <Button className="sm:min-w-40" type="submit">Сохранить</Button>
            </div>
          </form>
        </details>
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

function PreferenceSection({
  children,
  className,
  description,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  className?: string;
  description: string;
  icon: typeof Newspaper;
  title: string;
}) {
  return (
    <fieldset className={cn("border-border/70 p-4 sm:p-5", className)}>
      <legend className="sr-only">{title}</legend>
      <div>
        <h3 className="flex items-center gap-2 font-display text-base font-bold">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-3 grid gap-1">{children}</div>
    </fieldset>
  );
}

function SessionPreferenceRow({
  label,
  name,
  setting,
  shortLabel,
}: {
  label: string;
  name: SessionNotificationKey;
  setting: SessionNotificationSetting;
  shortLabel: string;
}) {
  return (
    <div className="grid gap-3 py-3 sm:grid-cols-[minmax(10rem,1fr)_auto_auto] sm:items-center sm:gap-5">
      <PreferenceToggle
        defaultChecked={setting.enabled}
        label={label}
        name={`session_${name}_enabled`}
        prefix={shortLabel}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2 pl-2 sm:pl-0">
        <span className="mr-1 text-[0.68rem] font-bold uppercase text-muted-foreground">Напомнить</span>
        <TimingCheckbox defaultChecked={setting.reminder_24h} label="24 ч" name={`session_${name}_reminder_24h`} />
        <TimingCheckbox defaultChecked={setting.reminder_1h} label="1 ч" name={`session_${name}_reminder_1h`} />
        <TimingCheckbox defaultChecked={setting.reminder_15m} label="15 мин" name={`session_${name}_reminder_15m`} />
      </div>
      <label className="flex cursor-pointer items-center gap-2 pl-2 text-xs font-semibold sm:justify-end sm:pl-0">
        <input
          className="size-4 accent-[var(--primary)]"
          defaultChecked={setting.spoiler_free}
          name={`session_${name}_spoiler_free`}
          type="checkbox"
        />
        <ShieldCheck aria-hidden="true" className="size-4 text-[var(--success)]" />
        Без спойлеров
      </label>
    </div>
  );
}

function PreferenceToggle({
  defaultChecked,
  label,
  name,
  prefix,
}: {
  defaultChecked: boolean;
  label: string;
  name: NotificationBooleanKey | string;
  prefix?: string;
}) {
  return (
    <label className="group flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/45">
      {prefix ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-sm bg-primary/10 font-telemetry text-[0.68rem] font-extrabold text-primary">
          {prefix}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
      <input className="peer sr-only" defaultChecked={defaultChecked} name={name} type="checkbox" />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-secondary ring-1 ring-border transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-muted-foreground after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-4 peer-checked:after:bg-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
    </label>
  );
}

function TimingCheckbox({ defaultChecked, label, name }: { defaultChecked: boolean; label: string; name: string }) {
  return (
    <label className="cursor-pointer">
      <input className="peer sr-only" defaultChecked={defaultChecked} name={name} type="checkbox" />
      <span className="inline-flex h-7 items-center rounded-sm border border-border bg-secondary/35 px-2 font-telemetry text-[0.68rem] font-bold text-muted-foreground transition-colors peer-checked:border-primary/55 peer-checked:bg-primary/10 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
        {label}
      </span>
    </label>
  );
}

function TimingBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-7 items-center rounded-sm border border-primary/35 bg-primary/10 px-2 font-telemetry text-[0.68rem] font-bold text-primary">
      {label}
    </span>
  );
}
