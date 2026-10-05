using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchuoolBuddy.API.Migrations
{
    /// <inheritdoc />
    public partial class AddSwipes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Swipes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    SwiperId = table.Column<int>(type: "INTEGER", nullable: false),
                    TargetId = table.Column<int>(type: "INTEGER", nullable: false),
                    Liked = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Swipes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Swipes_SwiperId_TargetId",
                table: "Swipes",
                columns: new[] { "SwiperId", "TargetId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Swipes_TargetId",
                table: "Swipes",
                column: "TargetId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Swipes");
        }
    }
}
