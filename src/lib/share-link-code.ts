import { randomBytes } from "node:crypto";

export const SHARE_LINK_CODE_LENGTH = 7;
export const SHARE_LINK_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const MAX_UNBIASED_BYTE = 256 - (256 % SHARE_LINK_ALPHABET.length);
const SHARE_LINK_CODE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{7}$/;

type RandomBytesSource = (size: number) => Uint8Array;

export function createShareLinkCode(
  source: RandomBytesSource = randomBytes,
): string {
  let code = "";

  while (code.length < SHARE_LINK_CODE_LENGTH) {
    const bytes = source(Math.max(8, (SHARE_LINK_CODE_LENGTH - code.length) * 2));

    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE) {
        continue;
      }

      code += SHARE_LINK_ALPHABET[byte % SHARE_LINK_ALPHABET.length];

      if (code.length === SHARE_LINK_CODE_LENGTH) {
        break;
      }
    }
  }

  return code;
}

export function isShareLinkCode(value: string): boolean {
  return SHARE_LINK_CODE_PATTERN.test(value);
}
