export type PublicHealthPayload = {
  ok: boolean;
  app: "RaceSide";
  supabase: "configured" | "missing";
  database: "healthy" | "unhealthy";
  release: string | null;
  checkedAt: string;
};

export function buildPublicHealthPayload({
  checkedAt,
  databaseHealthy,
  release,
  supabaseConfigured,
}: {
  checkedAt: string;
  databaseHealthy: boolean;
  release: string | null;
  supabaseConfigured: boolean;
}): PublicHealthPayload {
  const ok = supabaseConfigured && databaseHealthy;

  return {
    ok,
    app: "RaceSide",
    supabase: supabaseConfigured ? "configured" : "missing",
    database: databaseHealthy ? "healthy" : "unhealthy",
    release,
    checkedAt,
  };
}

export function getPublicHealthStatus(payload: PublicHealthPayload) {
  return payload.ok ? 200 : 503;
}
