using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Npgsql;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Services;

public enum DbProvider { Sqlite, Postgres, SqlServer }

// Вибір бази: явно через Database:Provider (Sqlite / Postgres / SqlServer),
// інакше за рядком підключення: postgres://… або Host=… → PostgreSQL (хостинг), решта → SQLite (локально).
public static partial class DatabaseSetup
{
    // Neon показує команду на кшталт  psql 'postgresql://user:pass@host/db?sslmode=require'
    // — тож шукаємо URL усередині рядка, ігноруючи пробіли, лапки й префікс psql.
    [GeneratedRegex(@"postgres(?:ql)?://[^\s'""]+", RegexOptions.IgnoreCase)]
    private static partial Regex PostgresUrl();

    public static bool IsPostgres(string connectionString) =>
        PostgresUrl().IsMatch(connectionString) ||
        connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase);

    public static DbProvider ResolveProvider(string? configured, string connectionString)
    {
        if (string.IsNullOrWhiteSpace(configured))
            return IsPostgres(connectionString) ? DbProvider.Postgres : DbProvider.Sqlite;
        return configured.Trim().ToLowerInvariant() switch
        {
            "sqlite" => DbProvider.Sqlite,
            "postgres" or "postgresql" or "npgsql" => DbProvider.Postgres,
            "sqlserver" or "mssql" => DbProvider.SqlServer,
            _ => throw new InvalidOperationException(
                $"Unknown Database:Provider '{configured}'. Use Sqlite, Postgres or SqlServer."),
        };
    }

    // Neon / Render дають URL виду postgresql://user:pass@host/db?sslmode=require — Npgsql хоче рядок ключ=значення
    public static string ToNpgsql(string cs)
    {
        var match = PostgresUrl().Match(cs);
        if (!match.Success) return cs.Trim().Trim('\'', '"');
        var uri = new Uri(match.Value);
        var user = uri.UserInfo.Split(':', 2);
        return new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = Uri.UnescapeDataString(user[0]),
            Password = user.Length > 1 ? Uri.UnescapeDataString(user[1]) : null,
            SslMode = SslMode.Require,
        }.ConnectionString;
    }

    public static void Configure(DbContextOptionsBuilder options, DbProvider provider, string connectionString)
    {
        switch (provider)
        {
            case DbProvider.Postgres: options.UseNpgsql(ToNpgsql(connectionString)); break;
            // Транзієнтні помилки (контейнер SQL Serveru ще стартує) — кілька повторів
            case DbProvider.SqlServer: options.UseSqlServer(connectionString, o => o.EnableRetryOnFailure()); break;
            default: options.UseSqlite(connectionString); break;
        }
    }

    // Реєстрація контексту: для SQL Serveru — підклас із власними міграціями (Migrations/SqlServer),
    // решта коду й далі працює з AppDbContext.
    public static void AddAppDbContext(this IServiceCollection services, DbProvider provider, string connectionString)
    {
        if (provider == DbProvider.SqlServer)
            services.AddDbContext<AppDbContext, SqlServerAppDbContext>(o => Configure(o, provider, connectionString));
        else
            services.AddDbContext<AppDbContext>(o => Configure(o, provider, connectionString));
    }
}

// Для `dotnet ef migrations add … --context SqlServerAppDbContext`: SQL Server не потрібен,
// рядок підключення використовується лише якщо його задано (напр. для `dotnet ef database update`).
public class SqlServerAppDbContextFactory : IDesignTimeDbContextFactory<SqlServerAppDbContext>
{
    public SqlServerAppDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
            ?? "Server=localhost,1433;Database=SchoolBuddy;User Id=sa;TrustServerCertificate=True";
        var options = new DbContextOptionsBuilder<SqlServerAppDbContext>().UseSqlServer(cs).Options;
        return new SqlServerAppDbContext(options);
    }
}

// Для `dotnet ef … --context AppDbContext` (міграції SQLite у Migrations/) — без фабрики EF
// підставив би сюди SQL Server-фабрику вище.
public class SqliteAppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("ConnectionStrings__Default") ?? "Data Source=schoolbuddy.db";
        return new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(cs).Options);
    }
}
