using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;
using SchoolBuddy.API.Services;

namespace SchoolBuddy.API.Controllers;

// «Seznamka»: колода профілів зі свайпами. Взаємний лайк створює рівноправний чат (Connection з Origin "match").
[Route("api/swipe")]
public class SwipeController(AppDbContext db, NotificationService notify) : ApiBase
{
    const int DeckSize = 15;

    [HttpGet("deck")]
    public async Task<IActionResult> Deck(string role = "student")
    {
        var me = await db.Users.Include(u => u.Tags).FirstAsync(u => u.Id == Me);
        var mine = me.Tags.Select(t => t.Id).ToHashSet();

        var seen = await db.Swipes.Where(s => s.SwiperId == Me).Select(s => s.TargetId).ToListAsync();
        var blocked = await db.Blocks.Where(b => b.BlockerId == Me || b.BlockedId == Me)
            .Select(b => b.BlockerId == Me ? b.BlockedId : b.BlockerId).ToListAsync();
        var skip = seen.Concat(blocked).ToHashSet();

        var query = db.Users.Include(u => u.Tags)
            .Where(u => u.Id != Me && !u.IsBlocked && u.Role != "admin");
        if (role is "student" or "mentor") query = query.Where(u => u.Role == role);
        var users = (await query.ToListAsync()).Where(u => !skip.Contains(u.Id)).ToList();

        // Ті, хто вже вподобав мене, йдуть першими — швидший метч; далі за збігом інтересів
        var likedMe = (await db.Swipes.Where(s => s.TargetId == Me && s.Liked).Select(s => s.SwiperId).ToListAsync()).ToHashSet();
        var deck = users
            .Select(u => (u, score: Matching.Score(mine, u.Tags.Select(t => t.Id).ToHashSet())))
            .OrderByDescending(x => likedMe.Contains(x.u.Id))
            .ThenByDescending(x => x.score)
            .ThenBy(_ => Random.Shared.Next())
            .Take(DeckSize)
            .Select(x => new
            {
                user = Views.Card(x.u),
                x.u.Bio,
                match = x.score,
                tags = x.u.Tags.Select(t => t.Name).Take(8),
                sharedTags = x.u.Tags.Where(t => mine.Contains(t.Id)).Select(t => t.Name),
            });
        return Ok(deck);
    }

    public record SwipeDto(int TargetId, bool Like);

    [HttpPost]
    public async Task<IActionResult> Swipe(SwipeDto req)
    {
        var target = await db.Users.FindAsync(req.TargetId);
        if (target == null || target.Id == Me || target.IsBlocked || target.Role == "admin") return Fail("not_found", 404);
        if (await db.Blocks.AnyAsync(b => (b.BlockerId == Me && b.BlockedId == target.Id) || (b.BlockerId == target.Id && b.BlockedId == Me)))
            return Fail("blocked", 403);

        var swipe = await db.Swipes.FirstOrDefaultAsync(s => s.SwiperId == Me && s.TargetId == target.Id);
        if (swipe == null) db.Swipes.Add(swipe = new Swipe { SwiperId = Me, TargetId = target.Id });
        swipe.Liked = req.Like;
        swipe.CreatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        if (!req.Like || !await db.Swipes.AnyAsync(s => s.SwiperId == target.Id && s.TargetId == Me && s.Liked))
            return Ok(new { matched = false });

        // Взаємний лайк: чат для двох учнів. Якщо звʼязок уже є (напр. ментор–студент) — використовуємо його.
        var conn = await db.Connections.Where(c => ((c.StudentId == Me && c.MentorId == target.Id) || (c.StudentId == target.Id && c.MentorId == Me))
            && (c.Status == "active" || c.Status == "pending")).FirstOrDefaultAsync();
        if (conn == null)
        {
            conn = new Connection
            {
                StudentId = Math.Min(Me, target.Id), MentorId = Math.Max(Me, target.Id),
                Origin = "match", Status = "active", AcceptedAt = DateTime.UtcNow, LastMessageAt = DateTime.UtcNow,
            };
            db.Connections.Add(conn);
            await db.SaveChangesAsync();
            db.Messages.Add(new Message { ConnectionId = conn.Id, SystemType = "matched", Data = "{}" });
            await db.SaveChangesAsync();
            var me = await db.Users.FindAsync(Me);
            await notify.NotifyAsync(target.Id, "match_new", new { name = me!.Nickname }, $"/chat/{conn.Id}");
        }
        return Ok(new { matched = true, connectionId = conn.Id, user = Views.Card(target) });
    }

    // Повернути в колоду тих, кого пропустив (лайки не чіпаємо)
    [HttpDelete("skipped")]
    public async Task<IActionResult> ResetSkipped()
    {
        await db.Swipes.Where(s => s.SwiperId == Me && !s.Liked).ExecuteDeleteAsync();
        return Ok(new { ok = true });
    }
}
