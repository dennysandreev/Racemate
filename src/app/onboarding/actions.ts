"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedTimezones = new Set([
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Vladivostok",
]);

export async function saveOnboarding(formData: FormData) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/onboarding");
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "Europe/Moscow").trim();
  const teamIds = [...new Set(formData.getAll("teamIds").map(String).filter(Boolean))];
  const driverIds = [...new Set(formData.getAll("driverIds").map(String).filter(Boolean))];

  if (displayName.length > 40 || !allowedTimezones.has(timezone) || teamIds.length > 1 || driverIds.length > 2) {
    redirect("/onboarding?error=favorites");
  }

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

  if (teamIds[0]) {
    await supabase.from("user_favorite_teams").insert(
      [{
        user_id: user.id,
        team_id: teamIds[0],
      }],
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

  redirect("/account");
}
