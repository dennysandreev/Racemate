"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  notificationBooleanKeys,
  retiredNotificationBooleanKeys,
  sessionNotificationKeys,
  type SessionNotificationPreferences,
} from "@/lib/notification-preferences";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function connectTelegram() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");

  if (!admin || !botUsername) {
    redirect("/account?telegram=unavailable#telegram");
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1_000).toISOString();

  await admin
    .from("telegram_link_tokens")
    .delete()
    .eq("user_id", user.id)
    .is("used_at", null);

  const { error } = await admin.from("telegram_link_tokens").insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    redirect("/account?telegram=error#telegram");
  }

  redirect(`https://t.me/${encodeURIComponent(botUsername)}?start=link_${rawToken}`);
}

export async function disconnectTelegram() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  if (!admin) {
    redirect("/account?telegram=error#telegram");
  }

  await Promise.all([
    admin
      .from("telegram_accounts")
      .update({ is_active: false, disconnected_at: new Date().toISOString() })
      .eq("user_id", user.id),
    admin
      .from("notification_preferences")
      .upsert({ user_id: user.id, telegram_enabled: false }, { onConflict: "user_id" }),
  ]);

  revalidatePath("/account");
  redirect("/account?telegram=disconnected#telegram");
}

export async function saveTelegramPreferences(formData: FormData) {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  if (!admin) {
    redirect("/account?telegram=error#telegram");
  }

  const values = Object.fromEntries(
    notificationBooleanKeys.map((key) => [key, formData.get(key) === "on"]),
  );
  const retiredValues = Object.fromEntries(
    retiredNotificationBooleanKeys.map((key) => [key, false]),
  );
  const sessionNotifications = Object.fromEntries(sessionNotificationKeys.map((key) => [
    key,
    {
      enabled: formData.get(`session_${key}_enabled`) === "on",
      reminder_24h: formData.get(`session_${key}_reminder_24h`) === "on",
      reminder_1h: formData.get(`session_${key}_reminder_1h`) === "on",
      reminder_15m: formData.get(`session_${key}_reminder_15m`) === "on",
      spoiler_free: formData.get(`session_${key}_spoiler_free`) === "on",
    },
  ])) as SessionNotificationPreferences;

  const { error } = await admin.from("notification_preferences").upsert(
    {
      ...values,
      ...retiredValues,
      user_id: user.id,
      session_notifications: sessionNotifications,
      quiet_hours_start: null,
      quiet_hours_end: null,
      delivery_mode: "instant",
    },
    { onConflict: "user_id" },
  );

  if (error) {
    redirect("/account?telegram=error#telegram");
  }

  const fantasyDeadlinesEnabled = Boolean(values.fantasy_deadlines);
  const disabledFantasyTimings = [
    { enabled: Boolean(values.fantasy_reminder_4h), key: "4h" },
    { enabled: Boolean(values.fantasy_reminder_15m), key: "15m" },
  ].filter((timing) => !timing.enabled);

  if (!fantasyDeadlinesEnabled) {
    await admin
      .from("notification_queue")
      .update({ status: "cancelled", last_error: "Fantasy reminders disabled by user" })
      .eq("user_id", user.id)
      .eq("event_type", "FANTASY_DEADLINE")
      .eq("status", "pending");
  } else if (disabledFantasyTimings.length) {
    await Promise.all(disabledFantasyTimings.map((timing) => admin
      .from("notification_queue")
      .update({ status: "cancelled", last_error: "Fantasy reminder timing disabled by user" })
      .eq("user_id", user.id)
      .eq("event_type", "FANTASY_DEADLINE")
      .eq("status", "pending")
      .like("dedupe_key", `%:${timing.key}`)));
  }

  revalidatePath("/account");
  redirect("/account?telegram=saved#telegram");
}

export async function sendTelegramTest() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  if (!admin) {
    redirect("/account?telegram=error#telegram");
  }

  const minuteKey = new Date().toISOString().slice(0, 16);
  await admin.from("notification_queue").upsert(
    {
      user_id: user.id,
      event_type: "TEST_NOTIFICATION",
      payload: {
        text: "🏁 <b>RaceMate на связи</b>\n\nУведомления настроены. Напишем, когда появится действительно важный повод.",
        parseMode: "HTML",
        buttonText: "Открыть настройки",
        buttonUrl: "/account#telegram",
      },
      dedupe_key: `test:${user.id}:${minuteKey}`,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );

  redirect("/account?telegram=test-queued#telegram");
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
