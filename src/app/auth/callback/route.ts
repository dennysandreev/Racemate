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
  const flow = requestUrl.searchParams.get("flow");
  const requestedNext = normalizeAuthNext(requestUrl.searchParams.get("next"));
  const next =
    flow === "recovery"
      ? "/auth/update-password"
      : flow === "signup"
        ? "/onboarding"
        : requestedNext;
  const errorPath =
    flow === "recovery"
      ? "/auth/forgot-password?message=link-invalid"
      : "/auth?message=link-invalid";

  if (!code) {
    return NextResponse.redirect(new URL(errorPath, getSiteUrl()));
  }

  let target = next;
  const response = NextResponse.redirect(new URL(target, getSiteUrl()));
  const supabase = createSupabaseRouteHandlerClient(request, response);
  const { data, error } = (await supabase?.auth.exchangeCodeForSession(code)) ?? {
    data: null,
    error: new Error("Supabase Auth is unavailable"),
  };
  const user = data?.user;

  if (error || !supabase || !user) {
    return redirectWithCookies(errorPath, response);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    if (flow !== "recovery") {
      target = "/onboarding";
    }

    const admin = createSupabaseAdminClient();

    await admin?.from("profiles").upsert({
      id: user.id,
      email: user.email ?? null,
      display_name:
        typeof user.user_metadata?.display_name === "string" &&
        user.user_metadata.display_name.trim()
          ? user.user_metadata.display_name.trim()
          : user.email?.split("@")[0] ?? "Гость RaceSide",
    });
  }

  if (target === next) {
    return response;
  }

  return redirectWithCookies(target, response);
}

function redirectWithCookies(target: string, sourceResponse: NextResponse) {
  const finalResponse = NextResponse.redirect(new URL(target, getSiteUrl()));

  sourceResponse.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie);
  });

  return finalResponse;
}
