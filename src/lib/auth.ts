import { redirect } from "next/navigation";
import { cache } from "react";

import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const getSessionUser = cache(async () => {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
});

export async function getSessionProfileSummary() {
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const fallbackName =
    typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
      ? user.user_metadata.display_name.trim()
      : user.email?.split("@")[0] ?? "Гость RaceMate";

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return {
    displayName: profile?.display_name?.trim() || fallbackName,
    email: profile?.email ?? user.email ?? null,
  };
}

export async function requireUser() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/auth");
  }

  return user;
}

export async function ensureProfile() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, timezone, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    return profile;
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  const { data } = await admin
    .from("profiles")
    .upsert({
      id: user.id,
      email: user.email ?? null,
      display_name:
        user.user_metadata?.display_name ??
        user.email?.split("@")[0] ??
        "Гость RaceMate",
    })
    .select("id, email, display_name, timezone, onboarding_completed")
    .single();

  return data;
}

export async function requireOnboardedUser() {
  const profile = await ensureProfile();

  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  return profile;
}

export async function requireAdmin() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/");
  }

  const { data: isAdmin } = await supabase.rpc("is_admin");

  if (!isAdmin) {
    redirect("/");
  }

  return user;
}

export async function getIsAdmin() {
  const user = await getSessionUser();

  if (!user) {
    return false;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return false;
  }

  const { data } = await supabase.rpc("is_admin");

  return Boolean(data);
}
