export type GameLink = {
  number: 1 | 2 | 3;
  startSeconds: number;
  draftStartSeconds: number;
  source: "verified" | "concealed-fallback";
  matchId?: number;
  heroes: {
    teamA: string[];
    teamB: string[];
  };
};

export type Series = {
  id: string;
  teamA: string;
  teamB: string;
  openDotaSeriesId: number;
  teamAId: number;
  teamBId: number;
  games: [GameLink, GameLink, GameLink];
};

const teamLogos: Record<number, string> = {
  2163: "https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/2163.png",
  726228: "https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/726228.png",
  2586976: "https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/2586976.png",
  5017210: "https://cdn.steamusercontent.com/ugc/14326265454983833183/734A1D8A0938380A48221CDAE1AACB0C5C0AB585/",
  8255888: "https://cdn.steamusercontent.com/ugc/9995426432403529725/51E13136D4CCC8C7D8062861541A1D13B8ED87E0/",
  9572001: "https://cdn.steamusercontent.com/ugc/10380389074903512947/5D074799695A862D17D4205285315FE20399B28D/",
  9823272: "https://cdn.steamusercontent.com/ugc/12970505637628494427/B04C3358F4E815ADFC2F8B1B8BE3AB0CE75C8881/",
  10136357: "https://cdn.steamusercontent.com/ugc/16959999218725724364/1D334B91A52606CA3E0027832D6F646E2A094391/",
  10149530: "https://cdn.steamusercontent.com/ugc/14844266645370842778/47230D9640A722EAF06548C2EEB813ED4296AE3F/",
  10150413: "https://cdn.steamusercontent.com/ugc/16903873521422862552/02513782FE03E7A567B8B8955A0DEF415EF2B624/",
};

export function teamLogoUrl(teamId: number) {
  return teamLogos[teamId];
}

export type Vod = {
  id: string;
  tournamentId: string;
  event: string;
  stage: string;
  stream: string;
  date: string;
  language: "English";
  thumbnail: string;
  series: Series[];
};

export type Tournament = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  year: number;
};

export const tournaments: Tournament[] = [
  {
    id: "ti-2026",
    slug: "the-international-2026",
    name: "The International 2026",
    shortName: "TI 2026",
    year: 2026,
  },
];

const played = (
  number: 1 | 2 | 3,
  draftStartSeconds: number,
  startSeconds: number,
  matchId: number,
  teamAHeroes: string[],
  teamBHeroes: string[],
): GameLink => ({
  number,
  startSeconds,
  draftStartSeconds,
  source: "verified",
  matchId,
  heroes: { teamA: teamAHeroes, teamB: teamBHeroes },
});

// A best-of-three always renders three indistinguishable links. When game three
// was not played, its link repeats game two. This conceals the series length on
// the listing page without inventing a result or exposing the next matchup.
const concealedThird = (
  draftStartSeconds: number,
  startSeconds: number,
  teamAHeroes: string[],
  teamBHeroes: string[],
): GameLink => ({
  number: 3,
  startSeconds,
  draftStartSeconds,
  source: "concealed-fallback",
  heroes: { teamA: teamAHeroes, teamB: teamBHeroes },
});

export const vods: Vod[] = [
  {
    id: "giB1GPD9YBs",
    tournamentId: "ti-2026",
    event: "The International 2026",
    stage: "Group Stage · Day 1",
    stream: "English Stream D",
    date: "2026-08-13",
    language: "English",
    thumbnail: "https://i.ytimg.com/vi/giB1GPD9YBs/maxresdefault.jpg",
    series: [
      {
        id: "team-resilience-vs-team-vision",
        teamA: "Team Resilience",
        teamB: "TEAM VISION",
        openDotaSeriesId: 1130027,
        teamAId: 5017210,
        teamBId: 9572001,
        games: [
          played(1, 6508, 7264, 8943010675, ["Winter Wyvern", "Earth Spirit", "Axe", "Rubick", "Spectre"], ["Lina", "Dark Willow", "Mirana", "Centaur Warrunner", "Tiny"]),
          played(2, 11158, 11984, 8943053016, ["Earth Spirit", "Snapfire", "Clockwerk", "Drow Ranger", "Phoenix"], ["Shadow Fiend", "Undying", "Rubick", "Slardar", "Lycan"]),
          played(3, 15919, 16696, 8943098449, ["Keeper of the Light", "Winter Wyvern", "Timbersaw", "Vengeful Spirit", "Sand King"], ["Nature's Prophet", "Undying", "Dark Willow", "Doom", "Snapfire"]),
        ],
      },
      {
        id: "team-yandex-vs-huligani",
        teamA: "Team Yandex",
        teamB: "HULIGANI",
        openDotaSeriesId: 1130053,
        teamAId: 9823272,
        teamBId: 10149530,
        games: [
          played(1, 19990, 20870, 8943142948, ["Lone Druid", "Keeper of the Light", "Undying", "Slark", "Underlord"], ["Hoodwink", "Winter Wyvern", "Ember Spirit", "Dark Seer", "Alchemist"]),
          played(2, 23321, 24094, 8943182700, ["Undying", "Shadow Fiend", "Dark Seer", "Bounty Hunter", "Earth Spirit"], ["Centaur Warrunner", "Clockwerk", "Hoodwink", "Invoker", "Necrophos"]),
          concealedThird(23321, 24094, ["Undying", "Shadow Fiend", "Dark Seer", "Bounty Hunter", "Earth Spirit"], ["Centaur Warrunner", "Clockwerk", "Hoodwink", "Invoker", "Necrophos"]),
        ],
      },
      {
        id: "nigma-galaxy-vs-og",
        teamA: "Nigma Galaxy",
        teamB: "OG",
        openDotaSeriesId: 1130066,
        teamAId: 10136357,
        teamBId: 2586976,
        games: [
          played(1, 28050, 28890, 8943244303, ["Largo", "Ember Spirit", "Dazzle", "Shadow Shaman", "Shadow Fiend"], ["Windranger", "Dark Willow", "Earthshaker", "Muerta", "Beastmaster"]),
          played(2, 32969, 33690, 8943324841, ["Mirana", "Enigma", "Clockwerk", "Sven", "Lina"], ["Windranger", "Undying", "Gyrocopter", "Rubick", "Dragon Knight"]),
          concealedThird(32969, 33690, ["Mirana", "Enigma", "Clockwerk", "Sven", "Lina"], ["Windranger", "Undying", "Gyrocopter", "Rubick", "Dragon Knight"]),
        ],
      },
    ],
  },
  {
    id: "VaZpuoMhjmg",
    tournamentId: "ti-2026",
    event: "The International 2026",
    stage: "Group Stage · Day 1",
    stream: "English Stream B",
    date: "2026-08-13",
    language: "English",
    thumbnail: "https://i.ytimg.com/vi/VaZpuoMhjmg/maxresdefault.jpg",
    series: [
      {
        id: "nigma-galaxy-vs-iron-wing",
        teamA: "Nigma Galaxy",
        teamB: "Iron Wing",
        openDotaSeriesId: 1130028,
        teamAId: 10136357,
        teamBId: 10150413,
        games: [
          played(1, 6766, 7810, 8943000927, ["Mirana", "Clockwerk", "Lifestealer", "Slardar", "Huskar"], ["Hoodwink", "Centaur Warrunner", "Undying", "Morphling", "Earthshaker"]),
          played(2, 10720, 11670, 8943038404, ["Largo", "Shadow Shaman", "Bane", "Storm Spirit", "Necrophos"], ["Hoodwink", "Earth Spirit", "Ring Master", "Kez", "Lycan"]),
          concealedThird(10720, 11670, ["Largo", "Shadow Shaman", "Bane", "Storm Spirit", "Necrophos"], ["Hoodwink", "Earth Spirit", "Ring Master", "Kez", "Lycan"]),
        ],
      },
      {
        id: "team-liquid-vs-vici-gaming",
        teamA: "Team Liquid",
        teamB: "Vici Gaming",
        openDotaSeriesId: 1130045,
        teamAId: 2163,
        teamBId: 726228,
        games: [
          played(1, 16301, 17153, 8943091110, ["Lina", "Clockwerk", "Winter Wyvern", "Underlord", "Kez"], ["Earth Spirit", "Tusk", "Windranger", "Viper", "Io"]),
          played(2, 21738, 22697, 8943148045, ["Winter Wyvern", "Windranger", "Ember Spirit", "Slardar", "Sven"], ["Lone Druid", "Puck", "Elder Titan", "Brewmaster", "Dark Willow"]),
          concealedThird(21738, 22697, ["Winter Wyvern", "Windranger", "Ember Spirit", "Slardar", "Sven"], ["Lone Druid", "Puck", "Elder Titan", "Brewmaster", "Dark Willow"]),
        ],
      },
      {
        id: "boom-boys-vs-iron-wing",
        teamA: "Boom Boys",
        teamB: "Iron Wing",
        openDotaSeriesId: 1130060,
        teamAId: 8255888,
        teamBId: 10150413,
        games: [
          played(1, 26225, 27102, 8943202720, ["Bane", "Ring Master", "Kez", "Slardar", "Snapfire"], ["Hoodwink", "Io", "Tusk", "Earthshaker", "Centaur Warrunner"]),
          played(2, 31352, 32254, 8943278347, ["Largo", "Shadow Shaman", "Elder Titan", "Puck", "Drow Ranger"], ["Hoodwink", "Bane", "Kez", "Doom", "Tiny"]),
          played(3, 35757, 36640, 8943357930, ["Largo", "Elder Titan", "Mirana", "Puck", "Drow Ranger"], ["Hoodwink", "Ring Master", "Ember Spirit", "Doom", "Alchemist"]),
        ],
      },
    ],
  },
];

export function youtubeUrl(videoId: string, seconds: number) {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.round(seconds))}s`;
}

// Most hero asset names follow the localized name. These are Valve's internal
// exceptions, as reported by OpenDota's /constants/heroes response.
const heroAssetExceptions: Record<string, string> = {
  "Centaur Warrunner": "centaur",
  Clockwerk: "rattletrap",
  Doom: "doom_bringer",
  Io: "wisp",
  Lifestealer: "life_stealer",
  Necrophos: "necrolyte",
  "Ring Master": "ringmaster",
  Underlord: "abyssal_underlord",
  Windranger: "windrunner",
};

export function heroIconUrl(heroName: string) {
  const slug = heroAssetExceptions[heroName] ?? heroName.toLowerCase().replace(/\s+/g, "_");
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${slug}.png`;
}
