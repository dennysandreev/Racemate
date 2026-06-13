const required = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
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
const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
  {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      external_email_enabled: true,
      mailer_secure_email_change_enabled: true,
      mailer_autoconfirm: false,
      smtp_admin_email: process.env.SMTP_ADMIN_EMAIL,
      smtp_host: process.env.SMTP_HOST,
      smtp_port: Number(process.env.SMTP_PORT),
      smtp_user: process.env.SMTP_USER,
      smtp_pass: process.env.SMTP_PASS,
      smtp_sender_name: process.env.SMTP_SENDER_NAME,
    }),
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
      smtpHost: process.env.SMTP_HOST,
      smtpPort: Number(process.env.SMTP_PORT),
      from: process.env.SMTP_ADMIN_EMAIL,
      senderName: process.env.SMTP_SENDER_NAME,
    },
    null,
    2,
  ),
);
