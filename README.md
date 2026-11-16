# Weather Activity Ranking (POC)

Given a city and a country, the service ranks the next 7 days on a 0–100 scale for each of four activities: skiing, surfing, outdoor sightseeing and indoor sightseeing. Weather comes from [Open-Meteo](https://open-meteo.com/) and is stored in Postgres, so Open-Meteo is not called on every request.

Stack: Node 22, NestJS 11, GraphQL (code-first, Apollo), TypeORM + Postgres 16, Redis (rate limit), Jest.

## Running

```bash
docker compose up --build
```

This starts four containers: `postgres`, `redis`, `api` (port 3000, applies migrations on start) and `worker` (starts once `api` is healthy). Environment variables are read from `.env.example`; to override them, create a `.env` file, which is read on top.

```bash
curl localhost:3000/healthz
# {"status":"ok"}
```

### Locally, without Docker for the app

Postgres and Redis must be reachable from the host (compose does not expose them). By default the app looks for them at `localhost:5432` and `localhost:6379`.

```bash
npm ci && npm run build
npm run start:api      # in another terminal: npm run start:worker
```

### Migrations

Migrations live in `src/migrations` and are not imported by the code: TypeORM loads them by path (`src/libs/typeorm`). The `api` applies them on start; to run them by hand:

```bash
npm run migration:show
```

```bash
npm run migration:run
```

```bash
npm run migration:create -- src/migrations/add-something
```

### Recomputing scores

Scores are derived from `weather_hourly`, so they can be recomputed without calling Open-Meteo, for example after changing weights or curves and bumping `ALGO_VERSION` in `scoring.config.ts`:

```bash
docker compose exec worker node dist/commands/recompute-scores/recompute-scores.command.js
```

By default it recomputes only places whose scores were made by another `ALGO_VERSION`; add `--all` to recompute every place. `last_fetched_at` is not touched (the weather is as old as it was). Locally: `npm run scores:recompute`.

### Tests

```bash
npm test
```

Unit tests only, with no database or network: scoring, `DayWeatherContext`, utils (including daylight saving time transitions), parsing of recorded Open-Meteo responses from `test/fixtures`, day ranking, configuration and worker shutdown.

## API

`POST /graphql`, a single query:

```graphql
activityRankings(city: String!, country: String!): ActivityRankingsResult!
```

`country` is an ISO 3166-1 alpha-2 code (`PL`, `FR`, …).

```bash
curl -s -H 'content-type: application/json' \
  -d '{"query":"{ activityRankings(city: \"Zakopane\", country: \"PL\") { dataAsOf place { name country timezone } activities { activity applicable notApplicableReason days { rank date score rating confidence reasons } } } }"}' \
  localhost:3000/graphql
```

Response excerpt:

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

- `activities` always holds all 4 activities; applicable ones have 7 days from best to worst (`rank` 1 is the best; on equal scores the nearer day ranks higher).
- `date` is the local date in the city's time zone; `dataAsOf` is when the weather was last fetched.
- Ratings: 80–100 `EXCELLENT`, 60–79 `GOOD`, 40–59 `FAIR`, 20–39 `POOR`, below that `AVOID`. Confidence: days 0–2 `HIGH`, 3–4 `MEDIUM`, 5–7 `LOW`.

### Errors

| `extensions.code` | When |
| --- | --- |
| `BAD_USER_INPUT` | Empty city, a city longer than 70 characters, or the country is not two letters |
| `NOT_FOUND` | The geocoder found no such city in that country (remembered in Redis for `GEOCODE_NOT_FOUND_TTL_SECONDS`) |
| `UPSTREAM_UNAVAILABLE` | Open-Meteo did not answer (timeout `OPENMETEO_CALL_TIMEOUT_SECONDS`) or returned an error |
| `TOO_MANY_REQUESTS` | Rate limit exceeded (`THROTTLE_LIMIT` requests per `THROTTLE_TTL_SECONDS` from one IP); HTTP status 429 with a `Retry-After` header |

## How it works

```
 Client ──POST /graphql──▶ api (resolver → services) ──▶ Postgres (places, weather_hourly, activity_scores)
                                │ new or stale place                       ▲
                                ▼                                          │ upsert
                           Open-Meteo ◀──── worker (every minute) ─────────┘
```

### Storage

The database connection lives in `src/libs/typeorm`: `TypeOrmConfigPgFactory` builds the options (SSL, pool, `maxQueryExecutionTime`, migrations path) for Nest (`DatabaseModule.forRoot()`) and for the CLI (`data-source.ts`). Entities extend `BaseEntity` (Active Record): `Place.findOneBy(...)`, `ActivityScore.find(...)` without repositories. The transactional refresh path goes through the transaction's `EntityManager`.

The other infrastructure modules follow the same shape (a config factory plus a module that `AppModule` just imports): `src/libs/throttler` (`AppThrottlerModule`: Redis-backed rate limit and the global `GqlThrottlerGuard`), `src/libs/graphql` (`AppGraphQLModule`: code-first Apollo setup and the filter that passes expected `GraphQLError`s through) and `src/libs/redis` (`RedisModule`: the one ioredis client of the api, shared by the rate limit and the geocoding negative cache).

- `places`: a city from the geocoder (`geoname_id` is unique), coordinates, elevation, time zone, `has_marine_data`, plus `last_requested_at` / `last_fetched_at` / `last_attempt_at`, which drive refreshing. There is no separate queue: this table is the queue.
- `weather_hourly`: hourly weather for 8 days (~192 rows per city), PK `(place_id, valid_at)` in UTC. A `null` from Open-Meteo is stored as `NULL` ("unknown", not zero).
- `activity_scores`: scores for each of 8 local days × 4 activities, with `reasons` and a breakdown of factors (`components`). This is derived data: both a refresh and the recompute command score from `weather_hourly` (see [Recomputing scores](#recomputing-scores)). The rank is not stored because it depends on which day is today.

### Request flow

1. Per-IP rate limit (counters in Redis, shared by api replicas) and argument validation.
2. Look up the city by normalized name (lower case, no diacritics) and country. If it is not there, geocode it and insert it with `last_requested_at = now()`. A city the geocoder does not know is remembered in Redis for `GEOCODE_NOT_FOUND_TTL_SECONDS` (1 h), so repeating it does not call Open-Meteo again; if Redis is unavailable the request just goes to the geocoder.
3. `last_requested_at` is updated at most once every 10 minutes.
4. If there is no weather yet, or it is older than `SYNC_REFRESH_AFTER_HOURS` (24 h), refresh synchronously inside the request.
5. Read 7 days of scores starting today (in the city's time zone), sort them and assign ranks.

The first request for a new city waits for the geocoder and the forecast (~0.3–0.5 s); after that the answer comes from Postgres in a few milliseconds.

### Refreshing

`ForecastRefreshService.refreshPlace()` is the single refresh path for both the api and the worker: a transaction with `pg_advisory_xact_lock(place_id)` → Forecast API (+ Marine API if the place has a sea) → upsert `weather_hourly` → delete past rows → score 8 days from `weather_hourly` → upsert `activity_scores` → `last_fetched_at`. A first Marine API call that returns only `null` marks the place `has_marine_data = false`, and that call is never made for it again.

Every `WORKER_POLL_INTERVAL_SECONDS` the worker picks up to `WORKER_BATCH_SIZE` cities requested within the last 7 days whose data is older than 3 h (hot: requested within the last day) or 12 h (warm). It sets `last_attempt_at` before refreshing, so a failing city is retried no more often than every `WORKER_RETRY_AFTER_MINUTES` and does not block the queue. A city another process is already refreshing is skipped (`pg_try_advisory_xact_lock`). Cities with no requests for 7 days are not refreshed. On shutdown the worker finishes the city it is refreshing before closing the database connection.

### Scoring

`ActivityScoringService` (no I/O) takes a `DayWeatherContext` (the weather of one local day) and computes `S = min(cap, 100 × Σ wᵢ · fᵢ(xᵢ))`, where `fᵢ` are piecewise-linear curves. If a factor's value is unknown, the weights of the remaining factors are renormalized and `reasons` gets a `Missing data: …` entry. Weights, curves, caps and `ALGO_VERSION` are in [`scoring.config.ts`](src/modules/scoring/scoring.config.ts).

| Activity | Applicable | Caps | Factors (weights) |
| --- | --- | --- | --- |
| Skiing | elevation ≥ `SKI_MIN_ELEVATION_M` (300 m) | snow < 10 cm → 10; snow < 20 cm and daily max > 3 °C → 10; gusts > 70 km/h → 15 | snow depth 30, fresh snow 15, temperature 20, wind 15, visibility 10, precipitation 10 |
| Surfing | marine data available | waves < 0.3 m → 10; waves > 4 m or gusts > 60 km/h → 20 | wave height 35, swell period 20, wind 25, water temperature 10, rain 10 |
| Outdoor | always | thunderstorm → 10; feels-like < −10 or > 38 °C → 25 | precipitation 35, feels-like temperature 25, sunshine 15, day length 10, wind 10, visibility 5 |
| Indoor | always | dangerous roads (heavy snow, freezing rain, gusts > 80 km/h) → −20 | `60 + 40 × (1 − outdoor comfort)` |

Skiing, surfing and outdoor are scored over daylight hours, indoor over 09:00–18:00 local time.

## Environment variables

See [`.env.example`](.env.example).

Configuration is assembled in `src/environment`: each section has a factory (`environment-pg.factory.ts`, `environment-refresh.factory.ts`, …), and each section's type lives next to the module that reads it (`DbConfigType` in `libs/typeorm`, `RefreshConfigType` in `forecast-refresh`). `environment-api.factory.ts` and `environment-worker.factory.ts` assemble the sections of each app (`ApiConfigType` / `WorkerConfigType`): the worker gets no HTTP, Redis or rate limit settings. An invalid value (for example `WORKER_BATCH_SIZE=0`) stops startup with a message naming the variable.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `postgres` / `5432` / `weather` / `app` / `app` | Postgres connection (outside Docker the host defaults to `localhost`) |
| `DB_POOL_SIZE` | `10` | Connection pool size |
| `DB_LOGGING` | `error,warn,migration` | `true`, `false`, `all` or comma-separated TypeORM log levels |
| `DB_MAX_QUERY_EXECUTION_TIME_MS` | `500` | Queries slower than this are logged as slow |
| `DB_SSL` | `false` | TLS to Postgres |
| `DB_SSL_CA` / `DB_SSL_CERT` / `DB_SSL_KEY` | empty | Paths to PEM files (relative to the working directory); without them the system CAs are used |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Verify the server certificate |
| `REDIS_URL` | `redis://redis:6379` | Rate limit (api only) |
| `PORT` | `3000` | |
| `THROTTLE_TTL_SECONDS` / `THROTTLE_LIMIT` | `60` / `60` | Per-IP rate limit |
| `OPENMETEO_CALL_TIMEOUT_SECONDS` | `4` | Timeout of a single call |
| `WORKER_POLL_INTERVAL_SECONDS` | `60` | How often the worker polls the database |
| `WORKER_BATCH_SIZE` | `10` | Cities per tick |
| `WORKER_RETRY_AFTER_MINUTES` | `15` | Pause before retrying a city |
| `SYNC_REFRESH_AFTER_HOURS` | `24` | Older data is refreshed synchronously inside the request |
| `HOT_REFRESH_HOURS` / `WARM_REFRESH_HOURS` | `3` / `12` | Refresh intervals |
| `SKI_MIN_ELEVATION_M` | `300` | Skiing applicability rule |
| `GEOCODE_NOT_FOUND_TTL_SECONDS` | `3600` | How long an unknown city is remembered (api only) |

## POC limitations

- Happy path only: no retries, no queue of failed refreshes, no metrics.
- Cities are looked up by exact name and country; alternative spellings ("Kiev" / "Kyiv") go to the geocoder every time (and land on the same row via `geoname_id`).
- Skiing and surfing are scored at the city's own coordinates, without a database of resorts or surf spots.
- A city not requested for over a day answers more slowly the first time (synchronous refresh).
- There is no response cache: the query is already cheap. The finished response could be cached in the existing Redis (key `rankings:{country}:{name_normalized}`, TTL of a few minutes).
- Open-Meteo free tier: non-commercial use, CC BY 4.0 license with attribution; there is no global call counter.

## Next steps

- Response cache in Redis and metrics (response time, Open-Meteo calls, worker queue).
- Retries with backoff for Open-Meteo; a separate state for cities that keep failing.
- A database of resorts and surf spots near the city instead of the city's own coordinates.
- E2E tests with Testcontainers.

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
