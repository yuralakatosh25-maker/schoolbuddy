# SchoolBuddy

Платформа взаємного менторства для учнів SŠINFIS (Пльзень): метчинг за інтересами, SOS-допомога, розклад, домашка, зустрічі з PIN/QR, групи, події, анонімний форум, Buddy Coins, адмін-панель. Інтерфейс UA / CZ / EN, світла й темна теми, PWA.

- `frontend/` — React 19 + Vite + Tailwind 4 (подробиці в [frontend/README.md](frontend/README.md))
- `SchuoolBuddy.API/` — ASP.NET Core 10 + EF Core (SQLite / PostgreSQL / SQL Server); у продакшні також роздає зібраний фронтенд

## Запуск локально

```bash
dotnet run --project SchuoolBuddy.API --launch-profile http
npm --prefix frontend run dev
```

Відкрий http://localhost:5173 (на екрані входу є демо-акаунти).

## База даних

Провайдер обирається параметром `Database:Provider` (змінна середовища `Database__Provider`): `Sqlite`, `Postgres` або `SqlServer`. Якщо його не задано, вибір іде за рядком підключення `ConnectionStrings:Default`, як і раніше: `postgresql://…` або `Host=…` → PostgreSQL, інакше SQLite.

| Провайдер | Рядок підключення (приклад) | Схема |
|---|---|---|
| `Sqlite` (за замовчуванням локально) | `Data Source=schoolbuddy.db` | міграції в `SchuoolBuddy.API/Migrations/` |
| `Postgres` (Render + Neon) | `postgresql://user:pass@host/db` | `EnsureCreated` під час старту |
| `SqlServer` | `Server=localhost,1433;Database=SchoolBuddy;User Id=sa;Password=…;TrustServerCertificate=True` | міграції в `SchuoolBuddy.API/Migrations/SqlServer/` |

Міграції застосовуються автоматично під час старту API, базу SQL Server теж створять вони.

### SQL Server 2022 у Dockerі

Потрібен Docker Desktop (або Docker Engine з Compose).

```bash
# усе разом: SQL Server 2022 + застосунок (фронтенд і API) на http://localhost:8080
docker compose up --build

# або лише база, а API запускаєш сам (з IDE чи терміналу)
docker compose up -d sqlserver
```

Для `dotnet run` проти бази з Compose задай провайдера й рядок підключення (PowerShell):

```powershell
$env:Database__Provider = "SqlServer"
$env:ConnectionStrings__Default = "Server=localhost,1433;Database=SchoolBuddy;User Id=sa;Password=SchoolBuddy_Dev123!;TrustServerCertificate=True"
dotnet run --project SchuoolBuddy.API --launch-profile http
```

(у bash: `Database__Provider=SqlServer ConnectionStrings__Default="…" dotnet run --project SchuoolBuddy.API --launch-profile http`)

Пароль `sa` за замовчуванням — `SchoolBuddy_Dev123!`; інший задаєш змінною `MSSQL_SA_PASSWORD` перед `docker compose up` (SQL Server вимагає 8+ символів із великими й малими літерами та цифрами). Дані бази лежать у томі `mssql-data`; `docker compose down -v` їх видалить. Паролі й ключі в `docker-compose.yml` — лише для локальної розробки.

### Нова міграція після зміни моделей

Моделі спільні, але міграції окремі для кожного провайдера, тож після зміни `Models/` додай міграцію для обох:

```bash
cd SchuoolBuddy.API
dotnet ef migrations add <Назва> --context AppDbContext
dotnet ef migrations add <Назва> --context SqlServerAppDbContext --output-dir Migrations/SqlServer --namespace SchuoolBuddy.API.Migrations.SqlServer
```

Для PostgreSQL міграцій немає: нові таблиці чи стовпці на Render треба дописати в SQL-блок у `Program.cs` (поруч з `EnsureCreated`).

## Публікація

Див. [DEPLOY.md](DEPLOY.md) — Render + Neon (Postgres) + Brevo, усе безкоштовно.
