import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

export async function readPublicShareImageDataUrl(
  source: string,
  publicRoot = join(process.cwd(), "public"),
) {
  if (!/^\/[a-zA-Z0-9/_-]+\.(?:jpe?g|png)$/i.test(source)) {
    return null;
  }

  const mimeType = getMimeType(extname(source));

  if (!mimeType) {
    return null;
  }

  try {
    const bytes = await readFile(join(publicRoot, source.slice(1)));
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function getMimeType(extension: string) {
  switch (extension.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return null;
  }
}
