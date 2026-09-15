import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const heartbeatIntervalMs = 60_000;
const maxCapturedOutputLength = 32_000;

export function parseLoopArguments(args) {
  const options = {
    busyDelayMs: 1_000,
    commandArgs: [],
    heartbeatService: null,
    idleDelayMs: 15_000,
    maxBackoffMs: 300_000,
  };

  for (const argument of args) {
    if (argument.startsWith("--loop-idle-ms=")) {
      options.idleDelayMs = parsePositiveInteger(argument, "--loop-idle-ms=");
    } else if (argument.startsWith("--loop-busy-ms=")) {
      options.busyDelayMs = parsePositiveInteger(argument, "--loop-busy-ms=");
    } else if (argument.startsWith("--loop-max-backoff-ms=")) {
      options.maxBackoffMs = parsePositiveInteger(argument, "--loop-max-backoff-ms=");
    } else if (argument.startsWith("--loop-heartbeat-service=")) {
      options.heartbeatService = argument.slice("--loop-heartbeat-service=".length).trim() || null;
    } else if (argument.startsWith("--loop-")) {
      throw new Error(`Unknown worker loop option: ${argument.split("=")[0]}`);
    } else {
      options.commandArgs.push(argument);
    }
  }

  if (!options.commandArgs.length) {
    throw new Error("Worker command is required");
  }

  options.maxBackoffMs = Math.max(options.idleDelayMs, options.maxBackoffMs);
  return options;
}

export function getItemsProcessed(output) {
  const lines = String(output ?? "").trim().split("\n").reverse();

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      if (Number.isFinite(parsed?.itemsProcessed)) {
        return Number(parsed.itemsProcessed);
      }
    } catch {
      // Worker commands may emit progress lines before their final JSON result.
    }
  }

  return null;
}

export function calculateLoopDelayMs({
  busyDelayMs,
  exitCode,
  failureCount,
  idleDelayMs,
  itemsProcessed,
  maxBackoffMs,
}) {
  if (exitCode === 0) {
    return Number(itemsProcessed) > 0 ? busyDelayMs : idleDelayMs;
  }

  return Math.min(
    maxBackoffMs,
    idleDelayMs * (2 ** Math.max(1, failureCount)),
  );
}

async function runLoop() {
  const options = parseLoopArguments(process.argv.slice(2));
  let activeChild = null;
  let failureCount = 0;
  let nextHeartbeatAt = 0;
  let stopping = false;

  const stop = (signal) => {
    stopping = true;
    activeChild?.kill(signal);
  };

  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  while (!stopping) {
    if (options.heartbeatService && Date.now() >= nextHeartbeatAt) {
      await runWorkerCommand(
        ["ops.heartbeat", "--service", options.heartbeatService],
        (child) => {
          activeChild = child;
        },
      );
      activeChild = null;
      nextHeartbeatAt = Date.now() + heartbeatIntervalMs;
    }

    if (stopping) break;

    const result = await runWorkerCommand(options.commandArgs, (child) => {
      activeChild = child;
    });
    activeChild = null;

    if (stopping) break;

    failureCount = result.exitCode === 0 ? 0 : failureCount + 1;
    const itemsProcessed = getItemsProcessed(result.output);
    const baseDelayMs = calculateLoopDelayMs({
      ...options,
      exitCode: result.exitCode,
      failureCount,
      itemsProcessed,
    });
    const jitterMs = Math.floor(Math.random() * Math.min(5_000, baseDelayMs * 0.1));
    const delayMs = baseDelayMs + jitterMs;

    if (result.exitCode !== 0) {
      process.stderr.write(
        `[worker.loop] command=${options.commandArgs[0]} exitCode=${result.exitCode} retryMs=${delayMs}\n`,
      );
    }

    await sleep(delayMs);
  }
}

function runWorkerCommand(commandArgs, onSpawn) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["worker/cli.mjs", ...commandArgs], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";

    onSpawn(child);
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output = `${output}${chunk}`.slice(-maxCapturedOutputLength);
    });
    child.once("error", () => resolve({ exitCode: 1, output }));
    child.once("exit", (code) => resolve({ exitCode: code ?? 1, output }));
  });
}

function parsePositiveInteger(argument, prefix) {
  const value = Number(argument.slice(prefix.length));

  if (!Number.isSafeInteger(value) || value < 250) {
    throw new Error(`${prefix.slice(0, -1)} must be an integer of at least 250`);
  }

  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLoop().catch((error) => {
    process.stderr.write(`[worker.loop] fatal=${error instanceof Error ? error.message : "unknown"}\n`);
    process.exitCode = 1;
  });
}
