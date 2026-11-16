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

### Or just ask Claude

Instead of writing GraphQL by hand, you can ask [Claude Code](https://claude.com/claude-code) in this repository. The project ships a skill, [`.claude/skills/activity-ranking`](.claude/skills/activity-ranking/SKILL.md), that calls the running api and explains the answer in plain words:

```text
/activity-ranking Kyiv
```

or simply "What's the best day for sightseeing in Zakopane this week?". Claude works out the country code, sends the query and replies with the best day for each activity, the other good days and any day to avoid. The api has to be running (`docker compose up --build -d`).

Unit tests: `npm ci && npm test`.

---

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
