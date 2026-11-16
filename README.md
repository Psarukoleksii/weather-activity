# Weather Activity Ranking (POC)

Given a city and a country, the service ranks the next 7 days on a 0–100 scale for four activities: skiing, surfing, outdoor sightseeing and indoor sightseeing. It exposes one GraphQL query, `activityRankings(city, country)`.

Weather comes from [Open-Meteo](https://open-meteo.com/) and is stored in Postgres, so the API answers from the database instead of calling Open-Meteo on every request; a separate worker keeps recently requested cities fresh in the background.

Stack: Node 22, NestJS, GraphQL (Apollo), TypeORM + Postgres, Redis, Jest.

## Run locally

Requires Docker.

```bash
docker compose up --build
```

This starts `postgres`, `redis`, `api` (http://localhost:3000, applies migrations on start) and `worker`. Settings come from `.env.example`; put overrides in a `.env` file.

Try it:

```bash
curl -s -H 'content-type: application/json' \
  -d '{"query":"{ activityRankings(city: \"Zakopane\", country: \"PL\") { place { name timezone } activities { activity applicable days { rank date score rating } } } }"}' \
  localhost:3000/graphql
```

Unit tests: `npm ci && npm test`.

---

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
