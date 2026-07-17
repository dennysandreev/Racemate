import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/supabase";

const protectedRoutes: string[] = [];

export async function proxy(request: NextRequest) {
  const env = getSupabaseEnv();
  let response = NextResponse.next({ request });
  const needsUser = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  if (!env) {
    return response;
  }

  const authCookieName = getSupabaseAuthCookieName(env.url);
  const hasAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name === authCookieName || name.startsWith(`${authCookieName}.`));

  if (!hasAuthCookie) {
    if (needsUser) {
      return buildLoginRedirect(request);
    }

    return response;
  }

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();

  if (needsUser && typeof data?.claims?.sub !== "string") {
    return buildLoginRedirect(request);
  }

  return response;
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/auth", request.url);

  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function getSupabaseAuthCookieName(url: string) {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
