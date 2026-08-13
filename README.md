# Riki VODs

A static, spoiler-free Dota 2 VOD browser styled after the supplied Riki VODs
design. The archive currently contains only The International 2026 and the
Esports World Cup 2026. It uses OpenDota for match, team, and hero metadata and
Liquipedia for series formats, casters, and per-game VOD links.

The site deliberately omits scores, winners, durations, and result-bearing
titles. Each match renders the correct spoiler-safe number of game controls for
its best-of format and can be marked watched as a whole or game by game. Watch
progress is stored only in the visitor's browser under `localStorage`; it never
leaves the device.

Use the `Tournaments` navigation item to open the tournament picker. On an
event page, the progress ring counts completed matches from the selected date
only; it does not include matches from other archive days or tournaments.

## Run the site

```bash
npm install
npm run dev
```

Checks:

```bash
npm test
npm run build
```

The Vite output in `dist/` is ready for Cloudflare Pages. The repository's
GitHub Actions workflow runs the same test and build checks on every push to
`main`.

## Refresh the Day 1 data

```bash
npm run data:ti-day1
```

The generator caches API responses below `.cache/ti-2026/` and writes the
spoiler-safe static snapshot to `src/ti-2026-day1.json`. Set `TI_REFRESH=1` to
refresh it. It does not download, transcribe, inspect, or OCR any video.

Refresh the EWC Group Stage snapshot with:

```bash
npm run data:ewc-2026
```

It caches responses below `.cache/ewc-2026/` and writes twelve dated snapshots
to `src/ewc-2026.json`, covering Group Stage, Survival, and Playoffs. The
TaiLung–Abed single-player entries are intentionally omitted. Series-level
VODs are reused for each game in that series. For the broader workflow, follow
the [archive data guide](docs/ADDING-ARCHIVE-DATA.md).

Liquipedia requests use the required project-specific `User-Agent` with contact
information, gzip negotiation, a reused serialized client, a minimum two-second
HTTP interval, and a minimum thirty-second interval between `action=parse`
requests. Liquipedia data is attributed under CC-BY-SA 3.0. OpenDota responses
are also cached and reduced to an explicit metadata allowlist before entering
the website.

## Sources

- [Liquipedia The International 2026 Group Stage](https://liquipedia.net/dota2/The_International/2026/Group_Stage)
- [Liquipedia Esports World Cup 2026 Group Stage](https://liquipedia.net/dota2/Esports_World_Cup/2026/Group_Stage)
- [Liquipedia API terms](https://liquipedia.net/api-terms-of-use)
- [OpenDota The International 2026 league](https://www.opendota.com/leagues/19719)
- [OpenDota Esports World Cup 2026 league](https://www.opendota.com/leagues/19785)

This is an independent fan project and is not affiliated with Valve,
Liquipedia, OpenDota, tournament organizers, teams, or broadcasters.
