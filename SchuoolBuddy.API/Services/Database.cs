using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace SchoolBuddy.API.Services;

// Вибір бази за рядком підключення: postgres://… або Host=… → PostgreSQL (хостинг), інакше SQLite (локально).
public static class DatabaseSetup
{
    public static bool IsPostgres(string connectionString) =>
        connectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        connectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) ||
        connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase);

    // Neon / Render дають URL виду postgresql://user:pass@host/db?sslmode=require — Npgsql хоче рядок ключ=значення
    public static string ToNpgsql(string cs)
    {
        if (!cs.StartsWith("postgres", StringComparison.OrdinalIgnoreCase) || !cs.Contains("://")) return cs;
        var uri = new Uri(cs);
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

    public static void Configure(DbContextOptionsBuilder options, string connectionString)
    {
        if (IsPostgres(connectionString)) options.UseNpgsql(ToNpgsql(connectionString));
        else options.UseSqlite(connectionString);
    }
}
