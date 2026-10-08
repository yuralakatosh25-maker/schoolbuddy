using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

[Route("api/users")]
public class UsersController(AppDbContext db, Gamification game) : ApiBase
{
    async Task<HashSet<int>> BlockedIds() =>
        (await db.Blocks.Where(b => b.BlockerId == Me || b.BlockedId == Me)
            .Select(b => b.BlockerId == Me ? b.BlockedId : b.BlockerId).ToListAsync()).ToHashSet();

    // всі користувачі за збігом тегів
    [HttpGet("match")]
    public async Task<IActionResult> Match(string role = "mentor", string? q = null, int? subjectId = null)
    {
        var me = await db.Users.Include(u => u.Tags).FirstAsync(u => u.Id == Me);
        var mine = me.Tags.Select(t => t.Id).ToHashSet();
        var blocked = await BlockedIds();
        var hours = (await db.OfficeHours.ToListAsync()).GroupBy(o => o.MentorId).ToDictionary(g => g.Key, g => g.ToList());
        var connections = await db.Connections
            .Where(c => (c.StudentId == Me || c.MentorId == Me) && c.Status != "declined")
            .ToListAsync();

        var query = db.Users.Include(u => u.Tags).Include(u => u.HelpSubjects)
            .Where(u => u.Id != Me && !u.IsBlocked && u.Role != "admin" && u.IsDemo == me.IsDemo);
        if (role is "mentor" or "student") query = query.Where(u => u.Role == role);
        var users = await query.ToListAsync();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().TrimStart('#').ToLowerInvariant();
            users = users.Where(u => u.Nickname.ToLowerInvariant().Contains(term) || u.Tags.Any(t => t.Name.TrimStart('#').ToLowerInvariant().Contains(term))).ToList();
        }
        if (subjectId != null) users = users.Where(u => u.HelpSubjects.Any(s => s.Id == subjectId)).ToList();

        var availabilityOrder = new Dictionary<string, int> { ["available"] = 0, ["busy"] = 1, ["dnd"] = 2 };
        var result = users.Where(u => !blocked.Contains(u.Id))
            .Select(u => (u, score: Matching.Score(mine, u.Tags.Select(t => t.Id).ToHashSet())))
            .OrderByDescending(x => x.score)
            .ThenBy(x => availabilityOrder.GetValueOrDefault(x.u.Availability, 3))
            .Select(x =>
            {
                var u = x.u;
                var conn = connections.Where(c => c.StudentId == u.Id || c.MentorId == u.Id).OrderByDescending(c => c.Id).FirstOrDefault();
                return new
                {
                    user = Views.Card(u),
                    match = x.score,
                    sharedTags = u.Tags.Where(t => mine.Contains(t.Id)).Select(t => t.Name),
                    tags = u.Tags.Select(t => t.Name).Take(6),
                    helpSubjects = u.HelpSubjects.Select(s => s.Id),
                    languages = Views.Csv(u.Languages),
                    inOffice = hours.TryGetValue(u.Id, out var h) && Views.InOfficeNow(h),
                    connection = conn == null ? null : new { conn.Id, conn.Status },
                };
            })
            .ToList();

        return Ok(result);
    }

    // повний профіль
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Profile(int id)
    {
        var u = await db.Users.Include(x => x.Tags).Include(x => x.HelpSubjects).FirstOrDefaultAsync(x => x.Id == id);
        if (u == null || (u.IsBlocked && !IsRealAdmin)) return Fail("not_found", 404);

        var me = await db.Users.Include(x => x.Tags).FirstAsync(x => x.Id == Me);
        // хто заблокував мене, того профіль я не бачу; демо й реальні акаунти одне одного теж
        if (!IsRealAdmin && (u.IsDemo != me.IsDemo || await db.Blocks.AnyAsync(b => b.BlockerId == id && b.BlockedId == Me)))
            return Fail("not_found", 404);
        var stats = await game.StatsAsync(id);
        var hours = await db.OfficeHours.Where(o => o.MentorId == id).OrderBy(o => o.DayOfWeek).ThenBy(o => o.Start).ToListAsync();
        var conn = await db.Connections.Where(c => ((c.StudentId == Me && c.MentorId == id) || (c.MentorId == Me && c.StudentId == id)) && c.Status != "declined")
            .OrderByDescending(c => c.Id).FirstOrDefaultAsync();

        return Ok(new
        {
            user = Views.Card(u),
            u.Bio,
            tags = u.Tags.Select(Views.Tag),
            helpSubjects = u.HelpSubjects.Select(s => s.Id),
            languages = Views.Csv(u.Languages),
            helpFormats = Views.Csv(u.HelpFormats),
            coins = u.Role == "mentor" ? u.Coins : (int?)null,
            streak = u.StreakCount,
            achievements = await db.UserAchievements.Where(a => a.UserId == id).Select(a => a.Code).ToListAsync(),
            stats,
            officeHours = hours.Select(Views.OfficeHour),
            inOffice = Views.InOfficeNow(hours),
            match = Matching.Score(me.Tags.Select(t => t.Id).ToHashSet(), u.Tags.Select(t => t.Id).ToHashSet()),
            connection = conn == null ? null : new { conn.Id, conn.Status },
            blockedByMe = await db.Blocks.AnyAsync(b => b.BlockerId == Me && b.BlockedId == id),
            isMe = id == Me,
        });
    }

    // QR-код профілю → id користувача
    [HttpGet("by-qr/{token}")]
    public async Task<IActionResult> ByQr(string token)
    {
        var u = await db.Users.FirstOrDefaultAsync(x => x.QrToken == token.Trim());
        if (u == null || u.IsBlocked || u.IsDemo != IsDemoUser) return Fail("not_found", 404);
        return Ok(new { id = u.Id });
    }

    [HttpPost("{id:int}/block")]
    public async Task<IActionResult> Block(int id)
    {
        if (id == Me) return Fail("invalid");
        if (!await db.Blocks.AnyAsync(b => b.BlockerId == Me && b.BlockedId == id))
        {
            db.Blocks.Add(new Block { BlockerId = Me, BlockedId = id });
            // заблокованому звʼязок не показуємо
            await db.Connections.Where(c => ((c.StudentId == Me && c.MentorId == id) || (c.MentorId == Me && c.StudentId == id)) && (c.Status == "active" || c.Status == "pending"))
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, "archived").SetProperty(c => c.ArchivedAt, DateTime.UtcNow));
            await db.SaveChangesAsync();
        }
        return Ok(new { ok = true });
    }

    [HttpDelete("{id:int}/block")]
    public async Task<IActionResult> Unblock(int id)
    {
        await db.Blocks.Where(b => b.BlockerId == Me && b.BlockedId == id).ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }

    [HttpGet("blocked")]
    public async Task<IActionResult> Blocked()
    {
        var ids = await db.Blocks.Where(b => b.BlockerId == Me).Select(b => b.BlockedId).ToListAsync();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToListAsync();
        return Ok(users.Select(Views.Card));
    }
}

[Route("api/reports")]
public class ReportsController(AppDbContext db, AnonHasher hasher) : ApiBase
{
    public record ReportRequest(string TargetType, int TargetId, string Reason);

    // скарга
    [HttpPost]
    public async Task<IActionResult> Create(ReportRequest req)
    {
        if (req.TargetType is not ("user" or "post" or "reply" or "message" or "group")) return Fail("invalid");
        if (string.IsNullOrWhiteSpace(req.Reason)) return Fail("required");
        if (!await CanReportAsync(req.TargetType, req.TargetId)) return Fail("not_found", 404);
        db.Reports.Add(new Report { ReporterId = Me, TargetType = req.TargetType, TargetId = req.TargetId, Reason = req.Reason.Trim() });
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // скаржитися можна лише на те, що користувач справді бачить: інакше через скарги
    // (і їхній перегляд в адмінці) можна було б читати чужі повідомлення за id
    async Task<bool> CanReportAsync(string type, int id)
    {
        var world = db.Users.Where(u => u.IsDemo == IsDemoUser).Select(u => u.Id);
        switch (type)
        {
            case "user":
                return await world.ContainsAsync(id);
            case "message":
                var m = await db.Messages.FirstOrDefaultAsync(x => x.Id == id);
                if (m == null) return false;
                if (m.ConnectionId != null)
                    return await db.Connections.AnyAsync(c => c.Id == m.ConnectionId && (c.StudentId == Me || c.MentorId == Me));
                return m.GroupId != null && await db.GroupMembers.AnyAsync(g => g.GroupId == m.GroupId && g.UserId == Me);
            case "group":
                return await db.StudyGroups.AnyAsync(g => g.Id == id && world.Contains(g.CreatedById));
            default: // post / reply
                var hashes = (await world.ToListAsync()).Select(hasher.For).ToList();
                return type == "post"
                    ? await db.ForumPosts.AnyAsync(p => p.Id == id && hashes.Contains(p.AuthorHash))
                    : await db.ForumReplies.AnyAsync(r => r.Id == id && hashes.Contains(r.AuthorHash));
        }
    }
}
