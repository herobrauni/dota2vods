# Project Agent Notes

- The TI 2026 playoffs page must keep the Swiss-style reveal flow. Every known completed Main Event match needs an entry in `src/ti-2026-playoffs-results.json`.
- A playoff match may be clickable only when both slots are resolved and its winner is present in the result map. Revealing it must feed winner and loser slots into the next rounds.
- When adding or refreshing Main Event snapshots, update the playoff result map and add a regression test that proves the affected round unlocks.
