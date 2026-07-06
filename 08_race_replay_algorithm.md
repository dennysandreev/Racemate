# Race Replay Algorithm

## Purpose

`Race replay` in RaceMate is a user-facing historical replay. V1 does not use live timing. It replays a completed race from OpenF1, normalizes it in the worker, stores it in Supabase, and serves the UI only from RaceMate data.

## Source Selection

1. For `/weekend`, find the RaceMate weekend currently shown to the user.
2. If that race has not happened yet, match it to the previous season race on the same circuit.
3. For completed RaceMate races, use the main race session from the same season and round context whenever OpenF1 has data.
4. Use the OpenF1 main race session for that circuit and source season.
4. Store the prepared link in `race_replay_sessions`.

For already completed 2026 Grands Prix, `race_replay.prepare_completed` prepares 2026 OpenF1 race data. Older 2025 reference replays can stay in the database, but the UI should prefer the latest ready replay for the race. The frontend must never call OpenF1 directly.

## Worker Data Fetch

The prepare job loads and caches:

- car locations;
- position and interval snapshots;
- laps and sector times;
- pit lane / pit stop records;
- stints and tyre compounds;
- race control messages;
- weather snapshots.

The normalized output is saved as replay events and a compact session snapshot.

## Track Construction

1. Build a technical centerline from OpenF1 location points.
2. Remove extreme outliers and stale points.
3. Normalize coordinates into a stable SVG viewBox.
4. Generate an SVG path from the centerline.
5. Store bounds, transform metadata, sectors, and pit lane geometry with the map.

The UI renders the track from the cached map definition. Sectors are visual only; replay positions still come from normalized timing/location events.

## Snapping And Interpolation

1. Each car event is snapped to the closest valid point on the centerline or pit lane.
2. Between telemetry samples, the player interpolates by replay time.
3. Around the start / finish line, interpolation must prefer lap continuity so a car does not jump backward between the end of one lap and the beginning of the next.
4. Stale or missing telemetry is not drawn as an active car. Retired cars move into the `OUT` list instead of staying on the track.

## Pit Lane

Pit lane windows are built per driver:

- `startMs`: first detected pit lane entry;
- `endMs`: pit lane exit, preferably from reported pit lane duration;
- `pitLaneSeconds`: full time from pit entry to exit;
- `pitStopSeconds`: stationary stop duration when available.

UI rule:

- while the driver is in pit lane, show only the live pit lane timer;
- after exit, keep the card for 15 replay seconds and show `pit lane (pit stop)`;
- pit cards are sorted by entry time so their positions do not jump when another driver pits.

## Race Status And Flags

Race control messages are normalized into timed statuses:

- green;
- yellow / double yellow;
- safety car;
- virtual safety car;
- red flag;
- chequered flag.

Status windows must end when race control announces green, restart, safety car in, VSC ending, red flag cleared, or the race finishes. If the chequered flag overlaps a neutralized status, show a combined status such as `Финиш · Пейс-кар`.

## Timing Order

Timing rows are sorted by race order:

1. drivers on the highest current lap first;
2. then by classified position or interval order;
3. retired / out drivers after active runners.

Lapped cars receive a visible `+1 круг` style marker and must not float above cars that are physically a lap ahead.

## Tyre Pace And Lap Analytics

The map overlay shows:

- best lap of the replay so far;
- best last lap among current runners;
- average last-lap pace by tyre compound.

Zero, empty, stale, pit-affected, and OUT laps are ignored. Pit-affected laps are detected by checking whether the last-lap time window intersects a driver pit window.

## Preparing Future Replays

To prepare replay for completed 2026 races:

1. ensure calendar, sessions, results, and circuit mapping are synced;
2. run `race_replay.prepare_completed` for the season, or pass `--season` / `--round` for a single race;
3. verify that a `race_replay_sessions` row exists;
4. verify that the track map has centerline, sectors, bounds, and pit lane;
5. open `/race-replay/[sessionKey]` and check track continuity, timing order, pit windows, flags, and OUT handling.

The replay is considered ready only when the map renders, cars move without start-line jumps, timing rows are ordered correctly, and no retired car remains parked on the active racing line.

`race_replay.prepare_current` stays focused on the `/weekend` race and uses the previous season when the upcoming race has not happened yet. `race_replay.prepare_completed` uses the same builder for every completed race in the target season, skips already ready same-season sessions unless `--force` is passed, and writes the same snapshot format used by the Silverstone replay.
