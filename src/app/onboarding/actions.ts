"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveOnboarding(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/onboarding");
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "Europe/Moscow").trim();
  const teamIds = formData.getAll("teamIds").map(String).filter(Boolean);
  const driverIds = formData.getAll("driverIds").map(String).filter(Boolean);

  await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      email: user.email ?? null,
      display_name: displayName || user.email?.split("@")[0] || "Гость RaceMate",
      timezone: timezone || "Europe/Moscow",
      onboarding_completed: true,
    });

  await supabase.from("user_favorite_teams").delete().eq("user_id", user.id);
  await supabase.from("user_favorite_drivers").delete().eq("user_id", user.id);

  if (teamIds.length) {
    await supabase.from("user_favorite_teams").insert(
      teamIds.map((teamId) => ({
        user_id: user.id,
        team_id: teamId,
      })),
    );
  }

  if (driverIds.length) {
    await supabase.from("user_favorite_drivers").insert(
      driverIds.map((driverId) => ({
        user_id: user.id,
        driver_id: driverId,
      })),
    );
  }

  redirect("/predictions");
}
