using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SchoolBuddy.API.Models;

namespace SchoolBuddy.API.Services;

public class TokenService(IConfiguration config)
{
    public string Create(User user)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim(ClaimTypes.Email, user.Email),
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!));
        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddDays(14),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public static class Codes
{
    const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public static string Random(int length)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++) chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }

    public static string Digits(int length)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < length; i++) sb.Append(RandomNumberGenerator.GetInt32(10));
        return sb.ToString();
    }

    public static string Token() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
}

// Анонімний підпис автора на форумі: SHA-256 від id користувача + серверна сіль.
// Один і той самий автор завжди отримує однаковий псевдонім, але відновити id з нього неможливо.
public class AnonHasher(IConfiguration config)
{
    public string For(int userId)
    {
        var salt = config["Forum:Salt"] ?? "schoolbuddy-forum";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{userId}:{salt}"));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
