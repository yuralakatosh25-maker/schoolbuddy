using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

[Route("api/me")]
public class MeController(AppDbContext db, Gamification game, Moderation moderation, UserCleanup cleanup,
    ScheduleService schedule, AnonHasher hasher) : ApiBase
{
    async Task<User> Load() => await db.Users.Include(u => u.Tags).Include(u => u.HelpSubjects).FirstAsync(u => u.Id == Me);

    async Task<object> Profile(User u)
    {
        var stats = await game.StatsAsync(u.Id);
        var achievements = await db.UserAchievements.Where(a => a.UserId == u.Id).Select(a => new { a.Code, a.UnlockedAt }).ToListAsync();
        return new
        {
            u.Id, u.Email, u.Nickname, u.Avatar, u.Role, u.Class, u.Bio,
            languages = Views.Csv(u.Languages),
            helpFormats = Views.Csv(u.HelpFormats),
            u.Availability, u.MaxStudents,
            emailVerified = u.IsEmailVerified,
            verified = u.IsSchoolApproved,
            u.Coins,
            streak = u.StreakCount,
            u.InviteCode, u.QrToken, u.PreferredLang,
            notify = new { push = u.NotifyPush, inApp = u.NotifyInApp, email = u.NotifyEmail, telegram = u.NotifyTelegram, telegramHandle = u.TelegramHandle },
            u.ConsentAt, u.IsDemo, u.CreatedAt,
            tags = u.Tags.Select(Views.Tag),
            helpSubjects = u.HelpSubjects.Select(s => s.Id),
            stats,
            achievements,
        };
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var u = await Load();
        await game.TouchStreakAsync(u);
        return Ok(await Profile(u));
    }

    public record UpdateProfile(string? Nickname, string? Avatar, string? Bio, string? Class, string[]? Languages,
        string[]? HelpFormats, string? Availability, string? PreferredLang, int[]? HelpSubjects, int? MaxStudents);

    [HttpPut]
    public async Task<IActionResult> Update(UpdateProfile req)
    {
        var u = await Load();
        if (req.Nickname != null)
        {
            var nick = req.Nickname.Trim();
            if (nick.Length is < 2 or > 40) return Fail("nickname_length");
            if (!moderation.IsClean(nick)) return Fail("moderation");
            u.Nickname = nick;
        }
        if (req.Avatar != null)
        {
            if (req.Avatar.Length > 400_000) return Fail("avatar_too_large");
            u.Avatar = req.Avatar == "" ? null : req.Avatar;
        }
        if (req.Bio != null)
        {
            if (!moderation.IsClean(req.Bio)) return Fail("moderation");
            u.Bio = req.Bio.Trim();
        }
        if (req.Class != null) u.Class = ScheduleService.Classes.Contains(req.Class) ? req.Class : null;
        if (req.Languages != null) u.Languages = string.Join(",", req.Languages.Where(l => l is "UA" or "CZ" or "EN"));
        if (req.HelpFormats != null) u.HelpFormats = string.Join(",", req.HelpFormats.Where(f => f is "online" or "offline" or "school" or "place"));
        if (req.Availability is "available" or "busy" or "dnd") u.Availability = req.Availability;
        if (req.PreferredLang is "UA" or "CZ" or "EN") u.PreferredLang = req.PreferredLang;
        if (req.MaxStudents is >= 1 and <= 20) u.MaxStudents = req.MaxStudents.Value;
        if (req.HelpSubjects != null)
        {
            u.HelpSubjects.Clear();
            foreach (var s in await db.Subjects.Where(s => req.HelpSubjects.Contains(s.Id)).ToListAsync()) u.HelpSubjects.Add(s);
        }
        await db.SaveChangesAsync();
        return Ok(await Profile(u));
    }

    public record RoleRequest(string Role);

    // Студент може стати ментором (потрібне підтвердження школи) і навпаки
    [HttpPut("role")]
    public async Task<IActionResult> SetRole(RoleRequest req)
    {
        var u = await Load();
        if (u.Role == "admin") return Fail("forbidden", 403);
        if (req.Role is not ("student" or "mentor")) return Fail("invalid");
        if (u.Role != req.Role)
        {
            u.Role = req.Role;
            if (u.Role == "mentor" && string.IsNullOrEmpty(u.HelpFormats)) u.HelpFormats = "school,online";
            await db.SaveChangesAsync();
        }
        return Ok(await Profile(u));
    }

    public record TagsRequest(int[] TagIds);

    [HttpPut("tags")]
    public async Task<IActionResult> SetTags(TagsRequest req)
    {
        var u = await Load();
        var tags = await db.Tags.Where(t => req.TagIds.Contains(t.Id) && t.IsApproved).ToListAsync();
        u.Tags.Clear();
        foreach (var t in tags) u.Tags.Add(t);
        await db.SaveChangesAsync();
        return Ok(u.Tags.Select(Views.Tag));
    }

    public record NotifyPrefs(bool Push, bool InApp, bool Email, bool Telegram, string? TelegramHandle);

    [HttpPut("notifications")]
    public async Task<IActionResult> SetNotify(NotifyPrefs req)
    {
        var u = await db.Users.FindAsync(Me);
        u!.NotifyPush = req.Push;
        u.NotifyInApp = req.InApp;
        u.NotifyEmail = req.Email;
        u.NotifyTelegram = req.Telegram;
        u.TelegramHandle = string.IsNullOrWhiteSpace(req.TelegramHandle) ? null : req.TelegramHandle.Trim();
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // ---------- Головний екран ----------

    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard()
    {
        var u = await Load();
        var nowUtc = DateTime.UtcNow;
        // Після останнього уроку або на вихідних показуємо найближчий навчальний день
        var lessonsDate = DateTime.Now.Date;
        var lessons = await schedule.ForDateAsync(u.Class, lessonsDate);
        var nowHm = DateTime.Now.ToString("HH:mm");
        for (var i = 0; i < 7 && u.Class != null && (lessons.Count == 0 || (lessonsDate == DateTime.Now.Date && lessons.All(l => string.Compare(l.End, nowHm) <= 0))); i++)
        {
            lessonsDate = lessonsDate.AddDays(1);
            lessons = await schedule.ForDateAsync(u.Class, lessonsDate);
        }

        var exams = u.Class == null ? [] : await db.Exams
            .Where(e => e.Class == u.Class && e.Date > nowUtc && e.Date < nowUtc.AddDays(14))
            .OrderBy(e => e.Date).Take(4).ToListAsync();

        var homework = await db.Homeworks.Where(h => h.UserId == Me && h.Status == "open").OrderBy(h => h.Deadline).Take(4).ToListAsync();

        var meetings = await db.Meetings
            .Where(m => (m.StudentId == Me || m.MentorId == Me) && m.Status == "scheduled" && m.ScheduledAt > nowUtc.AddHours(-2))
            .OrderBy(m => m.ScheduledAt).Take(3).ToListAsync();
        var otherIds = meetings.Select(m => m.StudentId == Me ? m.MentorId : m.StudentId).ToList();
        var others = await db.Users.Where(x => otherIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        var places = await db.SafePlaces.ToDictionaryAsync(p => p.Id);

        var blocked = await BlockedIds();
        var myTags = u.Tags.Select(t => t.Id).ToHashSet();
        var mentors = await db.Users.Include(x => x.Tags)
            .Where(x => x.Role == "mentor" && x.Id != Me && x.Availability == "available" && !x.IsBlocked && x.IsSchoolApproved)
            .ToListAsync();
        var mentorCards = mentors.Where(m => !blocked.Contains(m.Id))
            .Select(m => new { m, score = Matching.Score(myTags, m.Tags.Select(t => t.Id).ToHashSet()) })
            .OrderByDescending(x => x.score).Take(5)
            .Select(x => new { user = Views.Card(x.m), match = x.score });

        var notifications = await db.Notifications.Where(n => n.UserId == Me).OrderByDescending(n => n.Id).Take(4).ToListAsync();
        var announcements = await db.Announcements.OrderByDescending(a => a.Pinned).ThenByDescending(a => a.CreatedAt).Take(2).ToListAsync();

        var sosOpen = u.Role == "mentor"
            ? await db.SosRequests.CountAsync(r => r.Status == "active" && !blocked.Contains(r.StudentId))
            : await db.SosRequests.CountAsync(r => r.StudentId == Me && (r.Status == "active" || r.Status == "accepted"));

        return Ok(new
        {
            lessons,
            lessonsDate = lessonsDate.ToString("yyyy-MM-dd"),
            lessonsIsToday = lessonsDate == DateTime.Now.Date,
            exams = exams.Select(e => new { e.Id, e.SubjectId, e.TopicId, e.Date, e.Kind, e.Note }),
            homework = homework.Select(h => new { h.Id, h.Title, h.SubjectId, h.Deadline, h.Difficulty }),
            meetings = meetings.Select(m => new
            {
                m.Id, m.ScheduledAt, m.Topic,
                with = others.TryGetValue(m.StudentId == Me ? m.MentorId : m.StudentId, out var o) ? Views.Card(o) : null,
                place = m.PlaceId != null && places.TryGetValue(m.PlaceId.Value, out var p) ? p.Name : null,
            }),
            mentors = mentorCards,
            notifications,
            announcements,
            sosOpen,
        });
    }

    async Task<List<int>> BlockedIds() =>
        await db.Blocks.Where(b => b.BlockerId == Me || b.BlockedId == Me)
            .Select(b => b.BlockerId == Me ? b.BlockedId : b.BlockerId).ToListAsync();

    // ---------- Досягнення, гаманець ----------

    [HttpGet("achievements")]
    public async Task<IActionResult> Achievements()
    {
        await game.CheckAchievementsAsync(Me);
        var have = await db.UserAchievements.Where(a => a.UserId == Me).ToDictionaryAsync(a => a.Code, a => a.UnlockedAt);
        return Ok(Gamification.Achievements.Select(a => new
        {
            code = a.Code, coins = a.Coins,
            unlocked = have.ContainsKey(a.Code),
            unlockedAt = have.TryGetValue(a.Code, out var at) ? at : (DateTime?)null,
        }));
    }

    // ---------- Довірений контакт ----------

    [HttpGet("trusted-contacts")]
    public async Task<IActionResult> Contacts() => Ok(await db.TrustedContacts.Where(t => t.UserId == Me).ToListAsync());

    public record ContactRequest(string Name, string Contact, string? Relation);

    [HttpPost("trusted-contacts")]
    public async Task<IActionResult> AddContact(ContactRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Contact)) return Fail("required");
        if (await db.TrustedContacts.CountAsync(t => t.UserId == Me) >= 3) return Fail("limit");
        var c = new TrustedContact { UserId = Me, Name = req.Name.Trim(), Contact = req.Contact.Trim(), Relation = req.Relation?.Trim() };
        db.TrustedContacts.Add(c);
        await db.SaveChangesAsync();
        return Ok(c);
    }

    [HttpDelete("trusted-contacts/{id:int}")]
    public async Task<IActionResult> DeleteContact(int id)
    {
        await db.TrustedContacts.Where(t => t.Id == id && t.UserId == Me).ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }

    // ---------- GDPR ----------

    // Експорт усіх персональних даних (право на доступ)
    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        var u = await Load();
        var hash = hasher.For(Me);
        var connectionIds = await db.Connections.Where(c => c.StudentId == Me || c.MentorId == Me).Select(c => c.Id).ToListAsync();
        return Ok(new
        {
            exportedAt = DateTime.UtcNow,
            profile = await Profile(u),
            homework = await db.Homeworks.Where(h => h.UserId == Me).ToListAsync(),
            sos = await db.SosRequests.Where(s => s.StudentId == Me || s.MentorId == Me).ToListAsync(),
            connections = await db.Connections.Where(c => connectionIds.Contains(c.Id)).ToListAsync(),
            messages = await db.Messages.Where(m => m.SenderId == Me).ToListAsync(),
            meetings = await db.Meetings.Where(m => m.StudentId == Me || m.MentorId == Me).ToListAsync(),
            officeHours = await db.OfficeHours.Where(o => o.MentorId == Me).ToListAsync(),
            trustedContacts = await db.TrustedContacts.Where(t => t.UserId == Me).ToListAsync(),
            transactions = await db.CoinTransactions.Where(t => t.UserId == Me).ToListAsync(),
            forumPosts = await db.ForumPosts.Where(p => p.AuthorHash == hash).ToListAsync(),
            forumReplies = await db.ForumReplies.Where(r => r.AuthorHash == hash).ToListAsync(),
            groups = await db.GroupMembers.Where(m => m.UserId == Me).ToListAsync(),
            events = await db.EventParticipants.Where(p => p.UserId == Me).ToListAsync(),
            notifications = await db.Notifications.Where(n => n.UserId == Me).ToListAsync(),
        });
    }

    // Право на забуття: повне видалення акаунта
    [HttpDelete]
    public async Task<IActionResult> Delete()
    {
        await cleanup.DeleteAsync(Me);
        return Ok(new { ok = true });
    }
}

public static class Matching
{
    // Відсоток збігу за тегами: наскільки людина покриває мої інтереси (60%)
    // плюс загальна схожість профілів за коефіцієнтом Сьоренсена–Дайса (40%).
    public static int Score(HashSet<int> mine, HashSet<int> theirs)
    {
        if (mine.Count == 0 || theirs.Count == 0) return 0;
        var shared = mine.Intersect(theirs).Count();
        var coverage = (double)shared / mine.Count;
        var dice = 2.0 * shared / (mine.Count + theirs.Count);
        return (int)Math.Round(100 * (0.6 * coverage + 0.4 * dice));
    }
}
