import { existsSync, readFileSync } from "node:fs";

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

loadEnvFiles([".env", ".env.local"]);

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();

if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
  console.error("Сначала добавьте TELEGRAM_API_ID и TELEGRAM_API_HASH в окружение worker.");
  process.exit(1);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Авторизацию нужно запускать в интерактивном терминале.");
  process.exit(1);
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 3,
  floodSleepThreshold: 0,
});
client.setLogLevel("none");

try {
  console.log("Telegram-аккаунт RaceMate будет авторизован только в этой сессии терминала.");
  await client.start({
    phoneNumber: () => readHiddenLine("Номер телефона с кодом страны: "),
    phoneCode: () => readHiddenLine("Код из Telegram: "),
    password: () => readHiddenLine("Пароль 2FA: "),
    onError: (error) => {
      console.error(getSafeAuthorizationError(error));
    },
  });

  const session = client.session.save();

  if (!session) {
    throw new Error("Telegram не вернул session string");
  }

  console.log("\nСессия создана. Скопируйте строку в секреты окружения worker и не сохраняйте её в Supabase:");
  console.log(`TELEGRAM_SESSION=${session}`);
  console.log("После добавления секрета закройте историю терминала, если она сохраняет вывод команд.");
} catch (error) {
  console.error(getSafeAuthorizationError(error));
  process.exitCode = 1;
} finally {
  await client.disconnect().catch(() => undefined);
}

function loadEnvFiles(paths) {
  for (const path of paths) {
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const name = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (name && process.env[name] === undefined) process.env[name] = value;
    }
  }
}

function readHiddenLine(prompt) {
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const finish = (error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value.trim());
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish(new Error("Авторизация отменена"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    };

    process.stdout.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function getSafeAuthorizationError(error) {
  const code = String(error?.errorMessage ?? error?.code ?? "").toUpperCase();
  if (code.includes("PHONE_CODE_INVALID")) return "Код не подошёл. Проверьте его и попробуйте ещё раз.";
  if (code.includes("PHONE_CODE_EXPIRED")) return "Код устарел. Запустите авторизацию заново.";
  if (code.includes("PASSWORD_HASH_INVALID")) return "Пароль 2FA не подошёл. Попробуйте ещё раз.";
  if (code.includes("PHONE_NUMBER_INVALID")) return "Telegram не распознал номер телефона.";
  if (code.includes("FLOOD")) return "Telegram временно ограничил попытки входа. Повторите позже.";
  if (error?.message === "Авторизация отменена") return error.message;
  return "Не удалось авторизовать Telegram-аккаунт. Проверьте настройки и повторите попытку.";
}
