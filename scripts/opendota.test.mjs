import { describe, expect, it } from "vitest";
import { buildCandidateReport, findLeagueForTitle } from "./opendota.mjs";

describe("OpenDota candidate enrichment", () => {
  it("ignores league names that normalize to an empty Latin string", () => {
    const leagues = [
      { leagueid: 1, name: "Соревнования", tier: "professional" },
      { leagueid: 19719, name: "The International 2026", tier: "premium" },
    ];
    expect(findLeagueForTitle(leagues, "[EN-B] Team A - The International 2026")).toEqual(leagues[1]);
  });

  it("whitelists hero picks and omits result fields", () => {
    const report = buildCandidateReport({
      league: { leagueid: 7, name: "Test League" },
      matches: [{
        match_id: 99,
        series_id: 12,
        start_time: 1_700_000_100,
        radiant_team_id: 1,
        dire_team_id: 2,
        radiant_win: true,
        radiant_score: 40,
      }],
      teams: [
        { team_id: 1, name: "One", tag: "ONE", logo_url: null },
        { team_id: 2, name: "Two", tag: "TWO", logo_url: null },
      ],
      matchDetails: [{
        match_id: 99,
        radiant_win: true,
        picks_bans: [{ is_pick: true, hero_id: 5, order: 1, team: 0 }],
      }],
      heroConstants: { 5: { id: 5, localized_name: "Crystal Maiden" } },
      videoId: "video",
      streamStart: "2023-11-14T22:13:20Z",
      streamEnd: "2023-11-14T23:13:20Z",
    });
    expect(report.series[0].games[0].heroes).toEqual({
      teamA: [{ id: 5, name: "Crystal Maiden", iconUrl: null }],
      teamB: [],
    });
    expect(JSON.stringify(report)).not.toMatch(/radiant_win|radiant_score/);
  });
});
