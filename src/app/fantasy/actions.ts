"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureProfile, requireUser } from "@/lib/auth";
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
  const scope = parsePredictionScope(formData.get("predictionScope"));

  if (!raceId) {
    redirect("/fantasy");
  }

  const { data: existing } = await supabase
    .from("predictions")
    .select("id, pole_driver_id, winner_driver_id, fastest_lap_driver_id, dnf_driver_id, dnf_pick_kind, top_scoring_team_id, fastest_pit_stop_team_id, top10_driver_ids, share_slug, share_image_version")
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
  const submitted = buildSubmittedValues({
    existing,
    scope,
    poleDriverId,
    fastestLapDriverId,
    top10DriverIds,
    dnfPick,
    topScoringTeamId,
    fastestPitStopTeamId,
  });

  if (
    scope !== "qualification" &&
    !locks.raceLocked &&
    submitted.top10DriverIds.length > 0 &&
    !isValidTop10(submitted.top10DriverIds, activeDriverIds)
  ) {
    redirect("/fantasy?message=top10");
  }

  if (
    (scope !== "race" && !locks.poleLocked && submitted.poleDriverId && !activeDriverIds.has(submitted.poleDriverId)) ||
    (scope !== "qualification" && !locks.raceLocked && submitted.fastestLapDriverId && !activeDriverIds.has(submitted.fastestLapDriverId)) ||
    (scope !== "qualification" && !locks.raceLocked && submitted.dnfPickKind === "driver" && submitted.dnfDriverId && !activeDriverIds.has(submitted.dnfDriverId)) ||
    (scope !== "qualification" && !locks.raceLocked && submitted.topScoringTeamId && !activeTeamIds.has(submitted.topScoringTeamId)) ||
    (scope !== "qualification" && !locks.raceLocked && submitted.fastestPitStopTeamId && !activeTeamIds.has(submitted.fastestPitStopTeamId))
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
    submitted,
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
    is_public: true,
    share_image_version: existing
      ? changed
        ? Math.max(1, existing.share_image_version ?? 1) + 1
        : Math.max(1, existing.share_image_version ?? 1)
      : 1,
    ...(changed ? { score: null, scored_at: null, score_breakdown: null } : {}),
  };
  let predictionId = existing?.id ?? null;
  let shareSlug = existing?.share_slug ?? null;
  let shareImageVersion = payload.share_image_version;

  if (existing) {
    const { data, error } = await supabase
      .from("predictions")
      .update(payload)
      .eq("id", existing.id)
      .select("id, share_slug, share_image_version")
      .single();

    if (error || !data) {
      redirect("/fantasy?message=driver");
    }

    predictionId = data.id;
    shareSlug = data.share_slug;
    shareImageVersion = data.share_image_version ?? shareImageVersion;
  } else {
    const { data, error } = await supabase
      .from("predictions")
      .insert(payload)
      .select("id, share_slug, share_image_version")
      .single();

    if (error || !data) {
      redirect("/fantasy?message=driver");
    }

    predictionId = data.id;
    shareSlug = data.share_slug;
    shareImageVersion = data.share_image_version ?? shareImageVersion;
  }

  if (!predictionId) {
    redirect("/fantasy?message=driver");
  }

  if (!shareSlug) {
    shareSlug = await createPredictionShareSlug(supabase, {
      predictionId,
      raceId,
      userId: user.id,
    });
  }

  revalidatePath("/");
  revalidatePath("/fantasy");
  revalidatePath("/predictions");
  revalidatePath(`/prediction/${shareSlug}`);
  const shareScope = scope === "qualification" ? "qualification" : "race";
  redirect(`/fantasy?tab=picks&saved=1&share=${encodeURIComponent(shareSlug)}&shareScope=${shareScope}&v=${shareImageVersion}`);
}

export async function createFantasyLeague(formData: FormData) {
  const profile = await ensureProfile();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/fantasy");
  }

  if (!profile) {
    redirect("/fantasy?message=create");
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
      redirect("/fantasy?message=create");
    }
  } else {
    redirect("/fantasy?message=create");
  }

  revalidatePath("/fantasy");
  revalidatePath("/leagues");
  redirect(`/fantasy?tab=leagues&created=1&league=${data.id}`);
}

export async function joinFantasyLeague(formData: FormData) {
  const profile = await ensureProfile();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/fantasy");
  }

  if (!profile) {
    redirect("/fantasy?message=join");
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
    user_id: profile.id,
    role: "member",
  });

  if (error) {
    redirect("/fantasy?message=join");
  }

  revalidatePath("/fantasy");
  revalidatePath("/leagues");
  redirect(`/fantasy?tab=leagues&joined=1&league=${league.id}`);
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

type PredictionScope = "qualification" | "race" | "all";

function parsePredictionScope(value: FormDataEntryValue | null): PredictionScope {
  const scope = String(value ?? "");

  return scope === "qualification" || scope === "race" ? scope : "all";
}

function buildSubmittedValues({
  existing,
  scope,
  poleDriverId,
  fastestLapDriverId,
  top10DriverIds,
  dnfPick,
  topScoringTeamId,
  fastestPitStopTeamId,
}: {
  existing: {
    pole_driver_id: string | null;
    winner_driver_id: string | null;
    fastest_lap_driver_id: string | null;
    dnf_driver_id: string | null;
    dnf_pick_kind?: string | null;
    top_scoring_team_id?: string | null;
    fastest_pit_stop_team_id?: string | null;
    top10_driver_ids?: string[] | null;
  } | null;
  scope: PredictionScope;
  poleDriverId: string | null;
  fastestLapDriverId: string | null;
  top10DriverIds: string[];
  dnfPick: { driverId: string | null; kind: "driver" | "none" };
  topScoringTeamId: string | null;
  fastestPitStopTeamId: string | null;
}) {
  const current = {
    poleDriverId: existing?.pole_driver_id ?? null,
    winnerDriverId: existing?.winner_driver_id ?? null,
    fastestLapDriverId: existing?.fastest_lap_driver_id ?? null,
    dnfDriverId: existing?.dnf_driver_id ?? null,
    dnfPickKind: existing?.dnf_pick_kind === "none" ? "none" as const : "driver" as const,
    topScoringTeamId: existing?.top_scoring_team_id ?? null,
    fastestPitStopTeamId: existing?.fastest_pit_stop_team_id ?? null,
    top10DriverIds: normalizeTop10(existing?.top10_driver_ids ?? []),
  };

  if (scope === "qualification") {
    return { ...current, poleDriverId };
  }

  const raceValues = {
    ...current,
    winnerDriverId: top10DriverIds[0] ?? null,
    fastestLapDriverId,
    dnfDriverId: dnfPick.driverId,
    dnfPickKind: dnfPick.kind,
    topScoringTeamId,
    fastestPitStopTeamId,
    top10DriverIds,
  };

  return scope === "race" ? raceValues : { ...raceValues, poleDriverId };
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

async function createPredictionShareSlug(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  {
    predictionId,
    raceId,
    userId,
  }: {
    predictionId: string;
    raceId: string;
    userId: string;
  },
) {
  const [{ data: race }, { data: profile }] = await Promise.all([
    supabase
      .from("races")
      .select("race_name, season_year")
      .eq("id", raceId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const racePart = slugifySharePart(race?.race_name ?? "grand-prix", "grand-prix");
  const userPart = slugifySharePart(profile?.display_name ?? "fan", "fan");
  const seasonPart = race?.season_year ?? new Date().getUTCFullYear();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = `${racePart}-${seasonPart}-${userPart}-${makeShareSuffix()}`;
    const { data, error } = await supabase
      .from("predictions")
      .update({
        share_slug: candidate,
        shared_at: new Date().toISOString(),
      })
      .eq("id", predictionId)
      .select("share_slug")
      .single();

    if (!error && data?.share_slug) {
      return data.share_slug;
    }
  }

  redirect("/fantasy?message=driver");
}

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makeShareSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function slugifySharePart(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}
