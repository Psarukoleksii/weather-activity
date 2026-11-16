# Implementation plan: Weather Activity Ranking (proof of concept)

Сервіс приймає місто й країну та для кожної з чотирьох активностей (skiing, surfing, outdoor sightseeing, indoor sightseeing) ранжує найближчі 7 днів за оцінкою 0–100. Погоду бере з Open-Meteo, зберігає в Postgres і не ходить до Open-Meteo на кожен запит.

Це POC: реалізуємо happy flow. Фронтенду немає.

## 1. Прийняті рішення

| Тема | Рішення |
| --- | --- |
| Стек | Node 22, **NestJS**, TypeScript, **TypeORM** + Postgres 16, Jest |
| API | **GraphQL** (вимога), code-first: `@nestjs/graphql` + Apollo. Один query `activityRankings(city, country)`, обидва аргументи обов'язкові. Плюс службовий `GET /healthz` |
| Rate limit | `@nestjs/throttler` за IP, лічильники в **Redis** (спільні для всіх реплік api). Cookie-токена й окремого захисту GraphQL немає |
| Кеш відповідей | **Не реалізуємо.** Redis уже є, тож кеш готової відповіді можна додати пізніше; це позначено коментарем у `ActivityRankingsService` і в README |
| Нове місто | Геокодування + погода + розрахунок синхронно в запиті. Стану `WARMING` немає: при збої повертається помилка |
| Оновлення | Окремий воркер опитує Postgres раз на хвилину й оновлює міста, які нещодавно запитували: гарячі раз на 3 год, теплі раз на 12 год, решта не оновлюється |
| Черга | Немає ні Kafka, ні таблиці-черги: чергою є таблиця `places` |
| Таблиці | Три: `places`, `weather_hourly`, `activity_scores` |
| Запуск | Один образ для `api` і `worker`, плюс `postgres` і `redis`: чотири контейнери |
| Форма відповіді | Активність → 7 днів, відсортованих від найкращого до найгіршого |

## 2. Архітектура

```
 Client ──POST /graphql──▶ ┌──────────────────────┐
                           │ api (NestJS)         │── читає / пише ──▶ ┌──────────┐
                           │ resolver → services  │                    │ Postgres │
                           └──────────┬───────────┘                    │ 3 таблиці│
                     нове місто:      │                                └────▲─────┘
                     geocoding +      ▼                                     │
                     forecast    Open-Meteo ◀──────┐                        │ upsert
                                                   │                        │
                           ┌───────────────────────┴──┐                     │
                           │ worker (Nest standalone) │─────────────────────┘
                           │ раз на хвилину:          │
                           │ вибрати міста → refresh  │
                           └──────────────────────────┘
```

Спільний код: `ForecastRefreshService.refreshPlace(placeId)` робить fetch → upsert погоди → scoring → upsert оцінок → оновлення `last_fetched_at`. Його викликають і API (нове місто), і воркер (за розкладом), тож шлях оновлення один.

## 3. Структура файлів

```
weather-activity/
├─ docker-compose.yml
├─ Dockerfile                          # один образ для api і worker
├─ .env.example
├─ package.json
├─ src/
│  ├─ main.ts                          # entry point api (HTTP + GraphQL)
│  ├─ app.module.ts
│  ├─ workers/
│  │  ├─ worker.ts                     # entry point worker (NestFactory.createApplicationContext)
│  │  └─ worker.module.ts
│  ├─ config/
│  │  └─ config.module.ts              # глобальний ConfigModule для api / worker
│  ├─ environment/                     # змінні середовища
│  │  ├─ consts/app.consts.ts          # AppConst: api, worker
│  │  ├─ environments/environment.ts   # environment(app): повний конфіг застосунку
│  │  ├─ factories/                    # по фабриці на секцію + environment-api / environment-worker
│  │  ├─ types/                        # BasicConfigType, ApiConfigType, WorkerConfigType, …
│  │  └─ utils/env-var/                # get('X').default(...).asIntPositive()
│  ├─ libs/
│  │  └─ typeorm/                      # TypeOrmConfigPgFactory, DatabaseModule, data-source.ts для CLI
│  ├─ models/                          # усі моделі (TypeORM entities) та enum-и
│  │  ├─ place.entity.ts
│  │  ├─ weather-hourly.entity.ts
│  │  ├─ activity-score.entity.ts
│  │  ├─ entities.ts                   # лише entity, для TypeORM
│  │  └─ enums/                        # ActivityType, Rating, Confidence: по файлу на enum
│  ├─ migrations/
│  ├─ modules/                         # модулі за бізнес-логікою
│  │  ├─ places/
│  │  │  ├─ places.module.ts
│  │  │  └─ places.service.ts          # пошук / створення міста (геокодування)
│  │  ├─ weather/
│  │  │  ├─ weather.module.ts
│  │  │  ├─ open-meteo.client.ts       # geocoding, forecast, marine
│  │  │  └─ weather.service.ts         # fetch + upsert у weather_hourly
│  │  ├─ scoring/
│  │  │  ├─ scoring.module.ts
│  │  │  ├─ activity-scoring.service.ts # центральний клас розрахунків (розділ 7)
│  │  │  ├─ day-weather.context.ts     # контекст одного дня
│  │  │  └─ scoring.config.ts          # ваги, пороги, ALGO_VERSION
│  │  ├─ forecast-refresh/
│  │  │  ├─ forecast-refresh.module.ts
│  │  │  ├─ forecast-refresh.service.ts # refreshPlace()
│  │  │  └─ refresh.poller.ts          # @Interval: вибірка міст, лише у worker
│  │  ├─ activity-rankings/
│  │  │  ├─ activity-rankings.module.ts
│  │  │  ├─ activity-rankings.resolver.ts # тонкий resolver
│  │  │  ├─ activity-rankings.service.ts  # потік запиту, збирання відповіді
│  │  │  └─ dto/                       # GraphQL object types та args
│  │  └─ health/
│  │     └─ health.controller.ts       # GET /healthz
│  └─ utils/                           # чисті функції без залежностей від Nest; кожна в своїй папці
│     ├─ normalize-name/               # нижній регістр, без діакритики
│     ├─ piecewise-linear/             # крива f(x) для факторів
│     ├─ local-date/                   # локальні дні в часовому поясі міста
│     └─ stats/                        # min / max / avg / sum з урахуванням null
└─ test/
   └─ fixtures/                        # записані відповіді Open-Meteo для unit-тестів
```

Unit-тести лежать поруч із кодом (`*.spec.ts`). Папка утиліти: `<name>.ts`, `<name>.spec.ts`, `index.ts`.

`AppModule` підключає всі модулі. `WorkerModule` підключає лише `forecast-refresh` (з poller-ом) і його залежності, без GraphQL та HTTP.

## 4. Схема БД

### `places`

| Колонка | Тип | Примітки |
| --- | --- | --- |
| `id` | bigserial PK | |
| `geoname_id` | bigint, unique | Ідентифікатор із геокодера |
| `name` | text | Як повернув геокодер |
| `name_normalized` | text | Нижній регістр, без діакритики |
| `country_code` | char(2) | ISO 3166-1 alpha-2 |
| `latitude`, `longitude` | double | |
| `elevation_m` | real null | |
| `timezone` | text | IANA, наприклад `Europe/Warsaw` |
| `has_marine_data` | bool null | `null` до першої перевірки |
| `last_requested_at` | timestamptz | Останній запит клієнта. **Ставиться в `now()` вже при `INSERT`**, інакше воркер нове місто не побачить |
| `last_fetched_at` | timestamptz null | Остання успішна синхронізація погоди |
| `last_attempt_at` | timestamptz null | Остання спроба оновлення воркером, успішна чи ні. Потрібна, щоб місто, яке постійно падає, не займало чергу |
| `created_at` | timestamptz | |

Індекси: звичайний (не unique) на `(name_normalized, country_code)` для пошуку; індекс на `last_requested_at`. Unique лише на `geoname_id`, щоб два однойменні міста однієї країни не валили вставку.

### `weather_hourly`

PK `(place_id, valid_at)`, `valid_at` у UTC. На місто лежить ~192 рядки (8 днів × 24 год), їх перезаписує upsert.

- Атмосфера: `temperature_c`, `apparent_temperature_c`, `precipitation_mm`, `precipitation_probability_pct`, `snowfall_cm`, `snow_depth_m`, `cloud_cover_pct`, `wind_speed_kmh`, `wind_gusts_kmh`, `visibility_m`, `weather_code`, `is_day`.
- Море (nullable): `wave_height_m`, `wave_period_s`, `swell_wave_height_m`, `swell_wave_period_s`, `sea_surface_temperature_c`.
- `fetched_at` timestamptz.

`null` від Open-Meteo зберігаємо як `NULL` ("невідомо", а не нуль). Імена змінних звірити з документацією Open-Meteo під час реалізації.

### `activity_scores`

PK `(place_id, activity, local_date)`.

`applicable` (bool), `score` (smallint null), `rating` (null), `confidence`, `reasons` (jsonb), `components` (jsonb: сире значення, оцінка фактора, вага), `algo_version`, `computed_at`.

Оцінки рахуються **для всіх 8 днів**, які є в погоді, щоб після опівночі у відповіді лишалося 7 днів. Ранг дня в таблиці не зберігається: він залежить від того, який день сьогодні, тому рахується під час читання.

Це похідні дані: їх можна перерахувати з `weather_hourly` без викликів API.

## 5. Потік запиту

1. Throttler (за IP). Валідація аргументів: порожнє місто або країна не з двох літер дають `BAD_USER_INPUT`.
2. Нормалізація назви, пошук у `places` за `(name_normalized, country_code)`.
3. **Міста немає:** Geocoding API (`name`, фільтр за країною, перший результат) → `INSERT ... ON CONFLICT (geoname_id) DO NOTHING` з `last_requested_at = now()`, потім читаємо рядок. Геокодер нічого не знайшов: `NOT_FOUND`.
4. **Місто є:** оновити `last_requested_at`, лише якщо воно старіше за 10 хв (щоб читання не ставало записом на кожен запит):
   `UPDATE places SET last_requested_at = now() WHERE id = :id AND last_requested_at < now() - interval '10 minutes'`.
5. Якщо `last_fetched_at IS NULL` (нове місто або попередня спроба не вдалася) **або старше за `SYNC_REFRESH_AFTER_HOURS` (24)**: синхронно `refreshPlace(placeId)`. Збій Open-Meteo: `UPSTREAM_UNAVAILABLE`. Так "спляче" місто не віддає неповну чи порожню відповідь.
6. Прочитати `activity_scores` на 7 локальних днів, починаючи від сьогодні в часовому поясі міста. Для кожної активності відсортувати дні за `score` за спаданням, **при однаковій оцінці за датою за зростанням** (ближчий день вище), і проставити `rank` 1–7.
7. Повернути відповідь з `dataAsOf = last_fetched_at`.

Кешу відповідей немає: запит і так дешевий (пошук за індексом плюс ~28 рядків оцінок). У `ActivityRankingsService` лишається коментар про те, що готову відповідь можна кешувати в наявному Redis (ключ `rankings:{country}:{name_normalized}`, TTL кілька хвилин), якщо навантаження на читання виросте.

Дані віком до 24 год віддаються як є (вони завжди покривають 7 днів, бо погода тягнеться на 8), а воркер оновлює їх у фоні.

### GraphQL-схема (генерується code-first, тут для наочності)

```graphql
enum ActivityType { SKIING SURFING OUTDOOR_SIGHTSEEING INDOOR_SIGHTSEEING }
enum Rating { EXCELLENT GOOD FAIR POOR AVOID }
enum Confidence { HIGH MEDIUM LOW }

type Query {
  activityRankings(city: String!, country: String!): ActivityRankingsResult!
}

type ActivityRankingsResult {
  place: Place!
  dataAsOf: DateTime!
  activities: [ActivityRanking!]!   # завжди 4 елементи
}

type Place { id: ID!  name: String!  country: String!  timezone: String! }

type ActivityRanking {
  activity: ActivityType!
  applicable: Boolean!
  notApplicableReason: String       # заповнене, якщо applicable = false
  days: [DayScore!]!                # від найкращого дня до найгіршого; порожній, якщо не застосовна
}

type DayScore {
  rank: Int!                        # 1 = найкращий день для цієї активності
  date: Date!
  score: Int!
  rating: Rating!
  confidence: Confidence!
  reasons: [String!]!
}
```

### Приклад

```graphql
{
  activityRankings(city: "Zakopane", country: "PL") {
    dataAsOf
    place { name country timezone }
    activities {
      activity
      applicable
      notApplicableReason
      days { rank date score rating reasons }
    }
  }
}
```

```json
{
  "data": {
    "activityRankings": {
      "dataAsOf": "2026-11-16T09:05:41Z",
      "place": {"name": "Zakopane", "country": "PL", "timezone": "Europe/Warsaw"},
      "activities": [
        {
          "activity": "SKIING",
          "applicable": true,
          "notApplicableReason": null,
          "days": [
            {"rank": 1, "date": "2026-11-20", "score": 71, "rating": "GOOD", "reasons": ["Fresh snow 12 cm"]},
            {"rank": 2, "date": "2026-11-21", "score": 64, "rating": "GOOD", "reasons": []}
          ]
        },
        {
          "activity": "SURFING",
          "applicable": false,
          "notApplicableReason": "No marine data for this location",
          "days": []
        }
      ]
    }
  }
}
```

(Значення умовні; показано два дні із семи та дві активності з чотирьох.)

### Помилки

Помилки лежать у `errors` з кодом у `extensions.code`: `BAD_USER_INPUT`, `NOT_FOUND`, `UPSTREAM_UNAVAILABLE`. Перевищення rate limit: помилка від throttler (HTTP 429).

Throttler із GraphQL потребує власного guard-а (`GqlThrottlerGuard`, який бере `req`/`res` з GraphQL-контексту), а Apollo має передавати `req` і `res` у `context`.

## 6. Оновлення даних

### `refreshPlace(placeId)`

1. Відкрити транзакцію, взяти `pg_advisory_xact_lock(placeId)`. Після отримання lock ще раз перевірити `last_fetched_at`: якщо місто щойно оновив інший процес, вийти без викликів API.
2. Forecast API: hourly-змінні з розділу 4, `forecast_days=8`, `timezone=auto`, **`timeformat=unixtime`**. Час зберігаємо в UTC, а на локальні дні ділимо самі за `places.timezone`.
3. Marine API, лише якщо `has_marine_data` це `null` або `true`. Якщо при першій перевірці всі значення хвиль `null`, ставимо `has_marine_data = false` і більше цей виклик для міста не робимо.
4. Upsert у `weather_hourly` (`ON CONFLICT (place_id, valid_at) DO UPDATE`). Потім `DELETE` рядків цього міста до початку сьогоднішнього локального дня з `weather_hourly` і `activity_scores`: upsert минулі години не прибирає, і без цього таблиці росли б на 24 рядки на місто щодня.
5. Для кожного з 8 локальних днів зібрати `DayWeatherContext` і порахувати 4 оцінки через `ActivityScoringService`.
6. Upsert у `activity_scores`, оновити `places.last_fetched_at`. Commit.

### worker

Nest standalone-застосунок без HTTP. `RefreshPoller` з `@Interval(WORKER_POLL_INTERVAL_SECONDS)`:

```sql
SELECT id FROM places
WHERE last_requested_at > now() - interval '7 days'
  AND (
    last_fetched_at IS NULL
    OR last_fetched_at < now() - CASE
         WHEN last_requested_at > now() - interval '24 hours'
         THEN interval '3 hours'   -- hot
         ELSE interval '12 hours'  -- warm
       END
  )
  AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '15 minutes')
ORDER BY last_attempt_at NULLS FIRST
LIMIT :batch;
```

Для кожного `id` спершу ставить `last_attempt_at = now()` (окремим запитом, поза транзакцією оновлення), потім викликає `refreshPlace`. Місто, яке падає, повторюється не частіше ніж раз на 15 хв (`WORKER_RETRY_AFTER_MINUTES`) і стає в кінець черги, тож не витісняє решту з batch. У воркері lock береться через `pg_try_advisory_xact_lock`: якщо місто вже оновлює інший процес, воно пропускається. Помилка одного міста логується й не зупиняє цикл: `last_fetched_at` не змінився, тож місто потрапить у вибірку наступного разу. Новий тік не стартує, поки не завершився попередній.

Advisory lock замість `FOR UPDATE SKIP LOCKED`: блокування рядка `places` на час HTTP-викликів затримувало б `UPDATE last_requested_at` у запитах користувачів.

Міста без запитів за 7 днів у вибірку не потрапляють ("сплячі").

## 7. Scoring

### ООП-структура

`DayWeatherContext` це об'єкт одного локального дня одного міста. Конструктор приймає місто та погодинні рядки цього дня; гетери ховають агрегацію (`maxGustKmh`, `snowDepthCm`, `freshSnowCm`, `daylightHours`, `avgWaveHeightM`, `hasThunderstorm`, `daysAhead` тощо). Агрегації використовують функції з `utils/`.

`ActivityScoringService` це центральний клас розрахунків. Публічний метод один, решта приватні:

```ts
@Injectable()
export class ActivityScoringService {
  /** Оцінки всіх чотирьох активностей за один день. */
  calculate(ctx: DayWeatherContext): ActivityScoreResult[]

  private calculateSkiing(ctx: DayWeatherContext): ActivityScoreResult
  private calculateSurfing(ctx: DayWeatherContext): ActivityScoreResult
  private calculateOutdoorSightseeing(ctx: DayWeatherContext): ActivityScoreResult
  private calculateIndoorSightseeing(ctx: DayWeatherContext): ActivityScoreResult

  private weightedScore(factors: Factor[], caps: Cap[]): number
  private toRating(score: number): Rating
  private toConfidence(daysAhead: number): Confidence
}
```

Клас не робить I/O: на вході контекст, на виході результат. Тому тестується без БД і мережі.

### Правила застосовності

Оцінюємо в координатах самого міста, без бази курортів і серф-спотів. Це спрощення POC.

- Surfing: застосовний, якщо `has_marine_data = true`.
- Skiing: застосовний, якщо `elevation_m` не менше `SKI_MIN_ELEVATION_M` (300).
- Outdoor і indoor sightseeing: застосовні завжди.

### Формула

`S = min(cap, 100 × Σ wᵢ · fᵢ(xᵢ))`, де `fᵢ` це кусково-лінійна крива (1 в ідеальному діапазоні, 0 на найгіршій межі), а ваги в сумі дають 1. Показники агрегуються за світлові години (skiing, surfing, outdoor) або 09:00–18:00 за місцевим часом (indoor).

| Активність | Жорсткі обмеження | Ваги факторів |
| --- | --- | --- |
| Skiing | Сніговий покрив < 10 см: стеля 10 за будь-якої температури; покрив < 20 см і денний максимум > 3 °C: стеля 10; пориви > 70 км/год: стеля 15. Покрив береться як максимум за день, щоб урахувати сніг, що випав зранку | Глибина снігу 30, свіжий сніг 15, температура (−12…−2 °C ідеал) 20, вітер 15, видимість 10, опади 10 |
| Surfing | Хвилі < 0,3 м: стеля 10; хвилі > 4 м або пориви > 60 км/год: стеля 20 | Висота хвилі (1–2,5 м) 35, період свеллу (10 с і більше) 20, сила вітру 25, температура 10, дощ 10 |
| Outdoor | Гроза: стеля 10; відчувана температура < −10 або > 38 °C: стеля 25 | Опади 35, відчувана температура (12–25 °C) 25, сонячність 15, тривалість дня 10, вітер 10, видимість 5 |
| Indoor | Небезпечна дорога (сильний сніг, крижаний дощ, пориви > 80 км/год): мінус 20 | `60 + 40 × (1 − комфорт надворі)` |

Рейтинги: 80–100 excellent, 60–79 good, 40–59 fair, 20–39 poor, нижче 20 avoid. Довіра: дні 0–2 high, 3–4 medium, 5–7 low. Пороги й ваги лежать у `scoring.config.ts` разом з `ALGO_VERSION`.

## 8. docker compose

Ескіз, а не готовий файл.

```yaml
services:
  postgres:
    image: postgres:16
    environment: {POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: weather}
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d weather"]
      interval: 5s
      retries: 10

  redis:                             # лічильники rate limit; без volume, дані тимчасові
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  api:                               # при старті застосовує міграції (migrationsRun)
    build: .
    env_file: .env
    command: node dist/main.js
    ports: ["3000:3000"]
    depends_on:
      postgres: {condition: service_healthy}
      redis: {condition: service_healthy}
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/healthz || exit 1"]
      interval: 5s
      retries: 10

  worker:                            # стартує після api, коли міграції вже застосовані
    build: .
    env_file: .env
    command: node dist/workers/worker.js
    depends_on: {api: {condition: service_healthy}}

volumes:
  pgdata:
```

### Змінні середовища (`.env.example`)

| Змінна | За замовчуванням | Призначення |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://app:app@postgres:5432/weather` | |
| `REDIS_URL` | `redis://redis:6379` | Rate limit (лише api) |
| `PORT` | `3000` | |
| `THROTTLE_TTL_SECONDS` / `THROTTLE_LIMIT` | `60` / `60` | Rate limit за IP |
| `OPENMETEO_CALL_TIMEOUT_SECONDS` | `4` | Timeout одного виклику |
| `WORKER_POLL_INTERVAL_SECONDS` | `60` | Частота опитування БД воркером |
| `WORKER_BATCH_SIZE` | `10` | Міст за один тік |
| `WORKER_RETRY_AFTER_MINUTES` | `15` | Пауза перед повторною спробою для міста |
| `SYNC_REFRESH_AFTER_HOURS` | `24` | Дані, старші за це, оновлюються синхронно в запиті |
| `HOT_REFRESH_HOURS` / `WARM_REFRESH_HOURS` | `3` / `12` | Інтервали оновлення |
| `SKI_MIN_ELEVATION_M` | `300` | Правило застосовності skiing |

## 9. Тести

- **Unit, scoring** (`activity-scoring.service.spec.ts`): табличні кейси на кожну активність: день для лиж із глибоким снігом, відлига, штиль на пляжі, шторм, гроза, спека, пропущені дані (`null`), застосовність. Перевірка стель і рейтингів.
- **Unit, контекст і utils**: агрегація в `DayWeatherContext`, `piecewise-linear`, `normalize-name`, поділ на локальні дні (включно з днем переходу на літній час).
- **Unit, Open-Meteo client**: парсинг записаних відповідей із `test/fixtures`.
- **Unit, ранжування днів**: сортування 7 днів за оцінкою та проставлення `rank` в `ActivityRankingsService` (чиста функція, без БД), включно з однаковими оцінками (порядок за датою).
- **Unit, лижі без снігу**: морозний день без снігу отримує не більше 10.

Лише unit-тести, без БД і мережі. E2E-тестів немає: наскрізний шлях перевіряється вручну через `curl` (етапи 5 і 6).

## 10. Етапи реалізації

### Етап 0. Каркас

- [x] NestJS-застосунок у наявному репозиторії, структура папок із розділу 3, `Dockerfile`, `docker-compose.yml`, `.env.example`, `GET /healthz`.
- [x] **Перевірка:** `docker compose up --build` піднімає чотири контейнери; `curl localhost:3000/healthz` повертає 200.

### Етап 1. Моделі та міграція

- [x] Три entity в `src/models`, одна міграція, `migrationsRun` в api.
- [x] **Перевірка:** на чистій БД після старту api є три таблиці з потрібними індексами.

### Етап 2. Open-Meteo client

- [x] Geocoding, Forecast, Marine з timeout; парсинг `null`; фікстури.
- [x] **Перевірка:** unit-тести проходять без мережі; один ручний прогін проти реального API для Zakopane та прибережного міста.

### Етап 3. Scoring

- [x] `utils/`, `DayWeatherContext`, `ActivityScoringService`, конфіг ваг.
- [x] **Перевірка:** unit-тести зелені.

### Етап 4. `refreshPlace`

- [x] Fetch, upsert погоди, оцінки за 8 днів, upsert оцінок, `last_fetched_at`, advisory lock, `has_marine_data`.
- [x] **Перевірка:** повторний виклик ідемпотентний (кількість рядків не росте); якщо вручну зсунути `valid_at` і `local_date` кількох рядків у минуле, наступний виклик їх видаляє.

### Етап 5. GraphQL API

- [x] `PlacesService` (пошук, створення з `last_requested_at = now()`), `ActivityRankingsService` (потік із розділу 5), resolver, DTO, коди помилок.
- [x] Redis: throttler зі сховищем у Redis. Коментар у `ActivityRankingsService` про можливий кеш відповіді.
- [x] **Перевірка:**

```bash
curl -s -H 'content-type: application/json' \
  -d '{"query":"{ activityRankings(city: \"Zakopane\", country: \"PL\") { dataAsOf activities { activity applicable days { rank date score } } } }"}' \
  localhost:3000/graphql
```

Відповідь містить 4 активності, у застосовних по 7 днів за спаданням оцінки. Повторний запит не викликає Open-Meteo (видно в логах). Після перевищення ліміту запитів приходить HTTP 429, а в Redis видно ключі throttler.

### Етап 6. Worker

- [x] `worker.ts`, `WorkerModule`, `RefreshPoller`.
- [x] **Перевірка:** виставити `last_fetched_at` у минуле для тестового міста; протягом хвилини в логах worker видно оновлення, `last_fetched_at` змінився; місто з `last_requested_at` старшим за 7 днів не оновлюється.

### Етап 7. README

- [x] `README.md`: запуск, приклади запитів, як влаштовані зберігання й оновлення, обмеження POC і що далі.
- [x] **Перевірка:** на чистій машині `docker compose up --build` і приклад із README працюють; `npm test` зелений.

## 11. Обмеження POC (піде в README)

- Лише happy flow: немає retry, черги невдалих оновлень, метрик.
- Пошук міста за точною назвою й країною; альтернативні написання ("Kiev" / "Kyiv") кожного разу йдуть у геокодер.
- Skiing і surfing оцінюються в координатах міста, без бази курортів і серф-спотів.
- Місто, яке не запитували понад добу, перший раз відповідає повільніше (синхронне оновлення).
- Кешу відповідей немає; його можна додати в наявний Redis.
- Open-Meteo, вільний тариф: некомерційне використання, ліцензія CC-BY 4.0 з атрибуцією; глобального лічильника викликів немає.
