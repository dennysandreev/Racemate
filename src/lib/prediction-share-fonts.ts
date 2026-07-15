import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const fontDirectory = join(
  process.cwd(),
  "node_modules/geist/dist/fonts/geist-sans",
);

const fontFiles = Promise.all([
  readGeistFont(join(fontDirectory, "Geist-Regular.ttf"), "Geist-Regular.ttf"),
  readGeistFont(join(fontDirectory, "Geist-Black.ttf"), "Geist-Black.ttf"),
]);

export async function getPredictionShareFonts() {
  const [regular, black] = await fontFiles;

  return [
    {
      data: toArrayBuffer(regular),
      name: "Geist",
      style: "normal" as const,
      weight: 400 as const,
    },
    {
      data: toArrayBuffer(black),
      name: "Geist",
      style: "normal" as const,
      weight: 900 as const,
    },
  ];
}

function toArrayBuffer(value: Buffer) {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

async function readGeistFont(directPath: string, fileName: string) {
  try {
    return await readFile(directPath);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    const packagesDirectory = join(process.cwd(), "node_modules/.pnpm");
    const packageNames = await readdir(packagesDirectory);
    const geistPackage = packageNames.find((name) => name.startsWith("geist@"));

    if (!geistPackage) {
      throw error;
    }

    return readFile(join(
      packagesDirectory,
      geistPackage,
      "node_modules/geist/dist/fonts/geist-sans",
      fileName,
    ));
  }
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
