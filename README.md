# Dota VODs

A static, spoiler-free index for The International 2026 Group Stage Day 1.
It uses OpenDota for match, team, and hero metadata and Liquipedia for caster
and per-game VOD links.

The site deliberately omits scores, winners, durations, result-bearing titles,
and series-length indicators. Each match always renders three game controls;
when a third game is not present in OpenDota, the third control repeats game two
without labeling the fallback.

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

## Refresh the Day 1 data

```bash
npm run data:ti-day1
```

The generator caches API responses below `.cache/ti-2026/` and writes the
spoiler-safe static snapshot to `src/ti-2026-day1.json`. Set `TI_REFRESH=1` to
refresh it. It does not download, transcribe, inspect, or OCR any video.

To extend the archive with another day or tournament, follow the
[archive data guide](docs/ADDING-ARCHIVE-DATA.md). The current implementation
is intentionally single-snapshot, so the frontend needs to be generalized
before adding a second snapshot.

Liquipedia requests use the required project-specific `User-Agent` with contact
information, gzip negotiation, a reused serialized client, a minimum two-second
HTTP interval, and a minimum thirty-second interval between `action=parse`
requests. Liquipedia data is attributed under CC-BY-SA 3.0. OpenDota responses
are also cached and reduced to an explicit metadata allowlist before entering
the website.

## Sources

- [Liquipedia The International 2026 Group Stage](https://liquipedia.net/dota2/The_International/2026/Group_Stage)
- [Liquipedia API terms](https://liquipedia.net/api-terms-of-use)
- [OpenDota The International 2026 league](https://www.opendota.com/leagues/19719)

This is an independent fan project and is not affiliated with Valve,
Liquipedia, OpenDota, tournament organizers, teams, or broadcasters.
