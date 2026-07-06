"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureProfile } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function createLeague(formData: FormData) {
  const profile = await ensureProfile();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/leagues");
  }

  if (!profile) {
    redirect("/leagues?message=create");
  }

  const limit = consumeRateLimit("leagues:create", `user:${profile.id}`, 5, 10 * 60 * 1_000);

  if (!limit.ok) {
    redirect("/leagues?message=create");
  }

  const name = String(formData.get("name") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on";

  if (!name || name.length > 64) {
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
    const { error: memberError } = await supabase.from("prediction_league_members").upsert(
      {
        league_id: data.id,
        user_id: profile.id,
        role: "owner",
      },
      { onConflict: "league_id,user_id" },
    );

    if (memberError) {
      redirect("/leagues?message=create");
    }
  } else {
    redirect("/leagues?message=create");
  }

  revalidatePath("/leagues");
  revalidatePath(`/fantasy/leagues/${data.id}`);
  redirect(`/fantasy/leagues/${data.id}?created=1`);
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

  const limit = consumeRateLimit("leagues:join", `user:${profile.id}`, 10, 10 * 60 * 1_000);

  if (!limit.ok) {
    redirect("/leagues?message=join");
  }

  const inviteCode = String(formData.get("inviteCode") ?? "")
    .trim()
    .toUpperCase();

  if (!inviteCode || inviteCode.length > 16) {
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
  revalidatePath(`/fantasy/leagues/${league.id}`);
  redirect(`/fantasy/leagues/${league.id}?joined=1`);
}

function makeInviteCode() {
  return Array.from(randomBytes(8), (byte) => INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length]).join("");
}
