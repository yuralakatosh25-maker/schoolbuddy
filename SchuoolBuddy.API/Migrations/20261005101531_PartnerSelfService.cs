using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchuoolBuddy.API.Migrations
{
    /// <inheritdoc />
    public partial class PartnerSelfService : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContactEmail",
                table: "Partners",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Partners",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Partners",
                type: "TEXT",
                nullable: false,
                defaultValue: "approved");

            migrationBuilder.AddColumn<int>(
                name: "PurchaseAmount",
                table: "CoinTransactions",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContactEmail",
                table: "Partners");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Partners");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Partners");

            migrationBuilder.DropColumn(
                name: "PurchaseAmount",
                table: "CoinTransactions");
        }
    }
}
