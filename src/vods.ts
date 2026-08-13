import dayOneData from "./ti-2026-day1.json";
import ewcData from "./ewc-2026.json";

export type HeroPick = {
  name: string;
  iconUrl: string | null;
};

export type GameLink = {
  number: 1 | 2 | 3 | 4 | 5;
  source: "opendota" | "concealed-fallback";
  matchId?: number;
  vodUrl: string | null;
  heroes: {
    teamA: HeroPick[];
    teamB: HeroPick[];
  };
};

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

export const archive = dayOneData as ArchiveData;
export const archives: ArchiveData[] = [archive, ...(ewcData.archives as ArchiveData[])];
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
