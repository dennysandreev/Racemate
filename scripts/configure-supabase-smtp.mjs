import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvFile(".env");
loadEnvFile(".env.local");

if (!process.env.SUPABASE_ACCESS_TOKEN && process.env.SUPABASE_ACCESS_TOKEN_STDIN === "1") {
  process.env.SUPABASE_ACCESS_TOKEN = await readStdin();
}

if (!process.env.SUPABASE_PROJECT_REF) {
  process.env.SUPABASE_PROJECT_REF = readProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

const required = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
];
const smtpFields = [
  "SMTP_ADMIN_EMAIL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SENDER_NAME",
];

const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

const projectRef = process.env.SUPABASE_PROJECT_REF;
const configuredSmtpFields = smtpFields.filter((name) => process.env[name]);
const missingSmtpFields = smtpFields.filter((name) => !process.env[name]);
const shouldConfigureSmtp = configuredSmtpFields.length === smtpFields.length;

if (configuredSmtpFields.length > 0 && !shouldConfigureSmtp) {
  console.error(`Incomplete SMTP env: missing ${missingSmtpFields.join(", ")}`);
  process.exit(1);
}

const rateLimits = {
  rate_limit_otp: readPositiveInt("AUTH_RATE_LIMIT_OTP", 10000),
  rate_limit_verify: readPositiveInt("AUTH_RATE_LIMIT_VERIFY", 10000),
  rate_limit_token_refresh: readPositiveInt("AUTH_RATE_LIMIT_TOKEN_REFRESH", 10000),
};
const patchBody = {
  external_email_enabled: true,
  mailer_secure_email_change_enabled: true,
  mailer_autoconfirm: false,
  ...rateLimits,
};

if (shouldConfigureSmtp) {
  rateLimits.rate_limit_email_sent = readPositiveInt("AUTH_RATE_LIMIT_EMAIL_SENT", 10000);

  Object.assign(patchBody, {
    smtp_admin_email: process.env.SMTP_ADMIN_EMAIL,
    smtp_host: process.env.SMTP_HOST,
    smtp_port: process.env.SMTP_PORT,
    smtp_user: process.env.SMTP_USER,
    smtp_pass: process.env.SMTP_PASS,
    smtp_sender_name: process.env.SMTP_SENDER_NAME,
    smtp_max_frequency: readPositiveInt("AUTH_SMTP_MAX_FREQUENCY", 1),
  });
}

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
  {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(patchBody),
  },
);

const text = await response.text();
let payload;

try {
  payload = JSON.parse(text);
} catch {
  payload = { message: text };
}

if (!response.ok) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        status: response.status,
        error: payload.error ?? payload.message ?? payload,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
      {
        ok: true,
        projectRef,
      smtpConfigured: shouldConfigureSmtp,
      smtpHost: shouldConfigureSmtp ? process.env.SMTP_HOST : null,
      smtpPort: shouldConfigureSmtp ? Number(process.env.SMTP_PORT) : null,
      from: shouldConfigureSmtp ? process.env.SMTP_ADMIN_EMAIL : null,
      senderName: shouldConfigureSmtp ? process.env.SMTP_SENDER_NAME : null,
      rateLimits,
    },
    null,
    2,
  ),
);

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = unwrapEnvValue(rawValueParts.join("=").trim());
  }
}

function unwrapEnvValue(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readPositiveInt(name, fallback) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    console.error(`${name} must be a positive integer`);
    process.exit(1);
  }

  return value;
}

async function readStdin() {
  let value = "";

  for await (const chunk of process.stdin) {
    value += chunk;
  }

  return value.trim();
}

function readProjectRefFromUrl(url) {
  if (!url) {
    return undefined;
  }

  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return undefined;
  }
}
