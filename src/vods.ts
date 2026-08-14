import ewcData from "./ewc-2026.json";

// Day snapshots are discovered by filename so a generated ti-2026-dayN.json
// is picked up without touching this module. Vite inlines the JSON at build
// time; the glob stays lazy so test transforms keep working.
const tiDayModules = import.meta.glob<{ default: ArchiveData }>("./ti-2026-day*.json", { eager: true });
const tiDayData = Object.values(tiDayModules)
  .map((module) => module.default as ArchiveData)
  .sort((left, right) => left.date.localeCompare(right.date));

export type HeroPick = {
  name: string;
  iconUrl: string | null;
};

export type PlayedGame = {
  number: 1 | 2 | 3 | 4 | 5;
  source: "opendota";
  matchId?: number;
  vodUrl: string | null;
  heroes: {
    teamA: HeroPick[];
    teamB: HeroPick[];
  };
};

// Concealed games pad a series to its best-of length. They carry no VOD and
// no hero picks: cloning a played sibling game would leak its draft (and video),
// and searchable hero names must never surface a game that was not played.
export type ConcealedGame = {
  number: 1 | 2 | 3 | 4 | 5;
  source: "concealed-fallback";
  vodUrl: null;
  heroes: {
    teamA: [];
    teamB: [];
  };
};

export type GameLink = PlayedGame | ConcealedGame;

export type MatchRecord = {
  id: string;
  openDotaSeriesId: number;
  bestOf: 2 | 3 | 5;
  matchPageUrl: string | null;
  teamA: string;
  teamB: string;
  teamAId: number;
  teamBId: number;
  teamALogoUrl: string | null;
  teamBLogoUrl: string | null;
  casters: string[];
  games: GameLink[];
};

export type ArchiveData = {
  tournament: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
  };
  date: string;
  stage: string;
  matches: MatchRecord[];
  sources: {
    opendota: string;
    liquipedia: string;
    attribution: string;
  };
  generatedAt: string;
};

export type Tournament = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  year: number;
};

export const archive = tiDayData[0] as ArchiveData;
export const archives: ArchiveData[] = [...tiDayData, ...(ewcData.archives as ArchiveData[])];
export const tournaments: Tournament[] = [...new Map(archives.map((item) => [item.tournament.id, {
  ...item.tournament,
  year: Number(item.date.slice(0, 4)),
}])).values()].sort((left, right) => {
  const leftDate = archives.find((item) => item.tournament.id === left.id)?.date ?? "";
  const rightDate = archives.find((item) => item.tournament.id === right.id)?.date ?? "";
  return leftDate.localeCompare(rightDate);
});
export const matches = archives.flatMap((item) => item.matches);

export function fallbackHeroIconUrl(name: string) {
  const exceptions: Record<string, string> = {
    "Centaur Warrunner": "centaur",
    Clockwerk: "rattletrap",
    Doom: "doom_bringer",
    Io: "wisp",
    Lifestealer: "life_stealer",
    Necrophos: "necrolyte",
    Ringmaster: "ringmaster",
    "Underlord": "abyssal_underlord",
    Windranger: "windrunner",
  };
  const slug = exceptions[name] ?? name.toLowerCase().replace(/\s+/g, "_");
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${slug}.png`;
}
