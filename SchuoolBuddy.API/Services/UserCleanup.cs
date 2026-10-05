using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Services;

// «Право на забуття»: повністю видаляє користувача і все, що з ним повʼязано.
public class UserCleanup(AppDbContext db, AnonHasher hasher)
{
    public async Task DeleteAsync(int userId)
    {
        var user = await db.Users.Include(u => u.Tags).Include(u => u.HelpSubjects).FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return;

        var connectionIds = await db.Connections.Where(c => c.StudentId == userId || c.MentorId == userId).Select(c => c.Id).ToListAsync();
        await db.Messages.Where(m => m.ConnectionId != null && connectionIds.Contains(m.ConnectionId.Value)).ExecuteDeleteAsync();
        await db.Messages.Where(m => m.SenderId == userId).ExecuteDeleteAsync();
        await db.Connections.Where(c => connectionIds.Contains(c.Id)).ExecuteDeleteAsync();

        await db.Meetings.Where(m => m.StudentId == userId || m.MentorId == userId).ExecuteDeleteAsync();
        await db.Homeworks.Where(h => h.UserId == userId).ExecuteDeleteAsync();
        await db.SosRequests.Where(s => s.StudentId == userId).ExecuteDeleteAsync();
        await db.SosRequests.Where(s => s.MentorId == userId).ExecuteUpdateAsync(s => s.SetProperty(x => x.MentorId, (int?)null));
        await db.OfficeHours.Where(o => o.MentorId == userId).ExecuteDeleteAsync();
        await db.Notifications.Where(n => n.UserId == userId).ExecuteDeleteAsync();
        await db.Outbox.Where(o => o.UserId == userId).ExecuteDeleteAsync();
        await db.UserAchievements.Where(a => a.UserId == userId).ExecuteDeleteAsync();
        await db.TrustedContacts.Where(t => t.UserId == userId).ExecuteDeleteAsync();
        await db.CoinTransactions.Where(t => t.UserId == userId).ExecuteDeleteAsync();
        await db.Reports.Where(r => r.ReporterId == userId || (r.TargetType == "user" && r.TargetId == userId)).ExecuteDeleteAsync();
        await db.Swipes.Where(s => s.SwiperId == userId || s.TargetId == userId).ExecuteDeleteAsync();
        await db.Blocks.Where(b => b.BlockerId == userId || b.BlockedId == userId).ExecuteDeleteAsync();
        await db.EventParticipants.Where(p => p.UserId == userId).ExecuteDeleteAsync();
        await db.GroupMembers.Where(m => m.UserId == userId).ExecuteDeleteAsync();
        await db.EmailCodes.Where(c => c.Email == user.Email).ExecuteDeleteAsync();

        // Події, створені користувачем, видаляємо разом з учасниками
        var eventIds = await db.Events.Where(e => e.CreatedById == userId).Select(e => e.Id).ToListAsync();
        await db.EventParticipants.Where(p => eventIds.Contains(p.EventId)).ExecuteDeleteAsync();
        await db.Events.Where(e => eventIds.Contains(e.Id)).ExecuteDeleteAsync();

        // Групи: передаємо іншому учаснику або видаляємо порожні
        foreach (var group in await db.StudyGroups.Where(g => g.CreatedById == userId).ToListAsync())
        {
            var heir = await db.GroupMembers.Where(m => m.GroupId == group.Id).OrderBy(m => m.JoinedAt).FirstOrDefaultAsync();
            if (heir != null)
            {
                group.CreatedById = heir.UserId;
                heir.Role = "owner";
            }
            else
            {
                await db.Messages.Where(m => m.GroupId == group.Id).ExecuteDeleteAsync();
                db.StudyGroups.Remove(group);
            }
        }

        // Анонімні пости на форумі ідентифікуються лише хешем — знаходимо їх тим самим хешем
        var hash = hasher.For(userId);
        var postIds = await db.ForumPosts.Where(p => p.AuthorHash == hash).Select(p => p.Id).ToListAsync();
        await db.ForumReplies.Where(r => r.AuthorHash == hash || postIds.Contains(r.PostId)).ExecuteDeleteAsync();
        await db.ForumPosts.Where(p => postIds.Contains(p.Id)).ExecuteDeleteAsync();

        await db.Users.Where(u => u.InvitedById == userId).ExecuteUpdateAsync(s => s.SetProperty(u => u.InvitedById, (int?)null));

        user.Tags.Clear();
        user.HelpSubjects.Clear();
        db.Users.Remove(user);
        await db.SaveChangesAsync();
    }
}
