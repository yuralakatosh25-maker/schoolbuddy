# SchoolBuddy

Webová aplikace pro vzájemné mentorství studentů SŠINFIS v Plzni: spojuje studenty, kteří potřebují pomoc, se staršími spolužáky podle předmětů a zájmů.

Projekt vznikl ve tříčlenném týmu pro studentskou soutěž. Rozhraní je v češtině, ukrajinštině a angličtině, má světlý i tmavý motiv a funguje jako PWA.

## Funkce

- **Párování a swipe**: doporučení mentorů podle předmětů a zájmů
- **SOS pomoc**: rychlá žádost o pomoc s úkolem nebo látkou
- **Rozvrh a domácí úkoly**
- **Schůzky s potvrzením přes PIN nebo QR kód**
- **Skupiny, akce a anonymní fórum** s moderací obsahu
- **Buddy Coins**: odměny za pomoc, které lze uplatnit u partnerských podniků (partner má vlastní pokladní rozhraní)
- **Notifikace a připomínky** (v aplikaci i e-mailem)
- **Administrace**: oznámení, moderace, správa uživatelů
- **Přihlášení školním e-mailem** (`@infis.cz`) s jednorázovým kódem a demo účty pro rychlou ukázku

Aplikace má čtyři role: student, mentor, administrátor a partner.

## Technologie

C# · .NET 10 (ASP.NET Core Web API) · Entity Framework Core (SQLite / PostgreSQL / SQL Server) · JWT · React 19 · Vite · Tailwind CSS 4 · Docker · docker-compose · Render

- `SchuoolBuddy.API/` je backend (ASP.NET Core 10 + EF Core). V produkci zároveň servíruje sestavený frontend.
- `frontend/` je frontend (React 19 + Vite + Tailwind 4), podrobnosti v [frontend/README.md](frontend/README.md).

## Spuštění

### Docker (vše najednou)

```bash
docker compose up --build
```

Spustí SQL Server 2022 a aplikaci (frontend + API) na http://localhost:8080.

### Lokálně bez Dockeru

```bash
dotnet run --project SchuoolBuddy.API --launch-profile http
npm --prefix frontend install
npm --prefix frontend run dev
```

Otevři http://localhost:5173 (na přihlašovací obrazovce jsou demo účty). Lokálně se ve výchozím stavu použije SQLite, migrace a demo data se aplikují automaticky.

## Databáze

Poskytovatel se volí parametrem `Database:Provider` (proměnná prostředí `Database__Provider`): `Sqlite`, `Postgres` nebo `SqlServer`. Pokud není zadán, rozhoduje připojovací řetězec `ConnectionStrings:Default`: `postgresql://…` nebo `Host=…` znamená PostgreSQL, jinak SQLite.

| Poskytovatel | Připojovací řetězec (příklad) | Schéma |
|---|---|---|
| `Sqlite` (výchozí lokálně) | `Data Source=schoolbuddy.db` | migrace v `SchuoolBuddy.API/Migrations/` |
| `Postgres` (Render + Neon) | `postgresql://user:pass@host/db` | `EnsureCreated` při startu |
| `SqlServer` | `Server=localhost,1433;Database=SchoolBuddy;User Id=sa;Password=…;TrustServerCertificate=True` | migrace v `SchuoolBuddy.API/Migrations/SqlServer/` |

Migrace se aplikují automaticky při startu API, databázi SQL Server vytvoří také ony.

### SQL Server 2022 v Dockeru

Je potřeba Docker Desktop (nebo Docker Engine s Compose).

```bash
# vše najednou: SQL Server 2022 + aplikace (frontend i API) na http://localhost:8080
docker compose up --build

# nebo jen databáze, API spouštíš sám (z IDE nebo terminálu)
docker compose up -d sqlserver
```

Pro `dotnet run` proti databázi z Compose nastav poskytovatele a připojovací řetězec (PowerShell):

```powershell
$env:Database__Provider = "SqlServer"
$env:ConnectionStrings__Default = "Server=localhost,1433;Database=SchoolBuddy;User Id=sa;Password=SchoolBuddy_Dev123!;TrustServerCertificate=True"
dotnet run --project SchuoolBuddy.API --launch-profile http
```

(v bash: `Database__Provider=SqlServer ConnectionStrings__Default="…" dotnet run --project SchuoolBuddy.API --launch-profile http`)

Výchozí heslo `sa` je `SchoolBuddy_Dev123!`; jiné nastavíš proměnnou `MSSQL_SA_PASSWORD` před `docker compose up` (SQL Server vyžaduje alespoň 8 znaků s velkými i malými písmeny a číslicemi). Data databáze leží ve svazku `mssql-data`; `docker compose down -v` je smaže. Hesla a klíče v `docker-compose.yml` jsou jen pro lokální vývoj.

### Nová migrace po změně modelů

Modely jsou společné, ale migrace jsou pro každého poskytovatele zvlášť, takže po změně `Models/` přidej migraci pro oba:

```bash
cd SchuoolBuddy.API
dotnet ef migrations add <Nazev> --context AppDbContext
dotnet ef migrations add <Nazev> --context SqlServerAppDbContext --output-dir Migrations/SqlServer --namespace SchuoolBuddy.API.Migrations.SqlServer
```

Pro PostgreSQL migrace nejsou: nové tabulky či sloupce na Renderu je potřeba doplnit do SQL bloku v `Program.cs` (vedle `EnsureCreated`).

## Nasazení

Aplikace běží na Renderu (Docker image z tohoto repozitáře, PostgreSQL na Neonu, e-maily přes Brevo). Push do větve `main` spustí nové nasazení. Postup je popsaný v [DEPLOY.md](DEPLOY.md) (zatím v ukrajinštině).

## Testy

Automatické testy projekt zatím nemá. Aplikaci jsme testovali ručně přes demo účty pro jednotlivé role.

## Moje role

Jsem **Yurii Lakatosh**, vedoucí tříčlenného týmu (dále Eliška Soukupová a Simona Šimková).

- Vedl jsem tým a rozděloval práci.
- Přišel jsem s nápadem aplikace.
- Navrhl jsem aplikaci: funkce, role uživatelů a podobu rozhraní.
- Vyvíjeno s AI asistentem (Claude); kód jsem reviewoval, testoval a opravoval.
