"use server";

import { redirect } from "next/navigation";

import { normalizeAuthNext } from "@/lib/auth-redirect";
import { getSiteUrl } from "@/lib/env";
import { consumeIpRateLimit, consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = normalizeAuthNext(formData.get("next"));

  if (!email) {
    redirect("/auth?message=missing-email");
  }

  const ipLimit = await consumeIpRateLimit("auth:email", null, 10, 10 * 60 * 1_000);
  const emailLimit = consumeRateLimit("auth:email", `email:${email}`, 3, 10 * 60 * 1_000);
  const turnstileOk = await verifyTurnstileToken(String(formData.get("cf-turnstile-response") ?? ""));

  if (!ipLimit.ok || !emailLimit.ok || !turnstileOk) {
    redirect("/auth?message=send-failed");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/auth?message=missing-email");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect("/auth?message=send-failed");
  }

  redirect(`/auth/check-email?next=${encodeURIComponent(next)}`);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/");
}
