import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import sharp from "sharp";

export async function readPublicShareImageDataUrl(
  source: string,
  publicRoot = join(process.cwd(), "public"),
) {
  if (!/^\/[a-zA-Z0-9/_-]+\.(?:jpe?g|png|svg|webp)$/i.test(source)) {
    return null;
  }

  const extension = extname(source);
  const mimeType = getMimeType(extension);

  if (!mimeType) {
    return null;
  }

  try {
    const bytes = await readFile(join(publicRoot, source.slice(1)));

    if (extension.toLowerCase() === ".webp") {
      const png = await sharp(bytes).png().toBuffer();
      return `data:image/png;base64,${png.toString("base64")}`;
    }

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
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return null;
  }
}
