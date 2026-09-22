const relation = value => Array.isArray(value) ? value[0] : value;
// Name aliases only; team membership always comes from the database.
const russianNames = {
  Hamilton: ["Хэмилтон", "Хэмильтон"], Russell: ["Расселл"], Antonelli: ["Антонелли"],
  Norris: ["Норрис"], Piastri: ["Пиастри"], Verstappen: ["Ферстаппен"], Leclerc: ["Леклер"],
  Alonso: ["Алонсо"], Stroll: ["Стролл"], Sainz: ["Сайнс"], Albon: ["Албон"],
  Gasly: ["Гасли"], Ocon: ["Окон"], Bearman: ["Берман"], Hadjar: ["Хаджар"],
  Lawson: ["Лоусон"], Tsunoda: ["Цунода"], Bortoleto: ["Бортолето"],
  Hülkenberg: ["Хюлькенберг"], Hulkenberg: ["Хюлькенберг"], Colapinto: ["Колапинто"],
  Pérez: ["Перес"], Perez: ["Перес"], Bottas: ["Боттас"], Lindblad: ["Линдблад"],
};

/** One season-scoped snapshot per batch, from the same sporting tables as the site. */
export async function loadNewsContext(client, { season, now = new Date() }) {
  const currentDate = now.toISOString();
  if (!Number.isInteger(season) || season !== now.getUTCFullYear()) throw new Error("news_context_season_mismatch");
  const queries = await Promise.all([
    client.from("drivers").select("id, full_name, last_name, code, updated_at, teams:current_team_id(id,name,short_name)").eq("is_active", true),
    client.from("races").select("id,season_year,round,race_name,race_start_at,status,circuits(name,country)").eq("season_year", season).order("round"),
    client.from("driver_standings").select("id,driver_id,team_id,round,position,points,wins,updated_at").eq("season_year", season).order("round", { ascending: false }).limit(30),
    client.from("constructor_standings").select("id,team_id,round,position,points,wins,updated_at,teams(name,short_name)").eq("season_year", season).order("round", { ascending: false }).limit(15),
  ]);
  for (const result of queries) if (result.error) throw result.error;
  const [drivers, races, standings, constructors] = queries.map(result => result.data ?? []);
  if (!races.length || !drivers.length) throw new Error("news_context_unavailable");
  const facts = [{ id: "current_date", kind: "date", value: currentDate.slice(0, 10), scope: "current", reference: "worker.clock" }, { id: "current_season", kind: "season", value: season, scope: "current", reference: "worker.F1_SEASON" }];
  for (const driver of drivers) {
    const team = relation(driver.teams);
    if (team) facts.push({ id: `driver:${driver.id}:team`, kind: "driver_team", subject: driver.full_name, aliases: [driver.full_name, driver.last_name, ...(russianNames[driver.last_name] ?? [])].filter(Boolean), value: team.short_name || team.name, scope: "current", as_of: driver.updated_at, reference: `drivers/${driver.id}/current_team_id` });
  }
  for (const [rows, kind, table] of [[standings, "driver", "driver_standings"], [constructors, "team", "constructor_standings"]]) {
    const latestRound = Math.max(0, ...rows.map(row => row.round ?? 0));
    for (const row of rows.filter(row => row.round === latestRound)) {
      const subject = kind === "driver" ? drivers.find(driver => driver.id === row.driver_id)?.full_name : relation(row.teams)?.name;
      if (!subject) continue;
      for (const key of ["position", "points", "wins"]) {
        if (row[key] != null) facts.push({ id: `${kind}:${row[`${kind}_id`]}:${key}`, kind: `championship_${key}`, subject, value: row[key], scope: `season_${season}_after_round_${row.round}`, as_of: row.updated_at, reference: `${table}/${row.id}/${key}` });
      }
    }
  }
  for (const race of races) {
    facts.push({ id: `race:${race.id}:name`, kind: "calendar", subject: `round_${race.round}`, value: race.race_name, scope: `season_${season}`, reference: `races/${race.id}/race_name` });
    if (race.race_start_at) facts.push({ id: `race:${race.id}:date`, kind: "race_date", subject: race.race_name, value: race.race_start_at, scope: `season_${season}`, reference: `races/${race.id}/race_start_at` });
  }
  const completed = races.filter(race => race.status === "completed" && race.race_start_at < currentDate).slice(-5);
  if (completed.length) {
    const { data: sessions, error } = await client.from("sessions").select("id,race_id,session_type,start_at,status").in("race_id", completed.map(race => race.id)).eq("status", "completed");
    if (error) throw error;
    if (sessions?.length) {
      const { data: results, error: resultsError } = await client.from("session_results").select("id,session_id,driver_id,position,points,status,updated_at").in("session_id", sessions.map(session => session.id)).order("position").limit(1000);
      if (resultsError) throw resultsError;
      for (const row of results ?? []) {
        const session = sessions.find(item => item.id === row.session_id);
        const race = completed.find(item => item.id === session?.race_id);
        const driver = drivers.find(item => item.id === row.driver_id);
        if (!driver || !race || row.position == null) continue;
        facts.push({ id: `result:${row.id}:position`, kind: "session_position", subject: driver.full_name, value: row.position, scope: `${season}:${race.race_name}:${session.session_type}`, as_of: row.updated_at, reference: `session_results/${row.id}/position` });
      }
    }
  }
  return { current_date: currentDate, season, facts, drivers, races };
}

export function selectNewsContext(context, source, teams) {
  const sourceText = `${source.title} ${source.description} ${source.text}`.toLowerCase();
  const mentionedDrivers = new Set(context.drivers.filter(driver => [driver.full_name, driver.last_name].some(name => name && sourceText.includes(name.toLowerCase()))).map(driver => driver.full_name));
  const relatedRaces = context.races.filter(race => {
    const name = race.race_name?.replace(/grand prix/ig, "").trim().toLowerCase();
    return name && sourceText.includes(name);
  });
  const raceFactIds = new Set(relatedRaces.map(race => `race:${race.id}:`));
  const facts = context.facts.filter(fact => {
    if (["date", "season"].includes(fact.kind)) return true;
    if (["calendar", "race_date"].includes(fact.kind)) return [...raceFactIds].some(prefix => fact.id.startsWith(prefix));
    if (mentionedDrivers.has(fact.subject)) return true;
    return fact.id.startsWith("team:") && fact.subject && sourceText.includes(fact.subject.toLowerCase());
  });
  return { current_date: context.current_date, season: context.season, teams, races: relatedRaces, facts };
}
