import "server-only";

type TurnstileResponse = {
  success?: boolean;
};

export async function verifyTurnstileToken(token: string) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    return true;
  }

  if (!token) {
    return false;
  }

  const body = new FormData();
  body.set("secret", secretKey);
  body.set("response", token);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      body,
      method: "POST",
    });
    const payload = (await response.json()) as TurnstileResponse;

    return Boolean(response.ok && payload.success);
  } catch {
    return false;
  }
}
