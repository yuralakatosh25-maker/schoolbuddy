using Microsoft.EntityFrameworkCore;

namespace SchoolBuddy.API.Models;

// Той самий AppDbContext, але окремий тип, щоб міграції SQL Serveru (Migrations/SqlServer)
// не змішувалися з міграціями SQLite (Migrations/).
public class SqlServerAppDbContext : AppDbContext
{
    public SqlServerAppDbContext(DbContextOptions<SqlServerAppDbContext> options) : base(options) { }
}
