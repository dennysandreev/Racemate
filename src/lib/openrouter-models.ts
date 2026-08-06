import "server-only";

import { getOpenRouterEnv } from "@/lib/env";
import { withServerTtlCache } from "@/lib/server-ttl-cache";
import type { AdminOpenRouterModel } from "@/types/admin";

const MODELS_CACHE_TTL_MS = 30 * 60 * 1_000;

type OpenRouterModelPayload = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
  };
  supported_parameters?: unknown;
  top_provider?: {
    max_completion_tokens?: unknown;
  };
};

export async function loadOpenRouterModels(): Promise<AdminOpenRouterModel[]> {
  const env = getOpenRouterEnv();

  if (!env) return [];

  return withServerTtlCache(
    "admin:openrouter-models",
    MODELS_CACHE_TTL_MS,
    async () => {
      const response = await fetch("https://openrouter.ai/api/v1/models/user", {
        headers: {
          authorization: `Bearer ${env.apiKey}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter models: HTTP ${response.status}`);
      }

      const payload = await response.json() as { data?: OpenRouterModelPayload[] };

      return (payload.data ?? [])
        .map(normalizeOpenRouterModel)
        .filter((model): model is AdminOpenRouterModel => model !== null)
        .sort((left, right) => left.name.localeCompare(right.name, "ru"));
    },
    { staleWhileRevalidateMs: 24 * 60 * 60 * 1_000 },
  );
}

function normalizeOpenRouterModel(
  payload: OpenRouterModelPayload,
): AdminOpenRouterModel | null {
  const id = stringValue(payload.id);
  const supportedParameters = Array.isArray(payload.supported_parameters)
    ? payload.supported_parameters.filter((item): item is string => typeof item === "string")
    : [];

  if (
    !id ||
    !id.includes("/") ||
    !supportedParameters.some(
      (parameter) => parameter === "max_tokens" || parameter === "max_completion_tokens",
    )
  ) {
    return null;
  }

  return {
    id,
    name: stringValue(payload.name) ?? id,
    contextLength: positiveInteger(payload.context_length),
    maxCompletionTokens: positiveInteger(payload.top_provider?.max_completion_tokens),
    promptPricePerMillion: perMillion(payload.pricing?.prompt),
    completionPricePerMillion: perMillion(payload.pricing?.completion),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function perMillion(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : null;
}
