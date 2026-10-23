using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SchoolBuddy.API.Controllers;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// У продакшні заглушки секретів неприпустимі — їх треба задати змінними середовища
if (!builder.Environment.IsDevelopment())
{
    foreach (var key in new[] { "Jwt:Key", "Forum:Salt" })
        if (string.IsNullOrWhiteSpace(config[key]) || config[key]!.StartsWith("change-me"))
            throw new InvalidOperationException($"Set a real secret for '{key}' (env var {key.Replace(":", "__")}).");
}

// Каталог для файлу бази (напр. /home/data на Azure, який зберігається між перезапусками)
var connectionString = config.GetConnectionString("Default") ?? "Data Source=schoolbuddy.db";
var usePostgres = DatabaseSetup.IsPostgres(connectionString);
// Забутий рядок підключення на хостингу означав би тиху SQLite в контейнері, яка зникає при кожному перезапуску
if (!builder.Environment.IsDevelopment() && connectionString.Trim() == "Data Source=schoolbuddy.db")
    throw new InvalidOperationException("Set ConnectionStrings__Default (PostgreSQL URL, or an explicit SQLite 'Data Source=...' on a persistent disk).");
if (!usePostgres && !builder.Environment.IsDevelopment() && !connectionString.TrimStart().StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException("ConnectionStrings__Default must be a PostgreSQL URL (postgresql://user:password@host/db) or a SQLite 'Data Source=...' string.");
if (!usePostgres)
{
    var dbFile = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(connectionString).DataSource;
    var dbDir = Path.GetDirectoryName(Path.GetFullPath(dbFile));
    if (!string.IsNullOrEmpty(dbDir)) Directory.CreateDirectory(dbDir);
}

builder.Services.AddDbContext<AppDbContext>(options => DatabaseSetup.Configure(options, connectionString));

builder.Services.AddHttpClient();
builder.Services.AddSingleton<Moderation>();
builder.Services.AddSingleton<AnonHasher>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<EmailSender>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<Gamification>();
builder.Services.AddScoped<UserCleanup>();
builder.Services.AddScoped<ScheduleService>();
builder.Services.AddScoped<SosService>();
builder.Services.AddScoped<ConnectionService>();
builder.Services.AddScoped<DemoSeeder>();
builder.Services.AddHostedService<ReminderService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = config["Jwt:Issuer"],
            ValidAudience = config["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
                config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured"))),
        };
        // Токен видаленого або заблокованого користувача більше не діє
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async ctx =>
            {
                var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var id = int.TryParse(ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var v) ? v : 0;
                var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id);
                if (user == null || user.IsBlocked) ctx.Fail("user unavailable");
                else if (user.IsDemo) ((ClaimsIdentity)ctx.Principal!.Identity!).AddClaim(new Claim("demo", "1"));
            },
        };
    });
builder.Services.AddAuthorization();

// Хостинг стоїть за проксі: справжня IP клієнта — у X-Forwarded-For (потрібно для лімітів за IP)
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

// Ліміти запитів за IP: вхід/коди, демо-вхід і каса партнера
static RateLimitPartition<string> PerIp(HttpContext http, int permits) =>
    RateLimitPartition.GetFixedWindowLimiter(http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1) });
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, ct) => new ValueTask(ctx.HttpContext.Response.WriteAsJsonAsync(new { error = "too_many_requests" }, ct));
    o.AddPolicy("auth", http => PerIp(http, 30)); // ціла школа може сидіти за однією IP; від підбору коду захищають ліміти на пошту
    o.AddPolicy("partner", http => PerIp(http, 60));
    // підтвердження зустрічі PIN-кодом: 5 спроб на хвилину на користувача — PIN не підібрати за 10 хв його життя
    o.AddPolicy("pin", http => RateLimitPartition.GetFixedWindowLimiter(
        http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles);

builder.Services.AddCors(options => options.AddPolicy("Frontend", policy =>
    policy.WithOrigins(config.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:5173"])
        .AllowAnyHeader().AllowAnyMethod()));

// Хостинги (Render, Fly тощо) повідомляють порт змінною PORT
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } port)
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

var app = builder.Build();

// Міграції + довідкові та демо-дані при старті
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // SQLite (локально) оновлюється міграціями; для PostgreSQL схему створює EnsureCreated
    // (міграції в проєкті написані під SQLite).
    if (usePostgres)
    {
        db.Database.EnsureCreated();
        // EnsureCreated не додає нові таблиці до вже наявної бази — доводимо вручну
        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS "Swipes" (
                "Id" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                "SwiperId" integer NOT NULL,
                "TargetId" integer NOT NULL,
                "Liked" boolean NOT NULL,
                "CreatedAt" timestamptz NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_Swipes_SwiperId_TargetId" ON "Swipes" ("SwiperId", "TargetId");
            CREATE INDEX IF NOT EXISTS "IX_Swipes_TargetId" ON "Swipes" ("TargetId");
            ALTER TABLE "Partners" ADD COLUMN IF NOT EXISTS "ContactEmail" varchar(200);
            ALTER TABLE "Partners" ADD COLUMN IF NOT EXISTS "Status" text NOT NULL DEFAULT 'approved';
            ALTER TABLE "Partners" ADD COLUMN IF NOT EXISTS "CreatedAt" timestamptz NOT NULL DEFAULT now();
            ALTER TABLE "CoinTransactions" ADD COLUMN IF NOT EXISTS "PurchaseAmount" integer;
            """);
    }
    else db.Database.Migrate();
    var seeder = scope.ServiceProvider.GetRequiredService<DemoSeeder>();
    await seeder.SeedReferenceAsync();
    await seeder.SyncRewardsAsync();
    // демо-розклад (контрольні, заміни) — тільки в демо-режимі
    if (config.GetValue("Demo:Enabled", true))
    {
        await seeder.EnsureTimelineAsync();
        await seeder.SeedDemoAsync();
    }
}

app.UseForwardedHeaders();
app.UseCors("Frontend");

// Зібраний фронтенд (wwwroot) роздається тим самим сервером
app.UseDefaultFiles();
app.UseStaticFiles();

// автентифікація перед лімітером: ліміт PIN рахується на користувача, а не на всю шкільну IP
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { ok = true }));
// Prezentace pro soutěž. Adresa pod /api/ projde i přes starý service worker, který /prezentace/ ještě nezná
var deckPath = Path.Combine(app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot"), "prezentace", "index.html");
IResult Deck() => File.Exists(deckPath) ? Results.File(deckPath, "text/html; charset=utf-8") : Results.NotFound();
app.MapGet("/api/prezentace", Deck);
app.MapGet("/prezentace", () => Results.Redirect("/api/prezentace"));
// Невідомі /api/... — 404, усе інше (/invite/..., /partner, /u/...) — сторінка застосунку
app.Map("/api/{**rest}", () => Results.NotFound(new { error = "not_found" }));
app.MapFallbackToFile("index.html");

app.Run();
