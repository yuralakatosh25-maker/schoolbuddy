using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Services;

// Smart Reminders: раз на хвилину перевіряє зустрічі, уроки, контрольні, дедлайни та події
// і створює нагадування (дублікати відсікаються через DedupeKey).
public class ReminderService(IServiceScopeFactory scopes, ILogger<ReminderService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        await Task.Delay(TimeSpan.FromSeconds(5), stop);
        while (!stop.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                await RunOnceAsync(scope.ServiceProvider);
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Reminder pass failed");
            }
            await Task.Delay(TimeSpan.FromMinutes(1), stop);
        }
    }

    static async Task RunOnceAsync(IServiceProvider sp)
    {
        var db = sp.GetRequiredService<AppDbContext>();
        var notify = sp.GetRequiredService<NotificationService>();
        var nowUtc = DateTime.UtcNow;
        var names = await db.Users.ToDictionaryAsync(u => u.Id, u => u.Nickname);

        // Зустрічі в найближчу годину
        var soon = await db.Meetings.Where(m => m.Status == "scheduled" && !m.Reminded && m.ScheduledAt > nowUtc && m.ScheduledAt <= nowUtc.AddHours(1)).ToListAsync();
        foreach (var m in soon)
        {
            m.Reminded = true;
            await notify.NotifyAsync(m.StudentId, "meeting_reminder", new { name = names.GetValueOrDefault(m.MentorId), at = m.ScheduledAt }, $"/meetings/{m.Id}");
            await notify.NotifyAsync(m.MentorId, "meeting_reminder", new { name = names.GetValueOrDefault(m.StudentId), at = m.ScheduledAt }, $"/meetings/{m.Id}");
        }

        // Зустріч минула, але не підтверджена PIN/QR
        var unconfirmed = await db.Meetings.Where(m => m.Status == "scheduled" && m.ScheduledAt < nowUtc.AddMinutes(-15) && m.ScheduledAt > nowUtc.AddDays(-2)).ToListAsync();
        foreach (var m in unconfirmed)
        {
            await notify.NotifyAsync(m.StudentId, "meeting_confirm_needed", new { name = names.GetValueOrDefault(m.MentorId) }, $"/meetings/{m.Id}", $"mconf:{m.Id}");
            await notify.NotifyAsync(m.MentorId, "meeting_confirm_needed", new { name = names.GetValueOrDefault(m.StudentId) }, $"/meetings/{m.Id}", $"mconf:{m.Id}");
        }

        var subjects = await db.Subjects.ToDictionaryAsync(s => s.Id);
        var usersByClass = (await db.Users.Where(u => u.Class != null && !u.IsBlocked).Select(u => new { u.Id, u.Class }).ToListAsync())
            .GroupBy(u => u.Class!).ToDictionary(g => g.Key, g => g.Select(x => x.Id).ToList());

        // Уроки, що починаються протягом 10 хвилин (місцевий час школи)
        var now = DateTime.Now;
        var dow = (int)now.DayOfWeek;
        if (dow is >= 1 and <= 5)
        {
            var today = now.ToString("yyyy-MM-dd");
            var from = now.ToString("HH:mm");
            var to = now.AddMinutes(10).ToString("HH:mm");
            var lessons = await db.Lessons.Where(l => l.DayOfWeek == dow && string.Compare(l.Start, from) > 0 && string.Compare(l.Start, to) <= 0).ToListAsync();
            var cancelled = await db.ScheduleChanges.Where(c => c.Date == today && c.Kind == "cancelled").Select(c => c.LessonId).ToListAsync();
            foreach (var l in lessons.Where(l => !cancelled.Contains(l.Id)))
            {
                if (!usersByClass.TryGetValue(l.Class, out var ids)) continue;
                var s = subjects.GetValueOrDefault(l.SubjectId);
                await notify.NotifyManyAsync(ids, "lesson_reminder", new { subject = s?.NameEn, subjectId = l.SubjectId, room = l.Room, start = l.Start }, "/schedule", $"lesson:{today}:{l.Id}");
            }
        }

        // Контрольні протягом доби
        var exams = await db.Exams.Where(e => e.Date > nowUtc && e.Date <= nowUtc.AddHours(24)).ToListAsync();
        foreach (var e in exams)
        {
            if (!usersByClass.TryGetValue(e.Class, out var ids)) continue;
            await notify.NotifyManyAsync(ids, "exam_reminder", new { subject = subjects.GetValueOrDefault(e.SubjectId)?.NameEn, subjectId = e.SubjectId, kind = e.Kind, at = e.Date }, "/schedule", $"exam:{e.Id}");
        }

        // Дедлайни домашок протягом доби
        var homework = await db.Homeworks.Where(h => h.Status == "open" && h.Deadline > nowUtc && h.Deadline <= nowUtc.AddHours(24)).ToListAsync();
        foreach (var h in homework)
            await notify.NotifyAsync(h.UserId, "homework_deadline", new { title = h.Title, deadline = h.Deadline }, "/homework", $"hw:{h.Id}");

        // Події протягом 2 годин
        var events = await db.Events.Where(e => !e.Reminded && e.StartsAt > nowUtc && e.StartsAt <= nowUtc.AddHours(2)).ToListAsync();
        foreach (var ev in events)
        {
            ev.Reminded = true;
            var ids = await db.EventParticipants.Where(p => p.EventId == ev.Id).Select(p => p.UserId).ToListAsync();
            await notify.NotifyManyAsync(ids, "event_reminder", new { title = ev.Title, at = ev.StartsAt }, $"/events/{ev.Id}");
        }

        await db.SaveChangesAsync();
    }
}
