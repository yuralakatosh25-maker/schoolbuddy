using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Services;

// Довідкові дані школи + Demo / Test Mode (вигадані акаунти без реальних персональних даних)
public class DemoSeeder(AppDbContext db, UserCleanup cleanup, Gamification game, AnonHasher hasher, IConfiguration config)
{
    // ---------- Довідкові дані (один раз) ----------

    public async Task SeedReferenceAsync()
    {
        if (await db.Subjects.AnyAsync()) return;

        var subjects = new (string code, string ua, string cs, string en, string color, (string ua, string cs, string en)[] topics)[]
        {
            ("CSHARP", "C#", "C#", "C#", "#9b8cff", [("Змінні", "Proměnné", "Variables"), ("Цикли", "Cykly", "Loops"), ("ООП", "OOP", "OOP"), ("Класи", "Třídy", "Classes"), ("LINQ", "LINQ", "LINQ"), ("Винятки", "Výjimky", "Exceptions")]),
            ("PYTHON", "Python", "Python", "Python", "#5fb3f6", [("Основи", "Základy", "Basics"), ("Функції", "Funkce", "Functions"), ("Списки та словники", "Seznamy a slovníky", "Lists & dicts"), ("Робота з файлами", "Práce se soubory", "Files"), ("ООП", "OOP", "OOP")]),
            ("MATH", "Математика", "Matematika", "Mathematics", "#f5b74f", [("Рівняння", "Rovnice", "Equations"), ("Функції", "Funkce", "Functions"), ("Тригонометрія", "Goniometrie", "Trigonometry"), ("Похідні", "Derivace", "Derivatives"), ("Ймовірність", "Pravděpodobnost", "Probability")]),
            ("NET", "Компʼютерні мережі", "Počítačové sítě", "Computer networks", "#4fd1a5", [("IP-адресація", "IP adresace", "IP addressing"), ("Підмережі", "Subnetting", "Subnetting"), ("Модель OSI", "Model OSI", "OSI model"), ("Маршрутизація", "Směrování", "Routing")]),
            ("WEB", "Веб-розробка", "Webové aplikace", "Web development", "#f47fa8", [("HTML і CSS", "HTML a CSS", "HTML & CSS"), ("JavaScript", "JavaScript", "JavaScript"), ("React", "React", "React"), ("REST API", "REST API", "REST API")]),
            ("DB", "Бази даних", "Databáze", "Databases", "#c0a36e", [("Основи SQL", "Základy SQL", "SQL basics"), ("JOIN", "JOIN", "JOIN"), ("Нормалізація", "Normalizace", "Normalization")]),
            ("ENG", "Англійська мова", "Anglický jazyk", "English", "#7fa7ff", [("Граматика", "Gramatika", "Grammar"), ("Лексика", "Slovní zásoba", "Vocabulary"), ("Говоріння", "Konverzace", "Speaking"), ("Есе", "Esej", "Essay")]),
            ("CZECH", "Чеська мова", "Český jazyk", "Czech", "#e58a6b", [("Граматика", "Mluvnice", "Grammar"), ("Література", "Literatura", "Literature"), ("Твір", "Sloh", "Composition")]),
            ("PHYS", "Фізика", "Fyzika", "Physics", "#b98cf0", [("Механіка", "Mechanika", "Mechanics"), ("Електрика", "Elektřina", "Electricity"), ("Оптика", "Optika", "Optics")]),
        };
        foreach (var s in subjects)
        {
            db.Subjects.Add(new Subject
            {
                Code = s.code, NameUa = s.ua, NameCs = s.cs, NameEn = s.en, Color = s.color,
                Topics = s.topics.Select(t => new Topic { NameUa = t.ua, NameCs = t.cs, NameEn = t.en }).ToList(),
            });
        }

        var tags = new Dictionary<string, string[]>
        {
            ["it"] = ["#C#", "#Python", "#JavaScript", "#React", "#Unity", "#Linux", "#SQL", "#Networking"],
            ["games"] = ["#CS2", "#GTA V", "#Minecraft", "#Valorant", "#LoL", "#FIFA"],
            ["sport"] = ["#Powerlifting", "#Football", "#Gym", "#Running", "#Cycling"],
            ["hobby"] = ["#Auta", "#Music", "#Photo", "#Anime", "#Chess", "#Design"],
            ["study"] = ["#Math", "#English", "#Czech", "#Physics"],
        };
        foreach (var (cat, names) in tags)
            foreach (var n in names) db.Tags.Add(new Tag { Name = n, Category = cat });

        var klatovka = new Partner { Name = "Kavárna Klatovka", Kind = "cafe", Address = "Klatovská tř. 160, Plzeň", ApiKey = "klatovka-demo-key" };
        var arena = new Partner { Name = "CyberArena Plzeň", Kind = "cyberclub", Address = "Klatovská tř. 90, Plzeň", ApiKey = "cyberarena-demo-key" };
        var bistro = new Partner { Name = "Bistro Na Rohu", Kind = "cafe", Address = "Částkova 18, Plzeň", ApiKey = "bistro-demo-key" };
        db.Partners.AddRange(klatovka, arena, bistro);
        await db.SaveChangesAsync();

        db.PartnerRewards.AddRange(
            new PartnerReward { PartnerId = klatovka.Id, TitleUa = "−20 % на будь-яку каву", TitleCs = "−20 % na jakoukoli kávu", TitleEn = "20% off any coffee", Cost = 40, MinTier = 0 },
            new PartnerReward { PartnerId = klatovka.Id, TitleUa = "Кава та десерт безкоштовно", TitleCs = "Káva a zákusek zdarma", TitleEn = "Free coffee & dessert", Cost = 120, MinTier = 1 },
            new PartnerReward { PartnerId = arena.Id, TitleUa = "1 година гри", TitleCs = "1 hodina hraní", TitleEn = "1 hour of play", Cost = 80, MinTier = 0 },
            new PartnerReward { PartnerId = arena.Id, TitleUa = "3 години + напій", TitleCs = "3 hodiny + nápoj", TitleEn = "3 hours + drink", Cost = 200, MinTier = 2 },
            new PartnerReward { PartnerId = bistro.Id, TitleUa = "Суп дня безкоштовно", TitleCs = "Polévka dne zdarma", TitleEn = "Free soup of the day", Cost = 60, MinTier = 1 },
            new PartnerReward { PartnerId = bistro.Id, TitleUa = "−30 % на обіднє меню", TitleCs = "−30 % na polední menu", TitleEn = "30% off lunch menu", Cost = 150, MinTier = 3 });

        db.SafePlaces.AddRange(
            new SafePlace { Name = "Knihovna SŠINFIS", Kind = "school", Address = "Klatovská tř. 200G, Plzeň", Lat = 49.72625, Lng = 13.36680, Hours = "Po–Pá 7:30–16:00" },
            new SafePlace { Name = "Kavárna Klatovka", Kind = "cafe", Address = klatovka.Address, Lat = 49.72905, Lng = 13.36860, Hours = "Po–Ne 8:00–20:00", PartnerId = klatovka.Id },
            new SafePlace { Name = "CyberArena Plzeň", Kind = "cyberclub", Address = arena.Address, Lat = 49.73350, Lng = 13.37240, Hours = "Po–Ne 12:00–23:00", PartnerId = arena.Id },
            new SafePlace { Name = "Bistro Na Rohu", Kind = "cafe", Address = bistro.Address, Lat = 49.72480, Lng = 13.36210, Hours = "Po–Pá 10:30–18:00", PartnerId = bistro.Id },
            new SafePlace { Name = "Studijní a vědecká knihovna", Kind = "library", Address = "Smetanovy sady 2, Plzeň", Lat = 49.74560, Lng = 13.37930, Hours = "Po–Pá 9:00–19:00" },
            new SafePlace { Name = "Borský park", Kind = "park", Address = "Borský park, Plzeň", Lat = 49.72690, Lng = 13.35700, Hours = "24/7" });

        await db.SaveChangesAsync();
        await SeedLessonsAsync();
        await SeedAnnouncementsAsync();
    }

    static readonly (string start, string end)[] Periods =
        [("08:00", "08:45"), ("08:55", "09:40"), ("10:00", "10:45"), ("10:55", "11:40"), ("11:50", "12:35"), ("12:45", "13:30"), ("13:40", "14:25")];

    async Task SeedLessonsAsync()
    {
        var s = await db.Subjects.ToDictionaryAsync(x => x.Code, x => x.Id);
        var teacher = new Dictionary<string, string>
        {
            ["CSHARP"] = "Ing. Petr Novák", ["PYTHON"] = "Ing. Lucie Marešová", ["MATH"] = "Mgr. Jana Dvořáková",
            ["NET"] = "Ing. Martin Kučera", ["WEB"] = "Bc. Tomáš Beneš", ["DB"] = "Ing. Lucie Marešová",
            ["ENG"] = "Mgr. Emily Clarke", ["CZECH"] = "Mgr. Karel Procházka", ["PHYS"] = "RNDr. Hana Pokorná",
        };
        var room = new Dictionary<string, string>
        {
            ["CSHARP"] = "PC 2", ["PYTHON"] = "PC 3", ["MATH"] = "A204", ["NET"] = "LAB 1", ["WEB"] = "PC 1",
            ["DB"] = "PC 3", ["ENG"] = "B105", ["CZECH"] = "A201", ["PHYS"] = "A110",
        };
        string[][] week =
        [
            ["MATH", "CZECH", "CSHARP", "CSHARP", "ENG", "PHYS"],
            ["NET", "NET", "MATH", "ENG", "WEB", "WEB"],
            ["CZECH", "PYTHON", "PYTHON", "MATH", "DB", "PHYS"],
            ["CSHARP", "CSHARP", "ENG", "NET", "MATH", "CZECH"],
            ["WEB", "DB", "DB", "PYTHON", "ENG"],
        ];
        for (var c = 0; c < ScheduleService.Classes.Length; c++)
        {
            for (var d = 0; d < 5; d++)
            {
                var day = week[(d + c) % 5];
                for (var p = 0; p < day.Length; p++)
                {
                    var code = day[p];
                    db.Lessons.Add(new Lesson
                    {
                        Class = ScheduleService.Classes[c], DayOfWeek = d + 1, Period = p + 1,
                        Start = Periods[p].start, End = Periods[p].end, SubjectId = s[code], Room = room[code], Teacher = teacher[code],
                    });
                }
            }
        }
        await db.SaveChangesAsync();
    }

    async Task SeedAnnouncementsAsync()
    {
        var now = DateTime.UtcNow;
        db.Announcements.AddRange(
            new Announcement
            {
                Category = "room", Pinned = true, CreatedAt = now.AddHours(-3),
                TitleUa = "Зміна кабінету: C# переїжджає в PC 4", TitleCs = "Změna učebny: C# se stěhuje do PC 4", TitleEn = "Room change: C# moves to PC 4",
                BodyUa = "Через оновлення мережі в PC 2 уроки C# цього тижня проходять у кабінеті PC 4 (2-й поверх).",
                BodyCs = "Kvůli modernizaci sítě v PC 2 probíhají hodiny C# tento týden v učebně PC 4 (2. patro).",
                BodyEn = "Due to network upgrades in PC 2, C# lessons this week take place in room PC 4 (2nd floor).",
            },
            new Announcement
            {
                Category = "exam", CreatedAt = now.AddDays(-1),
                TitleUa = "Тиждень контрольних для 2.IT", TitleCs = "Testový týden pro 2.IT", TitleEn = "Test week for 2.IT",
                BodyUa = "Наступного тижня — контрольні з математики, C# та англійської. Розклад контрольних є в розділі «Розклад».",
                BodyCs = "Příští týden píšete testy z matematiky, C# a angličtiny. Termíny najdete v sekci Rozvrh.",
                BodyEn = "Next week you have tests in Maths, C# and English. Dates are in the Schedule section.",
            },
            new Announcement
            {
                Category = "event", CreatedAt = now.AddDays(-2),
                TitleUa = "День відкритих дверей — шукаємо волонтерів", TitleCs = "Den otevřených dveří — hledáme dobrovolníky", TitleEn = "Open day — volunteers wanted",
                BodyUa = "Потрібні учні, які проведуть екскурсію для майбутніх першокурсників. Зареєструйтесь у розділі «Події».",
                BodyCs = "Hledáme studenty, kteří provedou budoucí prváky po škole. Přihlaste se v sekci Akce.",
                BodyEn = "We need students to show future first-years around the school. Sign up in the Events section.",
            },
            new Announcement
            {
                Category = "general", CreatedAt = now.AddDays(-4),
                TitleUa = "Wi-Fi у бібліотеці знову працює", TitleCs = "Wi-Fi v knihovně opět funguje", TitleEn = "Library Wi-Fi is back",
                BodyUa = "Мережа SSINFIS-Student доступна в бібліотеці. Вхід — шкільним акаунтом.",
                BodyCs = "Síť SSINFIS-Student je v knihovně opět dostupná. Přihlášení školním účtem.",
                BodyEn = "The SSINFIS-Student network is available in the library again. Sign in with your school account.",
            });
        await db.SaveChangesAsync();
    }

    // ---------- Часова шкала (контрольні, зміни розкладу) ----------

    static List<DateTime> SchoolDays(int count)
    {
        var list = new List<DateTime>();
        for (var d = DateTime.Now.Date; list.Count < count; d = d.AddDays(1))
            if (d.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday)) list.Add(d);
        return list;
    }

    // Контрольні та зміни розкладу завжди мають бути «попереду», тож оновлюємо їх, якщо всі минули
    public async Task EnsureTimelineAsync()
    {
        if (await db.Exams.AnyAsync(e => e.Date > DateTime.UtcNow)) return;
        await db.Exams.ExecuteDeleteAsync();
        await db.ScheduleChanges.ExecuteDeleteAsync();

        var days = SchoolDays(14);
        var s = await db.Subjects.Include(x => x.Topics).ToDictionaryAsync(x => x.Code);
        foreach (var cls in ScheduleService.Classes)
        {
            var lessons = await db.Lessons.Where(l => l.Class == cls).ToListAsync();
            Exam ExamOn(DateTime day, string code, int topicIndex, string kind)
            {
                var dow = (int)day.DayOfWeek;
                var lesson = lessons.Where(l => l.DayOfWeek == dow && l.SubjectId == s[code].Id).OrderBy(l => l.Period).FirstOrDefault()
                             ?? lessons.Where(l => l.DayOfWeek == dow).OrderBy(l => l.Period).First();
                var topic = s[code].Topics.OrderBy(t => t.Id).ElementAtOrDefault(topicIndex);
                return new Exam { Class = cls, SubjectId = s[code].Id, TopicId = topic?.Id, Kind = kind, Date = day.Add(TimeSpan.Parse(lesson.Start)).ToUniversalTime() };
            }
            db.Exams.AddRange(
                ExamOn(days[2], "MATH", 3, "test"),
                ExamOn(days[5], "CSHARP", 2, "test"),
                ExamOn(days[7], "ENG", 0, "quiz"),
                ExamOn(days[11], "NET", 1, "exam"));

            // Зміни: сьогодні інший кабінет, завтра скасований урок, післязавтра заміна вчителя
            var today = lessons.Where(l => l.DayOfWeek == (int)days[0].DayOfWeek).OrderBy(l => l.Period).ToList();
            var tomorrow = lessons.Where(l => l.DayOfWeek == (int)days[1].DayOfWeek).OrderBy(l => l.Period).ToList();
            var after = lessons.Where(l => l.DayOfWeek == (int)days[2].DayOfWeek).OrderBy(l => l.Period).ToList();
            db.ScheduleChanges.AddRange(
                new ScheduleChange { Class = cls, Date = days[0].ToString("yyyy-MM-dd"), LessonId = today[2].Id, Kind = "room", NewRoom = "PC 4", Note = "Údržba sítě" },
                new ScheduleChange { Class = cls, Date = days[1].ToString("yyyy-MM-dd"), LessonId = tomorrow[^1].Id, Kind = "cancelled", Note = "Odpadá — exkurze vyučujícího" },
                new ScheduleChange { Class = cls, Date = days[2].ToString("yyyy-MM-dd"), LessonId = after[1].Id, Kind = "substitute", NewTeacher = "Mgr. Pavel Hrubý" });
        }
        await db.SaveChangesAsync();
    }

    // ---------- Демо-акаунти ----------

    public async Task ResetDemoAsync()
    {
        var ids = await db.Users.Where(u => u.IsDemo).Select(u => u.Id).ToListAsync();
        foreach (var id in ids) await cleanup.DeleteAsync(id);
        db.ChangeTracker.Clear();
        await db.Exams.ExecuteDeleteAsync();
        await EnsureTimelineAsync();
        await SeedDemoAsync();
    }

    record DemoUser(string Slug, string Nick, string Role, string? Class, string[] Tags, string[] Subjects, string Langs, string Formats, string Availability, int Streak, string? Bio, bool Approved = true);

    public async Task SeedDemoAsync()
    {
        var domain = config["School:EmailDomain"] ?? "infis.cz";
        if (await db.Users.AnyAsync(u => u.IsDemo && u.Email.EndsWith("@" + domain))) return;
        // Демо-акаунти зі старим доменом пошти видаляємо й створюємо заново
        foreach (var id in await db.Users.Where(u => u.IsDemo).Select(u => u.Id).ToListAsync()) await cleanup.DeleteAsync(id);
        db.ChangeTracker.Clear();

        var people = new DemoUser[]
        {
            new("student", "Катерина Шевченко", "student", "2.IT", ["#C#", "#Python", "#CS2", "#Music", "#English"], [], "UA,CZ,EN", "", "available", 12,
                "Другий рік у SŠINFIS. Вчу C#, готуюсь до матури з англійської."),
            new("mentor", "Ondřej Nový", "mentor", "4.IT", ["#C#", "#GTA V", "#Networking", "#Powerlifting", "#Linux"], ["CSHARP", "NET", "MATH"], "CZ,EN", "school,online,place", "available", 31,
                "Čtvrťák, baví mě backend a sítě. Rád vysvětlím OOP i subnetting."),
            new("admin", "Správa SŠINFIS", "admin", null, [], [], "CZ,EN", "", "available", 3, null),
            new("maksym", "Максим Бондаренко", "mentor", "3.IT", ["#Python", "#Powerlifting", "#Gym", "#Math", "#Linux"], ["PYTHON", "MATH", "PHYS"], "UA,CZ,EN", "school,online", "busy", 19,
                "Python, математика і трохи заліза в залі. Пояснюю на прикладах."),
            new("eliska", "Eliška Kovářová", "mentor", "4.IT", ["#Math", "#CS2", "#English", "#Photo"], ["MATH", "ENG", "CZECH"], "CZ,EN", "online,place", "available", 8,
                "Matika mě baví. Doučuju i angličtinu před maturitou."),
            new("jakub", "Jakub Svoboda", "mentor", "3.IT", ["#JavaScript", "#React", "#Football", "#Design"], ["WEB", "DB"], "CZ,EN", "online", "available", 5,
                "Frontend, React, trochu designu."),
            new("tereza", "Tereza Horáková", "mentor", "4.IT", ["#Czech", "#English", "#Photo", "#Music"], ["CZECH", "ENG"], "CZ", "school", "dnd", 2,
                "Pomůžu se slohem a literaturou."),
            new("olena", "Олена Коваленко", "mentor", "3.IT", ["#SQL", "#Python", "#Anime", "#Chess"], ["DB", "PYTHON"], "UA,EN", "school,online", "available", 14,
                "SQL, Python, шахи. Люблю розкладати складне на прості кроки."),
            new("adam", "Adam Černý", "mentor", "4.IT", ["#Unity", "#C#", "#Valorant", "#CS2"], ["CSHARP"], "CZ,EN", "online,place", "available", 6,
                "Dělám hry v Unity, pomůžu s C#."),
            new("iryna", "Ірина Савчук", "mentor", "3.IT", ["#English", "#Design", "#Running"], ["ENG", "WEB"], "UA,EN", "online,school", "busy", 9,
                "Англійська й UI-дизайн."),
            new("vojtech", "Vojtěch Dvořák", "student", "1.IT", ["#Minecraft", "#Python", "#Auta"], [], "CZ", "", "available", 3, null),
            new("anna", "Анна Мельник", "student", "2.IT", ["#Math", "#Music", "#Design"], [], "UA,CZ", "", "available", 7, null),
            new("jan", "Jan Svoboda", "student", "2.IT", ["#C#", "#FIFA", "#Football"], [], "CZ", "", "available", 4, null),
            new("lucie", "Lucie Novotná", "student", "1.IT", ["#Design", "#JavaScript", "#Photo"], [], "CZ,EN", "", "available", 2, null),
            new("dmytro", "Дмитро Ткаченко", "student", "2.IT", ["#CS2", "#Gym", "#C#", "#Valorant"], [], "UA,CZ", "", "available", 6, null),
            new("petr", "Petr Král", "student", "1.IT", ["#Auta", "#Football"], [], "CZ", "", "available", 1, null, Approved: false),
            new("sofiia", "Софія Лисенко", "mentor", "3.IT", ["#Python", "#Anime"], ["PYTHON"], "UA,EN", "online", "available", 1, null, Approved: false),
        };

        var allTags = (await db.Tags.ToListAsync()).GroupBy(t => t.Name).ToDictionary(g => g.Key, g => g.First());
        var subjects = await db.Subjects.Include(s => s.Topics).ToDictionaryAsync(s => s.Code);
        var u = new Dictionary<string, User>();
        foreach (var p in people)
        {
            var user = new User
            {
                Email = $"demo.{p.Slug}@{config["School:EmailDomain"] ?? "infis.cz"}", Nickname = p.Nick, Role = p.Role, Class = p.Class, Bio = p.Bio,
                Languages = p.Langs, HelpFormats = p.Formats, Availability = p.Availability,
                IsEmailVerified = true, IsSchoolApproved = p.Approved, StreakCount = p.Streak,
                LastActiveDate = DateTime.UtcNow.AddDays(-1), InviteCode = ("DEMO" + p.Slug.ToUpper()).PadRight(8, 'X')[..8],
                QrToken = "demo-" + p.Slug + "-" + Codes.Token()[..8], PreferredLang = p.Langs.Split(',')[0],
                ConsentAt = DateTime.UtcNow.AddDays(-60), IsDemo = true, CreatedAt = DateTime.UtcNow.AddDays(-60 + p.Streak % 7),
                Tags = p.Tags.Where(allTags.ContainsKey).Select(t => allTags[t]).ToList(),
                HelpSubjects = p.Subjects.Select(c => subjects[c]).ToList(),
            };
            db.Users.Add(user);
            u[p.Slug] = user;
        }
        // Петро прийшов за запрошенням Катерини
        await db.SaveChangesAsync();
        u["petr"].InvitedById = u["student"].Id;
        u["lucie"].InvitedById = u["mentor"].Id;
        u["vojtech"].InvitedById = u["mentor"].Id;
        await db.SaveChangesAsync();

        DateTime At(int days, string hm) => DateTime.Now.Date.AddDays(days).Add(TimeSpan.Parse(hm)).ToUniversalTime();
        DateTime Ago(double minutes) => DateTime.UtcNow.AddMinutes(-minutes);
        int T(string code, string topicEn) => subjects[code].Topics.First(t => t.NameEn == topicEn).Id;
        string J(object o) => JsonSerializer.Serialize(o, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var places = await db.SafePlaces.ToDictionaryAsync(p => p.Name, p => p.Id);
        var partners = await db.Partners.ToDictionaryAsync(p => p.Name, p => p.Id);

        // Office hours
        void Hours(string who, params (int dow, string s, string e, string mode, string? note)[] hours) =>
            db.OfficeHours.AddRange(hours.Select(h => new OfficeHour { MentorId = u[who].Id, DayOfWeek = h.dow, Start = h.s, End = h.e, Mode = h.mode, Note = h.note }));
        Hours("mentor", (1, "14:30", "16:00", "school", "Knihovna"), (3, "15:00", "17:00", "online", null), (4, "14:30", "16:00", "place", "Kavárna Klatovka"), (6, "10:00", "12:00", "online", null));
        Hours("maksym", (2, "15:00", "16:30", "school", null), (5, "13:30", "15:00", "online", null));
        Hours("eliska", (1, "15:00", "16:00", "online", null), (3, "14:00", "16:00", "school", "A204"));
        Hours("jakub", (4, "15:00", "17:00", "online", null));
        Hours("olena", (2, "14:00", "15:30", "school", null), (4, "16:00", "17:00", "online", null));
        Hours("adam", (3, "16:00", "18:00", "online", null));

        // Звʼязки
        Connection Conn(string student, string mentor, string status, string origin, int daysAgo, int? archivedDaysAgo = null)
        {
            var c = new Connection
            {
                StudentId = u[student].Id, MentorId = u[mentor].Id, Status = status, Origin = origin,
                CreatedAt = DateTime.UtcNow.AddDays(-daysAgo), AcceptedAt = status == "pending" ? null : DateTime.UtcNow.AddDays(-daysAgo).AddHours(1),
                ArchivedAt = archivedDaysAgo == null ? null : DateTime.UtcNow.AddDays(-archivedDaysAgo.Value),
            };
            db.Connections.Add(c);
            return c;
        }
        var kOnd = Conn("student", "mentor", "active", "sos", 10);
        var jOnd = Conn("jan", "mentor", "active", "request", 8);
        var aOnd = Conn("anna", "mentor", "archived", "request", 30, 5);
        var lOnd = Conn("lucie", "mentor", "pending", "request", 0);
        var kMax = Conn("student", "maksym", "active", "sos", 2);
        var dOnd = Conn("dmytro", "mentor", "active", "qr", 6);
        var vOle = Conn("vojtech", "olena", "active", "request", 4);
        await db.SaveChangesAsync();

        // Повідомлення
        void Chat(Connection c, params (string? who, string text, double minutesAgo)[] lines)
        {
            foreach (var (who, text, ago) in lines)
                db.Messages.Add(new Message { ConnectionId = c.Id, SenderId = who == null ? null : u[who].Id, Text = text, CreatedAt = Ago(ago) });
            c.LastMessageAt = Ago(lines.Min(l => l.minutesAgo));
        }
        db.Messages.Add(new Message { ConnectionId = kOnd.Id, SystemType = "sos", CreatedAt = Ago(60 * 24 * 10), Data = J(new { subjectId = subjects["CSHARP"].Id, topicId = T("CSHARP", "OOP"), kind = "test", description = "Abstraktní třídy vs. interface" }) });
        Chat(kOnd,
            ("mentor", "Ahoj, viděl jsem tvůj SOS k OOP. Co přesně ti nejde?", 60 * 24 * 10 - 2),
            ("student", "Ahoj! Nechápu rozdíl mezi abstraktní třídou a interfacem", 60 * 24 * 10 - 5),
            ("mentor", "To je klasika. Interface říká, CO má třída umět. Abstraktní třída může mít i část implementace a stav.", 60 * 24 * 10 - 8),
            ("mentor", "Pošli kód, na který se díváš, projdeme ho spolu.", 60 * 24 * 10 - 9),
            ("student", "Díky, už to dává smysl. Můžeme se potkat ještě jednou před testem?", 95),
            ("mentor", "Jasně. Dal jsem nám schůzku na zítra v knihovně, vezmi si notebook.", 80));
        Chat(kMax,
            ("maksym", "Привіт! Бачу, в тебе скоро контрольна з математики. Похідні?", 60 * 26),
            ("student", "Так. Правило ланцюжка взагалі не розумію", 60 * 25),
            ("maksym", "Розберемо на прикладах, там усе логічно. Глянь поки відео, яке я скинув, і запиши питання.", 60 * 25 - 10));
        Chat(jOnd,
            ("jan", "Čau, můžeš mi mrknout na úkol s cykly? Pořád mi to padá na IndexOutOfRange.", 60 * 5),
            ("mentor", "Jasně, pošli to. Nejspíš máš v podmínce <= místo <.", 60 * 5 - 3));
        Chat(dOnd,
            ("dmytro", "Díky za včerejšek, subnetting už chápu", 60 * 24 * 3),
            ("mentor", "Super. Příště zkusíme VLSM.", 60 * 24 * 3 - 20));
        Chat(aOnd,
            ("anna", "Дякую за допомогу з проєктом!", 60 * 24 * 6),
            ("mentor", "Rádo se stalo, hodně štěstí!", 60 * 24 * 6 - 30));
        db.Messages.Add(new Message { ConnectionId = aOnd.Id, SystemType = "archived", CreatedAt = Ago(60 * 24 * 5) });
        Chat(vOle,
            ("vojtech", "Ahoj, jak se v Pythonu vrací víc hodnot z funkce?", 60 * 3),
            ("olena", "Vrátíš tuple: return a, b — a pak si to rozbalíš: x, y = f()", 60 * 3 - 4));

        // Зустрічі
        Meeting Meet(Connection c, DateTime at, string status, string? place, string topic)
        {
            var m = new Meeting
            {
                ConnectionId = c.Id, StudentId = c.StudentId, MentorId = c.MentorId, ScheduledAt = at, Status = status,
                PlaceId = place == null ? null : places[place], Topic = topic, CompletedAt = status == "completed" ? at.AddMinutes(50) : null,
                Reminded = at < DateTime.UtcNow,
            };
            db.Meetings.Add(m);
            return m;
        }
        Meet(kOnd, At(1, "15:00"), "scheduled", "Knihovna SŠINFIS", "Abstraktní třídy vs. interface");
        Meet(kOnd, At(-7, "15:30"), "completed", "Kavárna Klatovka", "Úvod do OOP");
        Meet(kMax, At(3, "16:00"), "scheduled", "Bistro Na Rohu", "Похідні: правило ланцюжка");
        Meet(dOnd, At(-4, "14:30"), "completed", "Knihovna SŠINFIS", "Subnetting");
        Meet(aOnd, At(-12, "15:00"), "completed", "Studijní a vědecká knihovna", "Projekt do WEB");
        Meet(jOnd, At(2, "14:45"), "scheduled", null, "Cykly a pole");

        // SOS
        db.SosRequests.AddRange(
            new SosRequest { StudentId = u["jan"].Id, SubjectId = subjects["CSHARP"].Id, TopicId = T("CSHARP", "OOP"), Kind = "test", Description = "Zítra píšu test z dědičnosti, potřebuju rychle projít virtual/override.", CreatedAt = Ago(4) },
            new SosRequest { StudentId = u["vojtech"].Id, SubjectId = subjects["PYTHON"].Id, TopicId = T("PYTHON", "Functions"), Kind = "homework", Description = "Nevím, jak napsat rekurzivní funkci na faktoriál.", CreatedAt = Ago(25) },
            new SosRequest { StudentId = u["dmytro"].Id, SubjectId = subjects["NET"].Id, TopicId = T("NET", "Subnetting"), Kind = "test", Description = "Маска /27 — скільки хостів і як порахувати діапазон?", CreatedAt = Ago(70) },
            new SosRequest { StudentId = u["student"].Id, SubjectId = subjects["CSHARP"].Id, TopicId = T("CSHARP", "OOP"), Kind = "test", Description = "Abstraktní třídy vs. interface", Status = "resolved", MentorId = u["mentor"].Id, CreatedAt = Ago(60 * 24 * 10 + 5), AcceptedAt = Ago(60 * 24 * 10) },
            new SosRequest { StudentId = u["student"].Id, SubjectId = subjects["MATH"].Id, TopicId = T("MATH", "Derivatives"), Kind = "question", Description = "Правило ланцюжка для складених функцій", Status = "accepted", MentorId = u["maksym"].Id, CreatedAt = Ago(60 * 26 + 10), AcceptedAt = Ago(60 * 26) });

        // Домашні завдання Катерини
        void Hw(string title, string code, string topicEn, DateTime deadline, int diff, string desc, bool done = false) =>
            db.Homeworks.Add(new Homework
            {
                UserId = u["student"].Id, Title = title, SubjectId = subjects[code].Id, TopicId = T(code, topicEn), Deadline = deadline,
                Difficulty = diff, Description = desc, Status = done ? "done" : "open", CompletedAt = done ? deadline.AddHours(-5) : null,
                CreatedAt = deadline.AddDays(-5),
            });
        Hw("Třídy a objekty — cvičení 4", "CSHARP", "Classes", At(1, "20:00"), 2, "Vytvořit třídu BankAccount s metodami Deposit a Withdraw, ošetřit záporný zůstatek.");
        Hw("Похідні складеної функції", "MATH", "Derivatives", At(3, "08:00"), 3, "Сторінка 112, вправи 4–12. Не виходить 9 і 11.");
        Hw("Essay: My future job", "ENG", "Essay", At(5, "23:59"), 1, "180–220 words.");
        Hw("Subnetting — pracovní list", "NET", "Subnetting", At(-2, "18:00"), 2, "", done: true);
        Hw("Python: seznamy a slovníky", "PYTHON", "Lists & dicts", At(-6, "20:00"), 1, "", done: true);

        // Групи
        StudyGroup Group(string name, string? code, string? topic, string desc, string owner, params string[] members)
        {
            var g = new StudyGroup { Name = name, SubjectId = code == null ? null : subjects[code].Id, Topic = topic, Description = desc, CreatedById = u[owner].Id, CreatedAt = DateTime.UtcNow.AddDays(-20) };
            db.StudyGroups.Add(g);
            db.SaveChanges();
            db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = u[owner].Id, Role = "owner", JoinedAt = g.CreatedAt });
            foreach (var m in members) db.GroupMembers.Add(new GroupMember { GroupId = g.Id, UserId = u[m].Id, JoinedAt = g.CreatedAt.AddDays(1) });
            return g;
        }
        var gPy = Group("Python Beginners", "PYTHON", "Basics", "Začínáme s Pythonem: úkoly, tipy, společné řešení.", "olena", "vojtech", "student", "maksym", "lucie");
        var gCs = Group("C# OOP", "CSHARP", "OOP", "Třídy, dědičnost, rozhraní. Před testem se scházíme v knihovně.", "mentor", "student", "jan", "dmytro", "adam");
        var gMath = Group("Mathematics Help", "MATH", "Derivatives", "Математика для 2.IT: похідні, функції, підготовка до контрольних.", "eliska", "anna", "student", "maksym");
        var gCs2 = Group("CS2 Squad", null, "CS2", "Po škole hrajeme, o víkendu turnaj v CyberAreně.", "dmytro", "student", "eliska", "adam", "jan");
        void GroupChat(StudyGroup g, params (string who, string text, double ago)[] lines)
        {
            foreach (var (who, text, ago) in lines) db.Messages.Add(new Message { GroupId = g.Id, SenderId = u[who].Id, Text = text, CreatedAt = Ago(ago) });
        }
        GroupChat(gCs, ("mentor", "Ve čtvrtek před testem projdeme dědičnost, kdo přijde?", 600), ("jan", "Já určitě", 590), ("student", "Я теж буду", 585), ("adam", "Přinesu příklady z Unity", 560));
        GroupChat(gPy, ("olena", "Нове завдання: напишіть функцію, яка рахує голосні в рядку", 1500), ("vojtech", "Hotovo, poslal jsem to do chatu", 1400), ("lucie", "Můžu použít list comprehension?", 1300), ("olena", "Так, навіть бажано", 1290));
        GroupChat(gMath, ("eliska", "Kdo potřebuje projít derivace před testem?", 900), ("anna", "Я!", 880), ("maksym", "Можу пояснити правило ланцюжка в середу", 860));
        GroupChat(gCs2, ("dmytro", "Сьогодні о 19:00 хто грає?", 300), ("adam", "Jsem tam", 290), ("eliska", "Dneska nemůžu, ale v sobotu na turnaj jo", 250));

        // Події
        Event Ev(string title, string desc, DateTime at, string? place, StudyGroup? group, string owner, string kind, int? cap, params string[] who)
        {
            var e = new Event { Title = title, Description = desc, StartsAt = at, PlaceId = place == null ? null : places[place], Location = place ?? "SŠINFIS", GroupId = group?.Id, CreatedById = u[owner].Id, Kind = kind, Capacity = cap, Reminded = at < DateTime.UtcNow };
            db.Events.Add(e);
            db.SaveChanges();
            foreach (var w in who.Prepend(owner).Distinct()) db.EventParticipants.Add(new EventParticipant { EventId = e.Id, UserId = u[w].Id, CheckedIn = at < DateTime.UtcNow });
            return e;
        }
        Ev("C# OOP workshop", "Dědičnost, rozhraní a polymorfismus na praktických příkladech. Vezměte si notebook.", At(2, "15:00"), "Knihovna SŠINFIS", gCs, "mentor", "study", 12, "student", "jan", "dmytro");
        Ev("CS2 turnaj 5v5", "Přátelský turnaj, týmy losujeme na místě. Vstup se slevou pro SchoolBuddy.", At(4, "17:00"), "CyberArena Plzeň", gCs2, "dmytro", "gaming", 10, "student", "eliska", "adam");
        Ev("Ранкова пробіжка Борським парком", "5 км у спокійному темпі, після — кава.", At(6, "07:15"), "Borský park", null, "iryna", "sport", null, "eliska");
        Ev("Den otevřených dveří SŠINFIS", "Provázíme budoucí prváky po škole. Sraz ve vestibulu.", At(9, "09:00"), "Knihovna SŠINFIS", null, "admin", "school", 20, "mentor", "tereza");
        Ev("Python Beginners: první setkání", "Seznámení, instalace, první skripty.", At(-8, "15:00"), "Knihovna SŠINFIS", gPy, "olena", "study", null, "student", "vojtech", "lucie");
        Ev("Večer v CyberAreně", "Neformální večer pro mentory a nováčky.", At(-14, "18:00"), "CyberArena Plzeň", gCs2, "dmytro", "gaming", null, "mentor", "student", "adam");

        // Форум
        ForumPost Post(string who, string category, string title, string content, double minutesAgo, params (string who, string text, double ago)[] replies)
        {
            var p = new ForumPost { AuthorHash = hasher.For(u[who].Id), Category = category, Title = title, Content = content, CreatedAt = Ago(minutesAgo) };
            db.ForumPosts.Add(p);
            db.SaveChanges();
            foreach (var r in replies) db.ForumReplies.Add(new ForumReply { PostId = p.Id, AuthorHash = hasher.For(u[r.who].Id), Content = r.text, CreatedAt = Ago(r.ago) });
            return p;
        }
        Post("jan", "teachers", "Je těžký test z OOP u pana Nováka?", "Píšeme za týden a nevím, co čekat. Je tam víc teorie, nebo kódu?", 600,
            ("mentor", "Hlavně kód. Dědičnost, override, rozhraní. Teorie je jen pár otázek.", 560), ("adam", "Projdi si jeho příklady z hodin, dává podobné.", 500));
        Post("student", "school", "Як краще готуватись до матури з чеської, якщо ти іноземець?", "Я в Чехії третій рік. Говорю нормально, але слох і література — жах. Що допомогло вам?", 60 * 20,
            ("tereza", "Čti povinnou četbu ve zkrácené verzi a piš každý týden jeden sloh. Ráda opravím.", 60 * 18), ("anna", "Мені допомогли рідерси з адаптованою літературою + групи в SchoolBuddy.", 60 * 17));
        Post("lucie", "city", "Kde se dá levně najíst poblíž Klatovské?", "Ideálně do 120 Kč, s polední nabídkou.", 60 * 30,
            ("jakub", "Bistro Na Rohu, polední menu kolem 115 Kč. Se SchoolBuddy body i sleva.", 60 * 29));
        Post("dmytro", "school", "Працює Wi-Fi у бібліотеці?", "Вчора не міг підʼєднатися до SSINFIS-Student.", 60 * 50,
            ("olena", "Вже полагодили, є навіть оголошення.", 60 * 45));
        var spam = Post("vojtech", "other", "Prodám účet do hry, levně", "Napište mi soukromě, mám i skiny.", 120);

        db.Reports.Add(new Report { ReporterId = u["jan"].Id, TargetType = "post", TargetId = spam.Id, Reason = "Spam / prodej účtů", CreatedAt = Ago(60) });
        db.Reports.Add(new Report { ReporterId = u["anna"].Id, TargetType = "user", TargetId = u["petr"].Id, Reason = "Nevhodné zprávy", CreatedAt = Ago(60 * 30), Status = "dismissed", ResolvedAt = Ago(60 * 28) });

        // Довірений контакт
        db.TrustedContacts.Add(new TrustedContact { UserId = u["student"].Id, Name = "Мама", Contact = "+420 777 000 111", Relation = "Мама" });

        // Транзакції та баланси
        void Tx(string who, int amount, string reason, double daysAgo, string? partner = null)
        {
            db.CoinTransactions.Add(new CoinTransaction { UserId = u[who].Id, Amount = amount, Reason = reason, CreatedAt = DateTime.UtcNow.AddDays(-daysAgo), PartnerId = partner == null ? null : partners[partner] });
            u[who].Coins += amount;
        }
        Tx("mentor", 50, "meeting", 12); Tx("mentor", 50, "meeting", 7); Tx("mentor", 20, "sos_help", 9); Tx("mentor", 50, "meeting", 4);
        Tx("mentor", 30, "invite", 15); Tx("mentor", 30, "invite", 3); Tx("mentor", -40, "redeem", 2, "Kavárna Klatovka"); Tx("mentor", 120, "bonus", 40);
        Tx("maksym", 50, "meeting", 20); Tx("maksym", 50, "meeting", 14); Tx("maksym", 80, "bonus", 30);
        Tx("eliska", 50, "meeting", 18); Tx("eliska", 60, "bonus", 25);
        Tx("olena", 50, "meeting", 10); Tx("adam", 40, "bonus", 12); Tx("jakub", 30, "bonus", 9);
        Tx("student", 10, "meeting", 7); Tx("student", 30, "invite", 1);
        await db.SaveChangesAsync();

        // Кілька сповіщень, щоб дзвіночок не був порожнім
        void N(string who, string type, object data, string link, double minutesAgo, bool read = false) =>
            db.Notifications.Add(new Notification { UserId = u[who].Id, Type = type, Data = J(data), Link = link, CreatedAt = Ago(minutesAgo), IsRead = read });
        N("student", "sos_accepted", new { name = "Максим Бондаренко", subjectId = subjects["MATH"].Id }, $"/chat/{kMax.Id}", 60 * 26, true);
        N("student", "meeting_scheduled", new { name = "Ondřej Nový", at = At(1, "15:00") }, "/meetings", 80);
        N("student", "message_new", new { name = "Ondřej Nový", mentor = true }, $"/chat/{kOnd.Id}", 79);
        N("student", "invite_joined", new { name = "Petr Král", coins = 30 }, "/wallet", 60 * 24);
        N("mentor", "sos_new", new { name = "Jan Svoboda", subjectId = subjects["CSHARP"].Id }, "/sos", 4);
        N("mentor", "sos_new", new { name = "Дмитро Ткаченко", subjectId = subjects["NET"].Id }, "/sos", 70);
        N("mentor", "connection_request", new { name = "Lucie Novotná" }, "/cabinet", 30);
        N("mentor", "message_new", new { name = "Jan Svoboda", mentor = false }, $"/chat/{jOnd.Id}", 60 * 5, true);
        await db.SaveChangesAsync();

        foreach (var user in u.Values) await game.CheckAchievementsAsync(user.Id);
        // Позначаємо «старі» досягнення прочитаними, щоб не захаращувати дзвіночок
        var demoIds = u.Values.Select(x => x.Id).ToList();
        await db.Notifications.Where(n => demoIds.Contains(n.UserId) && n.Type == "achievement").ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true));
    }
}
