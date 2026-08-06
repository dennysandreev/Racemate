"use server";

import { redirect } from "next/navigation";

import { normalizeAuthNext } from "@/lib/auth-redirect";
import { getSiteUrl } from "@/lib/env";
import { consumeIpRateLimit, consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";

const MIN_PASSWORD_LENGTH = 8;

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = normalizeAuthNext(formData.get("next"));

  if (!email || !password) {
    redirect(authUrl("/auth", { message: "missing-credentials", next }));
  }

  const [ipLimit, turnstileOk] = await Promise.all([
    consumeIpRateLimit("auth:password", null, 10, 10 * 60 * 1_000),
    verifyTurnstileToken(String(formData.get("cf-turnstile-response") ?? "")),
  ]);
  const emailLimit = consumeRateLimit(
    "auth:password",
    `email:${email}`,
    5,
    10 * 60 * 1_000,
  );

  if (!ipLimit.ok || !emailLimit.ok || !turnstileOk) {
    redirect(authUrl("/auth", { message: "login-failed", next }));
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(authUrl("/auth", { message: "service-unavailable", next }));
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(authUrl("/auth", { message: "login-failed", next }));
  }

  redirect(next);
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
  const next = normalizeAuthNext(formData.get("next"));
  const signupUrl = (message: string) =>
    authUrl("/auth", { message, mode: "signup", next });

  if (!email || !password || !passwordConfirmation) {
    redirect(signupUrl("missing-credentials"));
  }

  if (password !== passwordConfirmation) {
    redirect(signupUrl("password-mismatch"));
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    redirect(signupUrl("password-too-short"));
  }

  const [ipLimit, turnstileOk] = await Promise.all([
    consumeIpRateLimit("auth:signup", null, 5, 30 * 60 * 1_000),
    verifyTurnstileToken(String(formData.get("cf-turnstile-response") ?? "")),
  ]);
  const emailLimit = consumeRateLimit(
    "auth:signup",
    `email:${email}`,
    3,
    30 * 60 * 1_000,
  );

  if (!ipLimit.ok || !emailLimit.ok || !turnstileOk) {
    redirect(signupUrl("signup-failed"));
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect(signupUrl("service-unavailable"));
  }

  const callbackUrl = new URL("/auth/callback", normalizedSiteUrl());
  callbackUrl.searchParams.set("flow", "signup");
  callbackUrl.searchParams.set("next", "/onboarding");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    redirect(signupUrl("signup-failed"));
  }

  if (data.session) {
    redirect("/onboarding");
  }

  redirect("/auth/check-email?type=signup");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect("/auth/forgot-password?message=missing-email");
  }

  const [ipLimit, turnstileOk] = await Promise.all([
    consumeIpRateLimit("auth:recovery", null, 8, 30 * 60 * 1_000),
    verifyTurnstileToken(String(formData.get("cf-turnstile-response") ?? "")),
  ]);
  const emailLimit = consumeRateLimit(
    "auth:recovery",
    `email:${email}`,
    3,
    30 * 60 * 1_000,
  );

  if (!ipLimit.ok || !emailLimit.ok || !turnstileOk) {
    redirect("/auth/forgot-password?message=send-failed");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/auth/forgot-password?message=service-unavailable");
  }

  const callbackUrl = new URL("/auth/callback", normalizedSiteUrl());
  callbackUrl.searchParams.set("flow", "recovery");
  callbackUrl.searchParams.set("next", "/auth/update-password");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl.toString(),
  });

  if (error) {
    redirect("/auth/forgot-password?message=send-failed");
  }

  redirect("/auth/check-email?type=recovery");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");

  if (!password || !passwordConfirmation) {
    redirect("/auth/update-password?message=missing-password");
  }

  if (password !== passwordConfirmation) {
    redirect("/auth/update-password?message=password-mismatch");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    redirect("/auth/update-password?message=password-too-short");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/auth/update-password?message=service-unavailable");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect("/auth/update-password?message=update-failed");
  }

  redirect("/auth/update-password?message=password-updated");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/");
}

function authUrl(pathname: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);

  return `${pathname}?${searchParams.toString()}`;
}

function normalizedSiteUrl() {
  const siteUrl = getSiteUrl();

  return siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
}
