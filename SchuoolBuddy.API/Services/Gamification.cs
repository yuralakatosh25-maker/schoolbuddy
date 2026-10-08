using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Services;

public record UserStats(int Helped, int Meetings, int Events, int Groups, int Invited, int Joint, string Title, int Tier, int TierProgress, int? NextTierAt);

public class Gamification(AppDbContext db, NotificationService notify)
{
    public static readonly (string Code, int Coins)[] Achievements =
    [
        ("FIRST_MENTOR", 20),
        ("FIRST_HELP", 30),
        ("FIRST_MEETING", 20),
        ("HELPED_5", 50),
        ("HELPED_10", 100),
        ("ACTIVE_30", 100),
        ("EVENT_PARTICIPANT", 15),
        ("TEAM_PLAYER", 30),
    ];

    // скільки новачків треба привести для рівня
    public static readonly int[] TierThresholds = [0, 3, 10, 25]; // Bronze, Silver, Gold, Platinum

    // звання за події і зустрічі
    static readonly (int min, string code)[] Titles = [(20, "legend"), (10, "captain"), (5, "squad"), (2, "teammate"), (0, "rookie")];

    public async Task AddCoinsAsync(int userId, int amount, string reason, int? partnerId = null, int? rewardId = null, int? purchaseAmount = null) =>
        await ChangeCoinsAsync(userId, amount, null, reason, partnerId, rewardId, purchaseAmount);

    // списання: атомарно, тільки якщо вистачає балансу (два одночасні запити не спишуть двічі)
    public Task<bool> TrySpendCoinsAsync(int userId, int cost, string reason, int? partnerId = null, int? rewardId = null, int? purchaseAmount = null) =>
        ChangeCoinsAsync(userId, -cost, cost, reason, partnerId, rewardId, purchaseAmount);

    // баланс змінюємо одним UPDATE у базі, а не "прочитав — змінив — записав"
    async Task<bool> ChangeCoinsAsync(int userId, int amount, int? minBalance, string reason, int? partnerId, int? rewardId, int? purchaseAmount)
    {
        var query = db.Users.Where(u => u.Id == userId);
        if (minBalance != null) query = query.Where(u => u.Coins >= minBalance);
        var rows = await query.ExecuteUpdateAsync(s => s.SetProperty(u => u.Coins, u => u.Coins + amount));
        if (rows == 0) return false;
        // синхронізуємо вже завантажений обʼєкт, щоб SaveChanges не перезаписав баланс старим значенням
        if (db.Users.Local.FirstOrDefault(u => u.Id == userId) is { } tracked)
        {
            var coins = db.Entry(tracked).Property(u => u.Coins);
            var updated = tracked.Coins + amount;
            coins.OriginalValue = updated;
            coins.CurrentValue = updated;
            coins.IsModified = false;
        }
        db.CoinTransactions.Add(new CoinTransaction { UserId = userId, Amount = amount, Reason = reason, PartnerId = partnerId, RewardId = rewardId, PurchaseAmount = purchaseAmount });
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<UserStats> StatsAsync(int userId)
    {
        var helped = await db.Connections
            .Where(c => c.MentorId == userId && c.Origin != "match" && (c.Status == "active" || c.Status == "archived"))
            .Select(c => c.StudentId).Distinct().CountAsync();
        var meetings = await db.Meetings.CountAsync(m => (m.MentorId == userId || m.StudentId == userId) && m.Status == "completed");
        var events = await db.EventParticipants.CountAsync(p => p.UserId == userId);
        var groups = await db.GroupMembers.CountAsync(m => m.UserId == userId);
        var invited = await db.Users.CountAsync(u => u.InvitedById == userId);

        var joint = events + meetings;
        var title = Titles.First(t => joint >= t.min).code;

        var brought = helped + invited;
        var tier = TierThresholds.Count(t => brought >= t) - 1;
        int? next = tier + 1 < TierThresholds.Length ? TierThresholds[tier + 1] : null;
        return new UserStats(helped, meetings, events, groups, invited, joint, title, tier, brought, next);
    }

    // перевіряємо всі досягнення і видаємо нові
    public async Task CheckAchievementsAsync(int userId)
    {
        var user = await db.Users.FindAsync(userId);
        if (user == null) return;

        var have = await db.UserAchievements.Where(a => a.UserId == userId).Select(a => a.Code).ToListAsync();
        var s = await StatsAsync(userId);
        var hasConnection = await db.Connections.AnyAsync(c => (c.MentorId == userId || c.StudentId == userId) && c.Origin != "match" && (c.Status == "active" || c.Status == "archived"));
        var helpedSos = await db.SosRequests.AnyAsync(r => r.MentorId == userId && (r.Status == "accepted" || r.Status == "resolved"));

        var earned = new Dictionary<string, bool>
        {
            ["FIRST_MENTOR"] = hasConnection,
            ["FIRST_HELP"] = helpedSos,
            ["FIRST_MEETING"] = s.Meetings >= 1,
            ["HELPED_5"] = s.Helped >= 5,
            ["HELPED_10"] = s.Helped >= 10,
            ["ACTIVE_30"] = user.StreakCount >= 30,
            ["EVENT_PARTICIPANT"] = s.Events >= 1,
            ["TEAM_PLAYER"] = s.Groups >= 1 && s.Joint >= 3,
        };

        foreach (var (code, coins) in Achievements)
        {
            if (have.Contains(code) || !earned[code]) continue;
            db.UserAchievements.Add(new UserAchievement { UserId = userId, Code = code });
            await AddCoinsAsync(userId, coins, $"achievement:{code}");
            await notify.NotifyAsync(userId, "achievement", new { code, coins }, "/achievements");
        }
    }

    // streak: +1 якщо був вчора, інакше знову 1
    public async Task TouchStreakAsync(User user)
    {
        var today = DateTime.Now.Date;
        var last = user.LastActiveDate?.ToLocalTime().Date;
        if (last == today) return;
        user.StreakCount = last == today.AddDays(-1) ? user.StreakCount + 1 : 1;
        user.LastActiveDate = DateTime.UtcNow;
        await db.SaveChangesAsync();
        if (user.StreakCount >= 30) await CheckAchievementsAsync(user.Id);
    }
}
