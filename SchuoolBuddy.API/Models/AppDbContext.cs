using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace SchoolBuddy.API.Models;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<EmailCode> EmailCodes => Set<EmailCode>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Topic> Topics => Set<Topic>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<ScheduleChange> ScheduleChanges => Set<ScheduleChange>();
    public DbSet<Exam> Exams => Set<Exam>();
    public DbSet<Homework> Homeworks => Set<Homework>();
    public DbSet<SosRequest> SosRequests => Set<SosRequest>();
    public DbSet<Connection> Connections => Set<Connection>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<SafePlace> SafePlaces => Set<SafePlace>();
    public DbSet<OfficeHour> OfficeHours => Set<OfficeHour>();
    public DbSet<Announcement> Announcements => Set<Announcement>();
    public DbSet<StudyGroup> StudyGroups => Set<StudyGroup>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventParticipant> EventParticipants => Set<EventParticipant>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<OutboxMessage> Outbox => Set<OutboxMessage>();
    public DbSet<UserAchievement> UserAchievements => Set<UserAchievement>();
    public DbSet<TrustedContact> TrustedContacts => Set<TrustedContact>();
    public DbSet<ForumPost> ForumPosts => Set<ForumPost>();
    public DbSet<ForumReply> ForumReplies => Set<ForumReply>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<Swipe> Swipes => Set<Swipe>();
    public DbSet<Block> Blocks => Set<Block>();
    public DbSet<CoinTransaction> CoinTransactions => Set<CoinTransaction>();
    public DbSet<Partner> Partners => Set<Partner>();
    public DbSet<PartnerReward> PartnerRewards => Set<PartnerReward>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>().HasIndex(u => u.Email).IsUnique();
        b.Entity<User>().HasIndex(u => u.InviteCode).IsUnique();
        b.Entity<User>().HasIndex(u => u.QrToken).IsUnique();
        b.Entity<User>().HasMany(u => u.Tags).WithMany(t => t.Users).UsingEntity(j => j.ToTable("UserTags"));
        b.Entity<User>().HasMany(u => u.HelpSubjects).WithMany(s => s.Mentors).UsingEntity(j => j.ToTable("MentorSubjects"));

        b.Entity<Subject>().HasMany(s => s.Topics).WithOne().HasForeignKey(t => t.SubjectId);

        b.Entity<GroupMember>().HasKey(m => new { m.GroupId, m.UserId });
        b.Entity<EventParticipant>().HasKey(p => new { p.EventId, p.UserId });

        b.Entity<Swipe>().HasIndex(s => new { s.SwiperId, s.TargetId }).IsUnique();
        b.Entity<Swipe>().HasIndex(s => s.TargetId);
        b.Entity<Message>().HasIndex(m => m.ConnectionId);
        b.Entity<Message>().HasIndex(m => m.GroupId);
        b.Entity<Notification>().HasIndex(n => new { n.UserId, n.IsRead });
        b.Entity<Notification>().HasIndex(n => new { n.UserId, n.DedupeKey });
        b.Entity<EmailCode>().HasIndex(c => c.Email);

        // SQLite повертає DateTime без Kind — позначаємо всі дати як UTC,
        // щоб у JSON вони йшли з "Z" і браузер правильно переводив їх у локальний час.
        // При записі також нормалізуємо до UTC — PostgreSQL (timestamptz) інакше відхиляє дати без Kind=Utc
        var utc = new ValueConverter<DateTime, DateTime>(
            v => v.Kind == DateTimeKind.Local ? v.ToUniversalTime() : DateTime.SpecifyKind(v, DateTimeKind.Utc),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        var utcNullable = new ValueConverter<DateTime?, DateTime?>(
            v => v.HasValue ? (v.Value.Kind == DateTimeKind.Local ? v.Value.ToUniversalTime() : DateTime.SpecifyKind(v.Value, DateTimeKind.Utc)) : v,
            v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
        foreach (var entity in b.Model.GetEntityTypes())
            foreach (var prop in entity.GetProperties())
            {
                if (prop.ClrType == typeof(DateTime)) prop.SetValueConverter(utc);
                else if (prop.ClrType == typeof(DateTime?)) prop.SetValueConverter(utcNullable);
            }
    }
}
