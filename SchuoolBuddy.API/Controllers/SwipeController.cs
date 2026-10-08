using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

// Seznamka - свайпи. Якщо двоє лайкнули одне одного, створюється чат
[Route("api/swipe")]
public class SwipeController(AppDbContext db, NotificationService notify) : ApiBase
{
    const int DeckSize = 15;

    [HttpGet("deck")]
    public async Task<IActionResult> Deck(string role = "student")
    {
        var me = await db.Users.Include(u => u.Tags).FirstAsync(u => u.Id == Me);
        var myTags = me.Tags.Select(t => t.Id).ToHashSet();

        // кого вже свайпали
        var seen = await db.Swipes.Where(s => s.SwiperId == Me).Select(s => s.TargetId).ToListAsync();

        // кого заблокували ми або нас
        var blockedList = await db.Blocks.Where(b => b.BlockerId == Me || b.BlockedId == Me).ToListAsync();
        var skip = new HashSet<int>(seen);
        foreach (var b in blockedList)
        {
            if (b.BlockerId == Me) skip.Add(b.BlockedId);
            else skip.Add(b.BlockerId);
        }

        // лише підтверджені школою, і демо-акаунти окремо від реальних
        var query = db.Users.Include(u => u.Tags)
            .Where(u => u.Id != Me && !u.IsBlocked && u.Role != "admin" && u.IsSchoolApproved && u.IsDemo == me.IsDemo);
        if (role == "student" || role == "mentor") query = query.Where(u => u.Role == role);
        var allUsers = await query.ToListAsync();

        // хто вже лайкнув мене - показуємо першими
        var likedMeList = await db.Swipes.Where(s => s.TargetId == Me && s.Liked).Select(s => s.SwiperId).ToListAsync();

        var cards = new List<(User user, int score)>();
        foreach (var u in allUsers)
        {
            if (skip.Contains(u.Id)) continue;
            var score = Matching.Score(myTags, u.Tags.Select(t => t.Id).ToHashSet());
            cards.Add((u, score));
        }

        var sorted = cards
            .OrderByDescending(c => likedMeList.Contains(c.user.Id))
            .ThenByDescending(c => c.score)
            .ThenBy(c => Random.Shared.Next())
            .Take(DeckSize);

        var result = new List<object>();
        foreach (var c in sorted)
        {
            result.Add(new
            {
                user = Views.Card(c.user),
                c.user.Bio,
                match = c.score,
                tags = c.user.Tags.Select(t => t.Name).Take(8),
                sharedTags = c.user.Tags.Where(t => myTags.Contains(t.Id)).Select(t => t.Name),
            });
        }
        return Ok(result);
    }

    public record SwipeDto(int TargetId, bool Like);

    [HttpPost]
    public async Task<IActionResult> Swipe(SwipeDto req)
    {
        var me = await db.Users.FindAsync(Me);
        if (!me!.IsSchoolApproved) return Fail("not_approved", 403);
        var target = await db.Users.FindAsync(req.TargetId);
        if (target == null || target.Id == Me || target.IsBlocked || target.Role == "admin" || !target.IsSchoolApproved || target.IsDemo != me.IsDemo)
            return Fail("not_found", 404);

        var isBlocked = await db.Blocks.AnyAsync(b =>
            (b.BlockerId == Me && b.BlockedId == target.Id) || (b.BlockerId == target.Id && b.BlockedId == Me));
        if (isBlocked) return Fail("blocked", 403);

        // якщо вже свайпав цю людину - просто оновлюємо
        var swipe = await db.Swipes.FirstOrDefaultAsync(s => s.SwiperId == Me && s.TargetId == target.Id);
        if (swipe == null)
        {
            swipe = new Swipe { SwiperId = Me, TargetId = target.Id };
            db.Swipes.Add(swipe);
        }
        swipe.Liked = req.Like;
        swipe.CreatedAt = DateTime.UtcNow;
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException)
        {
            // подвійний тап: такий свайп уже вставив паралельний запит — просто оновлюємо його
            db.ChangeTracker.Clear();
            await db.Swipes.Where(s => s.SwiperId == Me && s.TargetId == req.TargetId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.Liked, req.Like).SetProperty(x => x.CreatedAt, DateTime.UtcNow));
        }

        if (!req.Like) return Ok(new { matched = false });

        var theyLikedMe = await db.Swipes.AnyAsync(s => s.SwiperId == target.Id && s.TargetId == Me && s.Liked);
        if (!theyLikedMe) return Ok(new { matched = false });

        // взаємний лайк - шукаємо чат, якщо його нема, то створюємо
        var conn = await db.Connections.FirstOrDefaultAsync(c =>
            ((c.StudentId == Me && c.MentorId == target.Id) || (c.StudentId == target.Id && c.MentorId == Me))
            && (c.Status == "active" || c.Status == "pending"));

        if (conn == null)
        {
            conn = new Connection
            {
                StudentId = Math.Min(Me, target.Id),
                MentorId = Math.Max(Me, target.Id),
                Origin = "match",
                Status = "active",
                AcceptedAt = DateTime.UtcNow,
                LastMessageAt = DateTime.UtcNow,
            };
            db.Connections.Add(conn);
            await db.SaveChangesAsync();

            // обидва лайкнули одночасно — могли створитися два чати; лишаємо найстаріший
            var first = await db.Connections.Where(c => c.StudentId == conn.StudentId && c.MentorId == conn.MentorId && c.Origin == "match" && c.Status == "active")
                .OrderBy(c => c.Id).FirstAsync();
            if (first.Id != conn.Id)
            {
                db.Connections.Remove(conn);
                await db.SaveChangesAsync();
                return Ok(new { matched = true, connectionId = first.Id, user = Views.Card(target) });
            }

            db.Messages.Add(new Message { ConnectionId = conn.Id, SystemType = "matched", Data = "{}" });
            await db.SaveChangesAsync();

            await notify.NotifyAsync(target.Id, "match_new", new { name = me.Nickname }, $"/chat/{conn.Id}");
        }
        return Ok(new { matched = true, connectionId = conn.Id, user = Views.Card(target) });
    }

    // повернути пропущених у колоду, лайки лишаємо
    [HttpDelete("skipped")]
    public async Task<IActionResult> ResetSkipped()
    {
        await db.Swipes.Where(s => s.SwiperId == Me && !s.Liked).ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }
}
