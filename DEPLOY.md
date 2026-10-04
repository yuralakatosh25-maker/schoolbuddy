# Публікація SchoolBuddy безкоштовно, без картки (Render + Neon + Brevo)

Схема: **GitHub** (код) → **Render** (запускає сайт і сам оновлює його після кожного `git push`) → **Neon** (безкоштовна база Postgres) → **Brevo** (листи з кодом входу). Комп'ютер після цього не потрібен.

> Умови безкоштовних тарифів можуть змінюватися — перед реєстрацією гляньте, чи вони не просять картку чи вік.
> Безкоштовний Render «засинає» після ~15 хвилин без відвідувань: перше відкриття після паузи триває до хвилини.

## 1. GitHub

1. Створи на https://github.com/new порожній **Private** репозиторій `schoolbuddy` (без README).
2. У папці проєкту:

```bash
git config --global user.name "Твоє Імʼя"
git config --global user.email "ти@example.com"
git commit -m "SchoolBuddy"
git remote add origin https://github.com/ТВІЙ_ЛОГІН/schoolbuddy.git
git push -u origin main
```

## 2. База даних: Neon

1. https://neon.tech → **Sign up** (можна через GitHub).
2. Створи проєкт `schoolbuddy` (регіон Europe / Frankfurt).
3. На дашборді натисни **Connect** і скопіюй **Connection string** — рядок на кшталт
   `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
   Збережи його — він знадобиться на кроці 4.

Таблиці створюються самі при першому запуску сайту.

## 3. Пошта: Brevo

Без пошти вхід за кодом вимкнений (демо-вхід працює).

1. https://www.brevo.com → безкоштовна реєстрація (300 листів на день).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: вкажи свою пошту (наприклад, особисту Gmail) і підтверди її листом. Саме цю адресу будеш вказувати як відправника.
3. **SMTP & API → API Keys → Generate a new API key** → скопіюй ключ.

> Листи з нового відправника можуть потрапляти в «Спам» — для школи краще підтвердити в Brevo справжній домен школи (це може зробити лише той, хто керує DNS `infis.cz`).

## 4. Render

1. https://render.com → **Sign up with GitHub**.
2. **New + → Blueprint** → підключи репозиторій `schoolbuddy` (Render прочитає файл `render.yaml`).
3. У формі Render попросить значення для змінних:

| Змінна | Що вписати |
|---|---|
| `ConnectionStrings__Default` | рядок із Neon (крок 2) |
| `School__Admins__0` | твоя пошта `…@infis.cz` — вона отримає роль адміна |
| `Brevo__ApiKey` | ключ Brevo (крок 3) |
| `Smtp__From` | адреса відправника, підтверджена в Brevo |

   Секрети `Jwt__Key` і `Forum__Salt` Render згенерує сам.
4. Натисни **Apply**. Перша збірка триває 5–10 хвилин.
5. Коли збірка зелена, відкрий адресу сервісу `https://schoolbuddy-….onrender.com`. Перевірка: `/api/health` → `{"ok":true}`.

Далі кожен `git push` у `main` автоматично оновлює сайт.

## Для справжніх учнів

- `Demo__Enabled` → `false` (Render → сервіс → **Environment**), коли презентація закінчилась.
- Демо-ключі партнерів (`klatovka-demo-key` тощо) створюються разом з довідковими даними — заміни їх у таблиці `Partners`, коли з'являться справжні заклади (у Neon: **SQL Editor**).
- Свій домен: Render → **Settings → Custom Domains** (на безкоштовному тарифі HTTPS-сертифікат видається автоматично).

## Локальна розробка

Локально сайт працює на SQLite без жодних налаштувань:

```bash
dotnet run --project SchuoolBuddy.API --launch-profile http
npm --prefix frontend run dev
```

Код входу показується на екрані, поки пошта не налаштована. Рядок підключення з `postgres…` автоматично вмикає PostgreSQL, інакше використовується SQLite.

## Примітки

- Для Postgres схема створюється при першому запуску (`EnsureCreated`), тому майбутні зміни структури таблиць потребуватимуть окремих міграцій під Postgres або перестворення бази. Міграції в проєкті написані під SQLite.
- Якщо потрібен Azure, App Service чи інший хостинг із SQLite на диску — змінні називаються так само, лише `ConnectionStrings__Default` = `Data Source=/home/data/schoolbuddy.db`.
