#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LiquipediaClient, parseDayOnePage } from "./liquipedia.mjs";

const LEAGUE_ID = 19719;
const OUTPUT = resolve("src", "ti-2026-day1.json");
const CACHE = resolve(".cache", "ti-2026");
const LIQUIPEDIA_CACHE = resolve(".cache", "liquipedia", "the-international-2026-group-stage.parse.json");
const USER_AGENT = "dota2vods/0.1 (https://github.com/herobrauni/dota2vods; brauni@brauni.dev)";

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

class JsonApiClient {
  constructor({ baseUrl, minIntervalMs = 1_000, userAgent = USER_AGENT }) {
    this.baseUrl = baseUrl;
    this.minIntervalMs = minIntervalMs;
    this.userAgent = userAgent;
    this.lastRequestAt = 0;
  }

  async get(pathname, cacheName) {
    const cacheFile = resolve(CACHE, cacheName);
    if (existsSync(cacheFile) && process.env.TI_REFRESH !== "1") {
      return JSON.parse(await readFile(cacheFile, "utf8"));
    }

    await sleep(Math.max(0, this.lastRequestAt + this.minIntervalMs - Date.now()));
    this.lastRequestAt = Date.now();
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      headers: {
        "Accept-Encoding": "gzip",
        "User-Agent": this.userAgent,
      },
    });
    if (!response.ok) throw new Error(`${this.baseUrl} returned HTTP ${response.status} for ${pathname}`);
    const payload = await response.json();
    await mkdir(CACHE, { recursive: true });
    await writeFile(cacheFile, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
}

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Liquipedia reflects several team rebrands on its current Day 1 page while
// OpenDota retains the names used when the matches were recorded.
const teamAliases = new Map([
  ["1w team", "iron wing"],
  ["betboom team", "boomboys"],
  ["l1ga team", "huligani"],
  ["parivision", "team vision"],
]);

function teamKey(name) {
  const normalized = normalize(name);
  return teamAliases.get(normalized) ?? normalized;
}

function pairKey(left, right) {
  return [teamKey(left), teamKey(right)].sort().join("|");
}

function heroPickNames(details, match, teamId, heroById) {
  const picks = (details.picks_bans ?? [])
    .filter((pick) => pick.is_pick)
    .sort((left, right) => left.order - right.order);
  const picksForTeam = picks.filter((pick) => (
    (pick.team === 0 ? match.radiant_team_id : match.dire_team_id) === teamId
  ));
  if (picksForTeam.length === 5) {
    return picksForTeam.map((pick) => heroById.get(pick.hero_id) ?? `Hero ${pick.hero_id}`);
  }

  const playersForTeam = (details.players ?? []).filter((player) => {
    const playerTeamId = player.isRadiant ? match.radiant_team_id : match.dire_team_id;
    return player.hero_id && playerTeamId === teamId;
  });
  return playersForTeam.map((player) => heroById.get(player.hero_id) ?? `Hero ${player.hero_id}`);
}

function heroData(names, heroByName) {
  return names.map((name) => ({
    name,
    iconUrl: heroByName.get(name)?.iconUrl ?? null,
  }));
}

function buildGame({ match, details, gameNumber, teamAId, teamBId, vodUrl, heroById, heroByName }) {
  const teamAHeroNames = heroPickNames(details, match, teamAId, heroById);
  const teamBHeroNames = heroPickNames(details, match, teamBId, heroById);
  if (teamAHeroNames.length !== 5 || teamBHeroNames.length !== 5) {
    throw new Error(`OpenDota match ${match.match_id} does not have ten hero picks`);
  }
  return {
    number: gameNumber,
    matchId: match.match_id,
    source: "opendota",
    vodUrl: vodUrl ?? null,
    heroes: {
      teamA: heroData(teamAHeroNames, heroByName),
      teamB: heroData(teamBHeroNames, heroByName),
    },
  };
}

function concealedGame(game) {
  return {
    ...game,
    number: 3,
    source: "concealed-fallback",
    matchId: undefined,
  };
}

function toWebsiteData({ liquipedia, matches, teams, detailsByMatchId, heroes }) {
  const teamById = new Map(teams.map((team) => [team.team_id, team]));
  const heroById = new Map(Object.values(heroes).map((hero) => [hero.id, hero.localized_name]));
  const heroByName = new Map(Object.values(heroes).map((hero) => [hero.localized_name, {
    iconUrl: hero.icon ? `https://cdn.cloudflare.steamstatic.com${hero.icon.replace(/\?$/, "")}` : null,
  }]));
  const matchesByPair = new Map();
  for (const match of matches) {
    const radiant = teamById.get(match.radiant_team_id)?.name?.trim();
    const dire = teamById.get(match.dire_team_id)?.name?.trim();
    if (!radiant || !dire) continue;
    const key = pairKey(radiant, dire);
    if (!matchesByPair.has(key)) matchesByPair.set(key, []);
    matchesByPair.get(key).push(match);
  }

  const outputMatches = liquipedia.matches.map((liquipediaMatch) => {
    const [liquipediaTeamA, liquipediaTeamB] = liquipediaMatch.teams;
    const candidates = (matchesByPair.get(pairKey(liquipediaTeamA, liquipediaTeamB)) ?? [])
      .sort((left, right) => left.start_time - right.start_time);
    if (!candidates.length) {
      throw new Error(`Could not match Liquipedia series ${liquipediaTeamA} vs ${liquipediaTeamB} to OpenDota`);
    }
    const seriesId = candidates[0].series_id;
    const seriesMatches = candidates.filter((match) => match.series_id === seriesId);
    const teamAId = teamKey(teamById.get(candidates[0].radiant_team_id)?.name?.trim()) === teamKey(liquipediaTeamA)
      ? candidates[0].radiant_team_id
      : candidates[0].dire_team_id;
    const teamBId = teamAId === candidates[0].radiant_team_id
      ? candidates[0].dire_team_id
      : candidates[0].radiant_team_id;
    const games = seriesMatches.slice(0, 3).map((match, index) => buildGame({
      match,
      details: detailsByMatchId.get(match.match_id),
      gameNumber: index + 1,
      teamAId,
      teamBId,
      vodUrl: liquipediaMatch.games[index]?.vods[0],
      heroById,
      heroByName,
    }));
    if (games.length === 2) games.push(concealedGame(games[1]));
    if (games.length !== 3) throw new Error(`Series ${seriesId} did not resolve to three spoiler-safe controls`);

    const teamA = teamById.get(teamAId);
    const teamB = teamById.get(teamBId);
    return {
      id: `ti-2026-day1-${seriesId}`,
      openDotaSeriesId: seriesId,
      matchPageUrl: liquipediaMatch.matchPage,
      teamA: liquipediaTeamA,
      teamB: liquipediaTeamB,
      teamAId,
      teamBId,
      teamALogoUrl: teamA?.logo_url ?? null,
      teamBLogoUrl: teamB?.logo_url ?? null,
      casters: liquipediaMatch.casters,
      games,
    };
  });

  return {
    tournament: {
      id: "ti-2026",
      slug: "the-international-2026",
      name: "The International 2026",
      shortName: "TI 2026",
    },
    date: "2026-08-13",
    stage: "Group Stage · Day 1",
    matches: outputMatches,
    sources: {
      opendota: "https://www.opendota.com/leagues/19719",
      liquipedia: "https://liquipedia.net/dota2/The_International/2026/Group_Stage",
      attribution: "Match, team, and hero metadata from OpenDota; caster and VOD metadata from Liquipedia.",
    },
    generatedAt: new Date().toISOString(),
  };
}

function assertSpoilerSafe(data) {
  const serialized = JSON.stringify(data);
  for (const forbidden of ["radiant_win", "dire_score", "radiant_score", "winner", "duration", "score"]) {
    if (serialized.includes(`\"${forbidden}\"`)) throw new Error(`Spoiler-bearing field leaked into generated data: ${forbidden}`);
  }
}

async function main() {
  const liquipediaClient = new LiquipediaClient();
  const parsedPage = await liquipediaClient.parsePage("The_International/2026/Group_Stage", {
    cacheFile: LIQUIPEDIA_CACHE,
    refresh: process.env.TI_REFRESH === "1",
  });
  const liquipedia = parseDayOnePage({
    html: parsedPage.text,
    page: parsedPage.title,
  });
  if (liquipedia.matches.length !== 12) {
    throw new Error(`Expected 12 Liquipedia Day 1 matches, received ${liquipedia.matches.length}`);
  }

  const openDota = new JsonApiClient({ baseUrl: "https://api.opendota.com/api" });
  const matches = await openDota.get(`/leagues/${LEAGUE_ID}/matches`, "opendota.matches.json");
  const teams = await openDota.get(`/leagues/${LEAGUE_ID}/teams`, "opendota.teams.json");
  const heroes = await openDota.get("/constants/heroes", "opendota.heroes.json");
  const teamKeys = new Set(teams.map((team) => teamKey(team.name?.trim() ?? "")));
  const selectedPairs = new Set(liquipedia.matches.map((match) => pairKey(...match.teams)));
  const relevantMatches = matches.filter((match) => {
    const radiant = teams.find((team) => team.team_id === match.radiant_team_id)?.name?.trim();
    const dire = teams.find((team) => team.team_id === match.dire_team_id)?.name?.trim();
    return radiant && dire && selectedPairs.has(pairKey(radiant, dire));
  });
  if (!relevantMatches.length || ![...selectedPairs].every((key) => relevantMatches.some((match) => {
    const radiant = teams.find((team) => team.team_id === match.radiant_team_id)?.name?.trim();
    const dire = teams.find((team) => team.team_id === match.dire_team_id)?.name?.trim();
    return pairKey(radiant, dire) === key;
  }))) {
    throw new Error(`OpenDota did not cover all Liquipedia Day 1 pairs; known teams: ${[...teamKeys].join(", ")}`);
  }

  const detailsByMatchId = new Map();
  for (const match of relevantMatches) {
    detailsByMatchId.set(match.match_id, await openDota.get(`/matches/${match.match_id}`, `opendota.match-${match.match_id}.json`));
  }
  const data = toWebsiteData({ liquipedia, matches: relevantMatches, teams, detailsByMatchId, heroes });
  assertSpoilerSafe(data);
  await writeFile(OUTPUT, `${JSON.stringify(data, null, 2)}\n`);
  const games = data.matches.flatMap((match) => match.games.filter((game) => game.source === "opendota"));
  const missingVods = games.filter((game) => !game.vodUrl).length;
  console.log(`TI 2026 Day 1: wrote ${data.matches.length} matches and ${games.length} games to ${OUTPUT}`);
  console.log(`Liquipedia casters: ${new Set(data.matches.flatMap((match) => match.casters)).size}; missing game VODs: ${missingVods}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
