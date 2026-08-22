import { useEffect, useMemo, useState } from "react";
import { archives, type MatchRecord } from "./vods";
import playoffResults from "./ti-2026-playoffs-results.json";

type PlayoffMatch = {
  id: string;
  label: string;
  format: "BO3" | "BO5";
  slots: [string, string];
  sourcePair?: [string, string];
  sourceMatchPageId: string;
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
      { id: "ub-qf-1", label: "Match 1", format: "BO3", slots: ["Iron Wing", "Team Spirit"], sourcePair: ["Iron Wing", "Team Spirit"], sourceMatchPageId: "R01-M001" },
      { id: "ub-qf-2", label: "Match 2", format: "BO3", slots: ["PARIVISION", "BetBoom Team"], sourcePair: ["PARIVISION", "BetBoom Team"], sourceMatchPageId: "R01-M002" },
      { id: "ub-qf-3", label: "Match 3", format: "BO3", slots: ["Team Liquid", "Team Yandex"], sourcePair: ["Team Liquid", "Team Yandex"], sourceMatchPageId: "R01-M003" },
      { id: "ub-qf-4", label: "Match 4", format: "BO3", slots: ["Nigma Galaxy", "Team Falcons"], sourcePair: ["Nigma Galaxy", "Team Falcons"], sourceMatchPageId: "R01-M004" },
    ],
  },
  {
    id: "upper-semifinals",
    label: "Upper semifinals",
    shortLabel: "UB SF",
    matches: [
      { id: "ub-sf-1", label: "Match 5", format: "BO3", slots: ["Winner UB QF 1", "Winner UB QF 2"], sourceMatchPageId: "R02-M001" },
      { id: "ub-sf-2", label: "Match 6", format: "BO3", slots: ["Winner UB QF 3", "Winner UB QF 4"], sourceMatchPageId: "R02-M002" },
    ],
  },
  {
    id: "upper-final",
    label: "Upper final",
    shortLabel: "UB F",
    matches: [
      { id: "ub-f", label: "Match 7", format: "BO3", slots: ["Winner UB SF 1", "Winner UB SF 2"], sourceMatchPageId: "R04-M001" },
    ],
  },
  {
    id: "grand-final",
    label: "Grand final",
    shortLabel: "GF",
    matches: [
      { id: "grand-final", label: "Championship match", format: "BO5", slots: ["Winner UB F", "Winner LB F"], sourceMatchPageId: "R05-M001" },
    ],
  },
];

const lowerRounds: PlayoffRound[] = [
  {
    id: "lower-round-one",
    label: "Lower round one",
    shortLabel: "LB R1",
    matches: [
      { id: "lb-r1-1", label: "Match 8", format: "BO3", slots: ["Loser UB QF 1", "Loser UB QF 2"], sourcePair: ["Iron Wing", "BetBoom Team"], sourceMatchPageId: "R01-M005" },
      { id: "lb-r1-2", label: "Match 9", format: "BO3", slots: ["Loser UB QF 3", "Loser UB QF 4"], sourcePair: ["Team Liquid", "Team Falcons"], sourceMatchPageId: "R01-M006" },
    ],
  },
  {
    id: "lower-quarterfinals",
    label: "Lower quarterfinals",
    shortLabel: "LB QF",
    matches: [
      { id: "lb-qf-1", label: "Match 10", format: "BO3", slots: ["Loser UB SF 2", "Winner LB R1 1"], sourceMatchPageId: "R02-M003" },
      { id: "lb-qf-2", label: "Match 11", format: "BO3", slots: ["Loser UB SF 1", "Winner LB R1 2"], sourceMatchPageId: "R02-M004" },
    ],
  },
  {
    id: "lower-semifinals",
    label: "Lower semifinals",
    shortLabel: "LB SF",
    matches: [
      { id: "lb-sf", label: "Match 12", format: "BO3", slots: ["Winner LB QF 1", "Winner LB QF 2"], sourceMatchPageId: "R03-M001" },
    ],
  },
  {
    id: "lower-final",
    label: "Lower final",
    shortLabel: "LB F",
    matches: [
      { id: "lb-f", label: "Match 13", format: "BO3", slots: ["Loser UB F", "Winner LB SF"], sourceMatchPageId: "R04-M002" },
    ],
  },
];

const allRounds = [...rounds, ...lowerRounds];
const totalMatches = allRounds.reduce((total, round) => total + round.matches.length, 0);
const resultByMatchId = playoffResults as Record<string, string>;
const revealStorageKey = "riki-ti-2026-playoffs-reveals-v1";
const referenceMatchIds: Record<string, string> = {
  "UB QF 1": "ub-qf-1",
  "UB QF 2": "ub-qf-2",
  "UB QF 3": "ub-qf-3",
  "UB QF 4": "ub-qf-4",
  "UB SF 1": "ub-sf-1",
  "UB SF 2": "ub-sf-2",
  "UB F": "ub-f",
  "LB R1 1": "lb-r1-1",
  "LB R1 2": "lb-r1-2",
  "LB QF 1": "lb-qf-1",
  "LB QF 2": "lb-qf-2",
  "LB SF": "lb-sf",
  "LB F": "lb-f",
};

// Matchups with concrete team slots (later rounds gain sourcePairs once their
// participants are known). Exported so tests can derive expectations from the
// archive instead of hardcoding counts that break whenever it grows.
export const playoffSourcePairs: [string, string][] = allRounds
  .flatMap((round) => round.matches)
  .map((match) => match.sourcePair)
  .filter((pair): pair is [string, string] => Boolean(pair));

export const playoffSourceMatchPageIds = allRounds
  .flatMap((round) => round.matches)
  .map((match) => match.sourceMatchPageId);

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

export function normalizeTeamName(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized === "1w team" || normalized === "1w") return "iron wing";
  if (normalized === "boomboys" || normalized === "bb team") return "betboom team";
  if (normalized === "pvision" || normalized === "team vision") return "parivision";
  return normalized;
}

function slotReference(slot: string) {
  const match = slot.match(/^(Winner|Loser) (.+)$/);
  if (!match) return null;
  const matchId = referenceMatchIds[match[2]];
  return matchId ? { matchId, outcome: match[1].toLowerCase() as "winner" | "loser" } : null;
}

function sameTeam(left: string | null, right: string | null) {
  return Boolean(left && right && normalizeTeamName(left) === normalizeTeamName(right));
}

function sourceMatchFor(playoffMatch: PlayoffMatch, allMatches: MatchRecord[]) {
  const mainEventIds = new Set(archives
    .filter((archive) => archive.tournament.id === "ti-2026" && archive.stage.startsWith("Main Event"))
    .flatMap((archive) => archive.matches.map((match) => match.id)));
  const mainEventMatches = allMatches.filter((match) => mainEventIds.has(match.id));

  // Explicit pairs cover known matchups while keeping the bracket spoiler-safe.
  if (playoffMatch.sourcePair) {
    const expected = playoffMatch.sourcePair.map(normalizeTeamName).sort().join("|");
    const explicit = mainEventMatches.find((match) => [match.teamA, match.teamB].map(normalizeTeamName).sort().join("|") === expected);
    if (explicit) return explicit;
  }

  // Liquipedia's Main Event match-page IDs are stable even as scheduled days
  // are added to the snapshots. This fallback makes each newly published
  // series appear automatically without another source-pair edit.
  return mainEventMatches.find((match) => match.matchPageUrl?.includes(playoffMatch.sourceMatchPageId));
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

function PlayoffMatchCard({ playoffMatch, allMatches, revealed, resolveSlot, canReveal, onReveal }: { playoffMatch: PlayoffMatch; allMatches: MatchRecord[]; revealed: Set<string>; resolveSlot: (slot: string) => string | null; canReveal: (match: PlayoffMatch) => boolean; onReveal: (matchId: string) => void }) {
  const sourceMatch = sourceMatchFor(playoffMatch, allMatches);
  const href = sourceMatch ? sourceHref(sourceMatch) : null;
  const matchTeams = playoffMatch.slots.map((slot) => resolveSlot(slot));
  const matchupName = matchTeams.map((team, index) => team ?? playoffMatch.slots[index]).join(" versus ");
  const isRevealed = revealed.has(playoffMatch.id);
  const ready = canReveal(playoffMatch);
  const winner = isRevealed ? resultByMatchId[playoffMatch.id] ?? null : null;
  const status = isRevealed ? "WINNER REVEALED" : ready ? "CLICK TO REVEAL" : resultByMatchId[playoffMatch.id] ? "LOCKED" : "AWAITING RESULT";
  return <article className={`playoff-match-card ${sourceMatch ? "archived" : "upcoming"} ${isRevealed ? "revealed" : ready ? "ready" : "locked"}`} aria-label={matchupName}>
    <button type="button" className="playoff-match-surface" disabled={!ready && !isRevealed} onClick={() => onReveal(playoffMatch.id)} aria-label={isRevealed ? `${matchupName} winner revealed` : ready ? `Reveal winner for ${matchupName}` : resultByMatchId[playoffMatch.id] ? `Waiting on prior result for ${matchupName}` : `Waiting for result for ${matchupName}`}>
      <div className="playoff-match-head"><span>{playoffMatch.label}</span><strong>{playoffMatch.format}</strong></div>
      <div className="playoff-team-list">
        {playoffMatch.slots.map((slot, index) => {
          const team = matchTeams[index];
          if (!team) return <div className="playoff-slot-row" key={slot}><span className="playoff-slot-mark">{index === 0 ? "↗" : "↘"}</span><span>{slot}</span></div>;
          const winningTeam = sameTeam(team, winner);
          return <div className={`playoff-team-row ${isRevealed ? winningTeam ? "winner" : "loser" : ""}`} key={slot}><TeamBadge name={team} allMatches={allMatches} /><span>{team}</span>{winningTeam && <strong className="playoff-winner-tag">WINNER</strong>}{!isRevealed && <small>{index === 0 ? "A" : "B"}</small>}</div>;
        })}
      </div>
      <span className="playoff-reveal-label">{status}</span>
    </button>
    <div className="playoff-match-foot"><span className="playoff-match-status">{sourceMatch ? "VOD AVAILABLE" : "NOT ARCHIVED"}</span>{href ? <a href={href}>Open VODs ↗</a> : <span>Not played yet</span>}</div>
  </article>;
}

function PlayoffRoundColumn({ round, allMatches, revealed, resolveSlot, canReveal, onReveal, onRevealRound }: { round: PlayoffRound; allMatches: MatchRecord[]; revealed: Set<string>; resolveSlot: (slot: string) => string | null; canReveal: (match: PlayoffMatch) => boolean; onReveal: (matchId: string) => void; onRevealRound: (round: PlayoffRound) => void }) {
  const pending = round.matches.filter((match) => !revealed.has(match.id));
  const roundReady = pending.length > 0 && pending.every(canReveal);
  return <section className={`playoff-round-column ${round.id}`} aria-label={round.label}>
    <header className="playoff-round-head"><div><span>{round.shortLabel}</span><h3>{round.label}</h3></div>{pending.length > 0 ? <button type="button" className="playoff-round-reveal" disabled={!roundReady} onClick={() => onRevealRound(round)}>Reveal round</button> : <small>Revealed</small>}</header>
    <div className="playoff-round-matches">{round.matches.map((playoffMatch) => <PlayoffMatchCard key={playoffMatch.id} playoffMatch={playoffMatch} allMatches={allMatches} revealed={revealed} resolveSlot={resolveSlot} canReveal={canReveal} onReveal={onReveal} />)}</div>
  </section>;
}

export function PlayoffsBracket({ matches }: { matches: MatchRecord[] }) {
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const revealed = useMemo(() => new Set(revealedIds), [revealedIds]);
  const matchById = useMemo(() => new Map(allRounds.flatMap((round) => round.matches).map((match) => [match.id, match])), []);
  const vodArchive = archives.find((archive) => archive.tournament.id === "ti-2026" && archive.stage.startsWith("Main Event"));
  const vodHref = vodArchive ? `/tournaments/${vodArchive.tournament.slug}/${vodArchive.date}` : "/tournaments/the-international-2026";

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(revealStorageKey) || "[]");
      if (Array.isArray(saved)) setRevealedIds(saved.filter((item): item is string => typeof item === "string"));
    } catch {
      // A malformed local value should never block the bracket.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(revealStorageKey, JSON.stringify(revealedIds));
    } catch {
      // The bracket still works for the current session when storage is unavailable.
    }
  }, [hydrated, revealedIds]);

  function resolveMatchWinner(matchId: string): string | null {
    const bracketMatch = matchById.get(matchId);
    const actualWinner = resultByMatchId[matchId];
    if (!bracketMatch || !revealed.has(matchId) || !actualWinner) return null;
    const teams = bracketMatch.slots.map(resolveSlot);
    return teams.find((team) => sameTeam(team, actualWinner)) ?? null;
  }

  function resolveSlot(slot: string): string | null {
    if (knownTeamNames.has(slot)) return slot;
    const reference = slotReference(slot);
    if (!reference) return null;
    const sourceMatch = matchById.get(reference.matchId);
    const winner = resolveMatchWinner(reference.matchId);
    if (!sourceMatch || !winner) return null;
    if (reference.outcome === "winner") return winner;
    const sourceTeams = sourceMatch.slots.map(resolveSlot);
    return sourceTeams.find((team) => team && !sameTeam(team, winner)) ?? null;
  }

  function canReveal(playoffMatch: PlayoffMatch) {
    return !revealed.has(playoffMatch.id)
      && Boolean(resultByMatchId[playoffMatch.id])
      && playoffMatch.slots.every((slot) => Boolean(resolveSlot(slot)));
  }

  function revealMatch(matchId: string) {
    setRevealedIds((current) => current.includes(matchId) ? current : [...current, matchId]);
  }

  function revealRound(round: PlayoffRound) {
    setRevealedIds((current) => Array.from(new Set([...current, ...round.matches.map((match) => match.id)])));
  }

  const readyCount = allRounds.flatMap((round) => round.matches).filter(canReveal).length;

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
      <div className="playoffs-control-actions"><span className="playoffs-progress"><strong>{revealedIds.length}</strong>/{totalMatches} results revealed · {readyCount} ready</span><a className="playoffs-vods-link" href={vodHref}>Open Main Event VODs ↗</a><button type="button" className="playoffs-reset" onClick={() => setRevealedIds([])}>Reset reveals</button></div>
    </section>

    <section className="playoffs-board-wrap" aria-label="TI 2026 playoffs bracket">
      <div className="playoffs-board-intro"><span>UPPER BRACKET</span><span>Open archived series when you are ready →</span></div>
      <div className="playoffs-board-scroll"><div className="playoffs-board">
        <div className="playoffs-upper-label">Upper bracket <span>One loss remains survivable</span></div>
        <div className="playoffs-round-grid playoffs-upper-grid">{rounds.map((round) => <PlayoffRoundColumn key={round.id} round={round} allMatches={matches} revealed={revealed} resolveSlot={resolveSlot} canReveal={canReveal} onReveal={revealMatch} onRevealRound={revealRound} />)}</div>
        <div className="playoffs-lower-label">Lower bracket <span>Every match is do-or-die</span></div>
        <div className="playoffs-round-grid playoffs-lower-grid">{lowerRounds.map((round) => <PlayoffRoundColumn key={round.id} round={round} allMatches={matches} revealed={revealed} resolveSlot={resolveSlot} canReveal={canReveal} onReveal={revealMatch} onRevealRound={revealRound} />)}</div>
      </div></div>
      <p className="playoffs-footnote"><span>◎</span> Scores stay hidden; winners reveal only when you choose. Your progress stays on this device.</p>
    </section>
  </main>;
}
