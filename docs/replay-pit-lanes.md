# Replay pit lanes

Checked on 22 September 2026. Scope: all 27 ready snapshots (17 current-season
race/sprint replays and 10 older source versions), covering 14 circuits.

## Geometry and references

`src/data/replay-pit-layouts.json` contains a separate entry-to-exit polyline for
each circuit, the matching reference circuit and the official **2026 FIA pit
lane drawing** URL. All 14 drawings were rendered and visually reviewed.

Australia uses OpenStreetMap way 28119448; China uses ways 107371147 and
107371138 (the entry road must not be omitted); Japan uses way 120917578, not
the west-circuit pit lane. Coordinates are projected in metres against the
same bacinger/f1-circuits reference used by the existing track models.

Miami, Montreal, Monaco, Catalunya, Red Bull Ring, Silverstone, Spa,
Hungaroring, Zandvoort, Monza and Madring reuse the reviewed digital-twin
centreline/pit geometry. Their original source cards and public model metadata
remain the authoritative geometry provenance. The complete reference URLs are
stored alongside each layout, not inferred from the event name at runtime.

Geometry attribution: © OpenStreetMap contributors (ODbL),
https://www.openstreetmap.org/copyright; bacinger/f1-circuits, commit
394d8fbe70ef2c0b0c8d23ff7bee61fa09606055 (MIT). Madring uses the municipal survey
described in its existing source card. FIA documents are references, not
redistributed artwork.

## Runtime

- `withVerifiedReplayPitLane` runs on the server when reading an archived
  snapshot, so existing replays do not require deleting/rebuilding the archive.
- The worker uses the same function when preparing future snapshots.
- Similarity registration finds rotation, scale, reflection and lap origin.
  Local residual correction keeps the lane on the verified side of a slightly
  noisy telemetry contour. The merge points are snapped to the circuit.
- Rendered SVG and car motion receive the same pit points. The 2D line has a
  dark separation stroke so it stays visible beside the main straight.
- The damaged Monaco 11299 contour had 68.15 SVG-pixel registration RMS and the
  wrong shape. Only malformed Monaco contours are replaced with the reviewed
  circuit, retaining a closed loop and the model's actual start/finish origin.
- No database rows, race timings, radio or result data are changed by the
  repair. Unknown circuits retain their existing geometry.

This is a schematic replay map, not a surveyed driving simulator. Main-circuit
telemetry can differ by a few pixels from surveyed geometry. New circuits or
changed layouts require a source update and a repeat of this audit.

## Reproduce

1. `node scripts/replay-pit-sources.mjs` downloads the three extra OSM sources
   and the pinned circuit reference.
2. `node --experimental-strip-types scripts/generate-replay-pit-layouts.mjs`
   exports the compact reference data. Existing digital-twin build inputs in
   `.track-model-build` are required.
3. `node scripts/replay-pit-sources.mjs --references` downloads and renders all
   official pit drawings (requires Poppler).
4. `node scripts/check-replay-pit-lanes.mjs --refresh` reads all ready maps from
   Supabase without changing them. Subsequent runs work from the local cache.
   Overlay PNGs and the report are under `output/replay-pit-audit`.
5. `node --experimental-strip-types scripts/check-race-replays.mjs` checks all
   drivers every 250 ms through the 17 current replays, including pit transitions
   and the available 3D adapters.
6. `node --test src/lib/replay-pit-lane.test.mjs` exercises registration,
   coordinate validity, source coverage and immutable cached inputs.
