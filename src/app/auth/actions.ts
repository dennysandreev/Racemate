"use server";

import { redirect } from "next/navigation";

import { normalizeAuthNext } from "@/lib/auth-redirect";
import { getSiteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = normalizeAuthNext(formData.get("next"));
  const supabase = await createSupabaseServerClient();

  if (!supabase || !email) {
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

  redirect(
    `/auth/check-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`,
  );
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/");
}
