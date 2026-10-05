using System.ComponentModel.DataAnnotations;

namespace SchoolBuddy.API.Models;

// Ролі: "student", "mentor", "admin"
public class User
{
    public int Id { get; set; }
    [MaxLength(200)] public string Email { get; set; } = "";
    [MaxLength(40)] public string Nickname { get; set; } = "";
    public string? Avatar { get; set; }
    [MaxLength(20)] public string Role { get; set; } = "student";
    [MaxLength(20)] public string? Class { get; set; }
    [MaxLength(300)] public string? Bio { get; set; }

    // CSV-списки, напр. "UA,CZ" та "online,school"
    public string Languages { get; set; } = "";
    public string HelpFormats { get; set; } = "";
    // "available" | "busy" | "dnd"
    public string Availability { get; set; } = "available";
    public int MaxStudents { get; set; } = 5;

    public bool IsEmailVerified { get; set; }
    public bool IsSchoolApproved { get; set; }
    public bool IsBlocked { get; set; }

    public int Coins { get; set; }
    public int StreakCount { get; set; }
    public DateTime? LastActiveDate { get; set; }

    [MaxLength(16)] public string InviteCode { get; set; } = "";
    public int? InvitedById { get; set; }
    [MaxLength(40)] public string QrToken { get; set; } = "";

    public string PreferredLang { get; set; } = "UA";
    public bool NotifyPush { get; set; } = true;
    public bool NotifyInApp { get; set; } = true;
    public bool NotifyEmail { get; set; }
    public bool NotifyTelegram { get; set; }
    [MaxLength(64)] public string? TelegramHandle { get; set; }

    public DateTime? ConsentAt { get; set; }
    public bool IsDemo { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Tag> Tags { get; set; } = new List<Tag>();
    public ICollection<Subject> HelpSubjects { get; set; } = new List<Subject>();
}

public class EmailCode
{
    public int Id { get; set; }
    public string Email { get; set; } = "";
    public string Code { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public bool Used { get; set; }
}

// Категорії: "it", "games", "sport", "hobby", "study"
public class Tag
{
    public int Id { get; set; }
    [MaxLength(40)] public string Name { get; set; } = "";
    [MaxLength(20)] public string Category { get; set; } = "hobby";
    public bool IsApproved { get; set; } = true;
    public int? CreatedById { get; set; }
    public ICollection<User> Users { get; set; } = new List<User>();
}

public class Subject
{
    public int Id { get; set; }
    [MaxLength(20)] public string Code { get; set; } = "";
    public string NameUa { get; set; } = "";
    public string NameCs { get; set; } = "";
    public string NameEn { get; set; } = "";
    [MaxLength(10)] public string Color { get; set; } = "#8b93a1";
    public ICollection<Topic> Topics { get; set; } = new List<Topic>();
    public ICollection<User> Mentors { get; set; } = new List<User>();
}

public class Topic
{
    public int Id { get; set; }
    public int SubjectId { get; set; }
    public string NameUa { get; set; } = "";
    public string NameCs { get; set; } = "";
    public string NameEn { get; set; } = "";
}

public class Lesson
{
    public int Id { get; set; }
    [MaxLength(20)] public string Class { get; set; } = "";
    public int DayOfWeek { get; set; }   // 1 = понеділок … 5 = пʼятниця
    public int Period { get; set; }
    [MaxLength(5)] public string Start { get; set; } = "08:00";
    [MaxLength(5)] public string End { get; set; } = "08:45";
    public int SubjectId { get; set; }
    [MaxLength(20)] public string Room { get; set; } = "";
    [MaxLength(80)] public string Teacher { get; set; } = "";
}

// Kind: "cancelled" | "room" | "substitute"
public class ScheduleChange
{
    public int Id { get; set; }
    public string Class { get; set; } = "";
    [MaxLength(10)] public string Date { get; set; } = ""; // "yyyy-MM-dd" (місцева дата)
    public int LessonId { get; set; }
    public string Kind { get; set; } = "cancelled";
    public string? NewRoom { get; set; }
    public string? NewTeacher { get; set; }
    public string? Note { get; set; }
}

// Kind: "test" | "exam" | "quiz"
public class Exam
{
    public int Id { get; set; }
    public string Class { get; set; } = "";
    public int SubjectId { get; set; }
    public int? TopicId { get; set; }
    public DateTime Date { get; set; }
    public string Kind { get; set; } = "test";
    public string? Note { get; set; }
}

public class Homework
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int SubjectId { get; set; }
    public int? TopicId { get; set; }
    [MaxLength(120)] public string Title { get; set; } = "";
    [MaxLength(2000)] public string Description { get; set; } = "";
    public DateTime Deadline { get; set; }
    public int Difficulty { get; set; } = 2; // 1 легко, 2 середньо, 3 складно
    public string Status { get; set; } = "open"; // "open" | "done"
    public DateTime? CompletedAt { get; set; }
    public int? SosRequestId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Kind: "test" | "question" | "homework"; Status: "active" | "accepted" | "resolved" | "cancelled"
public class SosRequest
{
    public int Id { get; set; }
    public int StudentId { get; set; }
    public int SubjectId { get; set; }
    public int? TopicId { get; set; }
    [MaxLength(120)] public string? TopicText { get; set; }
    public string Kind { get; set; } = "question";
    [MaxLength(1000)] public string Description { get; set; } = "";
    public string Status { get; set; } = "active";
    public int? MentorId { get; set; }
    public int? HomeworkId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? AcceptedAt { get; set; }
}

// Status: "pending" | "active" | "archived" | "declined"; Origin: "request" | "sos" | "qr" | "match" (рівноправний чат двох учнів після взаємного свайпу; StudentId/MentorId там лише впорядковані за Id)
public class Connection
{
    public int Id { get; set; }
    public int StudentId { get; set; }
    public int MentorId { get; set; }
    public string Status { get; set; } = "pending";
    public string Origin { get; set; } = "request";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? AcceptedAt { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public DateTime? LastMessageAt { get; set; }
}

// Повідомлення в чаті звʼязку або в груповому чаті. SenderId == null — системне повідомлення.
public class Message
{
    public int Id { get; set; }
    public int? ConnectionId { get; set; }
    public int? GroupId { get; set; }
    public int? SenderId { get; set; }
    [MaxLength(2000)] public string Text { get; set; } = "";
    public string? SystemType { get; set; }
    public string? Data { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Status: "scheduled" | "completed" | "cancelled"
public class Meeting
{
    public int Id { get; set; }
    public int? ConnectionId { get; set; }
    public int StudentId { get; set; }
    public int MentorId { get; set; }
    public int? PlaceId { get; set; }
    public DateTime ScheduledAt { get; set; }
    [MaxLength(200)] public string? Topic { get; set; }
    public string Status { get; set; } = "scheduled";
    [MaxLength(6)] public string? Pin { get; set; }
    public string? QrToken { get; set; }
    public DateTime? PinExpiresAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool Reminded { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Kind: "library" | "cafe" | "cyberclub" | "school" | "park"
public class SafePlace
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "cafe";
    public string Address { get; set; } = "";
    public double Lat { get; set; }
    public double Lng { get; set; }
    public string Hours { get; set; } = "";
    public bool IsVerified { get; set; } = true;
    public int? PartnerId { get; set; }
}

// Mode: "online" | "school" | "place"
public class OfficeHour
{
    public int Id { get; set; }
    public int MentorId { get; set; }
    public int DayOfWeek { get; set; }
    [MaxLength(5)] public string Start { get; set; } = "14:00";
    [MaxLength(5)] public string End { get; set; } = "15:00";
    public string Mode { get; set; } = "school";
    [MaxLength(100)] public string? Note { get; set; }
}

// Category: "schedule" | "room" | "exam" | "event" | "general" | "urgent"
public class Announcement
{
    public int Id { get; set; }
    public string Category { get; set; } = "general";
    public string TitleUa { get; set; } = "";
    public string TitleCs { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public string BodyUa { get; set; } = "";
    public string BodyCs { get; set; } = "";
    public string BodyEn { get; set; } = "";
    public bool Pinned { get; set; }
    public int? AuthorId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class StudyGroup
{
    public int Id { get; set; }
    [MaxLength(60)] public string Name { get; set; } = "";
    public int? SubjectId { get; set; }
    [MaxLength(60)] public string? Topic { get; set; }
    [MaxLength(300)] public string Description { get; set; } = "";
    public int CreatedById { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class GroupMember
{
    public int GroupId { get; set; }
    public int UserId { get; set; }
    public string Role { get; set; } = "member"; // "owner" | "member"
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}

// Kind: "study" | "social" | "gaming" | "sport" | "school"
public class Event
{
    public int Id { get; set; }
    [MaxLength(80)] public string Title { get; set; } = "";
    [MaxLength(600)] public string Description { get; set; } = "";
    public DateTime StartsAt { get; set; }
    [MaxLength(120)] public string Location { get; set; } = "";
    public int? PlaceId { get; set; }
    public int? GroupId { get; set; }
    public int CreatedById { get; set; }
    public string Kind { get; set; } = "study";
    public int? Capacity { get; set; }
    public bool Reminded { get; set; }
}

public class EventParticipant
{
    public int EventId { get; set; }
    public int UserId { get; set; }
    public bool CheckedIn { get; set; }
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}

// Type — ключ шаблону, який фронтенд локалізує; Data — JSON із параметрами.
public class Notification
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Type { get; set; } = "";
    public string? Data { get; set; }
    public string? Link { get; set; }
    public bool IsRead { get; set; }
    public string? DedupeKey { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// Журнал доставки сповіщень у зовнішні канали (email / telegram).
public class OutboxMessage
{
    public int Id { get; set; }
    public int? UserId { get; set; }
    public string Channel { get; set; } = "email";
    public string Recipient { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public string Status { get; set; } = "simulated"; // "simulated" | "sent" | "failed"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class UserAchievement
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Code { get; set; } = "";
    public DateTime UnlockedAt { get; set; } = DateTime.UtcNow;
}

public class TrustedContact
{
    public int Id { get; set; }
    public int UserId { get; set; }
    [MaxLength(60)] public string Name { get; set; } = "";
    [MaxLength(100)] public string Contact { get; set; } = "";
    [MaxLength(40)] public string? Relation { get; set; }
}

public class ForumPost
{
    public int Id { get; set; }
    [MaxLength(140)] public string Title { get; set; } = "";
    [MaxLength(3000)] public string Content { get; set; } = "";
    public string Category { get; set; } = "school"; // "school" | "teachers" | "city" | "other"
    public string AuthorHash { get; set; } = "";
    public bool IsHidden { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ForumReply
{
    public int Id { get; set; }
    public int PostId { get; set; }
    [MaxLength(2000)] public string Content { get; set; } = "";
    public string AuthorHash { get; set; } = "";
    public bool IsHidden { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

// TargetType: "user" | "post" | "reply" | "message" | "group"; Status: "open" | "resolved" | "dismissed"
public class Report
{
    public int Id { get; set; }
    public int ReporterId { get; set; }
    public string TargetType { get; set; } = "user";
    public int TargetId { get; set; }
    [MaxLength(500)] public string Reason { get; set; } = "";
    public string Status { get; set; } = "open";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
}

// «Seznamka»: свайп користувача вправо (Liked) або вліво. Взаємні вподобання дають чат-метч.
public class Swipe
{
    public int Id { get; set; }
    public int SwiperId { get; set; }
    public int TargetId { get; set; }
    public bool Liked { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Block
{
    public int Id { get; set; }
    public int BlockerId { get; set; }
    public int BlockedId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class CoinTransaction
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int Amount { get; set; }
    public string Reason { get; set; } = ""; // ключ: "meeting", "achievement:FIRST_HELP", "invite", "redeem" …
    public int? PartnerId { get; set; }
    public int? RewardId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Partner
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "cafe";
    public string Address { get; set; } = "";
    public string ApiKey { get; set; } = "";
}

public class PartnerReward
{
    public int Id { get; set; }
    public int PartnerId { get; set; }
    public string TitleUa { get; set; } = "";
    public string TitleCs { get; set; } = "";
    public string TitleEn { get; set; } = "";
    public int Cost { get; set; }
    public int MinTier { get; set; } // 0 Bronze … 3 Platinum
}
