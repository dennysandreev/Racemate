# 04. Auth and Telegram Linking

## Основное решение

Авторизация:
- email OTP/passwordless;
- без хранения паролей;
- рекомендуемый провайдер: Supabase Auth.

Email-доставка:
- для production подключить custom SMTP;
- рекомендуемые варианты: Resend, Postmark, SendGrid.

Telegram:
- не основной логин;
- пользователь подключает Telegram внутри профиля;
- Telegram нужен для уведомлений.

## User flow: email OTP

1. Пользователь открывает `/auth`.
2. Вводит email.
3. Получает одноразовый код.
4. Вводит код.
5. Supabase создает сессию.
6. Если профиль новый — создается row в `profiles`.
7. Пользователь проходит onboarding:
   - язык;
   - часовой пояс;
   - любимые команды;
   - любимые пилоты;
   - подключить Telegram.

## Telegram linking flow

1. Пользователь авторизован по email.
2. В профиле нажимает “Подключить Telegram”.
3. Backend генерирует random token.
4. В БД сохраняется только `token_hash`, а не raw token.
5. Срок жизни токена — 10 минут.
6. Frontend показывает ссылку:

```text
https://t.me/<bot_username>?start=link_<raw_token>
```

7. Пользователь открывает бота.
8. Бот получает `/start link_<raw_token>`.
9. Backend проверяет token hash, срок и used_at.
10. Backend связывает:
   - user_id;
   - telegram_id;
   - chat_id;
   - username.
11. Token помечается used.
12. Бот пишет: “Telegram подключен”.

## Важные правила безопасности

- Raw token не хранить.
- Raw token не логировать.
- Token одноразовый.
- Token expires in 10 minutes.
- Endpoint создания токена требует auth.
- Telegram webhook должен иметь secret.
- Service role key только на backend/worker.
- Нельзя принимать user_id с frontend при привязке Telegram.

## Команды бота

- `/start`
- `/help`
- `/summary`
- `/next`
- `/settings`
- `/unsubscribe`

## Notification preferences

Поля:
- daily_digest_enabled;
- race_reminders_enabled;
- breaking_news_enabled;
- favorite_team_news_enabled;
- predictions_reminders_enabled;
- digest_time_local;
- telegram_enabled;
- web_push_enabled.

## Disconnect

Пользователь может отключить Telegram:
- в профиле;
- командой `/unsubscribe`.

При отключении:
- `telegram_accounts.is_active = false`;
- `notification_preferences.telegram_enabled = false`.
