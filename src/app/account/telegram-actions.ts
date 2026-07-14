"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  defaultNotificationPreferences,
  notificationBooleanKeys,
} from "@/lib/notification-preferences";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

  const quietStart = normalizeTime(formData.get("quiet_hours_start"));
  const quietEnd = normalizeTime(formData.get("quiet_hours_end"));
  const deliveryMode = formData.get("delivery_mode") === "digest" ? "digest" : "instant";
  const values = Object.fromEntries(
    notificationBooleanKeys.map((key) => [key, formData.get(key) === "on"]),
  );

  await admin.from("notification_preferences").upsert(
    {
      ...defaultNotificationPreferences,
      ...values,
      user_id: user.id,
      quiet_hours_start: quietStart,
      quiet_hours_end: quietEnd,
      delivery_mode: deliveryMode,
    },
    { onConflict: "user_id" },
  );

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
        text: "Связь с RaceMate работает. Следующее полезное уведомление придёт по вашим настройкам.",
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

function normalizeTime(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return timePattern.test(normalized) ? normalized : null;
}
