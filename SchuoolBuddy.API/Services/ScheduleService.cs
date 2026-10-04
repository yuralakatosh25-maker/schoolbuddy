using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Services;

public record LessonView(int Id, int Period, string Start, string End, int SubjectId, string Room, string Teacher,
    string Status, string? NewRoom, string? NewTeacher, string? Note);

public class ScheduleService(AppDbContext db)
{
    public static readonly string[] Classes = ["1.IT", "2.IT", "3.IT", "4.IT"];

    // Уроки класу на конкретну дату з урахуванням змін (скасування, інший кабінет, заміна)
    public async Task<List<LessonView>> ForDateAsync(string? cls, DateTime date)
    {
        if (string.IsNullOrWhiteSpace(cls)) return [];
        var dow = (int)date.DayOfWeek;
        var key = date.ToString("yyyy-MM-dd");
        var lessons = await db.Lessons.Where(l => l.Class == cls && l.DayOfWeek == dow).OrderBy(l => l.Period).ToListAsync();
        var changes = await db.ScheduleChanges.Where(c => c.Class == cls && c.Date == key).ToListAsync();
        return lessons.Select(l =>
        {
            var ch = changes.FirstOrDefault(c => c.LessonId == l.Id);
            return new LessonView(l.Id, l.Period, l.Start, l.End, l.SubjectId, l.Room, l.Teacher,
                ch?.Kind ?? "normal", ch?.NewRoom, ch?.NewTeacher, ch?.Note);
        }).ToList();
    }
}
