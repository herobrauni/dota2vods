# Adding a tournament or archive day

The site stores dated, spoiler-safe snapshots. TI Days 1 and 2 live in
`src/ti-2026-day1.json` and `src/ti-2026-day2.json`; EWC 2026 uses twelve dated snapshots inside
`src/ewc-2026.json` for Group Stage, Survival, and Playoffs. The frontend
imports all snapshots and groups them by tournament.

## Add a TI 2026 archive day

1. Confirm the day label and match list on the [Liquipedia Group Stage page](https://liquipedia.net/dota2/The_International/2026/Group_Stage).
   The parser currently filters the server-rendered API response by an exact
   date string such as `August 13, 2026`.

2. Use the generalized `parseDayPage({ html, page, date, revisionId })` parser
   in `scripts/liquipedia.mjs`; it accepts the exact Liquipedia date label.

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

6. Add the snapshot(s) to the `archives` collection in `src/vods.ts`. Update
   `getMatchesForDate`, `getTournamentDates`, and the tournament/date pages to
   filter by each snapshot's `tournament.id` and `date`. Match IDs should use a
   unique tournament/date prefix.

7. Add tests proving that each new date is independently addressable and that
   searching one day cannot show matches from another day.

## EWC 2026

The EWC generator is available as `npm run data:ewc-2026`. It reads the
Liquipedia overview and Group Stage pages, joins Group Stage, Survival, and
Playoffs to OpenDota league `19785`, and writes `src/ewc-2026.json`. The
single-player TaiLung–Abed entries are omitted. When Liquipedia provides one
series VOD for multiple games, the generator reuses that link for each game.

## Automated hourly publishing

`scripts/watch-ti.mjs` runs hourly via a Hermes no-agent cron job. Each run it
fetches the Liquipedia Group Stage page (one `action=parse`) and the OpenDota
league match list, and fingerprints: publishable day dates, every VOD link,
and every league match ID. If the fingerprint is unchanged it prints nothing
(no message, no commit, no Cloudflare deploy). Otherwise it regenerates all
publishable day snapshots (`src/ti-2026-dayN.json`, N = tournament day index),
reverts files whose only change is `generatedAt`, gates on `npm test` +
`npm run build`, and commits + pushes to `main`.

Because `src/vods.ts` discovers `ti-2026-day*.json` via `import.meta.glob`, a
new day file appears on the site without code changes; the test suite derives
its TI expectations from the same snapshots.

Scope: the Group Stage page only. The Main Event bracket page needs a bracket
parser (see `parseBracketStages`) and manual wiring when the stage begins.

Env flags: `TI_WATCH_DRY_RUN=1` (no commit/push), `TI_WATCH_FORCE=1`
(regenerate despite an unchanged fingerprint). State lives in
`.cache/ti-watch/` (fingerprint + last parse).

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

Every played game must have ten hero picks, and every match must render the
number of controls specified by its best-of format. A game that was not played
is padded out by the existing concealed fallback: it carries no VOD link, no
match id, and empty hero arrays — cloning a sibling game's picks or VOD would
leak its draft and video. It must not expose a score or winner.

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
