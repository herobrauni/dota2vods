# Dota VODs

A local, spoiler-free Dota 2 VOD index. It links directly to the start of each game on the official [`@dota2`](https://www.youtube.com/@dota2) YouTube channel and always renders three game choices for a best-of-three.

## Archive navigation

The archive deliberately reveals information in three steps:

1. `/` lists tournaments without team names or games.
2. `/tournaments/the-international-2026` lists available dates for TI 2026 without team names or games.
3. `/tournaments/the-international-2026/YYYY-MM-DD` loads broadcasts from that exact date only.

Each VOD has a `tournamentId` and ISO `date` in `src/vods.ts`. Adding another date automatically adds it to the TI 2026 date picker; it does not add that day's games to any other date page.

## Run the site

```bash
npm install
npm run dev
```

Production check:

```bash
npm test
npm run build
```

## Deploy with Cloudflare Pages

This is a static Vite/React site and does not require a server. Connect this
repository to Cloudflare Pages with the following build settings:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION=22`

Cloudflare Pages will build and deploy every push to `main`, and create preview
deployments for pull requests. The repository also includes a GitHub Actions
workflow that runs `npm ci`, `npm test`, and `npm run build` on pushes and pull
requests. Cloudflare's Pages SPA behavior serves `index.html` for this site's
client-side routes, so direct links to tournament and date pages work too.

The site uses static Pages assets only: it has no Pages Functions, Worker, D1,
KV, or other paid runtime component.

## Ingestion workflow

The initial data in `src/vods.ts` was verified against frames from `VaZpuoMhjmg`, and the same process was used for the other completed English broadcasts. One broadcast VOD can contain several series, so the current YouTube title is never treated as the full schedule. An actively live broadcast is not published until it ends and every included game can be verified.

The reusable workflow uses OpenDota for discovery, then the HUD and transcript for alignment:

1. Validate the official English YouTube broadcast and read its absolute start/end timestamps.
2. Match the title to an OpenDota league, then fetch the league's matches, teams, and hero constants. Group matches by `series_id`; retain only spoiler-safe IDs, team metadata, draft picks, and timestamps.
3. Use each OpenDota `start_time` to create a short HUD-search window. It is a lobby/draft-era time, not the gameplay start—in the initial VOD, the first stable HUD appeared about 14–17 minutes later.
4. Review top-center HUD frames in that window. The valid pregame clock ranges from `-1:30` to `0:00`; link the first stable live HUD, not only the horn. Accept it only when the same teams persist and the game clock advances roughly with VOD elapsed time. Flat intervals are permitted for pauses; isolated or discontinuous HUD appearances are treated as replays.
5. Use local Whisper (`base.en`, CPU/int8) on the full VOD or only ambiguous windows. Caster phrases and AI-assisted frame reading are supporting evidence, not automatic publication authority.

Requirements: `ffmpeg`, Node 22+, Python 3.10+, and the Python packages below.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run ingest -- 'https://www.youtube.com/watch?v=VaZpuoMhjmg'
```

Raw transcripts are written below `.cache/` and are intentionally excluded from source control. Candidate output is evidence for review, not automatically published data.

OpenDota candidate metadata is written first to `.cache/<video-id>/opendota.candidates.json`, including series/game IDs, draft timestamps, picked heroes/icons, and suggested HUD-search windows. Once a game is verified, the site offers separate **Draft** and **Game** links. Search matches both team and hero names; each draft groups two labeled rows of five hero icons, with accessible names/tooltips. If automatic title matching is ambiguous, set `OPENDOTA_LEAGUE_ID`, for example:

```bash
OPENDOTA_LEAGUE_ID=19719 npm run ingest -- 'https://www.youtube.com/watch?v=VaZpuoMhjmg' --validate-only
```

The report is reused on subsequent runs. Set `OPENDOTA_REFRESH=1` to refresh it. The free API is sufficient for this workflow with that cache: the observed response headers allowed 60 requests per minute and 3,000 per day; treat those as current service limits rather than hard-coded assumptions.

URL ingestion rejects videos outside the official `@dota2` channel and titles not marked `[EN]`/`[EN-*]`. A local audio path is also accepted for benchmarking and manual recovery.

### Local benchmark

On an 8-core Ryzen 7 5825U with no discrete GPU, a representative 10-minute segment took 20.45 seconds with `base.en` (about 30× real time). The full 11.5-hour VOD should take roughly 23 minutes after download. `small.en` took 54.36 seconds on the same clip and did not improve the difficult team-name recognition, so `base.en` is the default. The transcript found the opening-game call at 02:10:46; frame analysis found the first stable HUD at 02:10:10 with the game clock at approximately `-0:10`.

## Spoiler policy

- Never display scores, winners, series lengths, game durations, comments, or YouTube titles that may contain standings/results.
- Always display three identical game controls for a best-of-three. Each control offers both a draft timestamp and a verified gameplay timestamp.
- If game three was not played, its concealed fallback repeats game two rather than linking into the next matchup. The listing therefore does not reveal whether a deciding game exists.
- Concealed fallbacks also repeat game two's draft timestamp and heroes, so hero browsing cannot reveal the missing game.
- Team names and series order are cross-checked between OpenDota and in-broadcast draft/HUD evidence, never inferred only from a mutable stream title.
- OpenDota responses contain winners and scores. The ingestion report deliberately whitelists metadata fields and drops all result-bearing fields before anything can reach the site.
