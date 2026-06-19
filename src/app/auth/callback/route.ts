import { NextResponse, type NextRequest } from "next/server";

import { normalizeAuthNext } from "@/lib/auth-redirect";
import { getSiteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = normalizeAuthNext(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase?.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, getSiteUrl()));
}
