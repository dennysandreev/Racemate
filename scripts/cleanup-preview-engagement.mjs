import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile?.(".env.local");
} catch {
  // Production and CI normally provide environment variables directly.
}

const MANIFEST_PATH = resolve("scripts/test-data/synthetic-engagement-manifest.json");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const userIds = [...new Set((manifest.botUsers ?? []).map((bot) => bot.id).filter(Boolean))];

if (!userIds.length) {
  throw new Error("The preview manifest does not contain bot user IDs");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: profiles, error: profileError } = await supabase
  .from("profiles")
  .select("id, email, is_bot")
  .in("id", userIds);

if (profileError) throw profileError;

const removableIds = (profiles ?? [])
  .filter((profile) => profile.is_bot && String(profile.email ?? "").startsWith("preview.bot."))
  .map((profile) => profile.id);

if (removableIds.length !== userIds.length) {
  throw new Error(`Safety check failed: manifest has ${userIds.length} users, but only ${removableIds.length} are marked preview bots`);
}

const failures = [];
for (const userId of removableIds) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) failures.push({ error: error.message, userId });
}

if (failures.length) {
  throw new Error(`Could not remove all preview users: ${JSON.stringify(failures)}`);
}

console.log(JSON.stringify({
  deletedBotUsers: removableIds.length,
  deletedLeagueIds: (manifest.leagues ?? []).map((league) => league.id),
  manifestPath: MANIFEST_PATH,
}, null, 2));
