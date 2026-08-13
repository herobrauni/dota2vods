const API_ROOT = "https://api.opendota.com/api";

const HUD_WINDOW_AFTER_MATCH_START = {
  earliestSeconds: 8 * 60,
  latestSeconds: 25 * 60,
};

async function getJson(pathname) {
  const response = await fetch(`${API_ROOT}${pathname}`, {
    headers: { "User-Agent": "dota2vods-ingest/0.1" },
  });
  if (!response.ok) {
    throw new Error(`OpenDota ${pathname} returned ${response.status}`);
  }
  return response.json();
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findLeagueForTitle(leagues, title) {
  const normalizedTitle = normalize(title);
  return leagues
    .filter((league) => league.tier !== "excluded")
    .filter((league) => {
      const normalizedName = normalize(league.name);
      return normalizedName.length >= 4 && normalizedTitle.includes(normalizedName);
    })
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function buildCandidateReport({
  league,
  matches,
  teams,
  matchDetails = [],
  heroConstants = {},
  videoId,
  streamStart,
  streamEnd,
}) {
  const startEpoch = Math.floor(new Date(streamStart).getTime() / 1000);
  const endEpoch = Math.floor(new Date(streamEnd).getTime() / 1000);
  if (!Number.isFinite(startEpoch) || !Number.isFinite(endEpoch)) {
    throw new Error("The YouTube broadcast is missing valid start/end timestamps");
  }

  const duration = endEpoch - startEpoch;
  const teamById = new Map(teams.map((team) => [team.team_id, team]));
  const detailByMatchId = new Map(matchDetails.map((match) => [match.match_id, match]));
  const heroNameById = new Map(
    Object.values(heroConstants).map((hero) => [hero.id, hero.localized_name]),
  );
  const withinBroadcast = matches
    .filter((match) => match.start_time >= startEpoch - 30 * 60)
    .filter((match) => match.start_time <= endEpoch)
    .sort((a, b) => a.start_time - b.start_time);

  const grouped = new Map();
  for (const match of withinBroadcast) {
    const teamIds = [match.radiant_team_id, match.dire_team_id].sort((a, b) => a - b);
    const key = match.series_id ? `series-${match.series_id}` : `teams-${teamIds.join("-")}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(match);
  }

  const series = [...grouped.values()].map((seriesMatches) => {
    seriesMatches.sort((a, b) => a.start_time - b.start_time);
    const first = seriesMatches[0];
    const ids = [first.radiant_team_id, first.dire_team_id];
    const safeTeam = (id) => ({
      id,
      name: teamById.get(id)?.name?.trim() ?? `Team ${id}`,
      tag: teamById.get(id)?.tag ?? null,
      logoUrl: teamById.get(id)?.logo_url ?? null,
    });

    return {
      seriesId: first.series_id || null,
      teams: ids.map(safeTeam),
      games: seriesMatches.map((match, index) => {
        const apiVodOffsetSeconds = match.start_time - startEpoch;
        const picks = detailByMatchId.get(match.match_id)?.picks_bans ?? [];
        const safeHero = (pick) => ({
          id: pick.hero_id,
          name: heroNameById.get(pick.hero_id) ?? `Hero ${pick.hero_id}`,
          iconUrl: heroConstants[pick.hero_id]?.icon
            ? `https://cdn.cloudflare.steamstatic.com${heroConstants[pick.hero_id].icon.replace(/\?$/, "")}`
            : null,
        });
        const pickedHeroes = picks
          .filter((pick) => pick.is_pick)
          .sort((a, b) => a.order - b.order);
        return {
          gameNumber: index + 1,
          matchId: match.match_id,
          apiStartTime: new Date(match.start_time * 1000).toISOString(),
          apiVodOffsetSeconds,
          draftStartSeconds: clamp(apiVodOffsetSeconds, 0, duration),
          heroes: {
            teamA: pickedHeroes
              .filter((pick) => (pick.team === 0 ? match.radiant_team_id : match.dire_team_id) === ids[0])
              .map(safeHero),
            teamB: pickedHeroes
              .filter((pick) => (pick.team === 0 ? match.radiant_team_id : match.dire_team_id) === ids[1])
              .map(safeHero),
          },
          hudSearchWindow: {
            fromSeconds: clamp(
              apiVodOffsetSeconds + HUD_WINDOW_AFTER_MATCH_START.earliestSeconds,
              0,
              duration,
            ),
            toSeconds: clamp(
              apiVodOffsetSeconds + HUD_WINDOW_AFTER_MATCH_START.latestSeconds,
              0,
              duration,
            ),
          },
        };
      }),
    };
  });

  return {
    source: "OpenDota",
    generatedAt: new Date().toISOString(),
    videoId,
    streamStart,
    streamEnd,
    league: { id: league.leagueid, name: league.name },
    caveat: "OpenDota start_time precedes the gameplay HUD. Search windows are candidates and must pass HUD/team/game-clock verification before publication.",
    series,
  };
}

export async function getOpenDotaCandidates({
  title,
  videoId,
  streamStart,
  streamEnd,
  leagueId,
}) {
  const leagues = await getJson("/leagues");
  const league = leagueId
    ? leagues.find((candidate) => candidate.leagueid === Number(leagueId))
    : findLeagueForTitle(leagues, title);
  if (!league) {
    throw new Error("Could not identify an OpenDota league from the broadcast title; set OPENDOTA_LEAGUE_ID");
  }

  const [matches, teams, heroConstants] = await Promise.all([
    getJson(`/leagues/${league.leagueid}/matches`),
    getJson(`/leagues/${league.leagueid}/teams`),
    getJson("/constants/heroes"),
  ]);
  const startEpoch = Math.floor(new Date(streamStart).getTime() / 1000);
  const endEpoch = Math.floor(new Date(streamEnd).getTime() / 1000);
  const relevantMatches = matches.filter(
    (match) => match.start_time >= startEpoch - 30 * 60 && match.start_time <= endEpoch,
  );
  const matchDetails = await Promise.all(
    relevantMatches.map((match) => getJson(`/matches/${match.match_id}`)),
  );
  return buildCandidateReport({
    league,
    matches,
    teams,
    matchDetails,
    heroConstants,
    videoId,
    streamStart,
    streamEnd,
  });
}
