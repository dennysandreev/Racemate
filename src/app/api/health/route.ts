import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const database = supabase
    ? await supabase.from("seasons").select("year", { count: "exact", head: true })
    : null;

  return NextResponse.json({
    ok: Boolean(hasSupabaseEnv() && !database?.error),
    app: "RaceMate",
    supabase: hasSupabaseEnv() ? "configured" : "missing",
    database: database?.error ? "unhealthy" : "healthy",
    checkedAt: new Date().toISOString(),
  });
}
