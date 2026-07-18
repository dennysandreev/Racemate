import { createHash } from "node:crypto";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { createExpiringSingleFlight } from "@/lib/auth-refresh-flight";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/types/supabase";

const protectedRoutes: string[] = [];
const authStatusHeader = "x-racemate-auth-status";
const authUserHeader = "x-racemate-auth-user";
const authRefreshes = createExpiringSingleFlight<AuthCheckResult>(5_000);

type AuthCookie = {
  name: string;
  value: string;
};

type CookieUpdate = AuthCookie & {
  options: CookieOptions;
};

type AuthCheckResult = {
  cookies: CookieUpdate[];
  responseHeaders: Record<string, string>;
  status: "authenticated" | "anonymous" | "unavailable";
  user: {
    email?: string;
    id: string;
    user_metadata: Record<string, unknown>;
  } | null;
};

export async function proxy(request: NextRequest) {
  const env = getSupabaseEnv();
  const needsUser = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  if (!env) {
    return buildNextResponse(request, {
      cookies: [],
      responseHeaders: {},
      status: "anonymous",
      user: null,
    });
  }

  const authCookieName = getSupabaseAuthCookieName(env.url);
  const authCookies = request.cookies
    .getAll()
    .filter(
      ({ name }) => name === authCookieName || name.startsWith(`${authCookieName}.`),
    );

  if (authCookies.length === 0) {
    if (needsUser) {
      return buildLoginRedirect(request);
    }

    return buildNextResponse(request, {
      cookies: [],
      responseHeaders: {},
      status: "anonymous",
      user: null,
    });
  }

  const cookieSnapshot = request.cookies.getAll();
  const authResult = await authRefreshes.run(
    getAuthCookieFingerprint(authCookies),
    () => checkAuthSession(env.url, env.anonKey, cookieSnapshot),
  );

  if (needsUser && authResult.status !== "authenticated") {
    return buildLoginRedirect(request);
  }

  return buildNextResponse(request, authResult);
}

async function checkAuthSession(
  supabaseUrl: string,
  anonKey: string,
  cookies: AuthCookie[],
): Promise<AuthCheckResult> {
  let cookieUpdates: CookieUpdate[] = [];
  let responseHeaders: Record<string, string> = {};

  try {
    const supabase = createServerClient<Database>(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return cookies;
        },
        setAll(cookiesToSet, headersToSet) {
          cookieUpdates = cookiesToSet;
          responseHeaders = headersToSet;
        },
      },
    });
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;

    if (error) {
      return {
        cookies: cookieUpdates,
        responseHeaders,
        status: "unavailable",
        user: null,
      };
    }

    if (typeof claims?.sub !== "string") {
      return {
        cookies: cookieUpdates,
        responseHeaders,
        status: "anonymous",
        user: null,
      };
    }

    const userMetadata = isRecord(claims.user_metadata) ? claims.user_metadata : {};
    const displayName =
      typeof userMetadata.display_name === "string"
        ? userMetadata.display_name
        : undefined;

    return {
      cookies: cookieUpdates,
      responseHeaders,
      status: "authenticated",
      user: {
        email: typeof claims.email === "string" ? claims.email : undefined,
        id: claims.sub,
        user_metadata: displayName ? { display_name: displayName } : {},
      },
    };
  } catch {
    return {
      cookies: cookieUpdates,
      responseHeaders,
      status: "unavailable",
      user: null,
    };
  }
}

function buildNextResponse(request: NextRequest, authResult: AuthCheckResult) {
  authResult.cookies.forEach(({ name, value }) => request.cookies.set(name, value));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(authStatusHeader);
  requestHeaders.delete(authUserHeader);
  requestHeaders.set(authStatusHeader, authResult.status);

  if (authResult.user) {
    requestHeaders.set(
      authUserHeader,
      Buffer.from(JSON.stringify(authResult.user), "utf8").toString("base64url"),
    );
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  authResult.cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  Object.entries(authResult.responseHeaders).forEach(([name, value]) => {
    response.headers.set(name, value);
  });

  return response;
}

function getAuthCookieFingerprint(cookies: AuthCookie[]) {
  const serializedCookies = cookies
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map(({ name, value }) => `${name}=${value}`)
    .join(";");

  return createHash("sha256").update(serializedCookies).digest("base64url");
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/auth", request.url);

  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

function getSupabaseAuthCookieName(url: string) {
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
