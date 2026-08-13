#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LiquipediaClient, parseBracketStages, parseDayOnePage } from "./liquipedia.mjs";
import { assertSpoilerSafe, JsonApiClient, pairKey, toWebsiteData } from "./fetch-ti-day1.mjs";

const LEAGUE_ID = 19785;
const PAGE = "Esports_World_Cup/2026";
const GROUP_PAGE = "Esports_World_Cup/2026/Group_Stage";
const OUTPUT = resolve("src", "ewc-2026.json");
const CACHE = resolve(".cache", "ewc-2026");
const LIQUIPEDIA_CACHE = resolve(".cache", "liquipedia", "ewc-2026.parse.json");
const GROUP_LIQUIPEDIA_CACHE = resolve(".cache", "liquipedia", "ewc-2026-group-stage.parse.json");
const TOURNAMENT = {
  id: "ewc-2026",
  slug: "esports-world-cup-2026",
  name: "Esports World Cup 2026",
  shortName: "EWC 2026",
};
const DATES = [
  ["2026-07-07", "July 7, 2026"],
  ["2026-07-08", "July 8, 2026"],
  ["2026-07-09", "July 9, 2026"],
  ["2026-07-10", "July 10, 2026"],
  ["2026-07-11", "July 11, 2026"],
  ["2026-07-12", "July 12, 2026"],
  ["2026-07-14", "July 14, 2026"],
  ["2026-07-15", "July 15, 2026"],
  ["2026-07-16", "July 16, 2026"],
  ["2026-07-17", "July 17, 2026"],
  ["2026-07-18", "July 18, 2026"],
  ["2026-07-19", "July 19, 2026"],
];

const dateLabel = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
});

const isSoloMatch = (match) => match.teams.some((team) => ["Abed", "TaiLung"].includes(team));

async function main() {
  const liquipediaClient = new LiquipediaClient();
  const parsedPage = await liquipediaClient.parsePage(PAGE, {
    cacheFile: LIQUIPEDIA_CACHE,
    refresh: process.env.TI_REFRESH === "1",
  });
  const parsedGroupPage = await liquipediaClient.parsePage(GROUP_PAGE, {
    cacheFile: GROUP_LIQUIPEDIA_CACHE,
    refresh: process.env.TI_REFRESH === "1",
  });
  const parsedDays = DATES.slice(0, 6).map(([date, liquipediaDate]) => ({
    date,
    stage: "Group Stage",
    liquipedia: parseDayOnePage({ html: parsedGroupPage.text, page: parsedGroupPage.title ?? GROUP_PAGE, date: liquipediaDate }),
  }));
  const bracketMatches = parseBracketStages({ html: parsedPage.text, page: parsedPage.title ?? PAGE }).matches;
  const allLiquipediaMatches = [
    ...parsedDays.flatMap(({ date, stage, liquipedia }) => liquipedia.matches.map((match) => ({ ...match, date, stage }))),
    ...bracketMatches,
  ].filter((match) => !isSoloMatch(match));

  const openDota = new JsonApiClient({ baseUrl: "https://api.opendota.com/api", cacheDir: CACHE });
  const matches = await openDota.get(`/leagues/${LEAGUE_ID}/matches`, "opendota.matches.json");
  const teams = await openDota.get(`/leagues/${LEAGUE_ID}/teams`, "opendota.teams.json");
  const heroes = await openDota.get("/constants/heroes", "opendota.heroes.json");
  const teamById = new Map(teams.map((team) => [team.team_id, team]));
  const availablePairs = new Set(matches.map((match) => pairKey(
    teamById.get(match.radiant_team_id)?.name?.trim() ?? "",
    teamById.get(match.dire_team_id)?.name?.trim() ?? "",
  )));
  const supportedMatches = allLiquipediaMatches.filter((match) => match.games.length && availablePairs.has(pairKey(...match.teams)));
  const unsupportedMatches = allLiquipediaMatches.filter((match) => !availablePairs.has(pairKey(...match.teams)));
  if (unsupportedMatches.length) {
    console.log(`EWC 2026: skipped ${unsupportedMatches.length} Liquipedia match without OpenDota coverage: ${unsupportedMatches.map((match) => match.teams.join(" vs ")).join(", ")}`);
  }

  const selectedPairs = new Set(supportedMatches.map((match) => pairKey(...match.teams)));
  const relevantMatches = matches.filter((match) => selectedPairs.has(pairKey(
    teamById.get(match.radiant_team_id)?.name?.trim() ?? "",
    teamById.get(match.dire_team_id)?.name?.trim() ?? "",
  )));
  const missingPairs = [...selectedPairs].filter((key) => !relevantMatches.some((match) => pairKey(
    teamById.get(match.radiant_team_id)?.name?.trim() ?? "",
    teamById.get(match.dire_team_id)?.name?.trim() ?? "",
  ) === key));
  if (missingPairs.length) throw new Error(`OpenDota did not cover EWC pairs: ${missingPairs.join(", ")}`);

  const detailsByMatchId = new Map();
  for (const match of relevantMatches) {
    detailsByMatchId.set(match.match_id, await openDota.get(`/matches/${match.match_id}`, `opendota.match-${match.match_id}.json`));
  }

  const archives = [...new Set(supportedMatches.map((match) => match.date))]
    .sort()
    .map((date) => {
      const stage = supportedMatches.find((match) => match.date === date)?.stage ?? "Group Stage";
      const liquipedia = {
        page: PAGE,
        matches: supportedMatches.filter((match) => match.date === date && selectedPairs.has(pairKey(...match.teams))),
      };
      const data = toWebsiteData({
        liquipedia,
        matches: relevantMatches,
        teams,
        detailsByMatchId,
        heroes,
        config: {
          tournament: TOURNAMENT,
          date,
          stage: `${stage} · ${dateLabel(date)}`,
          matchIdPrefix: `ewc-2026-${date}`,
          sources: {
            opendota: `https://www.opendota.com/leagues/${LEAGUE_ID}`,
            liquipedia: "https://liquipedia.net/dota2/Esports_World_Cup/2026",
            attribution: "Match, team, and hero metadata from OpenDota; caster and VOD metadata from Liquipedia.",
          },
        },
      });
      assertSpoilerSafe(data);
      return data;
    });

  await mkdir(resolve(OUTPUT, ".."), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify({ archives }, null, 2)}\n`);
  console.log(`EWC 2026: wrote ${archives.length} dates, ${archives.reduce((total, archive) => total + archive.matches.length, 0)} matches, and ${relevantMatches.length} games to ${OUTPUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
