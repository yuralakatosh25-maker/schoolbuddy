using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

public class ConnectionService(AppDbContext db)
{
    public async Task<Connection> EnsureActiveAsync(int studentId, int mentorId, string origin)
    {
        var conn = await db.Connections.Where(c => c.StudentId == studentId && c.MentorId == mentorId && (c.Status == "active" || c.Status == "pending"))
            .FirstOrDefaultAsync();
        if (conn == null)
        {
            conn = new Connection { StudentId = studentId, MentorId = mentorId, Origin = origin };
            db.Connections.Add(conn);
        }
        conn.Status = "active";
        conn.AcceptedAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync();
        return conn;
    }

    public async Task SystemMessageAsync(int connectionId, string type, object data)
    {
        db.Messages.Add(new Message { ConnectionId = connectionId, SystemType = type, Data = JsonSerializer.Serialize(data, new JsonSerializerOptions(JsonSerializerDefaults.Web)) });
        var conn = await db.Connections.FindAsync(connectionId);
        if (conn != null) conn.LastMessageAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}

// Звʼязки Student ↔ Mentor та їхні чати
[Route("api/connections")]
public class ConnectionsController(AppDbContext db, NotificationService notify, Gamification game, ConnectionService service, Moderation moderation) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> All()
    {
        var list = await db.Connections.Where(c => (c.StudentId == Me || c.MentorId == Me) && c.Status != "declined")
            .OrderByDescending(c => c.LastMessageAt ?? c.CreatedAt).ToListAsync();
        var otherIds = list.Select(c => c.StudentId == Me ? c.MentorId : c.StudentId).ToList();
        var users = await db.Users.Where(u => otherIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        var ids = list.Select(c => c.Id).ToList();
        var last = await db.Messages.Where(m => m.ConnectionId != null && ids.Contains(m.ConnectionId.Value))
            .GroupBy(m => m.ConnectionId).Select(g => g.OrderByDescending(m => m.Id).First()).ToListAsync();
        var meetings = await db.Meetings.Where(m => m.ConnectionId != null && ids.Contains(m.ConnectionId.Value) && m.Status == "completed")
            .GroupBy(m => m.ConnectionId).Select(g => new { id = g.Key, count = g.Count() }).ToDictionaryAsync(x => x.id!.Value, x => x.count);

        return Ok(list.Where(c => users.ContainsKey(c.StudentId == Me ? c.MentorId : c.StudentId)).Select(c =>
        {
            var lastMsg = last.FirstOrDefault(m => m.ConnectionId == c.Id);
            return new
            {
                c.Id, c.Status, c.Origin, c.CreatedAt, c.AcceptedAt, c.ArchivedAt,
                myRole = c.Origin == "match" ? "peer" : c.MentorId == Me ? "mentor" : "student",
                with = Views.Card(users[c.StudentId == Me ? c.MentorId : c.StudentId]),
                lastMessage = lastMsg == null ? null : new { lastMsg.Text, lastMsg.SystemType, lastMsg.CreatedAt, mine = lastMsg.SenderId == Me },
                meetings = meetings.GetValueOrDefault(c.Id),
            };
        }));
    }

    public record RequestDto(int? MentorId, string? QrToken);

    // Студент просить ментора (зі сторінки профілю або через QR-код)
    [HttpPost]
    public async Task<IActionResult> Create(RequestDto req)
    {
        var me = await db.Users.FindAsync(Me);
        User? other = req.MentorId != null ? await db.Users.FindAsync(req.MentorId) :
            req.QrToken != null ? await db.Users.FirstOrDefaultAsync(u => u.QrToken == req.QrToken) : null;
        if (other == null || other.Id == Me || other.IsBlocked) return Fail("not_found", 404);
        if (await db.Blocks.AnyAsync(b => (b.BlockerId == Me && b.BlockedId == other.Id) || (b.BlockerId == other.Id && b.BlockedId == Me))) return Fail("blocked", 403);

        // Хто з двох ментор — визначає роль; двоє студентів чи менторів не створюють звʼязок
        int studentId, mentorId;
        if (other.Role == "mentor" && me!.Role != "mentor") { studentId = Me; mentorId = other.Id; }
        else if (me!.Role == "mentor" && other.Role != "mentor") { studentId = other.Id; mentorId = Me; }
        else return Fail("roles_mismatch");

        var existing = await db.Connections.FirstOrDefaultAsync(c => c.StudentId == studentId && c.MentorId == mentorId && (c.Status == "active" || c.Status == "pending"));
        if (existing != null) return Ok(existing);

        var origin = req.QrToken != null ? "qr" : "request";
        // Ментор, який сам сканує QR студента, одразу створює активний звʼязок
        var conn = new Connection { StudentId = studentId, MentorId = mentorId, Origin = origin, Status = mentorId == Me ? "active" : "pending" };
        if (conn.Status == "active") conn.AcceptedAt = DateTime.UtcNow;
        db.Connections.Add(conn);
        await db.SaveChangesAsync();

        if (conn.Status == "pending")
            await notify.NotifyAsync(mentorId, "connection_request", new { name = me.Nickname }, "/cabinet");
        else
        {
            await notify.NotifyAsync(studentId, "connection_accepted", new { name = me.Nickname }, $"/chat/{conn.Id}");
            await game.CheckAchievementsAsync(Me);
            await game.CheckAchievementsAsync(studentId);
        }
        return Ok(conn);
    }

    [HttpPost("{id:int}/accept")]
    public async Task<IActionResult> Accept(int id)
    {
        var conn = await db.Connections.FirstOrDefaultAsync(c => c.Id == id && c.MentorId == Me && c.Status == "pending");
        if (conn == null) return Fail("not_found", 404);
        var me = await db.Users.FindAsync(Me);
        if (!me!.IsSchoolApproved) return Fail("not_approved", 403);
        var active = await db.Connections.CountAsync(c => c.MentorId == Me && c.Status == "active" && c.Origin != "match");
        if (active >= me.MaxStudents) return Fail("mentor_full");

        conn.Status = "active";
        conn.AcceptedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await service.SystemMessageAsync(conn.Id, "connected", new { });
        await notify.NotifyAsync(conn.StudentId, "connection_accepted", new { name = me.Nickname }, $"/chat/{conn.Id}");
        await game.CheckAchievementsAsync(Me);
        await game.CheckAchievementsAsync(conn.StudentId);
        return Ok(conn);
    }

    [HttpPost("{id:int}/decline")]
    public async Task<IActionResult> Decline(int id)
    {
        var conn = await db.Connections.FirstOrDefaultAsync(c => c.Id == id && c.MentorId == Me && c.Status == "pending");
        if (conn == null) return Fail("not_found", 404);
        conn.Status = "declined";
        await db.SaveChangesAsync();
        return Ok(conn);
    }

    // Архівація: завершення звʼязку зі збереженням історії та статистики
    [HttpPost("{id:int}/archive")]
    public async Task<IActionResult> Archive(int id)
    {
        var conn = await db.Connections.FirstOrDefaultAsync(c => c.Id == id && (c.StudentId == Me || c.MentorId == Me) && c.Status == "active");
        if (conn == null) return Fail("not_found", 404);
        conn.Status = "archived";
        conn.ArchivedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await service.SystemMessageAsync(conn.Id, "archived", new { });
        await db.Meetings.Where(m => m.ConnectionId == id && m.Status == "scheduled")
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.Status, "cancelled"));
        var me = await db.Users.FindAsync(Me);
        var otherId = conn.StudentId == Me ? conn.MentorId : conn.StudentId;
        await notify.NotifyAsync(otherId, "connection_archived", new { name = me!.Nickname }, "/cabinet");
        return Ok(conn);
    }

    // Статистика звʼязку (для архіву)
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var conn = await db.Connections.FirstOrDefaultAsync(c => c.Id == id && (c.StudentId == Me || c.MentorId == Me));
        if (conn == null) return Fail("not_found", 404);
        var other = await db.Users.FindAsync(conn.StudentId == Me ? conn.MentorId : conn.StudentId);
        var meetings = await db.Meetings.Where(m => m.ConnectionId == id).OrderByDescending(m => m.ScheduledAt).ToListAsync();
        var messageCount = await db.Messages.CountAsync(m => m.ConnectionId == id && m.SenderId != null);
        var sosCount = await db.SosRequests.CountAsync(r => r.StudentId == conn.StudentId && r.MentorId == conn.MentorId);
        var places = await db.SafePlaces.ToDictionaryAsync(p => p.Id, p => p.Name);
        return Ok(new
        {
            conn.Id, conn.Status, conn.Origin, conn.CreatedAt, conn.AcceptedAt, conn.ArchivedAt,
            myRole = conn.Origin == "match" ? "peer" : conn.MentorId == Me ? "mentor" : "student",
            with = other == null ? null : Views.Card(other),
            stats = new { messages = messageCount, sos = sosCount, meetings = meetings.Count(m => m.Status == "completed") },
            meetings = meetings.Select(m => new { m.Id, m.ScheduledAt, m.Status, m.Topic, place = m.PlaceId != null ? places.GetValueOrDefault(m.PlaceId.Value) : null }),
        });
    }

    [HttpGet("{id:int}/messages")]
    public async Task<IActionResult> Messages(int id, int after = 0)
    {
        if (!await db.Connections.AnyAsync(c => c.Id == id && (c.StudentId == Me || c.MentorId == Me))) return Fail("not_found", 404);
        var list = await db.Messages.Where(m => m.ConnectionId == id && m.Id > after).OrderBy(m => m.Id).Take(200).ToListAsync();
        return Ok(list.Select(m => new { m.Id, m.SenderId, m.Text, m.SystemType, m.Data, m.CreatedAt, mine = m.SenderId == Me }));
    }

    public record SendDto(string Text);

    [HttpPost("{id:int}/messages")]
    public async Task<IActionResult> Send(int id, SendDto req)
    {
        var conn = await db.Connections.FirstOrDefaultAsync(c => c.Id == id && (c.StudentId == Me || c.MentorId == Me));
        if (conn == null) return Fail("not_found", 404);
        if (conn.Status != "active") return Fail("chat_archived");
        var text = (req.Text ?? "").Trim();
        if (text.Length is 0 or > 2000) return Fail("invalid");

        var msg = new Message { ConnectionId = id, SenderId = Me, Text = moderation.Mask(text) };
        db.Messages.Add(msg);
        conn.LastMessageAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Одне непрочитане сповіщення на чат, щоб не засипати дзвіночок
        var otherId = conn.StudentId == Me ? conn.MentorId : conn.StudentId;
        var me = await db.Users.FindAsync(Me);
        var unread = await db.Notifications.AnyAsync(n => n.UserId == otherId && n.Type == "message_new" && !n.IsRead && n.Link == $"/chat/{id}");
        if (!unread) await notify.NotifyAsync(otherId, "message_new", new { name = me!.Nickname, mentor = me.Role == "mentor" }, $"/chat/{id}");
        return Ok(new { msg.Id, msg.SenderId, msg.Text, msg.SystemType, msg.Data, msg.CreatedAt, mine = true });
    }
}

// Mentor Office Hours
[Route("api/office-hours")]
public class OfficeHoursController(AppDbContext db) : ApiBase
{
    [HttpGet("{mentorId:int}")]
    public async Task<IActionResult> Get(int mentorId) =>
        Ok((await db.OfficeHours.Where(o => o.MentorId == mentorId).OrderBy(o => o.DayOfWeek).ThenBy(o => o.Start).ToListAsync()).Select(Views.OfficeHour));

    public record HourDto(int DayOfWeek, string Start, string End, string Mode, string? Note);

    [HttpPut]
    public async Task<IActionResult> Replace(List<HourDto> hours)
    {
        var me = await db.Users.FindAsync(Me);
        if (me!.Role != "mentor") return Fail("mentor_only", 403);
        var re = new System.Text.RegularExpressions.Regex(@"^([01]\d|2[0-3]):[0-5]\d$");
        if (hours.Any(h => h.DayOfWeek is < 1 or > 7 || !re.IsMatch(h.Start) || !re.IsMatch(h.End) || string.Compare(h.Start, h.End) >= 0))
            return Fail("invalid_hours");
        await db.OfficeHours.Where(o => o.MentorId == Me).ExecuteDeleteAsync();
        db.OfficeHours.AddRange(hours.Select(h => new OfficeHour
        {
            MentorId = Me, DayOfWeek = h.DayOfWeek, Start = h.Start, End = h.End,
            Mode = h.Mode is "online" or "place" ? h.Mode : "school", Note = h.Note,
        }));
        await db.SaveChangesAsync();
        return await Get(Me);
    }

    // Вільні 30-хвилинні слоти ментора на найближчі 7 днів (з урахуванням уже запланованих зустрічей)
    [HttpGet("{mentorId:int}/slots")]
    public async Task<IActionResult> Slots(int mentorId)
    {
        var hours = await db.OfficeHours.Where(o => o.MentorId == mentorId).ToListAsync();
        var busy = await db.Meetings.Where(m => m.MentorId == mentorId && m.Status == "scheduled" && m.ScheduledAt > DateTime.UtcNow)
            .Select(m => m.ScheduledAt).ToListAsync();
        var slots = new List<object>();
        var now = DateTime.Now;
        for (var d = 0; d < 7; d++)
        {
            var day = now.Date.AddDays(d);
            var dow = day.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)day.DayOfWeek;
            foreach (var h in hours.Where(h => h.DayOfWeek == dow))
            {
                var t = day.Add(TimeSpan.Parse(h.Start));
                var end = day.Add(TimeSpan.Parse(h.End));
                for (; t.AddMinutes(30) <= end; t = t.AddMinutes(30))
                {
                    if (t <= now.AddMinutes(30)) continue;
                    var utc = t.ToUniversalTime();
                    if (busy.Any(b => Math.Abs((b - utc).TotalMinutes) < 30)) continue;
                    slots.Add(new { at = utc, mode = h.Mode });
                }
            }
        }
        return Ok(slots);
    }
}
