using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

[Route("api/groups")]
public class GroupsController(AppDbContext db, Moderation moderation, Gamification game) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> All(string? q = null)
    {
        var groups = await db.StudyGroups.OrderByDescending(g => g.CreatedAt).ToListAsync();
        var counts = await db.GroupMembers.GroupBy(m => m.GroupId).Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.n);
        var mine = (await db.GroupMembers.Where(m => m.UserId == Me).Select(m => m.GroupId).ToListAsync()).ToHashSet();
        if (!string.IsNullOrWhiteSpace(q)) groups = groups.Where(g => g.Name.Contains(q, StringComparison.OrdinalIgnoreCase) || (g.Topic ?? "").Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
        return Ok(groups.OrderByDescending(g => mine.Contains(g.Id)).ThenByDescending(g => counts.GetValueOrDefault(g.Id)).Select(g => new
        {
            g.Id, g.Name, g.SubjectId, g.Topic, g.Description, g.CreatedAt,
            members = counts.GetValueOrDefault(g.Id),
            joined = mine.Contains(g.Id),
        }));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var g = await db.StudyGroups.FindAsync(id);
        if (g == null) return Fail("not_found", 404);
        var members = await db.GroupMembers.Where(m => m.GroupId == id).ToListAsync();
        var userIds = members.Select(m => m.UserId).ToList();
        var users = await db.Users.Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        var events = await db.Events.Where(e => e.GroupId == id && e.StartsAt > DateTime.UtcNow.AddHours(-3)).OrderBy(e => e.StartsAt).ToListAsync();
        return Ok(new
        {
            g.Id, g.Name, g.SubjectId, g.Topic, g.Description, g.CreatedAt,
            joined = members.Any(m => m.UserId == Me),
            isOwner = g.CreatedById == Me,
            members = members.Where(m => users.ContainsKey(m.UserId)).OrderByDescending(m => m.Role == "owner").Select(m => new { user = Views.Card(users[m.UserId]), m.Role }),
            events = events.Select(e => new { e.Id, e.Title, e.StartsAt, e.Location, e.Kind }),
        });
    }

    public record GroupDto(string Name, int? SubjectId, string? Topic, string? Description);

    [HttpPost]
    public async Task<IActionResult> Create(GroupDto req)
    {
        var name = (req.Name ?? "").Trim();
        if (name.Length is < 3 or > 60) return Fail("name_length");
        if (!moderation.IsClean(name) || !moderation.IsClean(req.Description) || !moderation.IsClean(req.Topic)) return Fail("moderation");
        var g = new StudyGroup { Name = name, SubjectId = req.SubjectId, Topic = req.Topic?.Trim(), Description = req.Description?.Trim() ?? "", CreatedById = Me };
        db.StudyGroups.Add(g);
        await db.SaveChangesAsync();
        db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = Me, Role = "owner" });
        await db.SaveChangesAsync();
        await game.CheckAchievementsAsync(Me);
        return Ok(g);
    }

    [HttpPost("{id:int}/join")]
    public async Task<IActionResult> Join(int id)
    {
        if (!await db.StudyGroups.AnyAsync(g => g.Id == id)) return Fail("not_found", 404);
        if (!await db.GroupMembers.AnyAsync(m => m.GroupId == id && m.UserId == Me))
        {
            db.GroupMembers.Add(new GroupMember { GroupId = id, UserId = Me });
            var me = await db.Users.FindAsync(Me);
            db.Messages.Add(new Message { GroupId = id, SystemType = "joined", Data = System.Text.Json.JsonSerializer.Serialize(new { name = me!.Nickname }) });
            await db.SaveChangesAsync();
            await game.CheckAchievementsAsync(Me);
        }
        return Ok(new { ok = true });
    }

    [HttpPost("{id:int}/leave")]
    public async Task<IActionResult> Leave(int id)
    {
        var g = await db.StudyGroups.FindAsync(id);
        if (g == null) return Fail("not_found", 404);
        await db.GroupMembers.Where(m => m.GroupId == id && m.UserId == Me).ExecuteDeleteAsync();
        if (g.CreatedById == Me)
        {
            var heir = await db.GroupMembers.Where(m => m.GroupId == id).OrderBy(m => m.JoinedAt).FirstOrDefaultAsync();
            if (heir == null)
            {
                await db.Messages.Where(m => m.GroupId == id).ExecuteDeleteAsync();
                db.StudyGroups.Remove(g);
            }
            else
            {
                heir.Role = "owner";
                g.CreatedById = heir.UserId;
            }
            await db.SaveChangesAsync();
        }
        return Ok(new { ok = true });
    }

    [HttpGet("{id:int}/messages")]
    public async Task<IActionResult> Messages(int id, int after = 0)
    {
        if (!await db.GroupMembers.AnyAsync(m => m.GroupId == id && m.UserId == Me)) return Fail("not_member", 403);
        var list = await db.Messages.Where(m => m.GroupId == id && m.Id > after).OrderBy(m => m.Id).Take(200).ToListAsync();
        var ids = list.Where(m => m.SenderId != null).Select(m => m.SenderId!.Value).Distinct().ToList();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        return Ok(list.Select(m => new
        {
            m.Id, m.SenderId, m.Text, m.SystemType, m.Data, m.CreatedAt,
            mine = m.SenderId == Me,
            sender = m.SenderId != null && users.TryGetValue(m.SenderId.Value, out var u) ? Views.Card(u) : null,
        }));
    }

    public record SendDto(string Text);

    [HttpPost("{id:int}/messages")]
    public async Task<IActionResult> Send(int id, SendDto req)
    {
        if (!await db.GroupMembers.AnyAsync(m => m.GroupId == id && m.UserId == Me)) return Fail("not_member", 403);
        var text = (req.Text ?? "").Trim();
        if (text.Length is 0 or > 2000) return Fail("invalid");
        var msg = new Message { GroupId = id, SenderId = Me, Text = moderation.Mask(text) };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();
        var me = await db.Users.FindAsync(Me);
        return Ok(new { msg.Id, msg.SenderId, msg.Text, msg.SystemType, msg.Data, msg.CreatedAt, mine = true, sender = Views.Card(me!) });
    }
}

[Route("api/events")]
public class EventsController(AppDbContext db, Moderation moderation, Gamification game, NotificationService notify) : ApiBase
{
    async Task<object> Shape(Event e, Dictionary<int, int> counts, HashSet<int> mine)
    {
        var place = e.PlaceId != null ? await db.SafePlaces.FindAsync(e.PlaceId) : null;
        var group = e.GroupId != null ? await db.StudyGroups.FindAsync(e.GroupId) : null;
        var author = await db.Users.FindAsync(e.CreatedById);
        return new
        {
            e.Id, e.Title, e.Description, e.StartsAt, e.Location, e.Kind, e.Capacity, e.GroupId,
            place = place == null ? null : Views.Place(place),
            group = group == null ? null : new { group.Id, group.Name },
            author = author == null ? null : Views.Card(author),
            participants = counts.GetValueOrDefault(e.Id),
            joined = mine.Contains(e.Id),
            isOwner = e.CreatedById == Me,
        };
    }

    [HttpGet]
    public async Task<IActionResult> All(string scope = "upcoming")
    {
        var now = DateTime.UtcNow;
        var q = scope == "past"
            ? db.Events.Where(e => e.StartsAt < now).OrderByDescending(e => e.StartsAt)
            : db.Events.Where(e => e.StartsAt >= now.AddHours(-3)).OrderBy(e => e.StartsAt);
        var list = await q.Take(50).ToListAsync();
        var counts = await db.EventParticipants.GroupBy(p => p.EventId).Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.n);
        var mine = (await db.EventParticipants.Where(p => p.UserId == Me).Select(p => p.EventId).ToListAsync()).ToHashSet();
        var result = new List<object>();
        foreach (var e in list) result.Add(await Shape(e, counts, mine));
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var e = await db.Events.FindAsync(id);
        if (e == null) return Fail("not_found", 404);
        var parts = await db.EventParticipants.Where(p => p.EventId == id).ToListAsync();
        var ids = parts.Select(p => p.UserId).ToList();
        var users = await db.Users.Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        var shaped = await Shape(e, new Dictionary<int, int> { [id] = parts.Count }, parts.Any(p => p.UserId == Me) ? [id] : []);
        return Ok(new
        {
            @event = shaped,
            people = parts.Where(p => users.ContainsKey(p.UserId)).Select(p => new { user = Views.Card(users[p.UserId]), p.CheckedIn }),
        });
    }

    public record EventDto(string Title, string? Description, DateTime StartsAt, string? Location, int? PlaceId, int? GroupId, string Kind, int? Capacity);

    [HttpPost]
    public async Task<IActionResult> Create(EventDto req)
    {
        var title = (req.Title ?? "").Trim();
        if (title.Length is < 3 or > 80) return Fail("name_length");
        if (!moderation.IsClean(title) || !moderation.IsClean(req.Description)) return Fail("moderation");
        if (req.StartsAt.ToUniversalTime() < DateTime.UtcNow) return Fail("meeting_past");
        if (req.GroupId != null && !await db.GroupMembers.AnyAsync(m => m.GroupId == req.GroupId && m.UserId == Me)) return Fail("not_member", 403);

        var place = req.PlaceId != null ? await db.SafePlaces.FindAsync(req.PlaceId) : null;
        var e = new Event
        {
            Title = title, Description = req.Description?.Trim() ?? "", StartsAt = req.StartsAt.ToUniversalTime(),
            Location = place?.Name ?? req.Location?.Trim() ?? "", PlaceId = place?.Id, GroupId = req.GroupId, CreatedById = Me,
            Kind = req.Kind is "social" or "gaming" or "sport" or "school" ? req.Kind : "study",
            Capacity = req.Capacity is > 0 ? req.Capacity : null,
        };
        db.Events.Add(e);
        await db.SaveChangesAsync();
        db.EventParticipants.Add(new EventParticipant { EventId = e.Id, UserId = Me });
        await db.SaveChangesAsync();

        if (e.GroupId != null)
        {
            var ids = await db.GroupMembers.Where(m => m.GroupId == e.GroupId && m.UserId != Me).Select(m => m.UserId).ToListAsync();
            await notify.NotifyManyAsync(ids, "event_new", new { title = e.Title, at = e.StartsAt }, $"/events/{e.Id}");
        }
        await game.CheckAchievementsAsync(Me);
        return Ok(e);
    }

    [HttpPost("{id:int}/join")]
    public async Task<IActionResult> Join(int id)
    {
        var e = await db.Events.FindAsync(id);
        if (e == null) return Fail("not_found", 404);
        if (await db.EventParticipants.AnyAsync(p => p.EventId == id && p.UserId == Me)) return Ok(new { ok = true });
        if (e.Capacity != null && await db.EventParticipants.CountAsync(p => p.EventId == id) >= e.Capacity) return Fail("event_full");
        db.EventParticipants.Add(new EventParticipant { EventId = id, UserId = Me });
        await db.SaveChangesAsync();
        await game.CheckAchievementsAsync(Me);
        return Ok(new { ok = true });
    }

    [HttpPost("{id:int}/leave")]
    public async Task<IActionResult> Leave(int id)
    {
        await db.EventParticipants.Where(p => p.EventId == id && p.UserId == Me).ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }

    public record CheckInDto(string QrToken);

    // Організатор сканує QR-код профілю учасника — підтвердження особи на шкільній активності
    [HttpPost("{id:int}/checkin")]
    public async Task<IActionResult> CheckIn(int id, CheckInDto req)
    {
        var e = await db.Events.FindAsync(id);
        if (e == null) return Fail("not_found", 404);
        if (e.CreatedById != Me && !IsAdmin) return Fail("forbidden", 403);
        var user = await db.Users.FirstOrDefaultAsync(u => u.QrToken == req.QrToken.Trim());
        if (user == null) return Fail("not_found", 404);
        var p = await db.EventParticipants.FirstOrDefaultAsync(x => x.EventId == id && x.UserId == user.Id);
        if (p == null)
        {
            p = new EventParticipant { EventId = id, UserId = user.Id };
            db.EventParticipants.Add(p);
        }
        p.CheckedIn = true;
        await db.SaveChangesAsync();
        await game.CheckAchievementsAsync(user.Id);
        return Ok(new { user = Views.Card(user) });
    }
}

[Route("api/notifications")]
public class NotificationsController(AppDbContext db) : ApiBase
{
    [HttpGet]
    public async Task<IActionResult> All(int take = 50)
    {
        var list = await db.Notifications.Where(n => n.UserId == Me).OrderByDescending(n => n.Id).Take(Math.Clamp(take, 1, 100)).ToListAsync();
        var unread = await db.Notifications.CountAsync(n => n.UserId == Me && !n.IsRead);
        return Ok(new { unread, items = list });
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> ReadAll()
    {
        await db.Notifications.Where(n => n.UserId == Me && !n.IsRead).ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));
        return Ok(new { ok = true });
    }

    [HttpPost("{id:int}/read")]
    public async Task<IActionResult> Read(int id)
    {
        await db.Notifications.Where(n => n.Id == id && n.UserId == Me).ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));
        return Ok(new { ok = true });
    }
}

// Анонімний форум / Q&A
[Route("api/forum")]
public class ForumController(AppDbContext db, AnonHasher hasher, Moderation moderation) : ApiBase
{
    // Публічний псевдонім: перші 6 символів SHA-256 хешу
    static string Alias(string hash) => "anon-" + hash[..6];

    [HttpGet]
    public async Task<IActionResult> All(string? category = null)
    {
        var q = db.ForumPosts.Where(p => !p.IsHidden);
        if (!string.IsNullOrEmpty(category)) q = q.Where(p => p.Category == category);
        var posts = await q.OrderByDescending(p => p.CreatedAt).Take(100).ToListAsync();
        var ids = posts.Select(p => p.Id).ToList();
        var replies = await db.ForumReplies.Where(r => ids.Contains(r.PostId) && !r.IsHidden).GroupBy(r => r.PostId)
            .Select(g => new { g.Key, n = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.n);
        var myHash = hasher.For(Me);
        return Ok(posts.Select(p => new
        {
            p.Id, p.Title, p.Content, p.Category, p.CreatedAt,
            author = Alias(p.AuthorHash), mine = p.AuthorHash == myHash,
            replies = replies.GetValueOrDefault(p.Id),
        }));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var p = await db.ForumPosts.FirstOrDefaultAsync(x => x.Id == id && !x.IsHidden);
        if (p == null) return Fail("not_found", 404);
        var myHash = hasher.For(Me);
        var replies = await db.ForumReplies.Where(r => r.PostId == id && !r.IsHidden).OrderBy(r => r.CreatedAt).ToListAsync();
        return Ok(new
        {
            p.Id, p.Title, p.Content, p.Category, p.CreatedAt,
            author = Alias(p.AuthorHash), mine = p.AuthorHash == myHash,
            replies = replies.Select(r => new { r.Id, r.Content, r.CreatedAt, author = Alias(r.AuthorHash), mine = r.AuthorHash == myHash, op = r.AuthorHash == p.AuthorHash }),
        });
    }

    public record PostDto(string Title, string Content, string? Category);

    [HttpPost]
    public async Task<IActionResult> Create(PostDto req)
    {
        var title = (req.Title ?? "").Trim();
        var content = (req.Content ?? "").Trim();
        if (title.Length is < 5 or > 140 || content.Length > 3000) return Fail("post_length");
        if (!moderation.IsClean(title) || !moderation.IsClean(content)) return Fail("moderation");
        var p = new ForumPost
        {
            Title = title, Content = content, AuthorHash = hasher.For(Me),
            Category = req.Category is "teachers" or "city" or "other" ? req.Category : "school",
        };
        db.ForumPosts.Add(p);
        await db.SaveChangesAsync();
        return Ok(new { p.Id });
    }

    public record ReplyDto(string Content);

    [HttpPost("{id:int}/replies")]
    public async Task<IActionResult> Reply(int id, ReplyDto req)
    {
        if (!await db.ForumPosts.AnyAsync(p => p.Id == id && !p.IsHidden)) return Fail("not_found", 404);
        var content = (req.Content ?? "").Trim();
        if (content.Length is < 1 or > 2000) return Fail("post_length");
        if (!moderation.IsClean(content)) return Fail("moderation");
        db.ForumReplies.Add(new ForumReply { PostId = id, Content = content, AuthorHash = hasher.For(Me) });
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var hash = hasher.For(Me);
        var p = await db.ForumPosts.FirstOrDefaultAsync(x => x.Id == id && (x.AuthorHash == hash || IsAdmin));
        if (p == null) return Fail("not_found", 404);
        await db.ForumReplies.Where(r => r.PostId == id).ExecuteDeleteAsync();
        db.ForumPosts.Remove(p);
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }
}
