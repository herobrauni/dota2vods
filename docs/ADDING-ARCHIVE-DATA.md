# Adding a tournament or archive day

The current site is deliberately scoped to one static snapshot:
`src/ti-2026-day1.json`. The fetcher and frontend have a few Day 1-specific
constants, so adding another day or tournament is a small implementation task,
not only a new data file.

## Add TI 2026 Day 2

1. Confirm the day label and match list on the [Liquipedia Group Stage page](https://liquipedia.net/dota2/The_International/2026/Group_Stage).
   The parser currently filters the server-rendered API response by an exact
   date string such as `August 13, 2026`.

2. Generalize `parseDayOnePage` in `scripts/liquipedia.mjs` to
   `parseDayPage({ html, page, date, revisionId })`, removing the hard-coded
   `DAY_ONE_DATE` constant.

3. Parameterize `scripts/fetch-ti-day1.mjs` with a config object. For Day 2,
   keep the OpenDota league ID `19719`, but use a separate identity and cache:

   ```js
   {
     id: "ti-2026-day2",
     date: "2026-08-14",
     liquipediaDate: "August 14, 2026",
     output: "src/ti-2026-day2.json",
     cache: ".cache/ti-2026-day2"
   }
   ```

   Verify the actual date before running it. Do not overwrite the Day 1 JSON or
   cache.

4. Add a package script, for example:

   ```json
   "data:ti-day2": "node scripts/fetch-ti-day2.mjs"
   ```

   A shared parameterized fetcher is preferable to permanently copying the
   script.

5. Generate the snapshot:

   ```bash
   npm run data:ti-day2
   ```

   To intentionally fetch fresh data, use `TI_REFRESH=1`. The generator still
   caches all responses and uses the same request pacing.

6. Change the frontend data model from the single `archive` object to a
   collection of archives. Add both snapshots to that collection and update
   `getMatchesForDate`, `getTournamentDates`, and the tournament/date pages to
   filter by each snapshot's `tournament.id` and `date`. The current helpers
   explicitly reference `archive.tournament.id`, `archive.date`, and the
   `ti-2026-day1-` match ID prefix.

7. Add tests proving that Day 1 and Day 2 are independently addressable and
   that searching one day cannot show matches from the other day.

## Add a different tournament

Use the same sequence, with these additional inputs:

- the Liquipedia Dota 2 page name and exact date label;
- the OpenDota league ID and league URL;
- a unique tournament ID and URL slug;
- a dedicated output file and cache directory; and
- any team-name aliases needed to join Liquipedia names to OpenDota names.

The join is by the unordered team pair and then OpenDota `series_id`. If a
tournament's Liquipedia markup differs, adjust the parser against the cached
`action=parse` response rather than fetching the public HTML page directly.
If OpenDota does not contain the league or its match details, stop and document
the missing source instead of adding a video-parsing fallback.

## Data and spoiler-safety checklist

Every generated game must have ten hero picks, and every match must render
three game controls. A missing third OpenDota game is represented by the
existing concealed fallback behavior; it must not expose a score or winner.

Before committing a new snapshot, check its shape and forbidden fields:

```bash
jq '{matches: (.matches | length), games: ([.matches[].games[]] | length), casters: ([.matches[].casters[]] | unique | length)}' src/ti-2026-day2.json
rg -n 'radiant_win|dire_score|radiant_score|winner|duration|score' src/ti-2026-day2.json
npm test
npm run build
```

The second command should return no matches. Keep result-bearing fields out of
the generated allowlist even if they are available from OpenDota.

## Liquipedia request rules

Use the existing `LiquipediaClient`; do not add a separate HTTP client or call
Liquipedia's normal page HTML. It must continue to:

- send the project-specific `User-Agent` with a contact address;
- negotiate gzip;
- reuse a serialized client and wait at least two seconds between all API
  requests;
- wait at least thirty seconds between `action=parse` requests; and
- reuse cached responses whenever possible.

The full rules are in the [Liquipedia API Terms of Use](https://liquipedia.net/api-terms-of-use).
Keep the required Liquipedia CC-BY-SA 3.0 attribution in the site footer and
the generated source metadata.
