using System.Net;
using System.Net.Http.Json;
using System.Net.Mail;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Services;

// Відправка листів: Brevo HTTP API (Brevo:ApiKey — працює на хостингах, що блокують SMTP) або класичний SMTP.
// Якщо нічого не налаштовано, лист лише записується в Outbox зі статусом "simulated".
public class EmailSender(IConfiguration config, ILogger<EmailSender> log, IHttpClientFactory http)
{
    bool UseBrevo => !string.IsNullOrWhiteSpace(config["Brevo:ApiKey"]);
    bool UseSmtp => !string.IsNullOrWhiteSpace(config["Smtp:Host"]);
    public bool IsConfigured => UseBrevo || UseSmtp;

    string From => config["Smtp:From"] ?? config["Smtp:User"] ?? "";

    public async Task<string> SendAsync(string to, string subject, string body)
    {
        if (!IsConfigured)
        {
            log.LogInformation("[email simulated] to={To} subject={Subject}\n{Body}", to, subject, body);
            return "simulated";
        }
        if (UseBrevo)
        {
            try
            {
                var client = http.CreateClient();
                using var req = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email");
                req.Headers.Add("api-key", config["Brevo:ApiKey"]);
                req.Content = JsonContent.Create(new
                {
                    sender = new { name = "SchoolBuddy", email = From },
                    to = new[] { new { email = to } },
                    subject,
                    textContent = body,
                });
                using var res = await client.SendAsync(req);
                if (res.IsSuccessStatusCode) return "sent";
                log.LogWarning("Brevo send failed: {Status} {Body}", (int)res.StatusCode, await res.Content.ReadAsStringAsync());
                return "failed";
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Brevo send failed");
                return "failed";
            }
        }
        try
        {
            using var client = new SmtpClient(config["Smtp:Host"], int.Parse(config["Smtp:Port"] ?? "587"))
            {
                EnableSsl = true,
                Credentials = new NetworkCredential(config["Smtp:User"], config["Smtp:Password"]),
            };
            await client.SendMailAsync(new MailMessage(config["Smtp:From"] ?? config["Smtp:User"]!, to, subject, body));
            return "sent";
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "SMTP send failed");
            return "failed";
        }
    }
}

public class NotificationService(AppDbContext db, EmailSender email)
{
    // Створює in-app сповіщення і, якщо користувач увімкнув, дублює його в email / Telegram.
    // dedupeKey не дає надіслати те саме нагадування двічі.
    public async Task NotifyAsync(int userId, string type, object? data = null, string? link = null, string? dedupeKey = null)
    {
        if (dedupeKey != null && await db.Notifications.AnyAsync(n => n.UserId == userId && n.DedupeKey == dedupeKey))
            return;

        var user = await db.Users.FindAsync(userId);
        if (user == null || user.IsBlocked) return;

        var json = data == null ? null : JsonSerializer.Serialize(data, JsonOpts);
        db.Notifications.Add(new Notification { UserId = userId, Type = type, Data = json, Link = link, DedupeKey = dedupeKey });

        if (user.NotifyEmail || user.NotifyTelegram)
        {
            var (subject, body) = NotificationTexts.Render(type, json, user.PreferredLang);
            if (user.NotifyEmail)
            {
                var status = await email.SendAsync(user.Email, subject, body);
                db.Outbox.Add(new OutboxMessage { UserId = userId, Channel = "email", Recipient = user.Email, Subject = subject, Body = body, Status = status });
            }
            if (user.NotifyTelegram && !string.IsNullOrWhiteSpace(user.TelegramHandle))
            {
                // Інтеграція з Telegram Bot API потребує токена бота й chat_id — поки що лише журналюємо.
                db.Outbox.Add(new OutboxMessage { UserId = userId, Channel = "telegram", Recipient = user.TelegramHandle!, Subject = subject, Body = body, Status = "simulated" });
            }
        }
        await db.SaveChangesAsync();
    }

    public async Task NotifyManyAsync(IEnumerable<int> userIds, string type, object? data = null, string? link = null, string? dedupeKey = null)
    {
        foreach (var id in userIds.Distinct()) await NotifyAsync(id, type, data, link, dedupeKey);
    }

    static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
}

// Тексти для зовнішніх каналів (email / Telegram). Інтерфейс у застосунку локалізує сповіщення сам.
public static class NotificationTexts
{
    static readonly Dictionary<string, (string ua, string cs, string en)> Templates = new()
    {
        ["sos_new"] = ("Новий SOS-запит: {subject}", "Nový SOS požadavek: {subject}", "New SOS request: {subject}"),
        ["sos_accepted"] = ("{name} прийняв(ла) твій SOS", "{name} přijal(a) tvůj SOS", "{name} accepted your SOS"),
        ["connection_request"] = ("{name} хоче, щоб ти став(ла) його ментором", "{name} tě žádá o mentoring", "{name} asked you to be their mentor"),
        ["connection_accepted"] = ("{name} тепер твій ментор", "{name} je teď tvůj mentor", "{name} is now your mentor"),
        ["connection_archived"] = ("Звʼязок із {name} заархівовано", "Spojení s {name} bylo archivováno", "Your connection with {name} was archived"),
        ["message_new"] = ("Нове повідомлення від {name}", "Nová zpráva od {name}", "New message from {name}"),
        ["meeting_scheduled"] = ("Нова зустріч з {name}", "Nová schůzka s {name}", "New meeting with {name}"),
        ["meeting_reminder"] = ("Скоро зустріч з {name}", "Brzy máš schůzku s {name}", "Upcoming meeting with {name}"),
        ["meeting_confirm_needed"] = ("Підтвердь зустріч з {name}", "Potvrď schůzku s {name}", "Please confirm your meeting with {name}"),
        ["meeting_completed"] = ("Зустріч підтверджено", "Schůzka potvrzena", "Meeting confirmed"),
        ["meeting_cancelled"] = ("Зустріч з {name} скасовано", "Schůzka s {name} byla zrušena", "Meeting with {name} was cancelled"),
        ["lesson_reminder"] = ("Скоро урок: {subject}", "Brzy začíná hodina: {subject}", "Lesson soon: {subject}"),
        ["exam_reminder"] = ("Завтра контрольна: {subject}", "Zítra test: {subject}", "Test tomorrow: {subject}"),
        ["homework_deadline"] = ("Дедлайн домашки: {title}", "Termín úkolu: {title}", "Homework due: {title}"),
        ["event_reminder"] = ("Скоро подія: {title}", "Brzy začíná akce: {title}", "Event soon: {title}"),
        ["announcement"] = ("Оголошення школи", "Oznámení školy", "School announcement"),
        ["achievement"] = ("Нове досягнення!", "Nový úspěch!", "New achievement!"),
        ["invite_joined"] = ("{name} приєднався(лась) за твоїм запрошенням", "{name} se připojil(a) přes tvou pozvánku", "{name} joined with your invite"),
        ["coins"] = ("Нараховано Buddy Coins", "Připsány Buddy Coins", "Buddy Coins received"),
        ["school_approved"] = ("Школа підтвердила твій акаунт", "Škola ověřila tvůj účet", "Your account was verified by the school"),
    };

    public static (string subject, string body) Render(string type, string? json, string lang)
    {
        var text = Templates.TryGetValue(type, out var t)
            ? lang switch { "CZ" => t.cs, "EN" => t.en, _ => t.ua }
            : "SchoolBuddy";
        if (json != null)
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var p in doc.RootElement.EnumerateObject())
                text = text.Replace("{" + p.Name + "}", p.Value.ToString());
        }
        return ($"SchoolBuddy: {text}", text + "\n\nSchoolBuddy");
    }
}
