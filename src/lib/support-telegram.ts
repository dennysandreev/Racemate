import "server-only";

let cachedSupportChatId: string | null = null;

export async function sendSupportTelegramMessage(input: {
  text: string;
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
}) {
  const botToken = normalizeString(process.env.TELEGRAM_SUPPORT_BOT_TOKEN);
  if (!botToken) {
    return { ok: false as const, status: "not_configured" as const, reason: "support_bot_token_missing" };
  }

  const chatId = await resolveSupportChatId(botToken);
  if (!chatId) {
    return { ok: false as const, status: "not_configured" as const, reason: "support_chat_not_found" };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: input.text.slice(0, 4_096),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: input.replyMarkup,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    return {
      ok: false as const,
      status: "failed" as const,
      reason: `telegram_http_${response.status}`,
    };
  }

  return { ok: true as const, status: "sent" as const };
}

export function escapeSupportTelegramHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function resolveSupportChatId(botToken: string) {
  const configuredChatId = normalizeString(process.env.TELEGRAM_SUPPORT_CHAT_ID);
  if (configuredChatId && /^-?\d+$/.test(configuredChatId)) return configuredChatId;
  if (cachedSupportChatId) return cachedSupportChatId;

  const username = normalizeUsername(process.env.TELEGRAM_SUPPORT_USERNAME);
  if (!username) return null;

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/getUpdates?limit=100&timeout=0`,
    { cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as {
    result?: Array<{
      message?: TelegramPrivateMessage;
      edited_message?: TelegramPrivateMessage;
    }>;
  } | null;
  const updates = Array.isArray(payload?.result) ? payload.result : [];

  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const message = updates[index]?.message ?? updates[index]?.edited_message;
    if (
      message?.chat?.type === "private" &&
      (normalizeUsername(message.from?.username) === username ||
        normalizeUsername(message.chat.username) === username) &&
      Number.isSafeInteger(message.chat.id)
    ) {
      cachedSupportChatId = String(message.chat.id);
      return cachedSupportChatId;
    }
  }
  return null;
}

type TelegramPrivateMessage = {
  chat?: { id?: number; type?: string; username?: string };
  from?: { username?: string };
};

function normalizeUsername(value: unknown) {
  return normalizeString(value)?.replace(/^@/, "").toLowerCase() ?? null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
