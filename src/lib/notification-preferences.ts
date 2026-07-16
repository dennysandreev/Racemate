export const notificationBooleanKeys = [
  "telegram_enabled",
  "fantasy_deadlines",
  "fantasy_reminder_4h",
  "fantasy_reminder_15m",
  "important_news",
  "favorite_driver_news",
  "favorite_team_news",
] as const;

export const retiredNotificationBooleanKeys = [
  "practice_reminders",
  "qualifying_reminders",
  "sprint_reminders",
  "race_reminders",
  "reminder_24h",
  "reminder_1h",
  "reminder_15m",
  "schedule_changes",
  "practice_results",
  "qualifying_results",
  "sprint_results",
  "race_results",
  "fantasy_opened",
  "fantasy_incomplete",
  "fantasy_locked",
  "fantasy_scored",
  "fantasy_rank_changes",
  "transfer_news",
  "steward_news",
  "technical_news",
  "daily_digest",
  "weather_changes",
  "rain_alerts",
  "extreme_heat_alerts",
  "possible_session_delay",
  "championship_updates",
] as const;

export const sessionNotificationKeys = [
  "practice",
  "sprint_qualifying",
  "qualifying",
  "sprint",
  "race",
] as const;

export type NotificationBooleanKey = (typeof notificationBooleanKeys)[number];
export type SessionNotificationKey = (typeof sessionNotificationKeys)[number];

export type SessionNotificationSetting = {
  enabled: boolean;
  reminder_24h: boolean;
  reminder_1h: boolean;
  reminder_15m: boolean;
  spoiler_free: boolean;
};

export type SessionNotificationPreferences = Record<SessionNotificationKey, SessionNotificationSetting>;

export type NotificationPreferences = Record<NotificationBooleanKey, boolean> & {
  session_notifications: SessionNotificationPreferences;
};

const defaultSessionSetting: SessionNotificationSetting = {
  enabled: true,
  reminder_24h: false,
  reminder_1h: true,
  reminder_15m: true,
  spoiler_free: true,
};

export const defaultSessionNotificationPreferences: SessionNotificationPreferences = {
  practice: {
    ...defaultSessionSetting,
    enabled: false,
    spoiler_free: false,
  },
  sprint_qualifying: { ...defaultSessionSetting },
  qualifying: { ...defaultSessionSetting },
  sprint: { ...defaultSessionSetting },
  race: { ...defaultSessionSetting },
};

export const defaultNotificationPreferences: NotificationPreferences = {
  telegram_enabled: true,
  fantasy_deadlines: true,
  fantasy_reminder_4h: true,
  fantasy_reminder_15m: true,
  important_news: true,
  favorite_driver_news: false,
  favorite_team_news: false,
  session_notifications: defaultSessionNotificationPreferences,
};

export function normalizeSessionNotificationPreferences(value: unknown): SessionNotificationPreferences {
  const source = isRecord(value) ? value : {};

  return Object.fromEntries(sessionNotificationKeys.map((key) => {
    const candidate = isRecord(source[key]) ? source[key] : {};
    const fallback = defaultSessionNotificationPreferences[key];

    return [key, {
      enabled: readBoolean(candidate.enabled, fallback.enabled),
      reminder_24h: readBoolean(candidate.reminder_24h, fallback.reminder_24h),
      reminder_1h: readBoolean(candidate.reminder_1h, fallback.reminder_1h),
      reminder_15m: readBoolean(candidate.reminder_15m, fallback.reminder_15m),
      spoiler_free: readBoolean(candidate.spoiler_free, fallback.spoiler_free),
    }];
  })) as SessionNotificationPreferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
