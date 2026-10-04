using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

[Route("api/auth")]
[AllowAnonymous]
public class AuthController(AppDbContext db, TokenService tokens, EmailSender email, Moderation moderation,
    Gamification game, NotificationService notify, IConfiguration config, IWebHostEnvironment env) : ApiBase
{
    bool ShowDevCode => !email.IsConfigured && config.GetValue("Auth:ShowDevCode", env.IsDevelopment());

    string Domain => config["School:EmailDomain"] ?? "infis.cz";

    public record CodeRequest(string Email);

    // Крок 1: на шкільну пошту надсилається 6-значний код
    [HttpPost("request-code")]
    public async Task<IActionResult> RequestCode(CodeRequest req)
    {
        var mail = (req.Email ?? "").Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(mail, @"^[a-z0-9._%+\-]+@[a-z0-9.\-]+$")) return Fail("email_invalid");
        if (!mail.EndsWith("@" + Domain)) return Fail("email_domain");
        // Без пошти і без режиму розробки код нікуди доставити — вхід поштою недоступний
        if (!email.IsConfigured && !ShowDevCode) return Fail("email_unavailable", 503);

        var recent = await db.EmailCodes.Where(c => c.Email == mail && !c.Used).OrderByDescending(c => c.Id).FirstOrDefaultAsync();
        if (recent != null && recent.ExpiresAt > DateTime.UtcNow.AddMinutes(9).AddSeconds(30)) return Fail("too_many_requests", 429);
        await db.EmailCodes.Where(c => c.Email == mail && !c.Used).ExecuteUpdateAsync(s => s.SetProperty(c => c.Used, true));

        var code = Codes.Digits(6);
        db.EmailCodes.Add(new EmailCode { Email = mail, Code = code, ExpiresAt = DateTime.UtcNow.AddMinutes(10) });
        var status = await email.SendAsync(mail, "SchoolBuddy: " + code, $"Your SchoolBuddy sign-in code: {code}\nKód pro přihlášení: {code}\nКод для входу: {code}");
        db.Outbox.Add(new OutboxMessage { Channel = "email", Recipient = mail, Subject = "Sign-in code", Body = "******", Status = status });
        await db.SaveChangesAsync();

        var exists = await db.Users.AnyAsync(u => u.Email == mail);
        // Без SMTP код показується прямо в інтерфейсі, щоб можна було увійти локально
        return Ok(new { isNew = !exists, devCode = ShowDevCode ? code : null });
    }

    public record VerifyRequest(string Email, string Code, string? Role, string? Nickname, bool Consent, string? InviteCode, string? Class, string? Lang);

    // Крок 2: перевірка коду → вхід або створення акаунта
    [HttpPost("verify")]
    public async Task<IActionResult> Verify(VerifyRequest req)
    {
        var mail = (req.Email ?? "").Trim().ToLowerInvariant();
        var entry = await db.EmailCodes.Where(c => c.Email == mail && !c.Used).OrderByDescending(c => c.Id).FirstOrDefaultAsync();
        if (entry == null || entry.ExpiresAt < DateTime.UtcNow) return Fail("code_expired");
        if (entry.Code != (req.Code ?? "").Trim())
        {
            entry.Attempts++;
            if (entry.Attempts >= 5) entry.Used = true;
            await db.SaveChangesAsync();
            return Fail("code_invalid");
        }

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == mail);
        var created = user == null;
        if (user == null)
        {
            if (!req.Consent) return Fail("consent_required");
            var nickname = (req.Nickname ?? "").Trim();
            if (nickname.Length is < 2 or > 40) return Fail("nickname_length");
            if (!moderation.IsClean(nickname)) return Fail("moderation");

            var admins = config.GetSection("School:Admins").Get<string[]>() ?? [];
            var role = admins.Contains(mail) ? "admin" : req.Role == "mentor" ? "mentor" : "student";

            user = new User
            {
                Email = mail,
                Nickname = nickname,
                Role = role,
                Class = string.IsNullOrWhiteSpace(req.Class) ? null : req.Class.Trim(),
                Languages = req.Lang ?? "UA",
                HelpFormats = role == "mentor" ? "school,online" : "",
                PreferredLang = req.Lang is "CZ" or "EN" or "UA" ? req.Lang : "UA",
                IsEmailVerified = true,
                IsSchoolApproved = role == "admin",
                ConsentAt = DateTime.UtcNow,
                InviteCode = await UniqueInviteCode(),
                QrToken = Codes.Token(),
                StreakCount = 1,
                LastActiveDate = DateTime.UtcNow,
            };

            User? inviter = null;
            if (!string.IsNullOrWhiteSpace(req.InviteCode))
            {
                inviter = await db.Users.FirstOrDefaultAsync(u => u.InviteCode == req.InviteCode.Trim().ToUpper());
                if (inviter != null) user.InvitedById = inviter.Id;
            }

            db.Users.Add(user);
            entry.Used = true;
            await db.SaveChangesAsync();

            if (inviter != null)
            {
                await game.AddCoinsAsync(user.Id, 10, "invite_bonus");
                await game.AddCoinsAsync(inviter.Id, 30, "invite");
                await notify.NotifyAsync(inviter.Id, "invite_joined", new { name = user.Nickname, coins = 30 }, "/wallet");
            }
        }
        else
        {
            if (user.IsBlocked) return Fail("blocked", 403);
            entry.Used = true;
            user.IsEmailVerified = true;
            await db.SaveChangesAsync();
        }

        return Ok(new { token = tokens.Create(user), isNew = created });
    }

    async Task<string> UniqueInviteCode()
    {
        while (true)
        {
            var code = Codes.Random(8);
            if (!await db.Users.AnyAsync(u => u.InviteCode == code)) return code;
        }
    }

    // Публічна сторінка запрошення: schoolbuddy.cz/invite/{code}
    [HttpGet("/api/invites/{code}")]
    public async Task<IActionResult> Invite(string code)
    {
        var inviter = await db.Users.FirstOrDefaultAsync(u => u.InviteCode == code.ToUpper());
        if (inviter == null) return Fail("not_found", 404);
        return Ok(new { inviter.Nickname, inviter.Avatar, inviter.Role, bonus = 10 });
    }
}

[Route("api/demo")]
public class DemoController(AppDbContext db, TokenService tokens, DemoSeeder seeder, IConfiguration config) : ApiBase
{
    bool Enabled => config.GetValue("Demo:Enabled", true);
    string Domain => config["School:EmailDomain"] ?? "infis.cz";

    [AllowAnonymous, HttpGet("status")]
    public IActionResult Status() => Ok(new { enabled = Enabled });

    public record DemoLogin(string Role);

    // Demo / Test Mode: вхід у готовий тестовий акаунт без реальних персональних даних
    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(DemoLogin req)
    {
        if (!Enabled) return Fail("demo_disabled", 403);
        var role = req.Role is "mentor" or "admin" ? req.Role : "student";
        var user = await db.Users.FirstOrDefaultAsync(u => u.IsDemo && u.Email == $"demo.{role}@{Domain}");
        if (user == null)
        {
            await seeder.ResetDemoAsync();
            user = await db.Users.FirstAsync(u => u.IsDemo && u.Email == $"demo.{role}@{Domain}");
        }
        return Ok(new { token = tokens.Create(user) });
    }

    [Authorize(Roles = "admin"), HttpPost("reset")]
    public async Task<IActionResult> Reset()
    {
        if (!Enabled) return Fail("demo_disabled", 403);
        await seeder.ResetDemoAsync();
        return Ok(new { ok = true });
    }
}
