using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

[Route("api/meetings")]
public class MeetingsController(AppDbContext db, NotificationService notify, Gamification game, ConnectionService connections) : ApiBase
{
    const int MentorReward = 50;
    const int StudentReward = 10;

    async Task<object> Shape(Meeting m)
    {
        var otherId = m.StudentId == Me ? m.MentorId : m.StudentId;
        var other = await db.Users.FindAsync(otherId);
        var place = m.PlaceId != null ? await db.SafePlaces.FindAsync(m.PlaceId) : null;
        var isStudent = m.StudentId == Me;
        var pinValid = m.PinExpiresAt != null && m.PinExpiresAt > DateTime.UtcNow;
        return new
        {
            m.Id, m.ConnectionId, m.ScheduledAt, m.Topic, m.Status, m.CompletedAt,
            myRole = isStudent ? "student" : "mentor",
            with = other == null ? null : Views.Card(other),
            place = place == null ? null : Views.Place(place),
            // PIN і QR бачить лише студент — він показує їх ментору при зустрічі
            pin = isStudent && pinValid ? m.Pin : null,
            qrToken = isStudent && pinValid ? m.QrToken : null,
            pinExpiresAt = isStudent && pinValid ? m.PinExpiresAt : null,
        };
    }

    [HttpGet]
    public async Task<IActionResult> All(string scope = "upcoming")
    {
        var q = db.Meetings.Where(m => m.StudentId == Me || m.MentorId == Me);
        q = scope == "past"
            ? q.Where(m => m.Status != "scheduled").OrderByDescending(m => m.ScheduledAt)
            : q.Where(m => m.Status == "scheduled").OrderBy(m => m.ScheduledAt);
        var list = await q.Take(50).ToListAsync();
        var result = new List<object>();
        foreach (var m in list) result.Add(await Shape(m));
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var m = await db.Meetings.FirstOrDefaultAsync(x => x.Id == id && (x.StudentId == Me || x.MentorId == Me));
        return m == null ? Fail("not_found", 404) : Ok(await Shape(m));
    }

    public record CreateDto(int ConnectionId, DateTime ScheduledAt, int? PlaceId, string? Topic);

    [HttpPost]
    public async Task<IActionResult> Create(CreateDto req)
    {
        var conn = await db.Connections.FirstOrDefaultAsync(c => c.Id == req.ConnectionId && (c.StudentId == Me || c.MentorId == Me) && c.Status == "active");
        if (conn == null) return Fail("not_found", 404);
        var at = req.ScheduledAt.ToUniversalTime();
        if (at < DateTime.UtcNow.AddMinutes(5)) return Fail("meeting_past");
        if (req.PlaceId != null && !await db.SafePlaces.AnyAsync(p => p.Id == req.PlaceId)) return Fail("invalid");

        var m = new Meeting
        {
            ConnectionId = conn.Id, StudentId = conn.StudentId, MentorId = conn.MentorId,
            ScheduledAt = at, PlaceId = req.PlaceId, Topic = req.Topic?.Trim(),
        };
        db.Meetings.Add(m);
        await db.SaveChangesAsync();

        var me = await db.Users.FindAsync(Me);
        var otherId = conn.StudentId == Me ? conn.MentorId : conn.StudentId;
        await connections.SystemMessageAsync(conn.Id, "meeting", new { id = m.Id, at, placeId = req.PlaceId });
        await notify.NotifyAsync(otherId, "meeting_scheduled", new { name = me!.Nickname, at }, $"/meetings/{m.Id}");
        return Ok(await Shape(m));
    }

    // Студент генерує одноразовий PIN + QR (дійсні 10 хвилин)
    [HttpPost("{id:int}/pin")]
    public async Task<IActionResult> Pin(int id)
    {
        var m = await db.Meetings.FirstOrDefaultAsync(x => x.Id == id && x.StudentId == Me && x.Status == "scheduled");
        if (m == null) return Fail("not_found", 404);
        m.Pin = Codes.Digits(6);
        m.QrToken = "m-" + Codes.Token();
        m.PinExpiresAt = DateTime.UtcNow.AddMinutes(10);
        await db.SaveChangesAsync();
        return Ok(await Shape(m));
    }

    public record ConfirmDto(int? MeetingId, string? Pin, string? QrToken);

    // Ментор підтверджує зустріч PIN-кодом або скануванням QR → нараховуються Buddy Coins
    [HttpPost("confirm")]
    public async Task<IActionResult> Confirm(ConfirmDto req)
    {
        Meeting? m = null;
        if (!string.IsNullOrWhiteSpace(req.QrToken))
            m = await db.Meetings.FirstOrDefaultAsync(x => x.QrToken == req.QrToken.Trim() && x.MentorId == Me);
        else if (req.MeetingId != null)
            m = await db.Meetings.FirstOrDefaultAsync(x => x.Id == req.MeetingId && x.MentorId == Me);
        if (m == null) return Fail("not_found", 404);
        if (m.Status != "scheduled") return Fail("meeting_done");
        if (m.PinExpiresAt == null || m.PinExpiresAt < DateTime.UtcNow) return Fail("pin_expired");
        if (string.IsNullOrWhiteSpace(req.QrToken) && m.Pin != req.Pin?.Trim()) return Fail("pin_invalid");

        m.Status = "completed";
        m.CompletedAt = DateTime.UtcNow;
        m.Pin = null;
        m.QrToken = null;
        m.PinExpiresAt = null;
        await db.SaveChangesAsync();

        await game.AddCoinsAsync(m.MentorId, MentorReward, "meeting");
        await game.AddCoinsAsync(m.StudentId, StudentReward, "meeting");
        if (m.ConnectionId != null) await connections.SystemMessageAsync(m.ConnectionId.Value, "meeting_done", new { id = m.Id });
        await notify.NotifyAsync(m.MentorId, "meeting_completed", new { coins = MentorReward }, "/wallet");
        await notify.NotifyAsync(m.StudentId, "meeting_completed", new { coins = StudentReward }, $"/meetings/{m.Id}");
        await game.CheckAchievementsAsync(m.MentorId);
        await game.CheckAchievementsAsync(m.StudentId);
        return Ok(new { ok = true, coins = MentorReward });
    }

    [HttpPost("{id:int}/cancel")]
    public async Task<IActionResult> Cancel(int id)
    {
        var m = await db.Meetings.FirstOrDefaultAsync(x => x.Id == id && (x.StudentId == Me || x.MentorId == Me) && x.Status == "scheduled");
        if (m == null) return Fail("not_found", 404);
        m.Status = "cancelled";
        await db.SaveChangesAsync();
        var me = await db.Users.FindAsync(Me);
        await notify.NotifyAsync(m.StudentId == Me ? m.MentorId : m.StudentId, "meeting_cancelled", new { name = me!.Nickname }, $"/meetings/{m.Id}");
        return Ok(await Shape(m));
    }
}
