using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

// Гаманець Buddy Coins, прогресивна шкала й партнерські бонуси
[Route("api/wallet")]
public class WalletController(AppDbContext db, Gamification game) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var me = await db.Users.FindAsync(Me);
        var stats = await game.StatsAsync(Me);
        var tx = await db.CoinTransactions.Where(t => t.UserId == Me).OrderByDescending(t => t.Id).Take(40).ToListAsync();
        var partners = await db.Partners.ToDictionaryAsync(p => p.Id, p => p.Name);
        var rewards = await db.PartnerRewards.OrderBy(r => r.MinTier).ThenBy(r => r.Cost).ToListAsync();
        return Ok(new
        {
            balance = me!.Coins,
            me.QrToken,
            tier = stats.Tier,
            brought = stats.TierProgress,
            nextTierAt = stats.NextTierAt,
            thresholds = Gamification.TierThresholds,
            transactions = tx.Select(t => new { t.Id, t.Amount, t.Reason, t.CreatedAt, partner = t.PartnerId != null ? partners.GetValueOrDefault(t.PartnerId.Value) : null }),
            rewards = rewards.Select(r => new
            {
                r.Id, r.TitleUa, r.TitleCs, r.TitleEn, r.Cost, r.MinTier,
                partner = partners.GetValueOrDefault(r.PartnerId),
                unlocked = stats.Tier >= r.MinTier,
                affordable = me.Coins >= r.Cost,
            }),
        });
    }
}

// API для касирів партнерських закладів: автентифікація заголовком X-Partner-Key
[Route("api/partner")]
[AllowAnonymous]
public class PartnerController(AppDbContext db, Gamification game, NotificationService notify) : ApiBase
{
    async Task<Partner?> Auth()
    {
        var key = Request.Headers["X-Partner-Key"].ToString();
        return string.IsNullOrEmpty(key) ? null : await db.Partners.FirstOrDefaultAsync(p => p.ApiKey == key);
    }

    [HttpGet("me")]
    public async Task<IActionResult> MeInfo()
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        var rewards = await db.PartnerRewards.Where(r => r.PartnerId == p.Id).OrderBy(r => r.Cost).ToListAsync();
        return Ok(new { p.Id, p.Name, p.Kind, p.Address, rewards });
    }

    // Сканування QR-коду ментора: показуємо нікнейм, баланс і рівень
    [HttpGet("customer/{qr}")]
    public async Task<IActionResult> Customer(string qr)
    {
        if (await Auth() == null) return Fail("partner_key", 401);
        var u = await db.Users.FirstOrDefaultAsync(x => x.QrToken == qr.Trim());
        if (u == null || u.IsBlocked) return Fail("not_found", 404);
        var stats = await game.StatsAsync(u.Id);
        return Ok(new { u.Nickname, u.Avatar, u.Role, coins = u.Coins, tier = stats.Tier, verified = u.IsSchoolApproved });
    }

    public record RedeemDto(string QrToken, int RewardId);

    // Списання балів за знижку + фіксація транзакції
    [HttpPost("redeem")]
    public async Task<IActionResult> Redeem(RedeemDto req)
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        var reward = await db.PartnerRewards.FirstOrDefaultAsync(r => r.Id == req.RewardId && r.PartnerId == p.Id);
        if (reward == null) return Fail("not_found", 404);
        var u = await db.Users.FirstOrDefaultAsync(x => x.QrToken == req.QrToken.Trim());
        if (u == null || u.IsBlocked) return Fail("not_found", 404);
        var stats = await game.StatsAsync(u.Id);
        if (stats.Tier < reward.MinTier) return Fail("tier_locked");
        if (u.Coins < reward.Cost) return Fail("not_enough_coins");

        await game.AddCoinsAsync(u.Id, -reward.Cost, "redeem", p.Id, reward.Id);
        await notify.NotifyAsync(u.Id, "coins_spent", new { amount = reward.Cost, partner = p.Name, rewardUa = reward.TitleUa, rewardCs = reward.TitleCs, rewardEn = reward.TitleEn }, "/wallet");
        return Ok(new { ok = true, balance = u.Coins });
    }

    [HttpGet("transactions")]
    public async Task<IActionResult> Transactions()
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        var tx = await db.CoinTransactions.Where(t => t.PartnerId == p.Id).OrderByDescending(t => t.Id).Take(50).ToListAsync();
        var ids = tx.Select(t => t.UserId).ToList();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Nickname);
        return Ok(tx.Select(t => new { t.Id, t.Amount, t.RewardId, t.CreatedAt, nickname = users.GetValueOrDefault(t.UserId) }));
    }
}

[Route("api/admin")]
[Authorize(Roles = "admin")]
public class AdminController(AppDbContext db, NotificationService notify) : ApiBase
{
    // Статистика активності
    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        var now = DateTime.UtcNow;
        var since = DateTime.Now.Date.AddDays(-6).ToUniversalTime();
        var todayStart = DateTime.Now.Date.ToUniversalTime();
        var msgs = await db.Messages.Where(m => m.CreatedAt >= since && m.SenderId != null).Select(m => m.CreatedAt).ToListAsync();
        var sos = await db.SosRequests.Where(s => s.CreatedAt >= since).Select(s => s.CreatedAt).ToListAsync();
        var daily = Enumerable.Range(0, 7).Select(i =>
        {
            var day = DateTime.Now.Date.AddDays(-6 + i);
            return new
            {
                date = day.ToString("yyyy-MM-dd"),
                messages = msgs.Count(t => t.ToLocalTime().Date == day),
                sos = sos.Count(t => t.ToLocalTime().Date == day),
            };
        });
        return Ok(new
        {
            users = new
            {
                total = await db.Users.CountAsync(),
                students = await db.Users.CountAsync(u => u.Role == "student"),
                mentors = await db.Users.CountAsync(u => u.Role == "mentor"),
                pending = await db.Users.CountAsync(u => !u.IsSchoolApproved && u.Role != "admin"),
                blocked = await db.Users.CountAsync(u => u.IsBlocked),
                activeToday = await db.Users.CountAsync(u => u.LastActiveDate != null && u.LastActiveDate >= todayStart),
            },
            sos = new
            {
                active = await db.SosRequests.CountAsync(s => s.Status == "active"),
                accepted = await db.SosRequests.CountAsync(s => s.Status == "accepted" || s.Status == "resolved"),
            },
            meetings = new
            {
                scheduled = await db.Meetings.CountAsync(m => m.Status == "scheduled" && m.ScheduledAt > now),
                completed = await db.Meetings.CountAsync(m => m.Status == "completed"),
            },
            connections = await db.Connections.CountAsync(c => c.Status == "active"),
            forum = await db.ForumPosts.CountAsync(),
            reportsOpen = await db.Reports.CountAsync(r => r.Status == "open"),
            coinsIssued = await db.CoinTransactions.Where(t => t.Amount > 0).SumAsync(t => (int?)t.Amount) ?? 0,
            daily,
        });
    }

    [HttpGet("users")]
    public async Task<IActionResult> Users(string filter = "pending", string? q = null)
    {
        var query = db.Users.AsQueryable();
        query = filter switch
        {
            "pending" => query.Where(u => !u.IsSchoolApproved && u.Role != "admin"),
            "blocked" => query.Where(u => u.IsBlocked),
            _ => query,
        };
        if (!string.IsNullOrWhiteSpace(q)) query = query.Where(u => u.Nickname.Contains(q) || u.Email.Contains(q));
        var list = await query.OrderByDescending(u => u.CreatedAt).Take(100).ToListAsync();
        return Ok(list.Select(u => new { user = Views.Card(u), u.Email, u.CreatedAt, u.IsBlocked, u.IsDemo }));
    }

    [HttpPost("users/{id:int}/approve")]
    public async Task<IActionResult> Approve(int id)
    {
        var u = await db.Users.FindAsync(id);
        if (u == null) return Fail("not_found", 404);
        u.IsSchoolApproved = true;
        await db.SaveChangesAsync();
        await notify.NotifyAsync(id, "school_approved", new { }, "/profile");
        return Ok(new { ok = true });
    }

    [HttpPost("users/{id:int}/block")]
    public async Task<IActionResult> BlockUser(int id)
    {
        if (id == Me) return Fail("invalid");
        await db.Users.Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsBlocked, true));
        return Ok(new { ok = true });
    }

    [HttpPost("users/{id:int}/unblock")]
    public async Task<IActionResult> UnblockUser(int id)
    {
        await db.Users.Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsBlocked, false));
        return Ok(new { ok = true });
    }

    // Модерація форуму (включно з прихованими)
    [HttpGet("forum")]
    public async Task<IActionResult> Forum()
    {
        var posts = await db.ForumPosts.OrderByDescending(p => p.CreatedAt).Take(100).ToListAsync();
        var reported = await db.Reports.Where(r => r.TargetType == "post" && r.Status == "open").GroupBy(r => r.TargetId)
            .Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.n);
        return Ok(posts.Select(p => new { p.Id, p.Title, p.Content, p.Category, p.CreatedAt, p.IsHidden, author = "anon-" + p.AuthorHash[..6], reports = reported.GetValueOrDefault(p.Id) }));
    }

    [HttpPost("forum/{id:int}/hide")]
    public async Task<IActionResult> Hide(int id, bool hidden = true)
    {
        await db.ForumPosts.Where(p => p.Id == id).ExecuteUpdateAsync(s => s.SetProperty(p => p.IsHidden, hidden));
        return Ok(new { ok = true });
    }

    [HttpGet("reports")]
    public async Task<IActionResult> Reports(string status = "open")
    {
        var list = await db.Reports.Where(r => status == "all" || r.Status == status).OrderByDescending(r => r.CreatedAt).Take(100).ToListAsync();
        var reporterIds = list.Select(r => r.ReporterId).ToList();
        var userTargets = list.Where(r => r.TargetType == "user").Select(r => r.TargetId).ToList();
        var users = await db.Users.Where(u => reporterIds.Contains(u.Id) || userTargets.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        var postIds = list.Where(r => r.TargetType == "post").Select(r => r.TargetId).ToList();
        var posts = await db.ForumPosts.Where(p => postIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id);
        var msgIds = list.Where(r => r.TargetType == "message").Select(r => r.TargetId).ToList();
        var messages = await db.Messages.Where(m => msgIds.Contains(m.Id)).ToDictionaryAsync(m => m.Id);
        return Ok(list.Select(r => new
        {
            r.Id, r.TargetType, r.TargetId, r.Reason, r.Status, r.CreatedAt,
            reporter = users.TryGetValue(r.ReporterId, out var rep) ? Views.Card(rep) : null,
            target = r.TargetType switch
            {
                "user" => users.TryGetValue(r.TargetId, out var u) ? (object)Views.Card(u) : null,
                "post" => posts.TryGetValue(r.TargetId, out var p) ? new { p.Title, p.IsHidden } : null,
                "message" => messages.TryGetValue(r.TargetId, out var m) ? new { m.Text, m.SenderId } : null,
                _ => null,
            },
        }));
    }

    [HttpPost("reports/{id:int}/{verb}")]
    public async Task<IActionResult> ResolveReport(int id, string verb)
    {
        var r = await db.Reports.FindAsync(id);
        if (r == null) return Fail("not_found", 404);
        r.Status = verb == "dismiss" ? "dismissed" : "resolved";
        r.ResolvedAt = DateTime.UtcNow;
        // "resolve" застосовує санкцію: ховає пост або блокує користувача
        if (verb == "resolve")
        {
            if (r.TargetType == "post") await db.ForumPosts.Where(p => p.Id == r.TargetId).ExecuteUpdateAsync(s => s.SetProperty(p => p.IsHidden, true));
            if (r.TargetType == "user") await db.Users.Where(u => u.Id == r.TargetId).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsBlocked, true));
            if (r.TargetType == "message") await db.Messages.Where(m => m.Id == r.TargetId).ExecuteUpdateAsync(s => s.SetProperty(m => m.Text, "[removed]"));
        }
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // Уроки класу на певну дату — для форми зміни розкладу
    [HttpGet("lessons")]
    public async Task<IActionResult> Lessons(string @class, string date)
    {
        if (!DateTime.TryParse(date, out var d)) return Fail("invalid");
        var dow = (int)d.DayOfWeek;
        return Ok(await db.Lessons.Where(l => l.Class == @class && l.DayOfWeek == dow).OrderBy(l => l.Period).ToListAsync());
    }

    [HttpGet("outbox")]
    public async Task<IActionResult> Outbox() =>
        Ok(await db.Outbox.Where(o => o.Body != "******").OrderByDescending(o => o.Id).Take(50).ToListAsync());
}
