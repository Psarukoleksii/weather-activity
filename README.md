# Weather Activity Ranking (POC)

Сервіс приймає місто й країну та для кожної з чотирьох активностей (skiing, surfing, outdoor sightseeing, indoor sightseeing) ранжує найближчі 7 днів за оцінкою 0–100. Погоду бере з [Open-Meteo](https://open-meteo.com/), зберігає в Postgres і не ходить до Open-Meteo на кожен запит.

Стек: Node 22, NestJS 11, GraphQL (code-first, Apollo), TypeORM + Postgres 16, Redis (rate limit), Jest.

## Запуск

```bash
docker compose up --build
```

Піднімаються чотири контейнери: `postgres`, `redis`, `api` (порт 3000, при старті застосовує міграції) і `worker` (стартує, коли `api` healthy). Змінні середовища беруться з `.env.example`; щоб їх перевизначити, створіть `.env` (він читається поверх).

```bash
curl localhost:3000/healthz
# {"status":"ok"}
```

### Локально, без Docker для застосунку

Потрібні Postgres і Redis, доступні з хоста (compose їх назовні не відкриває). За замовчуванням застосунок шукає їх на `localhost:5432` і `localhost:6379`.

```bash
npm ci && npm run build
npm run start:api      # в іншому терміналі: npm run start:worker
```

### Міграції

Міграції лежать у `src/migrations` і не імпортуються в код: TypeORM підхоплює їх за шляхом (`src/libs/typeorm`). `api` застосовує їх при старті; вручну:

```bash
npm run migration:show
```

```bash
npm run migration:run
```

```bash
npm run migration:create -- src/migrations/add-something
```

### Тести

```bash
npm test
```

Лише unit-тести, без БД і мережі: scoring, `DayWeatherContext`, utils (включно з днями переходу на літній час), парсинг записаних відповідей Open-Meteo з `test/fixtures`, ранжування днів.

## API

`POST /graphql`, один query:

```graphql
activityRankings(city: String!, country: String!): ActivityRankingsResult!
```

`country` це ISO 3166-1 alpha-2 (`PL`, `FR`, …).

```bash
curl -s -H 'content-type: application/json' \
  -d '{"query":"{ activityRankings(city: \"Zakopane\", country: \"PL\") { dataAsOf place { name country timezone } activities { activity applicable notApplicableReason days { rank date score rating confidence reasons } } } }"}' \
  localhost:3000/graphql
```

Фрагмент відповіді:

```json
{
  "data": {
    "activityRankings": {
      "dataAsOf": "2026-11-16T17:03:33.561Z",
      "place": { "name": "Biarritz", "country": "FR", "timezone": "Europe/Paris" },
      "activities": [
        { "activity": "SKIING", "applicable": false, "notApplicableReason": "Elevation 39 m is below 300 m", "days": [] },
        {
          "activity": "SURFING",
          "applicable": true,
          "notApplicableReason": null,
          "days": [
            { "rank": 1, "date": "2026-11-21", "score": 93, "rating": "EXCELLENT", "confidence": "LOW", "reasons": ["Good waves 1.9 m", "Light wind"] },
            { "rank": 2, "date": "2026-11-16", "score": 90, "rating": "EXCELLENT", "confidence": "HIGH", "reasons": ["Good waves 2.1 m", "Light wind"] }
          ]
        }
      ]
    }
  }
}
```

- `activities` завжди містить 4 активності; у застосовних 7 днів від найкращого до найгіршого (`rank` 1 = найкращий; при однаковій оцінці вище ближчий день).
- `date` це локальна дата в часовому поясі міста; `dataAsOf` це час останнього оновлення погоди.
- Рейтинги: 80–100 `EXCELLENT`, 60–79 `GOOD`, 40–59 `FAIR`, 20–39 `POOR`, нижче `AVOID`. Довіра: дні 0–2 `HIGH`, 3–4 `MEDIUM`, 5–7 `LOW`.

### Помилки

| `extensions.code` | Коли |
| --- | --- |
| `BAD_USER_INPUT` | Порожнє місто або країна не з двох літер |
| `NOT_FOUND` | Геокодер не знайшов місто в цій країні |
| `UPSTREAM_UNAVAILABLE` | Open-Meteo не відповів (timeout `OPENMETEO_CALL_TIMEOUT_SECONDS`) або повернув помилку |
| `TOO_MANY_REQUESTS` | Перевищено rate limit (`THROTTLE_LIMIT` запитів за `THROTTLE_TTL_SECONDS` з одного IP); HTTP-статус 429, заголовок `Retry-After` |

## Як влаштовано

```
 Client ──POST /graphql──▶ api (resolver → services) ──▶ Postgres (places, weather_hourly, activity_scores)
                                │ нове або застаріле місто                 ▲
                                ▼                                          │ upsert
                           Open-Meteo ◀──── worker (раз на хвилину) ───────┘
```

### Зберігання

Підключення до БД зібране в `src/libs/typeorm`: `TypeOrmConfigPgFactory` будує опції (SSL, пул, `maxQueryExecutionTime`, шлях до міграцій) для Nest (`DatabaseModule.forRoot()`) і для CLI (`data-source.ts`). Entity успадковують `BaseEntity` (Active Record): `Place.findOneBy(...)`, `ActivityScore.find(...)` без репозиторіїв. Транзакційний шлях оновлення працює через `EntityManager` транзакції.

- `places`: місто з геокодера (`geoname_id` унікальний), координати, висота, часовий пояс, `has_marine_data`, а також `last_requested_at` / `last_fetched_at` / `last_attempt_at`, які керують оновленням. Окремої черги немає: чергою є ця таблиця.
- `weather_hourly`: погодинна погода на 8 днів (~192 рядки на місто), PK `(place_id, valid_at)` у UTC. `null` від Open-Meteo зберігається як `NULL` («невідомо», а не нуль).
- `activity_scores`: оцінки на кожен з 8 локальних днів × 4 активності, з причинами (`reasons`) і розкладкою факторів (`components`). Це похідні дані; ранг не зберігається, бо залежить від того, який день сьогодні.

### Потік запиту

1. Rate limit за IP (лічильники в Redis, спільні для реплік api), валідація аргументів.
2. Пошук міста за нормалізованою назвою (нижній регістр, без діакритики) і країною. Якщо міста немає, геокодування та вставка з `last_requested_at = now()`.
3. `last_requested_at` оновлюється не частіше ніж раз на 10 хв.
4. Якщо погоди ще немає або вона старша за `SYNC_REFRESH_AFTER_HOURS` (24 год), оновлення синхронно в запиті.
5. Читання 7 днів оцінок від сьогодні (у часовому поясі міста), сортування й ранги.

Першого запиту для нового міста чекаємо геокодер + прогноз (~0,3–0,5 с); далі відповідь іде з Postgres за кілька мілісекунд.

### Оновлення

`ForecastRefreshService.refreshPlace()` це єдиний шлях оновлення для api і worker: транзакція з `pg_advisory_xact_lock(place_id)` → Forecast API (+ Marine API, якщо в місця є море) → upsert `weather_hourly` → видалення минулих рядків → оцінки 8 днів → upsert `activity_scores` → `last_fetched_at`. Перший виклик Marine API з усіма `null` позначає місто `has_marine_data = false`, і цей виклик більше не робиться.

Worker раз на `WORKER_POLL_INTERVAL_SECONDS` вибирає до `WORKER_BATCH_SIZE` міст, які запитували за останні 7 днів і дані яких старші за 3 год (гарячі: запит за останню добу) або 12 год (теплі). Перед оновленням ставить `last_attempt_at`, тож місто, яке падає, повторюється не частіше ніж раз на `WORKER_RETRY_AFTER_MINUTES` і не займає чергу. Місто, яке вже оновлює інший процес, пропускається (`pg_try_advisory_xact_lock`). Міста без запитів 7 днів не оновлюються.

### Scoring

`ActivityScoringService` (без I/O) отримує `DayWeatherContext` (погода одного локального дня) і рахує `S = min(стеля, 100 × Σ wᵢ · fᵢ(xᵢ))`, де `fᵢ` це кусково-лінійні криві. Якщо значення фактора невідоме, ваги решти факторів перенормовуються, а в `reasons` з'являється `Missing data: …`. Ваги, криві, стелі та `ALGO_VERSION` лежать у [`scoring.config.ts`](src/modules/scoring/scoring.config.ts).

| Активність | Застосовна | Стелі | Фактори |
| --- | --- | --- | --- |
| Skiing | висота ≥ `SKI_MIN_ELEVATION_M` (300 м) | покрив < 10 см → 10; покрив < 20 см і максимум > 3 °C → 10; пориви > 70 км/год → 15 | глибина снігу 30, свіжий сніг 15, температура 20, вітер 15, видимість 10, опади 10 |
| Surfing | є морські дані | хвилі < 0,3 м → 10; хвилі > 4 м або пориви > 60 км/год → 20 | висота хвилі 35, період свеллу 20, вітер 25, температура води 10, дощ 10 |
| Outdoor | завжди | гроза → 10; відчувана < −10 або > 38 °C → 25 | опади 35, відчувана температура 25, сонячність 15, тривалість дня 10, вітер 10, видимість 5 |
| Indoor | завжди | небезпечна дорога (сильний сніг, крижаний дощ, пориви > 80 км/год) → −20 | `60 + 40 × (1 − комфорт надворі)` |

Skiing, surfing і outdoor рахуються за світлові години, indoor за 09:00–18:00 місцевого часу.

## Змінні середовища

Див. [`.env.example`](.env.example).

Конфіг збирається в `src/environment`: на кожну секцію є фабрика (`environment-pg.factory.ts`, `environment-refresh.factory.ts`, …), а тип секції лежить біля модуля, який її читає (`DbConfigType` у `libs/typeorm`, `RefreshConfigType` у `forecast-refresh`). `environment-api.factory.ts` і `environment-worker.factory.ts` збирають набір секцій кожного застосунку (`ApiConfigType` / `WorkerConfigType`): worker не отримує HTTP, Redis і rate limit. Невалідне значення (наприклад, `WORKER_BATCH_SIZE=0`) зупиняє старт із повідомленням про змінну.

| Змінна | За замовчуванням | Призначення |
| --- | --- | --- |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `postgres` / `5432` / `weather` / `app` / `app` | Підключення до Postgres (поза Docker за замовчуванням `localhost`) |
| `DB_POOL_SIZE` | `10` | Розмір пулу з'єднань |
| `DB_LOGGING` | `error,warn,migration` | `true`, `false`, `all` або рівні TypeORM через кому |
| `DB_MAX_QUERY_EXECUTION_TIME_MS` | `500` | Запити, довші за це, логуються як повільні |
| `DB_SSL` | `false` | TLS до Postgres |
| `DB_SSL_CA` / `DB_SSL_CERT` / `DB_SSL_KEY` | порожньо | Шляхи до PEM-файлів (від робочої директорії); без них використовуються системні CA |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Перевіряти сертифікат сервера |
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

## Обмеження POC

- Лише happy flow: немає retry, черги невдалих оновлень, метрик.
- Пошук міста за точною назвою й країною; альтернативні написання ("Kiev" / "Kyiv") кожного разу йдуть у геокодер (потрапляють на той самий рядок через `geoname_id`).
- Skiing і surfing оцінюються в координатах міста, без бази курортів і серф-спотів.
- Місто, яке не запитували понад добу, перший раз відповідає повільніше (синхронне оновлення).
- Кешу відповідей немає: запит і так дешевий. Готову відповідь можна кешувати в наявному Redis (ключ `rankings:{country}:{name_normalized}`, TTL кілька хвилин).
- Open-Meteo, вільний тариф: некомерційне використання, ліцензія CC-BY 4.0 з атрибуцією; глобального лічильника викликів немає.

## Що далі

- Кеш відповідей у Redis і метрики (час відповіді, виклики Open-Meteo, черга воркера).
- Retry з backoff для Open-Meteo; окремий стан для міст, що постійно падають.
- База курортів і серф-спотів поруч із містом замість координат самого міста.
- E2E-тести з Testcontainers.

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
