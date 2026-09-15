import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const versions = new Map<string, Promise<string>>();

/** Content-address the local circuit image so long browser caching survives asset updates. */
export function versionedCircuitAsset(src: string): Promise<string> {
  if (!/^\/f1\/circuits\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:webp|png|svg)$/.test(src)) {
    return Promise.resolve(src);
  }

  const existing = versions.get(src);
  if (existing) return existing;

  const version = readFile(path.join(process.cwd(), "public", src))
    .then((bytes) => `${src}?v=${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`)
    .catch(() => {
      versions.delete(src);
      return src;
    });
  versions.set(src, version);
  return version;
}
