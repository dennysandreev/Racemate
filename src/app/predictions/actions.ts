"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import {
  getPredictionLocksForRace,
  preserveLockedPredictionValues,
} from "@/lib/prediction-locks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function savePrediction(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/predictions");
  }

  const raceId = String(formData.get("raceId") ?? "");
  const winnerDriverId = nullableFormValue(formData.get("winnerDriverId"));
  const poleDriverId = nullableFormValue(formData.get("poleDriverId"));
  const fastestLapDriverId = nullableFormValue(formData.get("fastestLapDriverId"));
  const dnfDriverId = nullableFormValue(formData.get("dnfDriverId"));

  if (!raceId) {
    redirect("/predictions");
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
    await supabase
      .from("predictions")
      .update(payload)
      .eq("id", existing.id);
  } else {
    await supabase.from("predictions").insert(payload);
  }

  revalidatePath("/");
  revalidatePath("/predictions");
  redirect("/predictions?saved=1");
}

function nullableFormValue(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "");

  return stringValue ? stringValue : null;
}
