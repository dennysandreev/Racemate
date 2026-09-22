#!/usr/bin/env python3
"""Fetch the reviewed Miami source lock; never silently refresh a cached source."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / 'docs/track-model-miami-source-manifest.json'


def verify(path, entry):
    data = path.read_bytes()
    if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise ValueError(f"Miami source checksum mismatch: {entry['file']}")


def download(offline=False):
    manifest = json.loads(LOCK.read_text())
    directory = ROOT / '.track-model-build/miami-source'
    directory.mkdir(parents=True, exist_ok=True)

    def fetch(entry):
        target = directory / entry['file']
        if target.exists():
            verify(target, entry)
            return
        if offline:
            raise FileNotFoundError(f"Missing pinned Miami source: {target}")
        request = urllib.request.Request(entry['url'], headers={'User-Agent': 'RaceSide geographic asset builder/1.0'})
        with urllib.request.urlopen(request, timeout=180) as response:
            data = response.read()
        if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError(f"Upstream {entry['file']} changed; review and update the source lock explicitly")
        temporary = target.with_suffix(target.suffix + '.download')
        temporary.write_bytes(data)
        temporary.replace(target)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(fetch, manifest['sources']))
    (directory / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f"Miami: verified {len(manifest['sources'])} pinned sources")
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true')
    download(parser.parse_args().offline)
