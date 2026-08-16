import { useEffect, useMemo, useState } from "react";
import type { MatchRecord } from "./vods";
import bracketResults from "./ti-2026-bracket-results.json";

type BracketTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type ResultRef = {
  matchId: string;
  outcome: "winner" | "loser";
};

type BracketSlot = BracketTeam | ResultRef;

type BracketMatch = {
  id: string;
  score: string;
  slots: [BracketSlot, BracketSlot];
  actualWinnerId: string;
  vodHref: string;
};

type BracketGroup = {
  label: string;
  matches: BracketMatch[];
  outcomes?: ResultRef[];
  outcome?: "qualified" | "eliminated";
};

type BracketColumn = {
  label: string;
  groups: BracketGroup[];
};

type BracketResult = {
  winnerId: number;
};

type RecordScore = {
  wins: number;
  losses: number;
};

const bracketStorageKey = "riki-ti-2026-bracket-reveals-v1";
const tiVodsPath = "/tournaments/the-international-2026/2026-08-13";
const resultByMatchId = bracketResults as Record<string, BracketResult>;

function vodHrefForMatch(match: MatchRecord) {
  const date = match.id.includes("day4") ? "2026-08-16" : match.id.includes("day3") ? "2026-08-15" : match.id.includes("day2") ? "2026-08-14" : "2026-08-13";
  const params = new URLSearchParams({ search: `${match.teamA} ${match.teamB}`, searchType: "teams" });
  return `/tournaments/the-international-2026/${date}?${params}`;
}

function teamFromMatch(match: MatchRecord, side: "A" | "B"): BracketTeam {
  return {
    id: String(side === "A" ? match.teamAId : match.teamBId),
    name: side === "A" ? match.teamA : match.teamB,
    logoUrl: side === "A" ? match.teamALogoUrl : match.teamBLogoUrl,
  };
}

function result(matchId: string, outcome: ResultRef["outcome"]): ResultRef {
  return { matchId, outcome };
}

function teamScore(scores: Map<number, RecordScore>, teamId: number) {
  return scores.get(teamId) ?? { wins: 0, losses: 0 };
}

function makeBracket(allMatches: MatchRecord[]): BracketColumn[] {
  const scores = new Map<number, RecordScore>();
  const previousMatchByTeam = new Map<number, string>();
  const bracketMatches: BracketMatch[] = [];

  for (const source of allMatches) {
    const bracketResult = resultByMatchId[source.id];
    if (!bracketResult) continue;

    const scoreA = teamScore(scores, source.teamAId);
    const scoreB = teamScore(scores, source.teamBId);
    const previousA = previousMatchByTeam.get(source.teamAId);
    const previousB = previousMatchByTeam.get(source.teamBId);
    const slotA = previousA
      ? result(previousA, resultByMatchId[previousA].winnerId === source.teamAId ? "winner" : "loser")
      : teamFromMatch(source, "A");
    const slotB = previousB
      ? result(previousB, resultByMatchId[previousB].winnerId === source.teamBId ? "winner" : "loser")
      : teamFromMatch(source, "B");

    bracketMatches.push({
      id: source.id,
      score: `${scoreA.wins}-${scoreA.losses}`,
      slots: [slotA, slotB],
      actualWinnerId: String(bracketResult.winnerId),
      vodHref: vodHrefForMatch(source),
    });

    scores.set(source.teamAId, {
      wins: scoreA.wins + (bracketResult.winnerId === source.teamAId ? 1 : 0),
      losses: scoreA.losses + (bracketResult.winnerId === source.teamBId ? 1 : 0),
    });
    scores.set(source.teamBId, {
      wins: scoreB.wins + (bracketResult.winnerId === source.teamBId ? 1 : 0),
      losses: scoreB.losses + (bracketResult.winnerId === source.teamAId ? 1 : 0),
    });
    previousMatchByTeam.set(source.teamAId, source.id);
    previousMatchByTeam.set(source.teamBId, source.id);
  }

  const groups = new Map<string, BracketMatch[]>();
  for (const bracketMatch of bracketMatches) {
    const current = groups.get(bracketMatch.score) ?? [];
    current.push(bracketMatch);
    groups.set(bracketMatch.score, current);
  }

  function outcomeRef(score: string, index: number, outcome: ResultRef["outcome"]) {
    const source = groups.get(score)?.[index];
    return source ? result(source.id, outcome) : null;
  }

  function outcomeRefs(score: string, outcome: ResultRef["outcome"]) {
    return (groups.get(score) ?? []).map((source) => result(source.id, outcome));
  }

  const qualifiedFromThreeZero = outcomeRef("3-0", 0, "winner");
  const eliminatedFromZeroThree = outcomeRef("0-3", 0, "loser");

  const columns = [
    { label: "ROUND 1", scores: ["0-0"] },
    { label: "ROUND 2", scores: ["1-0", "0-1"] },
    { label: "ROUND 3", scores: ["2-0", "1-1", "0-2"] },
    { label: "ROUND 4", scores: ["3-0", "2-1", "1-2", "0-3"] },
    { label: "ROUND 5", scores: ["3-1", "2-2", "1-3"] },
    { label: "ROUND 6", scores: ["3-2", "2-3"] },
  ];

  return columns.map((column) => {
    const scoreGroups = column.scores
      .map((score) => ({ label: score, matches: groups.get(score) ?? [] }))
      .filter((group) => group.matches.length > 0);
    if (column.label === "ROUND 4") {
      return {
        label: column.label,
        groups: [
          ...(qualifiedFromThreeZero ? [{ label: "QUALIFIED", matches: [], outcomes: [qualifiedFromThreeZero], outcome: "qualified" as const }] : []),
          ...scoreGroups.slice(0, 3),
          ...(scoreGroups[3] ? [scoreGroups[3]] : []),
          ...(eliminatedFromZeroThree ? [{ label: "ELIMINATED", matches: [], outcomes: [eliminatedFromZeroThree], outcome: "eliminated" as const }] : []),
        ],
      };
    }
    if (column.label === "ROUND 5") {
      const qualifiedFromThreeOne = outcomeRefs("3-1", "winner");
      const eliminatedFromOneThree = outcomeRefs("1-3", "loser");
      return {
        label: column.label,
        groups: [
          ...(qualifiedFromThreeOne.length ? [{ label: "QUALIFIED", matches: [], outcomes: qualifiedFromThreeOne, outcome: "qualified" as const }] : []),
          ...scoreGroups,
          ...(eliminatedFromOneThree.length ? [{ label: "ELIMINATED", matches: [], outcomes: eliminatedFromOneThree, outcome: "eliminated" as const }] : []),
        ],
      };
    }
    if (column.label === "ROUND 6") {
      const qualifiedFromThreeTwo = [...outcomeRefs("3-2", "winner"), ...outcomeRefs("2-3", "winner")];
      const eliminatedFromTwoThree = [...outcomeRefs("3-2", "loser"), ...outcomeRefs("2-3", "loser")];
      return {
        label: column.label,
        groups: [
          ...(qualifiedFromThreeTwo.length ? [{ label: "QUALIFIED", matches: [], outcomes: qualifiedFromThreeTwo, outcome: "qualified" as const }] : []),
          ...scoreGroups,
          ...(eliminatedFromTwoThree.length ? [{ label: "ELIMINATED", matches: [], outcomes: eliminatedFromTwoThree, outcome: "eliminated" as const }] : []),
        ],
      };
    }
    return { label: column.label, groups: scoreGroups };
  }).filter((column) => column.groups.length > 0);
}

function initials(team: BracketTeam) {
  return team.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

function TeamLogo({ team }: { team: BracketTeam }) {
  return <span className="bracket-team-logo"><span>{initials(team)}</span>{team.logoUrl && <img src={team.logoUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</span>;
}

function BracketMatchCard({
  bracketMatch,
  resolveSlot,
  revealed,
  onReveal,
}: {
  bracketMatch: BracketMatch;
  resolveSlot: (slot: BracketSlot) => BracketTeam | null;
  revealed: boolean;
  onReveal: (matchId: string) => void;
}) {
  const teams = bracketMatch.slots.map(resolveSlot) as [BracketTeam | null, BracketTeam | null];
  const winner = revealed ? teams.find((team) => team?.id === bracketMatch.actualWinnerId) ?? null : null;
  const canReveal = Boolean(teams[0] && teams[1]) && !revealed;
  const matchupName = teams.filter(Boolean).map((team) => team?.name).join(" versus ");

  return <article className={`bracket-match ${revealed ? "revealed" : ""} ${canReveal ? "ready" : "waiting"}`} aria-label={`${bracketMatch.score} ${matchupName || "matchup"}`}>
    <button type="button" className="bracket-match-surface" disabled={!canReveal} onClick={() => onReveal(bracketMatch.id)} aria-label={revealed ? `${matchupName} result revealed` : canReveal ? `Reveal winner for ${matchupName}` : "Waiting on prior result"}>
      <div className="bracket-match-label"><strong>{bracketMatch.score}</strong><span>{revealed ? "RESULT REVEALED" : canReveal ? "CLICK TO REVEAL" : "LOCKED"}</span></div>
      <div className="bracket-team-list">
        {teams.map((team, index) => team ? <div className={`bracket-team-row ${winner?.id === team.id ? "winner" : ""} ${revealed && winner?.id !== team.id ? "loser" : ""}`} key={team.id}><TeamLogo team={team} /><span>{team.name}</span>{winner?.id === team.id && <strong className="winner-tag">WINNER</strong>}{!revealed && <small>{index === 0 ? "A" : "B"}</small>}</div> : <div className="bracket-team-row empty" key={`empty-${bracketMatch.id}-${index}`}><span className="empty-logo">?</span><span>Waiting on prior result</span></div>)}
      </div>
      <div className="bracket-vs">VS</div>
      <span className="bracket-reveal-label">{revealed ? "Winner revealed" : canReveal ? "Reveal winner ↗" : "Waiting on prior game"}</span>
    </button>
    <a className="bracket-match-vod" href={bracketMatch.vodHref}>View VODs ↗</a>
  </article>;
}

function BracketOutcomeCard({ slot, resolveSlot, outcome }: { slot: ResultRef; resolveSlot: (slot: BracketSlot) => BracketTeam | null; outcome: "qualified" | "eliminated" }) {
  const team = resolveSlot(slot);
  return <div className={`bracket-outcome-card ${team ? "filled" : "waiting"}`}>
    <span className="outcome-mark">{outcome === "qualified" ? "↑" : "↓"}</span>
    {team ? <><TeamLogo team={team} /><strong>{team.name}</strong></> : <span>Waiting on result</span>}
  </div>;
}

function Group({
  group,
  resolveSlot,
  revealed,
  onReveal,
}: {
  group: BracketGroup;
  resolveSlot: (slot: BracketSlot) => BracketTeam | null;
  revealed: Set<string>;
  onReveal: (matchId: string) => void;
}) {
  return <section className={`bracket-group ${group.outcome ?? ""}`}>
    <div className="bracket-group-head"><h3>{group.label}</h3></div>
    <div className="bracket-group-matches">{group.outcomes?.map((slot, index) => <BracketOutcomeCard key={`${group.label}-${index}`} slot={slot} resolveSlot={resolveSlot} outcome={group.outcome ?? "qualified"} />)}{group.matches.map((bracketMatch) => <BracketMatchCard key={bracketMatch.id} bracketMatch={bracketMatch} resolveSlot={resolveSlot} revealed={revealed.has(bracketMatch.id)} onReveal={onReveal} />)}</div>
  </section>;
}

export function SwissBracket({ matches }: { matches: MatchRecord[] }) {
  const columns = useMemo(() => makeBracket(matches), [matches]);
  const allBracketMatches = useMemo(() => columns.flatMap((column) => column.groups.flatMap((group) => group.matches)), [columns]);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const revealed = useMemo(() => new Set(revealedIds), [revealedIds]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(bracketStorageKey) || "[]");
      if (Array.isArray(saved)) setRevealedIds(saved.filter((item): item is string => typeof item === "string"));
    } catch {
      // A malformed local value should never block the bracket.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(bracketStorageKey, JSON.stringify(revealedIds));
    } catch {
      // The bracket still works for the current session when storage is unavailable.
    }
  }, [hydrated, revealedIds]);

  const matchById = useMemo(() => new Map(allBracketMatches.map((bracketMatch) => [bracketMatch.id, bracketMatch])), [allBracketMatches]);

  function resolveMatchWinner(bracketMatch: BracketMatch): BracketTeam | null {
    if (!revealed.has(bracketMatch.id)) return null;
    const teams = bracketMatch.slots.map(resolveSlot) as [BracketTeam | null, BracketTeam | null];
    return teams.find((team) => team?.id === bracketMatch.actualWinnerId) ?? null;
  }

  function resolveSlot(slot: BracketSlot): BracketTeam | null {
    if ("name" in slot) return slot;
    const sourceMatch = matchById.get(slot.matchId);
    if (!sourceMatch) return null;
    const winner = resolveMatchWinner(sourceMatch);
    if (!winner) return null;
    if (slot.outcome === "winner") return winner;
    const sourceTeams = sourceMatch.slots.map(resolveSlot) as [BracketTeam | null, BracketTeam | null];
    return sourceTeams.find((team) => team && team.id !== winner.id) ?? null;
  }

  function revealMatch(matchId: string) {
    setRevealedIds((current) => current.includes(matchId) ? current : [...current, matchId]);
  }

  function revealColumn(column: BracketColumn) {
    const columnMatchIds = column.groups.flatMap((group) => group.matches.map((bracketMatch) => bracketMatch.id));
    setRevealedIds((current) => Array.from(new Set([...current, ...columnMatchIds])));
  }

  const readyCount = allBracketMatches.filter((bracketMatch) => !revealed.has(bracketMatch.id) && bracketMatch.slots.every((slot) => Boolean(resolveSlot(slot)))).length;

  return <main className="bracket-page">
    <section className="bracket-hero">
      <div className="bracket-hero-grid" />
      <div className="bracket-hero-copy">
        <p className="bracket-kicker"><span className="live-dot" /> TI 2026 · Group Stage</p>
        <h1>Road to the<br /> <em>International</em></h1>
        <p>Reveal each completed matchup when you are ready. Results come from the real TI 2026 games and advance through the actual Swiss schedule.</p>
      </div>
      <div className="bracket-hero-mark" aria-hidden="true"><span>TI</span><small>2026</small></div>
    </section>

    <section className="bracket-controls" aria-label="Bracket controls">
      <div><span className="section-label">Interactive Swiss bracket</span><p>Only the 0-0 games are open at first. Click a matchup to reveal its real winner.</p></div>
      <div className="bracket-control-actions"><span className="bracket-progress"><strong>{revealedIds.length}</strong>/{allBracketMatches.length} results revealed · {readyCount} ready</span><a className="bracket-vods-link" href={tiVodsPath}>Open VOD archive ↗</a><button type="button" onClick={() => setRevealedIds([])}>Reset reveals</button></div>
    </section>

    <section className="bracket-board-wrap" aria-label="TI 2026 Swiss stage bracket">
      <div className="bracket-board-intro"><span>← Start here</span><span>Click any lit matchup to reveal the real winner →</span></div>
      <div className="bracket-scroll"><div className="bracket-board">
        {columns.map((column) => <section className="bracket-column" key={column.label}>
          <header className="bracket-column-head">
            <span>{column.label}</span>
            {(() => {
              const columnMatches = column.groups.flatMap((group) => group.matches);
              const pendingMatches = columnMatches.filter((bracketMatch) => !revealed.has(bracketMatch.id));
              const columnReady = pendingMatches.length > 0 && pendingMatches.every((bracketMatch) => bracketMatch.slots.every((slot) => Boolean(resolveSlot(slot))));
              return pendingMatches.length > 0
                ? <button type="button" className="bracket-column-reveal" disabled={!columnReady} onClick={() => revealColumn(column)} aria-label={`Reveal all ${column.label} matchups`}>Reveal column</button>
                : <span className="bracket-column-done">Revealed</span>;
            })()}
            <i />
          </header>
          <div className="bracket-column-groups">{column.groups.map((group) => <Group key={group.label} group={group} resolveSlot={resolveSlot} revealed={revealed} onReveal={revealMatch} />)}</div>
        </section>)}
      </div></div>
      <p className="bracket-footnote"><span>◎</span> Results are sourced from the real TI 2026 match data. Your reveal progress stays on this device only.</p>
    </section>
  </main>;
}
