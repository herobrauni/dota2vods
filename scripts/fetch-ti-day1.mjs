#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LiquipediaClient, parseDayPage } from "./liquipedia.mjs";

const USER_AGENT = "dota2vods/0.1 (https://github.com/herobrauni/dota2vods; brauni@brauni.dev)";
const DEFAULT_CACHE = resolve(".cache", "ti-2026");
const DEFAULT_CONFIG = {
  id: "ti-2026-day1",
  date: "2026-08-13",
  liquipediaDate: "August 13, 2026",
  stage: "Group Stage · Day 1",
  output: "src/ti-2026-day1.json",
  cache: ".cache/ti-2026",
  liquipediaCache: ".cache/liquipedia/the-international-2026-group-stage.parse.json",
  matchIdPrefix: "ti-2026-day1",
};
const LEAGUE_ID = 19719;

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

export class JsonApiClient {
  constructor({ baseUrl, minIntervalMs = 1_000, userAgent = USER_AGENT, cacheDir = DEFAULT_CACHE }) {
    this.baseUrl = baseUrl;
    this.minIntervalMs = minIntervalMs;
    this.userAgent = userAgent;
    this.cacheDir = cacheDir;
    this.lastRequestAt = 0;
  }

  async get(pathname, cacheName, { refresh = false, validate = null } = {}) {
    const cacheFile = resolve(this.cacheDir, cacheName);
    if (existsSync(cacheFile) && !refresh && process.env.TI_REFRESH !== "1") {
      return JSON.parse(await readFile(cacheFile, "utf8"));
    }

    await sleep(Math.max(0, this.lastRequestAt + this.minIntervalMs - Date.now()));
    this.lastRequestAt = Date.now();
    let response;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch(`${this.baseUrl}${pathname}`, {
        headers: {
          "Accept-Encoding": "gzip",
          "User-Agent": this.userAgent,
        },
      });
      if (response.status !== 429) break;
      await sleep(5_000 * (attempt + 1));
      this.lastRequestAt = Date.now();
    }
    if (!response.ok) throw new Error(`${this.baseUrl} returned HTTP ${response.status} for ${pathname}`);
    const payload = await response.json();
    if (validate) {
      const problem = validate(payload);
      if (problem) throw new Error(`Rejecting ${cacheName}: ${problem}`);
    }
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(cacheFile, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
}

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Liquipedia reflects several team rebrands on its current page while
// OpenDota retains the names used when the matches were recorded.
const teamAliases = new Map([
  ["1w team", "1w"],
  ["iron wing", "1w"],
  ["betboom team", "boomboys"],
  ["bb team", "boomboys"],
  ["l1ga team", "l1 team"],
  ["huligani", "l1 team"],
  ["parivision", "team vision"],
  ["power rangers", "powerrangers"],
  ["level up", "level up esports"],
  ["playtime", "ptime"],
  ["rune eaters esports", "rune eaters"],
  ["pvision", "team vision"],
]);

export function teamKey(name) {
  const normalized = normalize(name);
  return teamAliases.get(normalized) ?? normalized;
}

export function pairKey(left, right) {
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

function concealedGame(gameNumber) {
  return {
    number: gameNumber,
    source: "concealed-fallback",
    matchId: undefined,
    vodUrl: null,
    heroes: { teamA: [], teamB: [] },
  };
}

function supportedBestOf(value) {
  return [2, 3, 5].includes(value) ? value : 3;
}

export function toWebsiteData({ liquipedia, matches, teams, detailsByMatchId, heroes, config = {} }) {
  const tournament = config.tournament ?? {
    id: "ti-2026",
    slug: "the-international-2026",
    name: "The International 2026",
    shortName: "TI 2026",
  };
  const matchIdPrefix = config.matchIdPrefix ?? "ti-2026-day1";
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

  const outputMatches = liquipedia.matches
    .map((liquipediaMatch, originalIndex) => ({ liquipediaMatch, originalIndex }))
    .sort((left, right) => {
      if (!left.liquipediaMatch.scheduledAt || !right.liquipediaMatch.scheduledAt) return left.originalIndex - right.originalIndex;
      return left.liquipediaMatch.scheduledAt.localeCompare(right.liquipediaMatch.scheduledAt) || left.originalIndex - right.originalIndex;
    })
    .map(({ liquipediaMatch }) => {
      const [liquipediaTeamA, liquipediaTeamB] = liquipediaMatch.teams;
      const seriesBestOf = supportedBestOf(liquipediaMatch.bestOf);
      const candidates = (matchesByPair.get(pairKey(liquipediaTeamA, liquipediaTeamB)) ?? [])
        .sort((left, right) => left.start_time - right.start_time);
      if (!candidates.length) {
        throw new Error(`Could not match Liquipedia series ${liquipediaTeamA} vs ${liquipediaTeamB} to OpenDota`);
      }
      const scheduledTimestamp = Date.parse(liquipediaMatch.scheduledAt ?? "");
      const nearestCandidate = Number.isFinite(scheduledTimestamp)
        ? [...candidates].sort((left, right) => Math.abs(left.start_time * 1_000 - scheduledTimestamp) - Math.abs(right.start_time * 1_000 - scheduledTimestamp))[0]
        : candidates[0];
      const seriesId = nearestCandidate.series_id ?? candidates.find((match) => match.series_id != null)?.series_id ?? candidates[0].series_id;
      let seriesMatches = candidates.filter((match) => match.series_id === seriesId || (match.series_id == null && candidates.length <= 3));
      if (seriesMatches.length < 2 && candidates.length <= 3) seriesMatches = candidates.slice(0, 3);
      const teamAId = teamKey(teamById.get(candidates[0].radiant_team_id)?.name?.trim()) === teamKey(liquipediaTeamA)
        ? candidates[0].radiant_team_id
        : candidates[0].dire_team_id;
      const teamBId = teamAId === candidates[0].radiant_team_id
        ? candidates[0].dire_team_id
        : candidates[0].radiant_team_id;
      const games = seriesMatches.slice(0, 5).map((match, index) => buildGame({
        match,
        details: detailsByMatchId.get(match.match_id),
        gameNumber: index + 1,
        teamAId,
        teamBId,
        vodUrl: liquipediaMatch.games[index]?.vods[0],
        heroById,
        heroByName,
      }));
      if (games.length > seriesBestOf) throw new Error(`Series ${seriesId} resolved to ${games.length} games for a Bo${seriesBestOf} series`);
      while (games.length < seriesBestOf) games.push(concealedGame(games.length + 1));

      const teamA = teamById.get(teamAId);
      const teamB = teamById.get(teamBId);
      return {
        id: `${matchIdPrefix}-${seriesId}`,
        openDotaSeriesId: seriesId,
        bestOf: seriesBestOf,
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
    tournament,
    date: config.date ?? "2026-08-13",
    stage: config.stage ?? "Group Stage · Day 1",
    matches: outputMatches,
    sources: config.sources ?? {
      opendota: "https://www.opendota.com/leagues/19719",
      liquipedia: "https://liquipedia.net/dota2/The_International/2026/Group_Stage",
      attribution: "Match, team, and hero metadata from OpenDota; series format, caster, and VOD metadata from Liquipedia.",
    },
    generatedAt: new Date().toISOString(),
  };
}

export function assertSpoilerSafe(data) {
  const serialized = JSON.stringify(data);
  for (const forbidden of ["radiant_win", "dire_score", "radiant_score", "winner", "duration", "score"]) {
    if (serialized.includes(`"${forbidden}"`)) throw new Error(`Spoiler-bearing field leaked into generated data: ${forbidden}`);
  }
}

export async function fetchArchive(config = DEFAULT_CONFIG, options = {}) {
  const { refreshLeague = false, validateDetails = false, parser = null, page = null } = options;
  const liquipediaClient = new LiquipediaClient();
  const parsePageName = page ?? "The_International/2026/Group_Stage";
  const parsedPage = await liquipediaClient.parsePage(parsePageName, {
    cacheFile: resolve(config.liquipediaCache),
    refresh: process.env.TI_REFRESH === "1" || options.refreshLiquipedia === true,
  });
  const liquipedia = (parser ?? parseDayPage)({
    html: parsedPage.text,
    page: parsedPage.title,
    date: config.liquipediaDate,
    revisionId: parsedPage.revid ?? null,
  });
  if (!liquipedia.matches.length) {
    throw new Error(`No completed matches found for Liquipedia ${config.liquipediaDate}`);
  }

  const openDota = new JsonApiClient({ baseUrl: "https://api.opendota.com/api", cacheDir: resolve(config.cache) });
  const matches = await openDota.get(`/leagues/${LEAGUE_ID}/matches`, "opendota.matches.json", { refresh: refreshLeague });
  const teams = await openDota.get(`/leagues/${LEAGUE_ID}/teams`, "opendota.teams.json");
  const heroes = await openDota.get("/constants/heroes", "opendota.heroes.json");
  const teamKeys = new Set(teams.map((team) => teamKey(team.name?.trim() ?? "")));
  const selectedPairs = new Set(liquipedia.matches.map((match) => pairKey(...match.teams)));
  const targetDate = config.date;
  const relevantMatches = matches.filter((match) => {
    const radiant = teams.find((team) => team.team_id === match.radiant_team_id)?.name?.trim();
    const dire = teams.find((team) => team.team_id === match.dire_team_id)?.name?.trim();
    return radiant && dire
      && selectedPairs.has(pairKey(radiant, dire))
      && new Date(match.start_time * 1_000).toISOString().slice(0, 10) === targetDate;
  });
  const completedMatches = liquipedia.matches.filter((liquipediaMatch) => {
    const key = pairKey(...liquipediaMatch.teams);
    return relevantMatches.some((match) => {
      const radiant = teams.find((team) => team.team_id === match.radiant_team_id)?.name?.trim();
      const dire = teams.find((team) => team.team_id === match.dire_team_id)?.name?.trim();
      return pairKey(radiant, dire) === key;
    });
  });
  if (!completedMatches.length) {
    throw new Error(`OpenDota has no completed matches for Liquipedia ${config.liquipediaDate}; known teams: ${[...teamKeys].join(", ")}`);
  }

  const detailsByMatchId = new Map();
  for (const match of relevantMatches) {
    detailsByMatchId.set(match.match_id, await openDota.get(`/matches/${match.match_id}`, `opendota.match-${match.match_id}.json`, {
      validate: validateDetails
        ? (payload) => (Array.isArray(payload?.picks_bans) && payload.picks_bans.length >= 20 && Array.isArray(payload?.players) && payload.players.length === 10
          ? null
          : `match ${match.match_id} details incomplete (picks_bans=${payload?.picks_bans?.length ?? "missing"}, players=${payload?.players?.length ?? "missing"})`)
        : null,
    }));
  }
  const data = toWebsiteData({
    liquipedia: { ...liquipedia, matches: completedMatches },
    matches: relevantMatches,
    teams,
    detailsByMatchId,
    heroes,
    config: {
      matchIdPrefix: config.matchIdPrefix ?? config.id,
      date: config.date,
      stage: config.stage,
      ...(config.sources ? { sources: config.sources } : {}),
    },
  });
  assertSpoilerSafe(data);
  await writeFile(resolve(config.output), `${JSON.stringify(data, null, 2)}\n`);
  const games = data.matches.flatMap((match) => match.games.filter((game) => game.source === "opendota"));
  const missingVods = games.filter((game) => !game.vodUrl).length;
  console.log(`TI 2026 ${config.liquipediaDate}: wrote ${data.matches.length} matches and ${games.length} games to ${resolve(config.output)}`);
  console.log(`Liquipedia casters: ${new Set(data.matches.flatMap((match) => match.casters)).size}; missing game VODs: ${missingVods}`);
  return data;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchArchive().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
