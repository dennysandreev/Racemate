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
  const poleDriverId = nullableFormValue(formData.get("poleDriverId"));
  const fastestLapDriverId = nullableFormValue(formData.get("fastestLapDriverId"));
  const top10DriverIds = normalizeTop10(formData.getAll("top10DriverIds"));
  const dnfPick = parseDnfPick(formData.get("dnfDriverId"));
  const topScoringTeamId = nullableFormValue(formData.get("topScoringTeamId"));
  const fastestPitStopTeamId = nullableFormValue(formData.get("fastestPitStopTeamId"));

  if (!raceId) {
    redirect("/fantasy");
  }

  const { data: existing } = await supabase
    .from("predictions")
    .select("id, pole_driver_id, winner_driver_id, fastest_lap_driver_id, dnf_driver_id, dnf_pick_kind, top_scoring_team_id, fastest_pit_stop_team_id, top10_driver_ids")
    .eq("user_id", user.id)
    .eq("race_id", raceId)
    .is("league_id", null)
    .maybeSingle();

  const locks = await getPredictionLocksForRace(raceId);

  if (locks.raceLocked && !existing) {
    redirect("/fantasy?message=locked");
  }

  const activeDriverIds = await getActiveDriverIds(supabase);
  const activeTeamIds = await getActiveTeamIds(supabase);
  if (!locks.raceLocked && !isValidTop10(top10DriverIds, activeDriverIds)) {
    redirect("/fantasy?message=top10");
  }

  if (
    (!locks.poleLocked && poleDriverId && !activeDriverIds.has(poleDriverId)) ||
    (!locks.raceLocked && fastestLapDriverId && !activeDriverIds.has(fastestLapDriverId)) ||
    (!locks.raceLocked && dnfPick.kind === "driver" && dnfPick.driverId && !activeDriverIds.has(dnfPick.driverId)) ||
    (!locks.raceLocked && topScoringTeamId && !activeTeamIds.has(topScoringTeamId)) ||
    (!locks.raceLocked && fastestPitStopTeamId && !activeTeamIds.has(fastestPitStopTeamId))
  ) {
    redirect("/fantasy?message=driver");
  }

  const values = preserveLockedPredictionValues({
    current: existing
      ? {
          poleDriverId: existing.pole_driver_id,
          winnerDriverId: existing.winner_driver_id,
          fastestLapDriverId: existing.fastest_lap_driver_id,
          dnfDriverId: existing.dnf_driver_id,
          dnfPickKind: existing.dnf_pick_kind === "none" ? "none" : "driver",
          topScoringTeamId: existing.top_scoring_team_id,
          fastestPitStopTeamId: existing.fastest_pit_stop_team_id,
          top10DriverIds: normalizeTop10(existing.top10_driver_ids ?? []),
        }
      : null,
    locks,
    submitted: {
      poleDriverId,
      winnerDriverId: top10DriverIds[0] ?? null,
      fastestLapDriverId,
      dnfDriverId: dnfPick.driverId,
      dnfPickKind: dnfPick.kind,
      topScoringTeamId,
      fastestPitStopTeamId,
      top10DriverIds,
    },
  });
  const changed = !existing || hasPredictionChanged(existing, values);
  const payload = {
    user_id: user.id,
    race_id: raceId,
    league_id: null,
    winner_driver_id: values.winnerDriverId,
    pole_driver_id: values.poleDriverId,
    fastest_lap_driver_id: values.fastestLapDriverId,
    dnf_driver_id: values.dnfDriverId,
    dnf_pick_kind: values.dnfPickKind,
    top_scoring_team_id: values.topScoringTeamId,
    fastest_pit_stop_team_id: values.fastestPitStopTeamId,
    top3_driver_ids: values.top10DriverIds.slice(0, 3),
    top10_driver_ids: values.top10DriverIds,
    submitted_at: new Date().toISOString(),
    ...(changed ? { score: null, scored_at: null, score_breakdown: null } : {}),
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

function normalizeTop10(values: unknown[]) {
  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
}

function parseDnfPick(value: FormDataEntryValue | null): {
  driverId: string | null;
  kind: "driver" | "none";
} {
  const stringValue = String(value ?? "").trim();

  if (stringValue === "__none") {
    return { driverId: null, kind: "none" };
  }

  return { driverId: stringValue || null, kind: "driver" };
}

async function getActiveDriverIds(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>) {
  const { data } = await supabase.from("drivers").select("id").eq("is_active", true);

  return new Set((data ?? []).map((driver) => driver.id));
}

async function getActiveTeamIds(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>) {
  const { data } = await supabase.from("teams").select("id").eq("is_active", true);

  return new Set((data ?? []).map((team) => team.id));
}

function isValidTop10(top10DriverIds: string[], activeDriverIds: Set<string>) {
  if (top10DriverIds.length !== 10) {
    return false;
  }

  const uniqueIds = new Set(top10DriverIds);

  return uniqueIds.size === 10 && top10DriverIds.every((driverId) => activeDriverIds.has(driverId));
}

function hasPredictionChanged(
  existing: {
    pole_driver_id: string | null;
    winner_driver_id: string | null;
    fastest_lap_driver_id: string | null;
    dnf_driver_id: string | null;
    dnf_pick_kind?: string | null;
    top_scoring_team_id?: string | null;
    fastest_pit_stop_team_id?: string | null;
    top10_driver_ids?: string[] | null;
  },
  values: {
    poleDriverId: string | null;
    winnerDriverId: string | null;
    fastestLapDriverId: string | null;
    dnfDriverId: string | null;
    dnfPickKind: "driver" | "none";
    topScoringTeamId: string | null;
    fastestPitStopTeamId: string | null;
    top10DriverIds: string[];
  },
) {
  return (
    existing.pole_driver_id !== values.poleDriverId ||
    existing.winner_driver_id !== values.winnerDriverId ||
    existing.fastest_lap_driver_id !== values.fastestLapDriverId ||
    existing.dnf_driver_id !== values.dnfDriverId ||
    (existing.dnf_pick_kind ?? "driver") !== values.dnfPickKind ||
    (existing.top_scoring_team_id ?? null) !== values.topScoringTeamId ||
    (existing.fastest_pit_stop_team_id ?? null) !== values.fastestPitStopTeamId ||
    normalizeTop10(existing.top10_driver_ids ?? []).join("|") !== values.top10DriverIds.join("|")
  );
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
