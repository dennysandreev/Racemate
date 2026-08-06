import {
  captureWorkerException,
  flushWorkerTelemetry,
} from "./instrumentation.mjs";

const { runWorkerCli } = await import("./index.mjs");

try {
  await runWorkerCli();
} catch (error) {
  captureWorkerException(error, {
    jobName: process.argv[2],
    runId: getCliOption("attached-run-id"),
  });
  await flushWorkerTelemetry();
  process.exitCode = 1;
}

function getCliOption(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}
