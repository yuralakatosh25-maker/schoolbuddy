using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

[Route("api/homework")]
public class HomeworkController(AppDbContext db, SosService sos) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> All(string? status = null)
    {
        var q = db.Homeworks.Where(h => h.UserId == Me);
        if (status is "open" or "done") q = q.Where(h => h.Status == status);
        var list = await q.ToListAsync();
        // Поточні — за дедлайном, завершені — від нових до старих
        return Ok(list.OrderBy(h => h.Status == "done").ThenBy(h => h.Status == "done" ? -(h.CompletedAt ?? h.Deadline).Ticks : h.Deadline.Ticks));
    }

    public record HomeworkRequest(string Title, int SubjectId, int? TopicId, string? Description, DateTime Deadline, int Difficulty);

    [HttpPost]
    public async Task<IActionResult> Create(HomeworkRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Title)) return Fail("required");
        if (!await db.Subjects.AnyAsync(s => s.Id == req.SubjectId)) return Fail("invalid");
        var h = new Homework
        {
            UserId = Me, Title = req.Title.Trim(), SubjectId = req.SubjectId, TopicId = req.TopicId,
            Description = req.Description?.Trim() ?? "", Deadline = req.Deadline.ToUniversalTime(),
            Difficulty = Math.Clamp(req.Difficulty, 1, 3),
        };
        db.Homeworks.Add(h);
        await db.SaveChangesAsync();
        return Ok(h);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, HomeworkRequest req)
    {
        var h = await db.Homeworks.FirstOrDefaultAsync(x => x.Id == id && x.UserId == Me);
        if (h == null) return Fail("not_found", 404);
        h.Title = req.Title.Trim();
        h.SubjectId = req.SubjectId;
        h.TopicId = req.TopicId;
        h.Description = req.Description?.Trim() ?? "";
        h.Deadline = req.Deadline.ToUniversalTime();
        h.Difficulty = Math.Clamp(req.Difficulty, 1, 3);
        await db.SaveChangesAsync();
        return Ok(h);
    }

    [HttpPost("{id:int}/toggle")]
    public async Task<IActionResult> Toggle(int id)
    {
        var h = await db.Homeworks.FirstOrDefaultAsync(x => x.Id == id && x.UserId == Me);
        if (h == null) return Fail("not_found", 404);
        h.Status = h.Status == "done" ? "open" : "done";
        h.CompletedAt = h.Status == "done" ? DateTime.UtcNow : null;
        await db.SaveChangesAsync();
        return Ok(h);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        await db.Homeworks.Where(x => x.Id == id && x.UserId == Me).ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }

    // Перетворити домашнє завдання на SOS-запит
    [HttpPost("{id:int}/sos")]
    public async Task<IActionResult> ToSos(int id)
    {
        var h = await db.Homeworks.FirstOrDefaultAsync(x => x.Id == id && x.UserId == Me);
        if (h == null) return Fail("not_found", 404);
        if (h.SosRequestId != null && await db.SosRequests.AnyAsync(r => r.Id == h.SosRequestId && (r.Status == "active" || r.Status == "accepted")))
            return Fail("sos_exists");
        var request = await sos.CreateAsync(Me, h.SubjectId, h.TopicId, h.Title, "homework", h.Description, h.Id);
        h.SosRequestId = request.Id;
        await db.SaveChangesAsync();
        return Ok(new { request, notified = sos.LastNotifiedCount });
    }
}

[Route("api/sos")]
public class SosController(AppDbContext db, SosService sos, NotificationService notify, Gamification game, ConnectionService connections) : ApiBase
{
    public record SosRequestDto(int SubjectId, int? TopicId, string? TopicText, string Kind, string? Description, int? HomeworkId);

    [HttpPost]
    public async Task<IActionResult> Create(SosRequestDto req)
    {
        if (!await db.Subjects.AnyAsync(s => s.Id == req.SubjectId)) return Fail("invalid");
        if (req.TopicId == null && string.IsNullOrWhiteSpace(req.TopicText)) return Fail("topic_required");
        if (await db.SosRequests.CountAsync(r => r.StudentId == Me && r.Status == "active") >= 3) return Fail("sos_limit");
        var kind = req.Kind is "test" or "homework" ? req.Kind : "question";
        var r = await sos.CreateAsync(Me, req.SubjectId, req.TopicId, req.TopicText, kind, req.Description, req.HomeworkId);
        return Ok(new { request = r, notified = sos.LastNotifiedCount });
    }

    async Task<object> Shape(List<SosRequest> list)
    {
        var ids = list.Select(r => r.StudentId).Concat(list.Where(r => r.MentorId != null).Select(r => r.MentorId!.Value)).ToList();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        return list.Select(r => new
        {
            r.Id, r.SubjectId, r.TopicId, r.TopicText, r.Kind, r.Description, r.Status, r.CreatedAt, r.AcceptedAt, r.HomeworkId,
            student = users.TryGetValue(r.StudentId, out var s) ? Views.Card(s) : null,
            mentor = r.MentorId != null && users.TryGetValue(r.MentorId.Value, out var m) ? Views.Card(m) : null,
            connectionId = r.MentorId == null ? (int?)null : db.Connections
                .Where(c => c.StudentId == r.StudentId && c.MentorId == r.MentorId && c.Status == "active").Select(c => (int?)c.Id).FirstOrDefault(),
        });
    }

    // Стрічка ментора: активні запити (спершу з предметів, з якими він допомагає)
    [HttpGet("active")]
    public async Task<IActionResult> Active()
    {
        var me = await db.Users.Include(u => u.HelpSubjects).FirstAsync(u => u.Id == Me);
        var blocked = await db.Blocks.Where(b => b.BlockerId == Me || b.BlockedId == Me).Select(b => b.BlockerId == Me ? b.BlockedId : b.BlockerId).ToListAsync();
        var mySubjects = me.HelpSubjects.Select(s => s.Id).ToHashSet();
        var list = await db.SosRequests.Where(r => r.Status == "active" && r.StudentId != Me && !blocked.Contains(r.StudentId)).ToListAsync();
        list = list.OrderByDescending(r => mySubjects.Contains(r.SubjectId)).ThenByDescending(r => r.CreatedAt).ToList();
        return Ok(await Shape(list));
    }

    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        var list = await db.SosRequests.Where(r => r.StudentId == Me || r.MentorId == Me).OrderByDescending(r => r.CreatedAt).Take(30).ToListAsync();
        return Ok(await Shape(list));
    }

    // Ментор бере запит → створюється (або оживає) звʼязок і чат
    [HttpPost("{id:int}/accept")]
    public async Task<IActionResult> Accept(int id)
    {
        var me = await db.Users.FindAsync(Me);
        if (me!.Role != "mentor") return Fail("mentor_only", 403);
        if (!me.IsSchoolApproved) return Fail("not_approved", 403);
        var r = await db.SosRequests.FindAsync(id);
        if (r == null) return Fail("not_found", 404);
        if (r.Status != "active") return Fail("sos_taken", 409);

        r.Status = "accepted";
        r.MentorId = Me;
        r.AcceptedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var conn = await connections.EnsureActiveAsync(r.StudentId, Me, "sos");
        var subject = await db.Subjects.FindAsync(r.SubjectId);
        await connections.SystemMessageAsync(conn.Id, "sos", new { subjectId = r.SubjectId, topicId = r.TopicId, topic = r.TopicText, kind = r.Kind, description = r.Description });
        await notify.NotifyAsync(r.StudentId, "sos_accepted", new { name = me.Nickname, subject = subject?.NameEn, subjectId = r.SubjectId }, $"/chat/{conn.Id}");
        await game.CheckAchievementsAsync(Me);
        await game.CheckAchievementsAsync(r.StudentId);
        return Ok(new { connectionId = conn.Id });
    }

    [HttpPost("{id:int}/resolve")]
    public async Task<IActionResult> Resolve(int id)
    {
        var r = await db.SosRequests.FirstOrDefaultAsync(x => x.Id == id && (x.StudentId == Me || x.MentorId == Me));
        if (r == null) return Fail("not_found", 404);
        r.Status = "resolved";
        await db.SaveChangesAsync();
        if (r.MentorId != null && r.StudentId == Me) await game.AddCoinsAsync(r.MentorId.Value, 20, "sos_help");
        return Ok(r);
    }

    [HttpPost("{id:int}/cancel")]
    public async Task<IActionResult> Cancel(int id)
    {
        var r = await db.SosRequests.FirstOrDefaultAsync(x => x.Id == id && x.StudentId == Me);
        if (r == null) return Fail("not_found", 404);
        if (r.Status is "resolved") return Fail("invalid");
        r.Status = "cancelled";
        await db.SaveChangesAsync();
        return Ok(r);
    }
}

public class SosService(AppDbContext db, NotificationService notify)
{
    public int LastNotifiedCount { get; private set; }

    // Створює SOS і сповіщає найближчих вільних менторів:
    // спершу тих, хто допомагає з цим предметом і зараз доступний.
    public async Task<SosRequest> CreateAsync(int studentId, int subjectId, int? topicId, string? topicText, string kind, string? description, int? homeworkId)
    {
        var r = new SosRequest
        {
            StudentId = studentId, SubjectId = subjectId, TopicId = topicId,
            TopicText = string.IsNullOrWhiteSpace(topicText) ? null : topicText.Trim(),
            Kind = kind, Description = description?.Trim() ?? "", HomeworkId = homeworkId,
        };
        db.SosRequests.Add(r);
        await db.SaveChangesAsync();

        var student = await db.Users.FindAsync(studentId);
        var subject = await db.Subjects.FindAsync(subjectId);
        var blocked = await db.Blocks.Where(b => b.BlockerId == studentId || b.BlockedId == studentId).Select(b => b.BlockerId == studentId ? b.BlockedId : b.BlockerId).ToListAsync();
        var mentors = await db.Users.Include(u => u.HelpSubjects)
            .Where(u => u.Role == "mentor" && u.IsSchoolApproved && !u.IsBlocked && u.Availability != "dnd" && u.Id != studentId && !blocked.Contains(u.Id))
            .ToListAsync();
        var targets = mentors
            .OrderByDescending(m => m.HelpSubjects.Any(s => s.Id == subjectId))
            .ThenBy(m => m.Availability == "available" ? 0 : 1)
            .Where(m => m.HelpSubjects.Any(s => s.Id == subjectId) || m.Availability == "available")
            .Take(10).Select(m => m.Id).ToList();

        await notify.NotifyManyAsync(targets, "sos_new", new { id = r.Id, name = student?.Nickname, subject = subject?.NameEn, subjectId, topic = r.TopicText, kind }, "/sos");
        LastNotifiedCount = targets.Count;
        return r;
    }
}
