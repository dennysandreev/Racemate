import { redirect } from "next/navigation";

import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
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
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return false;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data } = await supabase.rpc("is_admin");

  return Boolean(data);
}
