import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup() {
  let now = 0;
  const context = vm.createContext({
    exports: {},
    require: () => ({}),
    Date: { now: () => now },
  });
  const source = readFileSync(new URL("./server-ttl-cache.ts", import.meta.url), "utf8");
  vm.runInContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return {
    cache: context.exports.withServerTtlCache,
    invalidate: context.exports.invalidateServerTtlCache,
    invalidatePrefix: context.exports.invalidateServerTtlCachePrefix,
    advance: (ms) => { now += ms; },
  };
}

test("concurrent cold requests share one loader and expiry starts after it resolves", async () => {
  const { cache, advance } = setup();
  let resolve;
  let calls = 0;
  const load = () => { calls++; return new Promise((done) => { resolve = done; }); };
  const first = cache("public:news", 100, load);
  const second = cache("public:news", 100, load);
  advance(500);
  resolve("news");
  assert.equal(await first, "news");
  assert.equal(await second, "news");
  assert.equal(await cache("public:news", 100, load), "news");
  assert.equal(calls, 1);
});

test("stale reads return immediately and share a single background refresh", async () => {
  const { cache, advance } = setup();
  const options = { staleWhileRevalidateMs: 200 };
  await cache("public:news", 100, async () => "old", options);
  advance(101);
  let resolve;
  let calls = 0;
  const load = () => { calls++; return new Promise((done) => { resolve = done; }); };
  assert.equal(await cache("public:news", 100, load, options), "old");
  assert.equal(await cache("public:news", 100, load, options), "old");
  assert.equal(calls, 1);
  resolve("new");
  await Promise.resolve();
  assert.equal(await cache("public:news", 100, load, options), "new");
});

test("failed cold loads are retried instead of poisoning the cache", async () => {
  const { cache } = setup();
  await assert.rejects(cache("public:news", 100, async () => { throw new Error("offline"); }));
  assert.equal(await cache("public:news", 100, async () => "recovered"), "recovered");
});

test("explicit invalidation refreshes exact and prefixed entries", async () => {
  const { cache, invalidate, invalidatePrefix } = setup();
  await cache("auth:subscription:user-1", 100, async () => "old-1");
  await cache("auth:subscription:user-2", 100, async () => "old-2");

  invalidate("auth:subscription:user-1");
  assert.equal(await cache("auth:subscription:user-1", 100, async () => "new-1"), "new-1");
  assert.equal(await cache("auth:subscription:user-2", 100, async () => "miss"), "old-2");

  invalidatePrefix("auth:subscription:");
  assert.equal(await cache("auth:subscription:user-2", 100, async () => "new-2"), "new-2");
});

test("profile churn cannot evict public data and users retain separate values", async () => {
  const { cache } = setup();
  await cache("public:home", 100, async () => "home");
  for (let i = 0; i < 80; i++) await cache(`auth:profile:${i}`, 100, async () => `user-${i}`);
  assert.equal(await cache("public:home", 100, async () => assert.fail("public cache evicted")), "home");
  assert.equal(await cache("auth:profile:79", 100, async () => assert.fail("profile missed")), "user-79");
  assert.equal(await cache("auth:profile:78", 100, async () => assert.fail("profile missed")), "user-78");
});

test("recently read public data survives eviction by filter combinations", async () => {
  const { cache } = setup();
  await cache("public:home", 100, async () => "home");
  for (let i = 0; i < 63; i++) await cache(`public:filter:${i}`, 100, async () => i);
  await cache("public:home", 100, async () => assert.fail("home missed"));
  await cache("public:filter:63", 100, async () => 63);
  assert.equal(await cache("public:home", 100, async () => assert.fail("hot entry evicted")), "home");
  assert.equal(await cache("public:filter:0", 100, async () => "reloaded"), "reloaded");
});
