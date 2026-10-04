using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace SchoolBuddy.API.Services;

// Простий фільтр нецензурної лексики (UA / CZ / EN) для тегів, форуму, груп і чатів.
public class Moderation
{
    static readonly string[] StopWords =
    [
        // cs
        "kurva", "pica", "kokot", "zmrd", "debil", "hovno", "prdel", "curak", "mrdat", "sracka",
        // en
        "fuck", "shit", "bitch", "asshole", "cunt", "whore", "nigg",
        // ua / ru
        "хуй", "хуя", "хує", "пизд", "бля", "сука", "єбат", "ебат", "уєб", "мудак", "підар", "пидор", "гандон", "залуп",
    ];

    static readonly Dictionary<char, char> Leet = new()
    {
        ['0'] = 'o', ['1'] = 'i', ['3'] = 'e', ['4'] = 'a', ['5'] = 's', ['7'] = 't', ['@'] = 'a', ['$'] = 's',
    };

    // Стоп-слова проходять ту саму нормалізацію, що й текст (й → и, ё → е тощо).
    static readonly string[] NormalizedStopWords = StopWords.Select(Normalize).ToArray();

    static string Normalize(string input)
    {
        var decomposed = input.ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var ch in decomposed)
        {
            // прибираємо діакритику (č → c), але лишаємо кирилицю: й/ї розкладаються на і + знак, знак відкидаємо
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(Leet.TryGetValue(ch, out var r) ? r : ch);
        }
        return Regex.Replace(sb.ToString(), @"[\s\.\-_\*]+", "");
    }

    public bool IsClean(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return true;
        var n = Normalize(text);
        return !NormalizedStopWords.Any(w => n.Contains(w));
    }

    // Для чатів: не блокуємо повідомлення, а маскуємо слова.
    public string Mask(string text)
    {
        return Regex.Replace(text, @"\S+", m => IsClean(m.Value) ? m.Value : new string('*', m.Value.Length));
    }
}
