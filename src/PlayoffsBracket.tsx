import { archives, type MatchRecord } from "./vods";

type PlayoffMatch = {
  id: string;
  label: string;
  format: "BO3" | "BO5";
  slots: [string, string];
  sourcePair?: [string, string];
};

type PlayoffRound = {
  id: string;
  label: string;
  shortLabel: string;
  matches: PlayoffMatch[];
};

const rounds: PlayoffRound[] = [
  {
    id: "upper-quarterfinals",
    label: "Upper quarterfinals",
    shortLabel: "UB QF",
    matches: [
      { id: "ub-qf-1", label: "Match 1", format: "BO3", slots: ["Iron Wing", "Team Spirit"], sourcePair: ["Iron Wing", "Team Spirit"] },
      { id: "ub-qf-2", label: "Match 2", format: "BO3", slots: ["PARIVISION", "BetBoom Team"], sourcePair: ["PARIVISION", "BetBoom Team"] },
      { id: "ub-qf-3", label: "Match 3", format: "BO3", slots: ["Team Liquid", "Team Yandex"], sourcePair: ["Team Liquid", "Team Yandex"] },
      { id: "ub-qf-4", label: "Match 4", format: "BO3", slots: ["Nigma Galaxy", "Team Falcons"], sourcePair: ["Nigma Galaxy", "Team Falcons"] },
    ],
  },
  {
    id: "upper-semifinals",
    label: "Upper semifinals",
    shortLabel: "UB SF",
    matches: [
      { id: "ub-sf-1", label: "Match 5", format: "BO3", slots: ["Winner UB QF 1", "Winner UB QF 2"] },
      { id: "ub-sf-2", label: "Match 6", format: "BO3", slots: ["Winner UB QF 3", "Winner UB QF 4"] },
    ],
  },
  {
    id: "upper-final",
    label: "Upper final",
    shortLabel: "UB F",
    matches: [
      { id: "ub-f", label: "Match 7", format: "BO3", slots: ["Winner UB SF 1", "Winner UB SF 2"] },
    ],
  },
  {
    id: "grand-final",
    label: "Grand final",
    shortLabel: "GF",
    matches: [
      { id: "grand-final", label: "Championship match", format: "BO5", slots: ["Winner UB F", "Winner LB F"] },
    ],
  },
];

const lowerRounds: PlayoffRound[] = [
  {
    id: "lower-round-one",
    label: "Lower round one",
    shortLabel: "LB R1",
    matches: [
      { id: "lb-r1-1", label: "Match 8", format: "BO3", slots: ["Loser UB QF 1", "Loser UB QF 2"] },
      { id: "lb-r1-2", label: "Match 9", format: "BO3", slots: ["Loser UB QF 3", "Loser UB QF 4"] },
    ],
  },
  {
    id: "lower-quarterfinals",
    label: "Lower quarterfinals",
    shortLabel: "LB QF",
    matches: [
      { id: "lb-qf-1", label: "Match 10", format: "BO3", slots: ["Loser UB SF 1", "Winner LB R1 1"] },
      { id: "lb-qf-2", label: "Match 11", format: "BO3", slots: ["Loser UB SF 2", "Winner LB R1 2"] },
    ],
  },
  {
    id: "lower-semifinals",
    label: "Lower semifinals",
    shortLabel: "LB SF",
    matches: [
      { id: "lb-sf", label: "Match 12", format: "BO3", slots: ["Winner LB QF 1", "Winner LB QF 2"] },
    ],
  },
  {
    id: "lower-final",
    label: "Lower final",
    shortLabel: "LB F",
    matches: [
      { id: "lb-f", label: "Match 13", format: "BO3", slots: ["Loser UB F", "Winner LB SF"] },
    ],
  },
];

const allRounds = [...rounds, ...lowerRounds];
const totalMatches = allRounds.reduce((total, round) => total + round.matches.length, 0);
const knownTeamNames = new Set([
  "Iron Wing",
  "Team Spirit",
  "PARIVISION",
  "BetBoom Team",
  "Team Liquid",
  "Team Yandex",
  "Nigma Galaxy",
  "Team Falcons",
]);

function normalizeTeamName(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized === "1w team" || normalized === "1w") return "iron wing";
  if (normalized === "boomboys" || normalized === "bb team") return "betboom team";
  return normalized;
}

function sourceMatchFor(playoffMatch: PlayoffMatch, allMatches: MatchRecord[]) {
  if (!playoffMatch.sourcePair) return undefined;
  const expected = playoffMatch.sourcePair.map(normalizeTeamName).sort().join("|");
  const mainEventIds = new Set(archives
    .filter((archive) => archive.tournament.id === "ti-2026" && archive.stage.startsWith("Main Event"))
    .flatMap((archive) => archive.matches.map((match) => match.id)));
  return allMatches.find((match) => mainEventIds.has(match.id) && [match.teamA, match.teamB].map(normalizeTeamName).sort().join("|") === expected);
}

function sourceHref(match: MatchRecord) {
  const archive = archives.find((item) => item.matches.some((candidate) => candidate.id === match.id));
  if (!archive) return null;
  const params = new URLSearchParams({ search: `${match.teamA} ${match.teamB}`, searchType: "teams" });
  return `/tournaments/${archive.tournament.slug}/${archive.date}?${params}`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

function TeamBadge({ name, allMatches }: { name: string; allMatches: MatchRecord[] }) {
  const team = allMatches
    .flatMap((match) => [
      { name: match.teamA, logoUrl: match.teamALogoUrl },
      { name: match.teamB, logoUrl: match.teamBLogoUrl },
    ])
    .find((candidate) => normalizeTeamName(candidate.name) === normalizeTeamName(name));
  return <span className="playoff-team-badge"><span>{initials(name)}</span>{team?.logoUrl && <img src={team.logoUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</span>;
}

function PlayoffMatchCard({ playoffMatch, allMatches }: { playoffMatch: PlayoffMatch; allMatches: MatchRecord[] }) {
  const sourceMatch = sourceMatchFor(playoffMatch, allMatches);
  const href = sourceMatch ? sourceHref(sourceMatch) : null;
  const ready = Boolean(sourceMatch);
  return <article className={`playoff-match-card ${ready ? "archived" : "upcoming"}`} aria-label={`${playoffMatch.slots[0]} versus ${playoffMatch.slots[1]}`}>
    <div className="playoff-match-head"><span>{playoffMatch.label}</span><strong>{playoffMatch.format}</strong></div>
    <div className="playoff-team-list">
      {playoffMatch.slots.map((slot, index) => knownTeamNames.has(slot)
        ? <div className="playoff-team-row" key={slot}><TeamBadge name={slot} allMatches={allMatches} /><span>{slot}</span><small>{index === 0 ? "A" : "B"}</small></div>
        : <div className="playoff-slot-row" key={slot}><span className="playoff-slot-mark">{index === 0 ? "↗" : "↘"}</span><span>{slot}</span></div>)}
    </div>
    <div className="playoff-match-foot"><span className="playoff-match-status">{ready ? "ARCHIVE READY" : "AWAITING RESULT"}</span>{href ? <a href={href}>Open VODs ↗</a> : <span>Not played yet</span>}</div>
  </article>;
}

function PlayoffRoundColumn({ round, allMatches }: { round: PlayoffRound; allMatches: MatchRecord[] }) {
  return <section className={`playoff-round-column ${round.id}`} aria-label={round.label}>
    <header className="playoff-round-head"><div><span>{round.shortLabel}</span><h3>{round.label}</h3></div><small>{round.matches.length} {round.matches.length === 1 ? "series" : "series"}</small></header>
    <div className="playoff-round-matches">{round.matches.map((playoffMatch) => <PlayoffMatchCard key={playoffMatch.id} playoffMatch={playoffMatch} allMatches={allMatches} />)}</div>
  </section>;
}

export function PlayoffsBracket({ matches }: { matches: MatchRecord[] }) {
  const archivedMatches = rounds.flatMap((round) => round.matches).filter((playoffMatch) => sourceMatchFor(playoffMatch, matches)).length;
  const vodArchive = archives.find((archive) => archive.tournament.id === "ti-2026" && archive.stage.startsWith("Main Event"));
  const vodHref = vodArchive ? `/tournaments/${vodArchive.tournament.slug}/${vodArchive.date}` : "/tournaments/the-international-2026";

  return <main className="playoffs-page">
    <section className="playoffs-hero">
      <div className="playoffs-hero-grid" />
      <div className="playoffs-hero-copy">
        <p className="playoffs-kicker"><span className="live-dot" /> TI 2026 · Main Event</p>
        <h1>Playoffs<br /> <em>bracket</em></h1>
        <p>Eight teams. Two lives. Follow the road to the Aegis without putting scores or winners in your way.</p>
      </div>
      <div className="playoffs-hero-mark" aria-hidden="true"><span>TI</span><small>2026</small></div>
    </section>

    <section className="playoffs-controls" aria-label="Playoffs bracket summary">
      <div><span className="section-label">Double-elimination Main Event</span><p>Slots advance by round, while your VOD boundary stays spoiler-safe.</p></div>
      <div className="playoffs-control-actions"><span className="playoffs-progress"><strong>{archivedMatches}</strong>/{totalMatches} series archived</span><a className="playoffs-vods-link" href={vodHref}>Open Main Event VODs ↗</a></div>
    </section>

    <section className="playoffs-board-wrap" aria-label="TI 2026 playoffs bracket">
      <div className="playoffs-board-intro"><span>UPPER BRACKET</span><span>Open archived series when you are ready →</span></div>
      <div className="playoffs-board-scroll"><div className="playoffs-board">
        <div className="playoffs-upper-label">Upper bracket <span>One loss remains survivable</span></div>
        <div className="playoffs-round-grid playoffs-upper-grid">{rounds.map((round) => <PlayoffRoundColumn key={round.id} round={round} allMatches={matches} />)}</div>
        <div className="playoffs-lower-label">Lower bracket <span>Every match is do-or-die</span></div>
        <div className="playoffs-round-grid playoffs-lower-grid">{lowerRounds.map((round) => <PlayoffRoundColumn key={round.id} round={round} allMatches={matches} />)}</div>
      </div></div>
      <p className="playoffs-footnote"><span>◎</span> Scores and winners stay hidden. Your archive progress stays on this device.</p>
    </section>
  </main>;
}
