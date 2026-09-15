import "../worker/load-env.mjs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { transcribeRadio } from "../worker/live/radio.mjs";

const directory = await mkdtemp(join(tmpdir(), "raceside-radio-check-"));
const usage = [];
try {
  const aiff = join(directory, "sample.aiff"),
    mp3 = join(directory, "sample.mp3");
  const phrase =
    "Radio check. The front left tyre is losing grip. Box this lap for hard tyres. Watch the yellow flags in sector two.";
  for (const [command, args] of [
    ["/usr/bin/say", ["-v", "Samantha", "-o", aiff, phrase]],
    [
      "/opt/homebrew/bin/ffmpeg",
      ["-v", "error", "-i", aiff, "-codec:a", "libmp3lame", "-b:a", "64k", mp3],
    ],
  ]) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(`${command} failed: ${result.stderr}`);
  }
  const result = await transcribeRadio(
    "https://livetiming.formula1.com/test.mp3",
    {
      fetchAudioImpl: () => readFile(mp3),
      fetchImpl: async (...args) => {
        const response = await fetch(...args);
        if (!response.ok) {
          const error = await response
            .clone()
            .json()
            .catch(() => ({}));
          console.info(
            JSON.stringify({
              status: response.status,
              message: String(error.error?.message ?? "")
                .replaceAll(process.env.OPENROUTER_API_KEY, "[redacted]")
                .slice(0, 500),
            }),
          );
        }
        return response;
      },
      onUsage: (payload, model, purpose) =>
        usage.push({ model, purpose, usage: payload.usage ?? null }),
    },
  );
  await writeFile(
    "/private/tmp/raceside-radio-demo.json",
    JSON.stringify({ ...result, test: true, driverNumber: 44, usage }, null, 2),
    { mode: 0o600 },
  );
  console.info(JSON.stringify({ ok: true, ...result, usage }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
