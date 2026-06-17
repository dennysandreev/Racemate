#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path


def seconds(value):
    if value is None:
        return None

    try:
        if hasattr(value, "total_seconds"):
            result = value.total_seconds()
        else:
            result = float(value)
    except Exception:
        return None

    return round(result, 3) if result == result else None


def main():
    if len(sys.argv) < 3:
        print("Usage: report_metrics.py <season> <round>", file=sys.stderr)
        return 2

    try:
        import fastf1
    except Exception as exc:
        print(f"FastF1 import failed: {exc}", file=sys.stderr)
        return 2

    season = int(sys.argv[1])
    round_number = int(sys.argv[2])
    cache_dir = Path(os.environ.get("FASTF1_CACHE_DIR", "/tmp/racemate-fastf1-cache"))
    cache_dir.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(cache_dir))

    session = fastf1.get_session(season, round_number, "R")
    session.load(laps=True, telemetry=False, weather=False, messages=False)
    laps = session.laps
    drivers = {}

    for driver_code in sorted(str(item) for item in laps["Driver"].dropna().unique()):
        driver_laps = laps.pick_drivers(driver_code)
        quick_laps = driver_laps.pick_quicklaps()
        sample = quick_laps if not quick_laps.empty else driver_laps

        if sample.empty:
            continue

        lap_times = sample["LapTime"].dropna()
        drivers[driver_code] = {
            "bestLapSeconds": seconds(lap_times.min() if not lap_times.empty else None),
            "medianLapSeconds": seconds(lap_times.median() if not lap_times.empty else None),
            "laps": int(len(driver_laps)),
            "quickLaps": int(len(quick_laps)),
        }

    print(json.dumps({"drivers": drivers}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
