using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace SchoolBuddy.API.Services;

// Вибір бази за рядком підключення: postgres://… або Host=… → PostgreSQL (хостинг), інакше SQLite (локально).
public static partial class DatabaseSetup
{
    // Neon показує команду на кшталт  psql 'postgresql://user:pass@host/db?sslmode=require'
    // — тож шукаємо URL усередині рядка, ігноруючи пробіли, лапки й префікс psql.
    [GeneratedRegex(@"postgres(?:ql)?://[^\s'""]+", RegexOptions.IgnoreCase)]
    private static partial Regex PostgresUrl();

    public static bool IsPostgres(string connectionString) =>
        PostgresUrl().IsMatch(connectionString) ||
        connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase);

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

    public static void Configure(DbContextOptionsBuilder options, string connectionString)
    {
        if (IsPostgres(connectionString)) options.UseNpgsql(ToNpgsql(connectionString));
        else options.UseSqlite(connectionString);
    }
}
