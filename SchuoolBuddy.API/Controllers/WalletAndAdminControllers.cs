using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

// гаманець з монетами
[Route("api/wallet")]
public class WalletController(AppDbContext db, Gamification game) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var me = await db.Users.FindAsync(Me);
        var stats = await game.StatsAsync(Me);
        var tx = await db.CoinTransactions.Where(t => t.UserId == Me).OrderByDescending(t => t.Id).Take(40).ToListAsync();
        var partners = (await db.Partners.Where(p => p.Status != "pending" && p.Status != "revoked").ToListAsync())
            .Where(p => me!.IsDemo || !PartnerController.IsDemo(p)).ToDictionary(p => p.Id, p => p.Name);
        var rewards = (await db.PartnerRewards.OrderBy(r => r.MinTier).ThenBy(r => r.Cost).ToListAsync()).Where(r => partners.ContainsKey(r.PartnerId)).ToList();
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

// API для партнерів (заголовок X-Partner-Key).
// Партнер реєструється сам (pending), потім адмін його схвалює
[Route("api/partner")]
[Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("partner")]
[AllowAnonymous]
public class PartnerController(AppDbContext db, Gamification game, NotificationService notify, IConfiguration config) : ApiBase
{
    static readonly string[] Kinds = ["cafe", "cyberclub", "shop", "sport", "other"];
    static readonly System.Text.RegularExpressions.Regex EmailRe = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$");

    // демо-партнер: засіяний з публічним ключем або схвалений демо-адміном.
    // Він бачить і списує монети тільки в демо-акаунтів
    public static bool IsDemo(Partner p) => p.Status == "demo" || p.ApiKey.EndsWith("-demo-key");

    async Task<Partner?> Auth()
    {
        var key = Request.Headers["X-Partner-Key"].ToString();
        if (string.IsNullOrEmpty(key)) return null;
        var p = await db.Partners.FirstOrDefaultAsync(p => p.ApiKey == key);
        if (p == null || p.Status == "revoked") return null;
        if (IsDemo(p) && !config.GetValue("Demo:Enabled", true)) return null;
        return p;
    }

    public record RegisterDto(string Name, string Kind, string Address, string ContactEmail);

    // реєстрація партнера, ключ показуємо один раз
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterDto req)
    {
        var name = (req.Name ?? "").Trim();
        var address = (req.Address ?? "").Trim();
        var email = (req.ContactEmail ?? "").Trim();
        if (name.Length is < 2 or > 60 || address.Length is < 3 or > 120 || !EmailRe.IsMatch(email) || email.Length > 200 || !Kinds.Contains(req.Kind))
            return Fail("invalid");
        if (await db.Partners.AnyAsync(p => p.Name.ToLower() == name.ToLower())) return Fail("partner_exists");
        if (await db.Partners.CountAsync(p => p.Status == "pending") >= 50) return Fail("partner_limit", 429);

        var key = "sbp_" + Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        db.Partners.Add(new Partner { Name = name, Kind = req.Kind, Address = address, ContactEmail = email, ApiKey = key, Status = "pending" });
        await db.SaveChangesAsync();
        return Ok(new { apiKey = key, status = "pending" });
    }

    [HttpGet("me")]
    public async Task<IActionResult> MeInfo()
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        var rewards = await db.PartnerRewards.Where(r => r.PartnerId == p.Id).OrderBy(r => r.Cost).ToListAsync();
        return Ok(new { p.Id, p.Name, p.Kind, p.Address, p.ContactEmail, p.Status, rewards });
    }

    // скан QR ментора
    [HttpGet("customer/{qr}")]
    public async Task<IActionResult> Customer(string qr)
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        if (p.Status == "pending") return Fail("partner_pending", 403);
        var u = await db.Users.FirstOrDefaultAsync(x => x.QrToken == qr.Trim());
        if (u == null || u.IsBlocked || (IsDemo(p) && !u.IsDemo)) return Fail("not_found", 404);
        var stats = await game.StatsAsync(u.Id);
        return Ok(new { u.Nickname, u.Avatar, u.Role, coins = u.Coins, tier = stats.Tier, verified = u.IsSchoolApproved });
    }

    public record RewardDto(string Title, int Cost, int MinTier);

    // пропозиція партнера (знижка за бали)
    [HttpPost("rewards")]
    public async Task<IActionResult> AddReward(RewardDto req)
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        if (p.Status == "pending") return Fail("partner_pending", 403);
        var title = (req.Title ?? "").Trim();
        if (title.Length is < 5 or > 100 || req.Cost is < 10 or > 1000 || req.MinTier is < 0 or > 3) return Fail("invalid");
        if (await db.PartnerRewards.CountAsync(r => r.PartnerId == p.Id) >= 8) return Fail("too_many_rewards");
        var r = new PartnerReward { PartnerId = p.Id, TitleUa = title, TitleCs = title, TitleEn = title, Cost = req.Cost, MinTier = req.MinTier };
        db.PartnerRewards.Add(r);
        await db.SaveChangesAsync();
        return Ok(r);
    }

    [HttpDelete("rewards/{id:int}")]
    public async Task<IActionResult> DeleteReward(int id)
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        await db.PartnerRewards.Where(r => r.Id == id && r.PartnerId == p.Id).ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }

    // PurchaseAmount - сума чека в Kč
    public record RedeemDto(string QrToken, int RewardId, int PurchaseAmount);

    // списуємо бали
    [HttpPost("redeem")]
    public async Task<IActionResult> Redeem(RedeemDto req)
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        if (p.Status == "pending") return Fail("partner_pending", 403);
        if (req.PurchaseAmount is < 1 or > 100000) return Fail("purchase_required");
        var reward = await db.PartnerRewards.FirstOrDefaultAsync(r => r.Id == req.RewardId && r.PartnerId == p.Id);
        if (reward == null) return Fail("not_found", 404);
        var u = await db.Users.FirstOrDefaultAsync(x => x.QrToken == (req.QrToken ?? "").Trim());
        if (u == null || u.IsBlocked || (IsDemo(p) && !u.IsDemo)) return Fail("not_found", 404);
        var stats = await game.StatsAsync(u.Id);
        if (stats.Tier < reward.MinTier) return Fail("tier_locked");
        if (!await game.TrySpendCoinsAsync(u.Id, reward.Cost, "redeem", p.Id, reward.Id, req.PurchaseAmount)) return Fail("not_enough_coins");
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
        return Ok(tx.Select(t => new { t.Id, t.Amount, t.RewardId, t.PurchaseAmount, t.CreatedAt, nickname = users.GetValueOrDefault(t.UserId) }));
    }

    // звіт для партнера
    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        var p = await Auth();
        if (p == null) return Fail("partner_key", 401);
        var since = DateTime.UtcNow.AddDays(-30);
        var all = await db.CoinTransactions.Where(t => t.PartnerId == p.Id && t.Reason == "redeem").ToListAsync();
        object Summary(List<CoinTransaction> l) => new
        {
            visits = l.Count,
            customers = l.Select(t => t.UserId).Distinct().Count(),
            purchaseTotal = l.Sum(t => t.PurchaseAmount ?? 0),
            avgCheck = l.Count(t => t.PurchaseAmount > 0) == 0 ? 0 : (int)l.Where(t => t.PurchaseAmount > 0).Average(t => t.PurchaseAmount!.Value),
        };
        var rewards = await db.PartnerRewards.Where(r => r.PartnerId == p.Id).ToDictionaryAsync(r => r.Id, r => r.TitleUa);
        return Ok(new
        {
            last30 = Summary(all.Where(t => t.CreatedAt >= since).ToList()),
            total = Summary(all),
            top = all.Where(t => t.RewardId != null).GroupBy(t => t.RewardId!.Value)
                .Select(g => new { title = rewards.GetValueOrDefault(g.Key, "—"), count = g.Count() }).OrderByDescending(x => x.count).Take(3),
        });
    }
}

[Route("api/admin")]
[Authorize(Roles = "admin")]
public class AdminController(AppDbContext db, NotificationService notify, AnonHasher hasher) : ApiBase
{
    // Демо-адмін (вхід без пароля через /api/demo/login) керує тільки демо-даними:
    // реальних користувачів, їхні пошти, скарги, листи й пости він не бачить і не змінює
    Task<bool> IsDemoAdmin() => Task.FromResult(IsDemoUser);

    async Task<List<string>> DemoHashes() =>
        (await db.Users.Where(u => u.IsDemo).Select(u => u.Id).ToListAsync()).Select(hasher.For).ToList();

    async Task<bool> CanManage(int userId) =>
        !await IsDemoAdmin() || await db.Users.AnyAsync(u => u.Id == userId && u.IsDemo);

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

    // Підприємці: заявки на партнерство
    [HttpGet("partners")]
    public async Task<IActionResult> Partners()
    {
        var demo = await IsDemoAdmin();
        var list = await db.Partners.OrderByDescending(p => p.Status == "pending").ThenByDescending(p => p.Id).ToListAsync();
        var visits = await db.CoinTransactions.Where(t => t.PartnerId != null && t.Reason == "redeem")
            .GroupBy(t => t.PartnerId).Select(g => new { id = g.Key, n = g.Count() }).ToDictionaryAsync(x => x.id!.Value, x => x.n);
        return Ok(list.Select(p => new
        {
            p.Id, p.Name, p.Kind, p.Address,
            contactEmail = demo && !PartnerController.IsDemo(p) ? null : p.ContactEmail,
            p.Status, p.CreatedAt, visits = visits.GetValueOrDefault(p.Id),
        }));
    }

    // демо-адмін схвалює лише в демо-статус: такий партнер працює тільки з демо-акаунтами
    [HttpPost("partners/{id:int}/approve")]
    public async Task<IActionResult> ApprovePartner(int id)
    {
        if (await IsDemoAdmin())
            await db.Partners.Where(p => p.Id == id && p.Status == "pending").ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, "demo"));
        else
            await db.Partners.Where(p => p.Id == id).ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, "approved"));
        return Ok(new { ok = true });
    }

    // відкликати партнера (напр. якщо ключ потрапив до чужих рук)
    [HttpPost("partners/{id:int}/revoke")]
    public async Task<IActionResult> RevokePartner(int id)
    {
        var query = db.Partners.Where(p => p.Id == id && p.Status != "pending");
        if (await IsDemoAdmin()) query = query.Where(p => p.Status == "demo");
        await query.ExecuteUpdateAsync(s => s.SetProperty(p => p.Status, "revoked"));
        return Ok(new { ok = true });
    }

    // видаляємо тільки заявки, що чекають
    [HttpPost("partners/{id:int}/reject")]
    public async Task<IActionResult> RejectPartner(int id)
    {
        await db.Partners.Where(p => p.Id == id && p.Status == "pending").ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }

    [HttpGet("users")]
    public async Task<IActionResult> Users(string filter = "pending", string? q = null)
    {
        var query = db.Users.AsQueryable();
        if (await IsDemoAdmin()) query = query.Where(u => u.IsDemo);
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
        if (u == null || !await CanManage(id)) return Fail("not_found", 404);
        u.IsSchoolApproved = true;
        await db.SaveChangesAsync();
        await notify.NotifyAsync(id, "school_approved", new { }, "/profile");
        return Ok(new { ok = true });
    }

    [HttpPost("users/{id:int}/block")]
    public async Task<IActionResult> BlockUser(int id)
    {
        if (id == Me) return Fail("invalid");
        if (!await CanManage(id)) return Fail("not_found", 404);
        await db.Users.Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsBlocked, true));
        return Ok(new { ok = true });
    }

    [HttpPost("users/{id:int}/unblock")]
    public async Task<IActionResult> UnblockUser(int id)
    {
        if (!await CanManage(id)) return Fail("not_found", 404);
        await db.Users.Where(u => u.Id == id).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsBlocked, false));
        return Ok(new { ok = true });
    }

    // модерація форуму
    [HttpGet("forum")]
    public async Task<IActionResult> Forum()
    {
        var postsQuery = db.ForumPosts.AsQueryable();
        if (await IsDemoAdmin())
        {
            var hashes = await DemoHashes();
            postsQuery = postsQuery.Where(p => hashes.Contains(p.AuthorHash));
        }
        var posts = await postsQuery.OrderByDescending(p => p.CreatedAt).Take(100).ToListAsync();
        var reported = await db.Reports.Where(r => r.TargetType == "post" && r.Status == "open").GroupBy(r => r.TargetId)
            .Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.n);
        return Ok(posts.Select(p => new { p.Id, p.Title, p.Content, p.Category, p.CreatedAt, p.IsHidden, author = "anon-" + p.AuthorHash[..6], reports = reported.GetValueOrDefault(p.Id) }));
    }

    [HttpPost("forum/{id:int}/hide")]
    public async Task<IActionResult> Hide(int id, bool hidden = true)
    {
        var query = db.ForumPosts.Where(p => p.Id == id);
        if (await IsDemoAdmin())
        {
            var hashes = await DemoHashes();
            query = query.Where(p => hashes.Contains(p.AuthorHash));
        }
        await query.ExecuteUpdateAsync(s => s.SetProperty(p => p.IsHidden, hidden));
        return Ok(new { ok = true });
    }

    [HttpGet("reports")]
    public async Task<IActionResult> Reports(string status = "open")
    {
        var query = db.Reports.Where(r => status == "all" || r.Status == status);
        if (await IsDemoAdmin())
        {
            var demoIds = db.Users.Where(u => u.IsDemo).Select(u => u.Id);
            query = query.Where(r => demoIds.Contains(r.ReporterId));
        }
        var list = await query.OrderByDescending(r => r.CreatedAt).Take(100).ToListAsync();
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
        if (await IsDemoAdmin())
        {
            // демо-адмін не може блокувати реальних людей чи стирати їхні повідомлення
            var targetUserId = r.TargetType switch
            {
                "user" => r.TargetId,
                "message" => await db.Messages.Where(m => m.Id == r.TargetId).Select(m => m.SenderId).FirstOrDefaultAsync(),
                _ => null as int?,
            };
            if (!await CanManage(r.ReporterId) || (targetUserId != null && !await CanManage(targetUserId.Value)))
                return Fail("not_found", 404);
        }
        r.Status = verb == "dismiss" ? "dismissed" : "resolved";
        r.ResolvedAt = DateTime.UtcNow;
        // resolve - ховаємо пост/відповідь, блокуємо юзера, стираємо повідомлення або видаляємо групу
        if (verb == "resolve")
        {
            if (r.TargetType == "post") await db.ForumPosts.Where(p => p.Id == r.TargetId).ExecuteUpdateAsync(s => s.SetProperty(p => p.IsHidden, true));
            if (r.TargetType == "reply") await db.ForumReplies.Where(p => p.Id == r.TargetId).ExecuteUpdateAsync(s => s.SetProperty(p => p.IsHidden, true));
            if (r.TargetType == "user") await db.Users.Where(u => u.Id == r.TargetId).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsBlocked, true));
            if (r.TargetType == "message") await db.Messages.Where(m => m.Id == r.TargetId).ExecuteUpdateAsync(s => s.SetProperty(m => m.Text, "[removed]"));
            if (r.TargetType == "group")
            {
                await db.Messages.Where(m => m.GroupId == r.TargetId).ExecuteDeleteAsync();
                await db.GroupMembers.Where(m => m.GroupId == r.TargetId).ExecuteDeleteAsync();
                await db.StudyGroups.Where(g => g.Id == r.TargetId).ExecuteDeleteAsync();
            }
        }
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // уроки класу на дату
    [HttpGet("lessons")]
    public async Task<IActionResult> Lessons(string @class, string date)
    {
        if (!DateTime.TryParse(date, out var d)) return Fail("invalid");
        var dow = (int)d.DayOfWeek;
        return Ok(await db.Lessons.Where(l => l.Class == @class && l.DayOfWeek == dow).OrderBy(l => l.Period).ToListAsync());
    }

    [HttpGet("outbox")]
    public async Task<IActionResult> Outbox()
    {
        var query = db.Outbox.Where(o => o.Body != "******");
        if (await IsDemoAdmin())
        {
            var demoEmails = db.Users.Where(u => u.IsDemo).Select(u => u.Email);
            query = query.Where(o => demoEmails.Contains(o.Recipient));
        }
        return Ok(await query.OrderByDescending(o => o.Id).Take(50).ToListAsync());
    }
}
