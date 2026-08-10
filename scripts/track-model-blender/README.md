# Blender track builder

This directory contains the reproducible real-scale builder for the RaceSide Circuit Zandvoort asset.

Requirements:

- Blender 5.2 LTS available as `blender` (or set `BLENDER_BIN`);
- Node.js 22 or newer;
- Python 3 with Pillow.

Build and validate:

```bash
pnpm track:3d:build zandvoort
pnpm track:3d:validate zandvoort
```

The build does not use the former hand-authored `src/data/zandvoort-model.ts` geometry. It performs this deterministic pipeline:

1. `download-zandvoort-data.mjs` fetches and SHA-256-pins OSM raceway geometry, AHN4 DTM/DSM, BGT objects, 3DBAG LoD2.2 buildings and the PDOK 2026 orthophoto.
2. `prepare-zandvoort-rasters.py` converts the height rasters and samples real roof colors from the orthophoto.
3. `export-track-data.mjs` adds the official FIA lap length, turn, sector, speed-trap, pit-lane and DRS control points plus the Dutch GP 2026 grandstand zones.
4. `build-zandvoort-digital-twin.py` creates the Blender scene at `1 unit = 1 metre` with no vertical exaggeration, keeps BGT ground classes in the measured 2026 orthophoto instead of duplicating them as synthetic overlays, renders the preview and exports a Meshopt-compressed GLB.
5. `write-zandvoort-client-model.mjs` regenerates lightweight UI/controller metadata from the same geodata.
6. `validate-track.mjs` checks checksums, FIA length tolerance, required anchors, scene completeness and web budgets.

Raw sources and prepared rasters stay in `.track-model-build/`. Production assets are written to `public/f1/tracks/3d/`. Do not hand-edit the generated GLB, preview, metadata or `src/data/zandvoort-model.ts`.
