"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createLeague(formData: FormData) {
  const profile = await ensureProfile();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/leagues");
  }

  if (!profile) {
    redirect("/leagues?message=create");
  }

  const name = String(formData.get("name") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on";

  if (!name) {
    redirect("/leagues?message=name");
  }

  const inviteCode = makeInviteCode();
  const { data, error } = await supabase
    .from("prediction_leagues")
    .insert({
      owner_user_id: profile.id,
      name,
      invite_code: inviteCode,
      is_public: isPublic,
    })
    .select("id")
    .single();

  if (!error && data) {
    const { error: memberError } = await supabase.from("prediction_league_members").insert({
      league_id: data.id,
      user_id: profile.id,
      role: "owner",
    });

    if (memberError) {
      redirect("/leagues?message=create");
    }
  } else {
    redirect("/leagues?message=create");
  }

  revalidatePath("/leagues");
  redirect("/leagues?created=1");
}

export async function joinLeague(formData: FormData) {
  const profile = await ensureProfile();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/leagues");
  }

  if (!profile) {
    redirect("/leagues?message=join");
  }

  const inviteCode = String(formData.get("inviteCode") ?? "")
    .trim()
    .toUpperCase();

  if (!inviteCode) {
    redirect("/leagues?message=code");
  }

  const { data: league } = await supabase
    .from("prediction_leagues")
    .select("id")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (!league) {
    redirect("/leagues?message=not-found");
  }

  const { error } = await supabase.from("prediction_league_members").upsert({
    league_id: league.id,
    user_id: profile.id,
    role: "member",
  });

  if (error) {
    redirect("/leagues?message=join");
  }

  revalidatePath("/leagues");
  redirect("/leagues?joined=1");
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
