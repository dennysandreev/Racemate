"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createLeague(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/leagues");
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
      owner_user_id: user.id,
      name,
      invite_code: inviteCode,
      is_public: isPublic,
    })
    .select("id")
    .single();

  if (!error && data) {
    await supabase.from("prediction_league_members").insert({
      league_id: data.id,
      user_id: user.id,
      role: "owner",
    });
  }

  revalidatePath("/leagues");
  redirect("/leagues?created=1");
}

export async function joinLeague(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/leagues");
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

  await supabase.from("prediction_league_members").upsert({
    league_id: league.id,
    user_id: user.id,
    role: "member",
  });

  revalidatePath("/leagues");
  redirect("/leagues?joined=1");
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
