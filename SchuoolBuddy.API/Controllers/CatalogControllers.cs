using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

[Route("api/tags")]
public class TagsController(AppDbContext db, Moderation moderation) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> All() =>
        Ok((await db.Tags.Where(t => t.IsApproved).OrderBy(t => t.Category).ThenBy(t => t.Name).ToListAsync()).Select(Views.Tag));

    public record CreateTag(string Name, string? Category);

    // Власний тег: проходить автоматичну перевірку на стоп-слова і одразу додається до профілю
    [HttpPost]
    public async Task<IActionResult> Create(CreateTag req)
    {
        var raw = (req.Name ?? "").Trim().TrimStart('#').Trim();
        if (raw.Length is < 2 or > 24) return Fail("tag_length");
        if (!System.Text.RegularExpressions.Regex.IsMatch(raw, @"^[\p{L}\p{N} +#.\-]+$")) return Fail("tag_chars");
        if (!moderation.IsClean(raw)) return Fail("moderation");

        var name = "#" + raw;
        // SQLite lower() не знає кирилиці, тому порівнюємо без урахування регістру вже в памʼяті
        var tag = (await db.Tags.ToListAsync()).FirstOrDefault(t => string.Equals(t.Name, name, StringComparison.CurrentCultureIgnoreCase));
        if (tag == null)
        {
            var category = req.Category is "it" or "games" or "sport" or "hobby" or "study" ? req.Category : "hobby";
            tag = new Tag { Name = name, Category = category, IsApproved = true, CreatedById = Me };
            db.Tags.Add(tag);
        }
        var me = await db.Users.Include(u => u.Tags).FirstAsync(u => u.Id == Me);
        if (!me.Tags.Any(t => t.Id == tag.Id)) me.Tags.Add(tag);
        await db.SaveChangesAsync();
        return Ok(Views.Tag(tag));
    }
}

[Route("api/subjects")]
public class SubjectsController(AppDbContext db) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> All()
    {
        var subjects = await db.Subjects.Include(s => s.Topics).OrderBy(s => s.Id).ToListAsync();
        return Ok(subjects.Select(s => new
        {
            s.Id, s.Code, s.NameUa, s.NameCs, s.NameEn, s.Color,
            topics = s.Topics.OrderBy(t => t.Id).Select(Views.Topic),
        }));
    }
}

[Route("api/places")]
public class PlacesController(AppDbContext db) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> All()
    {
        var partners = await db.Partners.ToDictionaryAsync(p => p.Id);
        var rewards = await db.PartnerRewards.ToListAsync();
        var places = await db.SafePlaces.OrderBy(p => p.Id).ToListAsync();
        return Ok(places.Select(p => new
        {
            p.Id, p.Name, p.Kind, p.Address, p.Lat, p.Lng, p.Hours, p.IsVerified,
            partner = p.PartnerId != null && partners.ContainsKey(p.PartnerId.Value),
            rewards = rewards.Where(r => r.PartnerId == p.PartnerId).Select(r => new { r.Id, r.TitleUa, r.TitleCs, r.TitleEn, r.Cost, r.MinTier }),
        }));
    }
}

[Route("api/schedule")]
public class ScheduleController(AppDbContext db, ScheduleService schedule, NotificationService notify) : ApiBase
{
    [HttpGet("classes")]
    [AllowAnonymous]
    public IActionResult Classes() => Ok(ScheduleService.Classes);

    // Розклад на тиждень (з понеділка вказаного тижня) зі змінами
    [HttpGet("week")]
    public async Task<IActionResult> Week(int offset = 0)
    {
        var me = await db.Users.FindAsync(Me);
        var today = DateTime.Now.Date;
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7)).AddDays(7 * offset);
        var days = new List<object>();
        for (var i = 0; i < 5; i++)
        {
            var d = monday.AddDays(i);
            days.Add(new { date = d.ToString("yyyy-MM-dd"), dayOfWeek = i + 1, lessons = await schedule.ForDateAsync(me!.Class, d) });
        }
        return Ok(new { @class = me!.Class, monday = monday.ToString("yyyy-MM-dd"), days });
    }

    // Майбутні контрольні та іспити
    [HttpGet("exams")]
    public async Task<IActionResult> Exams()
    {
        var me = await db.Users.FindAsync(Me);
        var exams = await db.Exams.Where(e => e.Class == me!.Class && e.Date > DateTime.UtcNow.AddHours(-2)).OrderBy(e => e.Date).ToListAsync();
        return Ok(exams);
    }

    // Зміни в розкладі на найближчі 7 днів
    [HttpGet("changes")]
    public async Task<IActionResult> Changes()
    {
        var me = await db.Users.FindAsync(Me);
        var from = DateTime.Now.ToString("yyyy-MM-dd");
        var to = DateTime.Now.AddDays(7).ToString("yyyy-MM-dd");
        var changes = await db.ScheduleChanges
            .Where(c => c.Class == me!.Class && string.Compare(c.Date, from) >= 0 && string.Compare(c.Date, to) <= 0)
            .OrderBy(c => c.Date).ToListAsync();
        var lessonIds = changes.Select(c => c.LessonId).ToList();
        var lessons = await db.Lessons.Where(l => lessonIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id);
        return Ok(changes.Select(c => new
        {
            c.Id, c.Date, c.Kind, c.NewRoom, c.NewTeacher, c.Note,
            lesson = lessons.GetValueOrDefault(c.LessonId),
        }));
    }

    public record ChangeRequest(string Class, string Date, int LessonId, string Kind, string? NewRoom, string? NewTeacher, string? Note);

    [Authorize(Roles = "admin"), HttpPost("changes")]
    public async Task<IActionResult> AddChange(ChangeRequest req)
    {
        if (req.Kind is not ("cancelled" or "room" or "substitute")) return Fail("invalid");
        var lesson = await db.Lessons.FirstOrDefaultAsync(l => l.Id == req.LessonId && l.Class == req.Class);
        if (lesson == null) return Fail("not_found", 404);
        var change = new ScheduleChange { Class = req.Class, Date = req.Date, LessonId = req.LessonId, Kind = req.Kind, NewRoom = req.NewRoom, NewTeacher = req.NewTeacher, Note = req.Note };
        db.ScheduleChanges.Add(change);
        await db.SaveChangesAsync();

        var ids = await db.Users.Where(u => u.Class == req.Class).Select(u => u.Id).ToListAsync();
        await notify.NotifyManyAsync(ids, "schedule_change", new { kind = req.Kind, date = req.Date, subjectId = lesson.SubjectId, start = lesson.Start, room = req.NewRoom }, "/schedule");
        return Ok(change);
    }

    public record ExamRequest(string Class, int SubjectId, int? TopicId, DateTime Date, string Kind, string? Note);

    [Authorize(Roles = "admin"), HttpPost("exams")]
    public async Task<IActionResult> AddExam(ExamRequest req)
    {
        var exam = new Exam { Class = req.Class, SubjectId = req.SubjectId, TopicId = req.TopicId, Date = req.Date.ToUniversalTime(), Kind = req.Kind is "exam" or "quiz" ? req.Kind : "test", Note = req.Note };
        db.Exams.Add(exam);
        await db.SaveChangesAsync();
        var ids = await db.Users.Where(u => u.Class == req.Class).Select(u => u.Id).ToListAsync();
        await notify.NotifyManyAsync(ids, "exam_added", new { subjectId = req.SubjectId, kind = exam.Kind, at = exam.Date }, "/schedule");
        return Ok(exam);
    }
}

[Route("api/announcements")]
public class AnnouncementsController(AppDbContext db, NotificationService notify) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> All(string? category = null)
    {
        var q = db.Announcements.AsQueryable();
        if (!string.IsNullOrEmpty(category)) q = q.Where(a => a.Category == category);
        return Ok(await q.OrderByDescending(a => a.Pinned).ThenByDescending(a => a.CreatedAt).ToListAsync());
    }

    public record AnnouncementRequest(string Category, string? TitleUa, string? TitleCs, string? TitleEn, string? BodyUa, string? BodyCs, string? BodyEn, bool Pinned);

    // Офіційний канал школи — публікує лише адміністрація
    [Authorize(Roles = "admin"), HttpPost]
    public async Task<IActionResult> Create(AnnouncementRequest req)
    {
        // Якщо переклад не заповнено — показуємо текст тією мовою, якою його написали
        var title = req.TitleUa ?? req.TitleCs ?? req.TitleEn;
        var body = req.BodyUa ?? req.BodyCs ?? req.BodyEn;
        if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(body)) return Fail("required");
        var a = new Announcement
        {
            Category = req.Category is "schedule" or "room" or "exam" or "event" or "urgent" ? req.Category : "general",
            TitleUa = Pick(req.TitleUa, title), TitleCs = Pick(req.TitleCs, title), TitleEn = Pick(req.TitleEn, title),
            BodyUa = Pick(req.BodyUa, body), BodyCs = Pick(req.BodyCs, body), BodyEn = Pick(req.BodyEn, body),
            Pinned = req.Pinned, AuthorId = Me,
        };
        db.Announcements.Add(a);
        await db.SaveChangesAsync();

        var ids = await db.Users.Where(u => !u.IsBlocked && u.Id != Me).Select(u => u.Id).ToListAsync();
        await notify.NotifyManyAsync(ids, "announcement", new { id = a.Id, titleUa = a.TitleUa, titleCs = a.TitleCs, titleEn = a.TitleEn, category = a.Category }, "/announcements");
        return Ok(a);
    }

    static string Pick(string? v, string fallback) => string.IsNullOrWhiteSpace(v) ? fallback : v.Trim();

    [Authorize(Roles = "admin"), HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await db.Announcements.Where(a => a.Id == id).ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }
}
