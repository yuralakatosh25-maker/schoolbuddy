using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Controllers;

[ApiController]
[Authorize]
public abstract class ApiBase : ControllerBase
{
    protected int Me => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    protected bool IsAdmin => User.IsInRole("admin");
    // демо-акаунт (вхід без пароля): ознаку додає Program.cs при перевірці токена
    protected bool IsDemoUser => User.HasClaim("demo", "1");
    // справжній адмін школи, а не демо-адмін
    protected bool IsRealAdmin => IsAdmin && !IsDemoUser;

    // повертаємо код помилки, фронтенд сам його перекладає
    protected ObjectResult Fail(string code, int status = 400) => StatusCode(status, new { error = code });
}

public static class Views
{
    public static string[] Csv(string? s) =>
        string.IsNullOrWhiteSpace(s) ? [] : s.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    public static object Card(User u) => new
    {
        u.Id, u.Nickname, u.Avatar, u.Role, u.Class,
        verified = u.IsSchoolApproved,
        u.Availability,
    };

    public static object Tag(Tag t) => new { t.Id, t.Name, t.Category };

    public static object Subject(Subject s) => new { s.Id, s.Code, s.NameUa, s.NameCs, s.NameEn, s.Color };

    public static object Topic(Topic t) => new { t.Id, t.SubjectId, t.NameUa, t.NameCs, t.NameEn };

    public static object Place(SafePlace p) => new { p.Id, p.Name, p.Kind, p.Address, p.Lat, p.Lng, p.Hours, p.IsVerified, p.PartnerId };

    public static object OfficeHour(OfficeHour o) => new { o.Id, o.DayOfWeek, o.Start, o.End, o.Mode, o.Note };

    // чи є зараз у ментора консультація
    public static bool InOfficeNow(IEnumerable<OfficeHour> hours)
    {
        var now = DateTime.Now;
        var dow = now.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)now.DayOfWeek;
        var hm = now.ToString("HH:mm");
        return hours.Any(h => h.DayOfWeek == dow && string.Compare(h.Start, hm) <= 0 && string.Compare(h.End, hm) > 0);
    }
}
