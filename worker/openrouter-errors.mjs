export class OpenRouterBatchBlockedError extends Error {
  constructor({ code, message, status }) {
    super(message);
    this.name = "OpenRouterBatchBlockedError";
    this.code = code;
    this.status = status;
  }
}

export function getOpenRouterBatchBlock(status, payload) {
  const message = normalizeString(
    payload?.error?.message ?? payload?.message ?? payload?.error,
  );
  const normalized = message?.toLowerCase() ?? "";

  if (status === 401) {
    return {
      code: "openrouter_invalid_key",
      message: "OpenRouter отклонил API-ключ. Проверь ключ в настройках сервера.",
      status,
    };
  }

  if (status === 402) {
    return {
      code: "openrouter_insufficient_credits",
      message: "На балансе OpenRouter недостаточно средств для обработки новостей.",
      status,
    };
  }

  if (status === 403) {
    const keyLimitExceeded = /key.+limit|limit.+exceed|spend.+limit/.test(normalized);

    return {
      code: keyLimitExceeded
        ? "openrouter_key_limit_exceeded"
        : "openrouter_permission_denied",
      message: keyLimitExceeded
        ? "Исчерпан лимит расходов активного API-ключа OpenRouter. Увеличь или сбрось лимит ключа."
        : "OpenRouter запретил запрос для активного API-ключа.",
      status,
    };
  }

  if (status === 429) {
    return {
      code: "openrouter_rate_limited",
      message: "OpenRouter временно ограничил частоту запросов. Задача будет повторена позже.",
      status,
    };
  }

  return null;
}

export function isOpenRouterBatchBlockedError(error) {
  return error instanceof OpenRouterBatchBlockedError;
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
