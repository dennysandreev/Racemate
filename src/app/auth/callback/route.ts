import { NextResponse, type NextRequest } from "next/server";

import { normalizeAuthNext } from "@/lib/auth-redirect";
import { getSiteUrl } from "@/lib/env";
import {
  createSupabaseAdminClient,
  createSupabaseRouteHandlerClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = normalizeAuthNext(requestUrl.searchParams.get("next"));
  let target = next;
  const response = NextResponse.redirect(new URL(target, getSiteUrl()));

  if (code) {
    const supabase = createSupabaseRouteHandlerClient(request, response);
    const { data } = await supabase?.auth.exchangeCodeForSession(code) ?? { data: null };
    const user = data?.user;

    if (supabase && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        target = "/onboarding";
        const admin = createSupabaseAdminClient();

        await admin?.from("profiles").upsert({
          id: user.id,
          email: user.email ?? null,
          display_name:
            typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
              ? user.user_metadata.display_name.trim()
              : user.email?.split("@")[0] ?? "Гость RaceMate",
        });
      }
    }
  }

  if (target === next) {
    return response;
  }

  const finalResponse = NextResponse.redirect(new URL(target, getSiteUrl()));
  response.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie);
  });

  return finalResponse;
}
