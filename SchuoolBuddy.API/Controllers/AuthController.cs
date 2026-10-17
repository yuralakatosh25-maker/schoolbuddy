using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

[Route("api/auth")]
[AllowAnonymous]
[EnableRateLimiting("auth")]
public class AuthController(AppDbContext db, TokenService tokens, EmailSender email, Moderation moderation,
    Gamification game, NotificationService notify, IConfiguration config, IWebHostEnvironment env) : ApiBase
{
    bool ShowDevCode => !email.IsConfigured && config.GetValue("Auth:ShowDevCode", env.IsDevelopment());

    string Domain => config["School:EmailDomain"] ?? "infis.cz";

    public record CodeRequest(string Email);

    // крок 1: шлемо код на пошту
    [HttpPost("request-code")]
    public async Task<IActionResult> RequestCode(CodeRequest req)
    {
        var mail = (req.Email ?? "").Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(mail, @"^[a-z0-9._%+\-]+@[a-z0-9.\-]+$")) return Fail("email_invalid");
        if (!mail.EndsWith("@" + Domain)) return Fail("email_domain");
        // без пошти код нікуди слати
        if (!email.IsConfigured && !ShowDevCode) return Fail("email_unavailable", 503);

        var recent = await db.EmailCodes.Where(c => c.Email == mail && !c.Used).OrderByDescending(c => c.Id).FirstOrDefaultAsync();
        if (recent != null && recent.ExpiresAt > DateTime.UtcNow.AddMinutes(9).AddSeconds(30)) return Fail("too_many_requests", 429);
        // не більше 10 кодів на годину: інакше код можна підбирати, щоразу беручи новий після 5 спроб
        var lastHour = await db.EmailCodes.CountAsync(c => c.Email == mail && c.ExpiresAt > DateTime.UtcNow.AddMinutes(-50));
        if (lastHour >= 10) return Fail("too_many_codes", 429);
        await db.EmailCodes.Where(c => c.Email == mail && !c.Used).ExecuteUpdateAsync(s => s.SetProperty(c => c.Used, true));

        var code = Codes.Digits(6);
        db.EmailCodes.Add(new EmailCode { Email = mail, Code = code, ExpiresAt = DateTime.UtcNow.AddMinutes(10) });
        var status = await email.SendAsync(mail, "SchoolBuddy: " + code, $"Your SchoolBuddy sign-in code: {code}\nKód pro přihlášení: {code}\nКод для входу: {code}");
        db.Outbox.Add(new OutboxMessage { Channel = "email", Recipient = mail, Subject = "Sign-in code", Body = "******", Status = status });
        await db.SaveChangesAsync();

        var exists = await db.Users.AnyAsync(u => u.Email == mail);
        // без SMTP показуємо код на екрані (для локального тесту)
        return Ok(new { isNew = !exists, devCode = ShowDevCode ? code : null });
    }

    public record VerifyRequest(string Email, string Code, string? Role, string? Nickname, bool Consent, string? InviteCode, string? Class, string? Lang);

    // крок 2: перевіряємо код, входимо або створюємо акаунт
    [HttpPost("verify")]
    public async Task<IActionResult> Verify(VerifyRequest req)
    {
        var mail = (req.Email ?? "").Trim().ToLowerInvariant();
        var entry = await db.EmailCodes.Where(c => c.Email == mail && !c.Used).OrderByDescending(c => c.Id).FirstOrDefaultAsync();
        if (entry == null || entry.ExpiresAt < DateTime.UtcNow) return Fail("code_expired");
        // спершу атомарно зараховуємо спробу, і лише потім порівнюємо: навіть паралельні запити
        // не отримають більше 5 спроб на код
        var counted = await db.EmailCodes.Where(c => c.Id == entry.Id && !c.Used && c.Attempts < 5)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Attempts, c => c.Attempts + 1));
        if (counted == 0) return Fail("code_expired");
        if (entry.Code != (req.Code ?? "").Trim()) return Fail("code_invalid");

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

            if (!await ConsumeAsync(entry)) return Fail("code_expired");
            db.Users.Add(user);
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
            if (!await ConsumeAsync(entry)) return Fail("code_expired");
            user.IsEmailVerified = true;
            await db.SaveChangesAsync();
        }

        return Ok(new { token = tokens.Create(user), isNew = created });
    }

    // код одноразовий: з двох одночасних запитів з правильним кодом пройде лише один
    async Task<bool> ConsumeAsync(EmailCode entry) =>
        await db.EmailCodes.Where(c => c.Id == entry.Id && !c.Used)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Used, true)) == 1;

    async Task<string> UniqueInviteCode()
    {
        while (true)
        {
            var code = Codes.Random(8);
            if (!await db.Users.AnyAsync(u => u.InviteCode == code)) return code;
        }
    }

    // сторінка запрошення
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

    // демо вхід (тестові акаунти). Демо-адмін бачить і змінює лише демо-дані — див. AdminController
    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("login")]
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
        await seeder.FreshenDemoSosAsync();
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
