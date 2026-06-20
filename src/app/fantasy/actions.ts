"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import {
  getPredictionLocksForRace,
  preserveLockedPredictionValues,
} from "@/lib/prediction-locks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveFantasyPrediction(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/fantasy");
  }

  const raceId = String(formData.get("raceId") ?? "");
  const winnerDriverId = nullableFormValue(formData.get("winnerDriverId"));
  const poleDriverId = nullableFormValue(formData.get("poleDriverId"));
  const fastestLapDriverId = nullableFormValue(formData.get("fastestLapDriverId"));
  const dnfDriverId = nullableFormValue(formData.get("dnfDriverId"));

  if (!raceId) {
    redirect("/fantasy");
  }

  const { data: existing } = await supabase
    .from("predictions")
    .select("id, pole_driver_id, winner_driver_id, fastest_lap_driver_id, dnf_driver_id")
    .eq("user_id", user.id)
    .eq("race_id", raceId)
    .is("league_id", null)
    .maybeSingle();

  const locks = await getPredictionLocksForRace(raceId);
  const values = preserveLockedPredictionValues({
    current: existing
      ? {
          poleDriverId: existing.pole_driver_id,
          winnerDriverId: existing.winner_driver_id,
          fastestLapDriverId: existing.fastest_lap_driver_id,
          dnfDriverId: existing.dnf_driver_id,
        }
      : null,
    locks,
    submitted: {
      poleDriverId,
      winnerDriverId,
      fastestLapDriverId,
      dnfDriverId,
    },
  });
  const payload = {
    user_id: user.id,
    race_id: raceId,
    league_id: null,
    winner_driver_id: values.winnerDriverId,
    pole_driver_id: values.poleDriverId,
    fastest_lap_driver_id: values.fastestLapDriverId,
    dnf_driver_id: values.dnfDriverId,
    submitted_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from("predictions").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("predictions").insert(payload);
  }

  revalidatePath("/");
  revalidatePath("/fantasy");
  revalidatePath("/predictions");
  redirect("/fantasy?saved=1");
}

export async function createFantasyLeague(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/fantasy");
  }

  const name = String(formData.get("name") ?? "").trim();
  const isPublic = formData.get("isPublic") === "on";

  if (!name) {
    redirect("/fantasy?message=name");
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
    const { error: memberError } = await supabase.from("prediction_league_members").insert({
      league_id: data.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      redirect("/fantasy?message=create");
    }
  } else {
    redirect("/fantasy?message=create");
  }

  revalidatePath("/fantasy");
  revalidatePath("/leagues");
  redirect(`/fantasy?created=1&league=${data.id}`);
}

export async function joinFantasyLeague(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/fantasy");
  }

  const inviteCode = String(formData.get("inviteCode") ?? "")
    .trim()
    .toUpperCase();

  if (!inviteCode) {
    redirect("/fantasy?message=code");
  }

  const { data: league } = await supabase
    .from("prediction_leagues")
    .select("id")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (!league) {
    redirect("/fantasy?message=not-found");
  }

  const { error } = await supabase.from("prediction_league_members").upsert({
    league_id: league.id,
    user_id: user.id,
    role: "member",
  });

  if (error) {
    redirect("/fantasy?message=join");
  }

  revalidatePath("/fantasy");
  revalidatePath("/leagues");
  redirect(`/fantasy?joined=1&league=${league.id}`);
}

function nullableFormValue(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "");

  return stringValue ? stringValue : null;
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
