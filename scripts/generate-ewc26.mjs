#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const matches = JSON.parse(readFileSync("/tmp/ewc-matches.json", "utf8"));
const teams = JSON.parse(readFileSync("/tmp/ewc-teams.json", "utf8"));
const heroes = JSON.parse(readFileSync("/tmp/ewc-heroes.json", "utf8"));
const heroById = new Map(Object.values(heroes).map((hero) => [hero.id, hero.localized_name]));
const teamById = new Map(teams.map((team) => [team.team_id, team]));

const streams = [
  ["BLX7obzQS60", 1783412287, 42900, "2026-07-07", "Group Stage · Day 1", "A", 1800, ["series:1118051", "series:1118085", "series:1118153", "series:1118203"]],
  ["6ch95zxwRNE", 1783412562, 42900, "2026-07-07", "Group Stage · Day 1", "B", 1800, ["series:1118052", "series:1118078", "pair:REKONIX|Vici Gaming", "pair:LGD Gaming|Virtus.pro"]],
  ["xv_JgaMnjd4", 1783413600, 42900, "2026-07-07", "Group Stage · Day 1", "C", 1800, ["series:1118055", "series:1118100", "series:1118158", "series:1118190"]],
  ["bLvDHW2X0pM", 1783498681, 42898, "2026-07-08", "Group Stage · Day 2", "A", 1800, ["series:1118320", "series:1118356", "series:1118425", "series:1118443"]],
  ["llpqHb7dMyc", 1783498649, 40796, "2026-07-08", "Group Stage · Day 2", "B", 1800, ["series:1118318", "series:1118336", "series:1118447", "series:1118459"]],
  ["RP5j3a5bxFY", 1783498930, 41498, "2026-07-08", "Group Stage · Day 2", "C", 1800, ["series:1118317", "series:1118338", "series:1118397", "series:1118406"]],
  ["4nL8I_nGTBk", 1783584985, 42900, "2026-07-09", "Group Stage · Day 3", "A", 1800, ["series:1118572", "series:1118603", "series:1118668", "series:1118725"]],
  ["qR2hAjoFNUo", 1783585323, 41334, "2026-07-09", "Group Stage · Day 3", "B", 1800, ["series:1118570", "series:1118588", "series:1118657", "series:1118714"]],
  ["CPLqUj8GpeU", 1783585855, 40806, "2026-07-09", "Group Stage · Day 3", "C", 1800, ["series:1118573", "series:1118590", "series:1118650", "series:1118710"]],
  ["Kp4ZSgv_tjs", 1783671530, 40564, "2026-07-10", "Group Stage · Day 4", "A", 1800, ["series:1118878", "series:1118895", "series:1118962", "series:1119018"]],
  ["-IcUXsc-01g", 1783671701, 41180, "2026-07-10", "Group Stage · Day 4", "B", 1800, ["series:1118877", "series:1118894", "series:1118948", "series:1119025"]],
  ["70oVjpTnXzM", 1783671670, 41212, "2026-07-10", "Group Stage · Day 4", "C", 1800, ["series:1118876", "series:1118910", "series:1118970", "series:1119035"]],
  ["OKtbx3NQ6M0", 1783757788, 24692, "2026-07-11", "Group Stage · Day 5", "A", 1800, ["series:1119248", "series:1119315"]],
  ["9bkf_RJNQsU", 1783757786, 25168, "2026-07-11", "Group Stage · Day 5", "B", 1800, ["series:1119241", "pair:PTime|Nigma Galaxy"]],
  ["kDI7mHHvWRQ", 1783757846, 22332, "2026-07-11", "Group Stage · Day 5", "C", 1800, ["series:1119240", "series:1119295"]],
  ["t6MeXFBVqUE", 1783844103, 29696, "2026-07-12", "Group Stage · Day 6", "A", 1800, ["series:1119683", "series:1119733"]],
  ["HkdYCOfOF4E", 1783843959, 28192, "2026-07-12", "Group Stage · Day 6", "B", 1800, ["series:1119680", "series:1119761"]],
  ["yTDRLdcifg0", 1783844139, 22486, "2026-07-12", "Group Stage · Day 6", "C", 1800, ["series:1119682", "series:1119737"]],
  ["L4g9eWBFMQo", 1784024011, 33418, "2026-07-14", "Playoffs · Day 7", "A", 1500, ["series:1120368", "series:1120370", "series:1120473"]],
  ["aDK0qF_VATM", 1784023939, 21418, "2026-07-14", "Playoffs · Day 7", "B", 1500, ["series:1120368", "series:1120370"]],
  ["3h58-1X2Zow", 1784110205, 28414, "2026-07-15", "Survival Stage · Day 8", "A", 2500, ["series:1120661", "series:1120662", "series:1120721", "series:1120748"]],
  ["dN2ev1iSOWQ", 1784110587, 29140, "2026-07-15", "Survival Stage · Day 8", "B", 2500, ["series:1120661", "series:1120662", "series:1120721", "series:1120748"]],
  ["d2wJwL9MKkE", 1784196593, 23316, "2026-07-16", "Playoffs · Day 9", "A", 1500, ["series:1120911", "series:1120991"]],
  ["3GCgmCq12eY", 1784282893, 23838, "2026-07-17", "Playoffs · Day 10", "A", 1500, ["series:1121211", "series:1121275"]],
  ["NbKa6VTG9BE", 1784369489, 27412, "2026-07-18", "Playoffs · Day 11", "A", 1500, ["series:1121542", "series:1121633"]],
  ["avxSeNmhm_o", 1784452299, 35372, "2026-07-19", "Playoffs · Final Day", "A", 1500, ["series:1121968", "series:1122069"]],
];

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const displayName = (id) => {
  const name = teamById.get(id)?.name?.trim() ?? `Team ${id}`;
  return name === "_PowerRangers" ? "Power Rangers" : name;
};
const pairKey = (a, b) => `pair:${[displayName(a), displayName(b)].map(normalize).sort().join("|")}`;

function picksFor(match) {
  const picks = (match.details?.picks_bans ?? [])
    .filter((pick) => pick.is_pick)
    .sort((a, b) => a.order - b.order);
  const bySide = (side) => picks
    .filter((pick) => (pick.team === 0 ? match.radiant_team_id : match.dire_team_id) === side)
    .map((pick) => heroById.get(pick.hero_id) ?? `Hero ${pick.hero_id}`);
  if (picks.length === 10) return { teamA: bySide(match.radiant_team_id), teamB: bySide(match.dire_team_id) };
  const players = (match.details?.players ?? []).filter((player) => player.hero_id);
  return {
    teamA: players.filter((player) => player.isRadiant).map((player) => heroById.get(player.hero_id) ?? `Hero ${player.hero_id}`),
    teamB: players.filter((player) => !player.isRadiant).map((player) => heroById.get(player.hero_id) ?? `Hero ${player.hero_id}`),
  };
}

function loadDetails(match) {
  const details = JSON.parse(readFileSync(`/tmp/ewc-details/${match.match_id}.json`, "utf8"));
  return { ...match, details };
}

function groupMatches(start, duration) {
  const candidates = matches
    .filter((match) => match.start_time >= start - 1800 && match.start_time <= start + duration)
    .map(loadDetails)
    .sort((a, b) => a.start_time - b.start_time);
  const groups = new Map();
  for (const match of candidates) {
    const key = match.series_id ? `series:${match.series_id}` : pairKey(match.radiant_team_id, match.dire_team_id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  return groups;
}

const selectedGames = [];
for (const [videoId, start, duration, date, stage, stream, shift, wanted] of streams) {
  const groups = groupMatches(start, duration);
  const chosen = wanted.flatMap((key) => groups.get(key) ?? []);
  if (!chosen.length) throw new Error(`No matches selected for ${videoId}`);
  const byKey = new Map();
  for (const match of chosen) {
    const key = match.series_id ? `series:${match.series_id}` : pairKey(match.radiant_team_id, match.dire_team_id);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(match);
  }
  selectedGames.push({ videoId, date, stage, stream: `English Stream ${stream}`, shift, series: [...byKey.values()] });
}

const gameLiteral = (match, streamStart, shift, number) => {
  const offset = match.start_time - streamStart;
  const heroes = picksFor(match);
  const draft = Math.max(0, offset + shift - 600);
  const gameplay = Math.max(0, offset + shift);
  return `played(${number}, ${draft}, ${gameplay}, ${match.match_id}, ${JSON.stringify(heroes.teamA)}, ${JSON.stringify(heroes.teamB)})`;
};

const output = [];
output.push('import type { Vod } from "./vods";');
output.push('');
output.push('const played = (number: 1 | 2 | 3, draftStartSeconds: number, startSeconds: number, matchId: number, teamAHeroes: string[], teamBHeroes: string[]) => ({ number, startSeconds, draftStartSeconds, source: "verified" as const, matchId, heroes: { teamA: teamAHeroes, teamB: teamBHeroes } });');
output.push('type GameSeed = { number: 1 | 2 | 3; startSeconds: number; draftStartSeconds: number; source: "verified" | "concealed-fallback"; matchId?: number; heroes: { teamA: string[]; teamB: string[] } };');
output.push('const concealedGame = (game: GameSeed, number: 2 | 3) => ({ ...game, number, source: "concealed-fallback" as const, matchId: undefined });');
output.push('const concealedThird = (game: GameSeed) => concealedGame(game, 3);');
output.push('');
output.push('export const ewc26Vods: Vod[] = [');
for (const vod of selectedGames) {
  const [videoId, start] = streams.find((stream) => stream[0] === vod.videoId);
  output.push('  {');
  output.push(`    id: "${videoId}", tournamentId: "ewc-2026", event: "Esports World Cup 2026", stage: "${vod.stage}", stream: "${vod.stream}", date: "${vod.date}", language: "English", thumbnail: "https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg", series: [`);
  for (const games of vod.series) {
    const first = games[0];
    const teamA = displayName(first.radiant_team_id);
    const teamB = displayName(first.dire_team_id);
    const key = first.series_id ?? first.match_id;
    const gameLines = games.slice(0, 3).map((match, index) => gameLiteral(match, start, vod.shift, index + 1));
    while (gameLines.length < 2) gameLines.push(`concealedGame(${gameLines[0]}, 2)`);
    if (gameLines.length < 3) gameLines.push(`concealedThird(${gameLines[1]})`);
    output.push(`      { id: "ewc-${key}-${normalize(teamA)}-${normalize(teamB).replace(/ /g, "-")}", teamA: ${JSON.stringify(teamA)}, teamB: ${JSON.stringify(teamB)}, openDotaSeriesId: ${key}, teamAId: ${first.radiant_team_id}, teamBId: ${first.dire_team_id}, games: [${gameLines.join(", ")}] },`);
  }
  output.push('    ],');
  output.push('  },');
}
output.push('];');
writeFileSync("src/ewc26.ts", `${output.join("\n")}\n`);
