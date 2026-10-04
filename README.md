# SchoolBuddy

Платформа взаємного менторства для учнів SŠINFIS (Пльзень): метчинг за інтересами, SOS-допомога, розклад, домашка, зустрічі з PIN/QR, групи, події, анонімний форум, Buddy Coins, адмін-панель. Інтерфейс UA / CZ / EN, світла й темна теми, PWA.

- `frontend/` — React 19 + Vite + Tailwind 4 (подробиці в [frontend/README.md](frontend/README.md))
- `SchuoolBuddy.API/` — ASP.NET Core 10 + EF Core + SQLite; у продакшні також роздає зібраний фронтенд

## Запуск локально

```bash
dotnet run --project SchuoolBuddy.API --launch-profile http
npm --prefix frontend run dev
```

Відкрий http://localhost:5173 (на екрані входу є демо-акаунти).

## Публікація

Див. [DEPLOY.md](DEPLOY.md) — Render + Neon (Postgres) + Brevo, усе безкоштовно.
