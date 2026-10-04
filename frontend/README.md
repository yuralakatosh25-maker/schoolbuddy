# SchoolBuddy — фронтенд

React 19 + Vite + Tailwind 4, PWA. Бекенд — `../SchuoolBuddy.API` (ASP.NET Core 10 + SQLite).

## Запуск

```bash
# 1. API (порт 5199): міграції та демо-дані застосовуються автоматично
dotnet run --project ../SchuoolBuddy.API --launch-profile http

# 2. Фронтенд (порт 5173): запити /api проксіюються на API
npm install
npm run dev
```

Відкрий http://localhost:5173.

- **Вхід поштою.** Тільки `@infis.cz`. Поки SMTP не налаштовано (`Smtp` в `appsettings.json`), код показується прямо на екрані входу.
- **Демо-режим.** Кнопки «Як студент / ментор / адмін» на екрані входу — тестові акаунти без реальних даних. Адмін може скинути демо-дані в адмін-панелі.
- **Адмін.** Будь-яка пошта зі списку `School:Admins` в `appsettings.json` отримує роль адміністратора.
- **Каса партнера.** http://localhost:5173/partner, демо-ключі: `klatovka-demo-key`, `cyberarena-demo-key`, `bistro-demo-key`.

## Структура

- `src/app` — контекст (користувач, мова, сповіщення), навігація, оболонка (шапка, таб-бар).
- `src/screens` — екрани.
- `src/components` — UI-компоненти, QR, рядки списків, пасхалка.
- `src/lib/i18n.js` — усі тексти: кожен ключ має переклад `[UA, CZ, EN]`.
