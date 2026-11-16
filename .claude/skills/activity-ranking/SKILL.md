---
name: activity-ranking
description: Rank the next 7 days for skiing, surfing, outdoor and indoor sightseeing in a city, using this project's locally running weather-activity API. Use when the user gives a city (optionally with a country) and asks what to do there, which day is best for an activity, or to "run"/"check" the activity ranking.
argument-hint: <city>[, <country code>]
allowed-tools: Bash(curl:*)
---

# Activity ranking for a city

Input: a city, optionally with a country, e.g. `Kyiv`, `Zakopane, PL`, `Biarritz FR`.
Output: a short, readable summary of the API's answer. Use only data from the response; never invent scores, dates or reasons.

## 1. Resolve the country

The API needs an ISO 3166-1 alpha-2 country code (`PL`, `UA`, `FR`, …).

- If the user gave a country (name or code), convert it to the two-letter code.
- If not, infer it only when the city is unambiguous (Kyiv → `UA`, Zakopane → `PL`).
- If the name is common to several countries (Springfield, Paris, Valencia, …), ask which country before calling the API.

Keep the city as the user wrote it; the API handles case and diacritics.

## 2. Call the API

The api listens on `http://localhost:3000` (override with `WEATHER_API_URL` if the user has it set). Send city and country as GraphQL variables, so quotes or diacritics in the name cannot break the query. Put the JSON-escaped values in place of `<CITY>` and `<CC>`:

```bash
curl -s -w '\nHTTP %{http_code}\n' -H 'content-type: application/json' --data-binary @- "${WEATHER_API_URL:-http://localhost:3000}/graphql" <<'JSON'
{"query":"query Rankings($city: String!, $country: String!) { activityRankings(city: $city, country: $country) { dataAsOf place { name country timezone } activities { activity applicable notApplicableReason days { rank date score rating confidence reasons } } } }","variables":{"city":"<CITY>","country":"<CC>"}}
JSON
```

If curl cannot connect, the api is not running. Tell the user to start it from the project root with `docker compose up --build -d`, and stop there. Do not start containers yourself.

## 3. Handle errors

Errors come back in `errors[0].extensions.code`:

| Code | What to tell the user |
| --- | --- |
| `BAD_USER_INPUT` | The message as is (empty city, more than 70 characters, or a bad country code). |
| `NOT_FOUND` | The geocoder does not know this city in that country. Suggest checking the spelling or the country. |
| `UPSTREAM_UNAVAILABLE` | Open-Meteo did not answer; try again in a minute. |
| `TOO_MANY_REQUESTS` (HTTP 429) | Rate limit hit; wait a minute. |

Do not retry automatically.

## 4. Present the result

Plain text only: no tables, no raw JSON, no codes like `GOOD` or `OUTDOOR_SIGHTSEEING`. Someone who has never seen the API must understand it. Answer in the user's language; activity names stay as plain words (Skiing, Surfing, Outdoor sightseeing, Indoor sightseeing).

Write dates as words: weekday and day with month ("Thu 19 Nov", or "чт, 19 листопада" in Ukrainian), never `2026-11-19`. Ratings in sentence case (Excellent, Good, Fair, Poor, Avoid). Reasons are short notes in the user's language ("dry day", "rain 6.2 mm"). Add "low confidence" to days 5–7 days ahead (`confidence` = `LOW`).

Structure:

1. **First line**: the place, country and when the weather was fetched (`dataAsOf` in the place's local time), e.g. "Kyiv, Ukraine. Forecast from 21:15 local time."
2. **For each applicable activity, in API order**, a short paragraph:
   - `<Activity> – the best day: <day>, <score> (<rating>). Notes: <first one or two reasons>.`
   - `Also good: <day> (<score>), <day> (<score>).` Days with a score of 60 or more besides the best one, in date order. Leave the sentence out if there are none.
   - `Worst day: <day>, <score> (<rating>): <its first reason>.` The day with the highest `rank` number, only when its score is below 40 (Poor or Avoid); a "worst" day that is still fine would only confuse.
   If every score of an activity is below 20, say so in one sentence instead (e.g. "Skiing – no good days this week: not enough snow.").
3. **Not applicable activities**, one sentence each with `notApplicableReason`, e.g. "Surfing – not available here: no marine data for this location."
4. **One sentence of advice** from the data only, e.g. "Go out on Thursday; Tuesday is rainy, a good day for museums."

Example (English):

> Kyiv, Ukraine. Forecast from 21:15 local time.
>
> Outdoor sightseeing – the best day: Thu 19 Nov, 76 (Good). Notes: dry day.
> Also good: Mon 16 Nov (65), Wed 18 Nov (64), Sat 21 Nov (65, low confidence).
> Worst day: Tue 17 Nov, 36 (Poor): rain 6.2 mm.
>
> Indoor sightseeing – the best day: Tue 17 Nov, 85 (Excellent). Notes: poor weather outside, a good day for museums.
> Also good: every other day, 69–79.
>
> Skiing – not available here: elevation 187 m is below 300 m.
> Surfing – not available here: no marine data for this location.
>
> Go out on Thursday; Tuesday is rainy, a good day for museums.

When every other day qualifies as "also good", say so briefly with the score range (as in the example) instead of listing them all.
