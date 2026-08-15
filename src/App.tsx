import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  archive,
  archives,
  fallbackHeroIconUrl,
  matches,
  tournaments,
  type ArchiveData,
  type GameLink,
  type MatchRecord,
  type Tournament,
} from "./vods";
import { SwissBracket } from "./SwissBracket";

type SearchType = "all" | "teams" | "heroes" | "casters";

const progressStorageKey = "riki-vods-progress-v1";
const preferredTournamentId = "ti-2026";

function cleanPathname(pathname: string) {
  const clean = pathname.replace(/\/+$/, "");
  return clean || "/";
}

function usePathname() {
  const [pathname, setPathname] = useState(() => cleanPathname(window.location.pathname));
  useEffect(() => {
    const update = () => setPathname(cleanPathname(window.location.pathname));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return pathname;
}

function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}

function SiteLink({ href, children, className, ariaLabel }: { href: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  return <a href={href} className={className} aria-label={ariaLabel} onClick={(event) => navigate(event, href)}>{children}</a>;
}

export function getMatchesForDate(allMatches: MatchRecord[], tournamentId: string, date: string) {
  const selectedArchive = archives.find((item) => item.tournament.id === tournamentId && item.date === date);
  if (!selectedArchive) return [];
  const availableMatchIds = new Set(allMatches.map((match) => match.id));
  return selectedArchive.matches.filter((match) => availableMatchIds.has(match.id));
}

export function getTournamentDates(allMatches: MatchRecord[], tournamentId: string) {
  return archives
    .filter((item) => item.tournament.id === tournamentId && getMatchesForDate(allMatches, tournamentId, item.date).length)
    .map((item) => item.date);
}

function getArchiveForDate(tournamentId: string, date: string): ArchiveData | undefined {
  return archives.find((item) => item.tournament.id === tournamentId && item.date === date);
}

function getTournament(tournamentId: string) {
  return tournaments.find((item) => item.id === tournamentId);
}

function tournamentPath(tournament: Tournament) {
  return `/tournaments/${tournament.slug}`;
}

function datePath(tournament: Tournament, date: string) {
  return `${tournamentPath(tournament)}/${date}`;
}

function bracketPath(tournament: Tournament) {
  return `${tournamentPath(tournament)}/bracket`;
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${date}T12:00:00Z`));
}

function shortDate(date: string) {
  return formatDate(date, { month: "short", day: "numeric" });
}

function matchSearchable(match: MatchRecord) {
  return [
    match.teamA,
    match.teamB,
    ...match.casters,
    ...match.games.flatMap((game) => [
      ...game.heroes.teamA.map((hero) => hero.name),
      ...game.heroes.teamB.map((hero) => hero.name),
    ]),
  ].join(" ").toLowerCase();
}

function matchesForSearch(match: MatchRecord, query: string, searchType: SearchType) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const teams = `${match.teamA} ${match.teamB}`.toLowerCase();
  const heroes = match.games.flatMap((game) => [
    ...game.heroes.teamA.map((hero) => hero.name),
    ...game.heroes.teamB.map((hero) => hero.name),
  ]).join(" ").toLowerCase();
  const casters = match.casters.join(" ").toLowerCase();
  if (searchType === "teams") return teams.includes(normalized);
  if (searchType === "heroes") return heroes.includes(normalized);
  if (searchType === "casters") return casters.includes(normalized);
  return matchSearchable(match).includes(normalized);
}

function gameHasHeroSearchMatch(game: GameLink, query: string, searchType: SearchType) {
  if (!query.trim() || searchType === "teams" || searchType === "casters") return false;
  const normalized = query.trim().toLowerCase();
  return [...game.heroes.teamA, ...game.heroes.teamB].some((hero) => hero.name.toLowerCase().includes(normalized));
}

function initials(team: string) {
  return team.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
}

function TeamMark({ name, logoUrl, alt = false }: { name: string; logoUrl: string | null; alt?: boolean }) {
  return <span className={`team-badge ${alt ? "alt" : ""}`}><span>{initials(name)}</span>{logoUrl && <img src={logoUrl} alt={`${name} logo`} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</span>;
}

function HeroPick({ hero }: { hero: { name: string; iconUrl: string | null } }) {
  return <li className="hero-pick" title={hero.name} aria-label={hero.name}><span>{hero.name.slice(0, 2).toUpperCase()}</span><img src={hero.iconUrl ?? fallbackHeroIconUrl(hero.name)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /></li>;
}

function ShieldIcon() {
  return <span className="shield" aria-hidden="true">✓</span>;
}

function SearchPanel({ search, searchType, onSearch, onSearchType }: { search: string; searchType: SearchType; onSearch: (value: string) => void; onSearchType: (value: SearchType) => void }) {
  return <div className="search-panel">
    <label htmlFor="vod-search">Search VODs</label>
    <div className="search-box"><span aria-hidden="true">⌕</span><input id="vod-search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Team, hero, or caster…" />{search && <button type="button" onClick={() => onSearch("")} aria-label="Clear search">×</button>}</div>
    <div className="filter-row" aria-label="Search category">
      {(["all", "teams", "heroes", "casters"] as SearchType[]).map((type) => <button type="button" key={type} className={searchType === type ? "selected" : ""} onClick={() => onSearchType(type)}>{type}</button>)}
    </div>
    <p className="safe-note">Search is limited to the selected day. Results never expose another date or result.</p>
  </div>;
}

function GameCard({ match, game, watched, expanded, heroSearchMatch, onToggleWatched, onTogglePicks }: { match: MatchRecord; game: GameLink; watched: boolean; expanded: boolean; heroSearchMatch: boolean; onToggleWatched: () => void; onTogglePicks: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const concealed = game.source === "concealed-fallback";
  const playGlyph = <><span className="fog-line" /><span className="play-glyph">▶</span><span className="fog-line" /></>;
  const visualLabel = `Game ${game.number}: ${match.teamA} versus ${match.teamB}`;
  function activateGame() {
    if (game.vodUrl) window.open(game.vodUrl, "_blank", "noopener,noreferrer");
    else setRevealed((current) => !current);
  }
  return <div className={`game-card ${watched ? "watched" : ""} ${heroSearchMatch ? "hero-search-match" : ""}`}>
    <div className="game-top"><span>GAME {game.number}</span>{watched && <span className="check">✓ WATCHED</span>}</div>
    <button type="button" className="game-visual game-visual-link" onClick={activateGame} aria-label={visualLabel} aria-expanded={revealed}>{playGlyph}</button>
    <div className="game-actions">
      {!game.vodUrl && revealed && <span className="not-played">{concealed ? "This game was not played" : "VOD unavailable"}</span>}
      <button type="button" className="watch-toggle" onClick={onToggleWatched} aria-label={`${watched ? "Mark unwatched" : "Mark watched"} Game ${game.number} of ${match.teamA} versus ${match.teamB}`}>{watched ? "Undo" : "Mark watched"}</button>
    </div>
    <div className="picks-wrap">
      <button type="button" className="picks-toggle" onClick={onTogglePicks} aria-expanded={expanded}><span>Hero picks</span><span>{expanded ? "Hide −" : "Show +"}</span></button>
      {expanded && (concealed
        ? <div className="picks-panel"><p className="picks-note">Hero picks are not available for this game.</p></div>
        : <div className="picks-panel">
          <div><small>{match.teamA}</small><ul>{game.heroes.teamA.map((hero) => <HeroPick key={`${game.number}-a-${hero.name}`} hero={hero} />)}</ul></div>
          <span className="draft-vs">VS</span>
          <div><small>{match.teamB}</small><ul>{game.heroes.teamB.map((hero) => <HeroPick key={`${game.number}-b-${hero.name}`} hero={hero} />)}</ul></div>
        </div>)}
    </div>
  </div>;
}

function MatchCard({ match, index, watched, expandedPicks, search, searchType, onToggleWatched, onTogglePicks, onCatchUp }: { match: MatchRecord; index: number; watched: Set<string>; expandedPicks: Set<string>; search: string; searchType: SearchType; onToggleWatched: (gameId: string) => void; onTogglePicks: (gameId: string) => void; onCatchUp: () => void }) {
  const watchedCount = match.games.filter((game) => watched.has(gameKey(match, game))).length;
  const complete = watchedCount === match.games.length;
  return <article className="series-card" aria-label={`${match.teamA} versus ${match.teamB}`}>
    <div className="series-meta"><div><span className="series-time">{String(index + 1).padStart(2, "0")}</span><span className="series-stage">{match.casters.length ? `On the call · ${match.casters.join(" + ")}` : "Caster information unavailable"}</span></div><button type="button" onClick={onCatchUp}>{complete ? "Match watched" : "Mark match watched"}</button></div>
    <div className="matchup"><div className="team"><TeamMark name={match.teamA} logoUrl={match.teamALogoUrl} /><strong>{match.teamA}</strong></div><span className="versus">VS</span><div className="team team-right"><strong>{match.teamB}</strong><TeamMark name={match.teamB} logoUrl={match.teamBLogoUrl} alt /></div></div>
    <div className="game-grid">
      {match.games.map((game) => <GameCard key={game.number} match={match} game={game} watched={watched.has(gameKey(match, game))} expanded={expandedPicks.has(gameKey(match, game))} heroSearchMatch={gameHasHeroSearchMatch(game, search, searchType)} onToggleWatched={() => onToggleWatched(gameKey(match, game))} onTogglePicks={() => onTogglePicks(gameKey(match, game))} />)}
    </div>
    <div className="series-footer"><span>{watchedCount}/{match.games.length} games marked watched</span><span>Progress stays on this device</span></div>
  </article>;
}

function gameKey(match: MatchRecord, game: GameLink) {
  return `${match.id}:game-${game.number}`;
}

function matchIsWatched(match: MatchRecord, watched: Set<string>) {
  return match.games.length > 0 && match.games.every((game) => watched.has(gameKey(match, game)));
}

function ProgressBar({ watchedCount, total }: { watchedCount: number; total: number }) {
  const percentage = total ? Math.round((watchedCount / total) * 100) : 0;
  return <div className="progress-meter"><div className="progress-meter-head"><span>WATCHED TODAY</span><strong>{watchedCount}<small>/{total}</small></strong></div><div className="progress-track" role="progressbar" aria-label="Current-day match progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={watchedCount} aria-valuetext={`${watchedCount} of ${total} current-day matches watched`}><span style={{ width: `${percentage}%` }} /></div><p>{percentage}% complete</p></div>;
}

function TournamentCard({ tournament, allMatches }: { tournament: Tournament; allMatches: MatchRecord[] }) {
  const dates = getTournamentDates(allMatches, tournament.id);
  const matchCount = dates.reduce((count, date) => count + getMatchesForDate(allMatches, tournament.id, date).length, 0);
  return <article className="tournament-card"><span>{tournament.shortName.toUpperCase()} · {tournament.year}</span><h3>{tournament.name}</h3><p>{dates.length} date{dates.length === 1 ? "" : "s"} · {matchCount} matches</p><SiteLink href={tournamentPath(tournament)} ariaLabel={`Open ${tournament.name}`}>Browse archive ↗</SiteLink></article>;
}

function TournamentSelectionPage({ allMatches }: { allMatches: MatchRecord[] }) {
  return <main className="tournament-picker-page">
    <section className="hero-section tournament-picker-hero"><div className="hero-copy"><p className="kicker"><span className="live-dot" /> Spoiler protection is on</p><h1>Choose your tournament</h1><p className="hero-lede">Pick an event to browse its available dates. Matchups stay on the event page until you choose a day.</p></div></section>
    <section className="more-section tournament-picker-section"><div className="tournament-grid">{tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} allMatches={allMatches} />)}</div></section>
  </main>;
}

function HowItWorks({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="how-sheet" role="dialog" aria-modal="true" aria-labelledby="how-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-head"><div><p className="section-label">Spoiler rules</p><h2 id="how-title">How spoiler protection works</h2></div><button type="button" onClick={onClose} aria-label="Close explanation">×</button></div><p className="how-intro">The archive gives you the visual system from Riki VODs while keeping results out of sight. Your watch boundary lives only in this browser.</p><div className="how-grid"><article><span>01</span><div><strong>Every possible game appears</strong><p>Games are shown without scores, winners, durations, or result-bearing titles.</p></div></article><article><span>02</span><div><strong>Search stays in bounds</strong><p>Team, hero, and caster search only searches the date you selected.</p></div></article><article><span>03</span><div><strong>You set the boundary</strong><p>Mark individual games or use “Mark match watched” to save a complete series.</p></div></article><article><span>04</span><div><strong>Nothing leaves your device</strong><p>There are no accounts or server-side watch records. Progress is stored in local browser storage.</p></div></article></div><div className="how-footer"><p>Want to start over?</p><button type="button" onClick={onOpenSettings}>Open spoiler settings</button></div></section></div>;
}

function Settings({ watchedCount, total, onClose, onReset }: { watchedCount: number; total: number; onClose: () => void; onReset: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-head"><div><p className="section-label">Preferences</p><h2 id="settings-title">Spoiler settings</h2></div><button type="button" onClick={onClose} aria-label="Close settings">×</button></div><div className="setting-row"><div><strong>Hide result metadata</strong><p>Scores, winners, durations, and result-bearing titles are never included in the archive.</p></div><span className="fixed-toggle">ON</span></div><div className="setting-row"><div><strong>Local watch progress</strong><p>Mark games or complete matches while you catch up.</p></div><span className="fixed-toggle">ON</span></div><div className="local-box"><span>THIS DEVICE ONLY</span><strong>{watchedCount} of {total} current-day matches watched</strong><p>No account is created. Clearing browser data also clears this progress.</p><button type="button" onClick={onReset}>Reset local progress</button></div></section></div>;
}

function App({ allMatches = matches }: { allMatches?: MatchRecord[] }) {
  const pathname = usePathname();
  const [watched, setWatched] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [expandedPicks, setExpandedPicks] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const routeParts = pathname.split("/").filter(Boolean);
  const isTournamentPicker = pathname === "/tournaments";
  const routeTournament = routeParts[0] === "tournaments" ? tournaments.find((item) => item.slug === routeParts[1]) : undefined;
  const selectedTournament = routeTournament ?? getTournament(preferredTournamentId) ?? tournaments[0];
  const isBracketPage = routeTournament?.id === "ti-2026" && routeParts.length === 3 && routeParts[2] === "bracket";
  const availableDates = getTournamentDates(allMatches, selectedTournament.id);
  const requestedDate = routeParts.length === 3 && !isBracketPage ? routeParts[2] : undefined;
  const selectedDate = requestedDate && availableDates.includes(requestedDate) ? requestedDate : availableDates[availableDates.length - 1];
  const dateMatches = useMemo(
    () => (selectedDate ? getMatchesForDate(allMatches, selectedTournament.id, selectedDate) : []),
    [allMatches, selectedTournament.id, selectedDate],
  );
  const tiBracketMatches = useMemo(
    () => archives
      .filter((item) => item.tournament.id === "ti-2026")
      .flatMap((item) => getMatchesForDate(allMatches, "ti-2026", item.date)),
    [allMatches],
  );
  const selectedArchive = selectedDate ? getArchiveForDate(selectedTournament.id, selectedDate) : undefined;
  const routeIsValid = pathname === "/"
    || isTournamentPicker
    || isBracketPage
    || (routeTournament !== undefined
      && (routeParts.length === 2
        || (routeParts.length === 3 && availableDates.includes(routeParts[2]))));
  const canonicalPath = isTournamentPicker ? "/tournaments" : isBracketPage ? bracketPath(selectedTournament) : selectedDate ? datePath(selectedTournament, selectedDate) : "/";

  useEffect(() => {
    if (routeIsValid) return;
    window.history.replaceState({}, "", canonicalPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [routeIsValid, canonicalPath]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(progressStorageKey) || "[]");
      if (Array.isArray(saved)) setWatched(saved.filter((item): item is string => typeof item === "string"));
    } catch {
      // A malformed local value should never prevent the archive from loading.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(progressStorageKey, JSON.stringify(watched));
    } catch {
      // A full or unavailable localStorage keeps working for this session.
    }
  }, [watched, hydrated]);

  const filteredMatches = useMemo(() => dateMatches.filter((match) => matchesForSearch(match, search, searchType)), [dateMatches, search, searchType]);
  const watchedSet = useMemo(() => new Set(watched), [watched]);

  const noticeTimeout = useRef<number | undefined>(undefined);

  function showNotice(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimeout.current);
    noticeTimeout.current = window.setTimeout(() => setNotice(""), 2400);
  }

  function toggleWatched(gameId: string) {
    setWatched((current) => current.includes(gameId) ? current.filter((id) => id !== gameId) : [...current, gameId]);
  }

  function markMatch(match: MatchRecord) {
    const keys = match.games.map((game) => gameKey(match, game));
    const complete = keys.length > 0 && keys.every((key) => watchedSet.has(key));
    setWatched((current) => complete ? current.filter((key) => !keys.includes(key)) : Array.from(new Set([...current, ...keys])));
    showNotice(complete ? "Match marked unwatched" : "Match progress saved on this device");
  }

  function catchUpToDate() {
    const keys = dateMatches.flatMap((match) => match.games.map((game) => gameKey(match, game)));
    const complete = keys.length > 0 && keys.every((key) => watchedSet.has(key));
    setWatched((current) => complete ? current.filter((key) => !keys.includes(key)) : Array.from(new Set([...current, ...keys])));
    showNotice(complete ? "Day marked unwatched" : "Day progress saved on this device");
  }

  function resetProgress() {
    setWatched([]);
    showNotice("Local progress cleared");
    setSettingsOpen(false);
  }

  function selectDate(date: string) {
    window.history.pushState({}, "", datePath(selectedTournament, date));
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0 });
  }

  const watchedCurrentDayMatches = dateMatches.filter((match) => matchIsWatched(match, watchedSet)).length;
  const progressTotal = dateMatches.length;
  const dayGameKeys = dateMatches.flatMap((match) => match.games.map((game) => gameKey(match, game)));
  const dayIsWatched = dayGameKeys.length > 0 && dayGameKeys.every((key) => watchedSet.has(key));

  return <div className={`site-shell ${search ? "searching" : ""}`}>
     <header className="topbar">
       <SiteLink className="brand" href="/" ariaLabel="Riki VODs home"><span className="brand-mark" aria-hidden="true"><i /><i /></span><span>RIKI<span className="brand-dot">.</span>VODS</span></SiteLink>
       <nav className="desktop-nav" aria-label="Primary navigation"><SiteLink className={pathname.startsWith("/tournaments") ? "active" : undefined} href="/tournaments">Tournaments</SiteLink><SiteLink className={isBracketPage ? "active" : undefined} href={bracketPath(getTournament(preferredTournamentId) ?? tournaments[0])}>Swiss bracket</SiteLink>{isTournamentPicker || isBracketPage ? <SiteLink href="/">Continue watching</SiteLink> : <a href="#continue">Continue watching</a>}<button type="button" onClick={() => setHowOpen(true)}>How it works</button></nav>
       <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open spoiler settings"><span>Spoiler settings</span><ShieldIcon /></button>
     </header>

     {isTournamentPicker ? <TournamentSelectionPage allMatches={allMatches} /> : isBracketPage ? <SwissBracket matches={tiBracketMatches} /> : <main>
      <section className="hero-section">
        <div className="hero-copy"><p className="kicker"><span className="live-dot" /> Spoiler protection is on</p><h1>Spoiler-free Dota 2 VODs</h1><p className="hero-lede">Scores, result metadata, and your watch boundary stay out of sight while you catch up across the current archive.</p></div>
        <SearchPanel search={search} searchType={searchType} onSearch={setSearch} onSearchType={setSearchType} />
      </section>

       <section className="tournament-head"><div><p className="section-label">Featured tournament</p><h2>{selectedTournament.name}</h2><p>{selectedTournament.year} · {availableDates.length} archive date{availableDates.length === 1 ? "" : "s"}</p>{selectedTournament.id === "ti-2026" && <SiteLink className="bracket-entry-link" href={bracketPath(selectedTournament)}>Open Swiss bracket ↗</SiteLink>}</div><ProgressBar watchedCount={watchedCurrentDayMatches} total={progressTotal} /></section>

      <nav className="day-tabs" aria-label="Tournament dates">
        {availableDates.map((date) => <button type="button" key={date} className={selectedDate === date ? "active" : ""} onClick={() => selectDate(date)} aria-pressed={selectedDate === date}><span>{shortDate(date)}</span><small>{getArchiveForDate(selectedTournament.id, date)?.stage.split(" · ")[0]}</small></button>)}
      </nav>

      <section className="day-section" id="continue">
        <div className="day-title"><div><p className="section-label">{selectedArchive?.stage ?? "Archive"}</p><h2>{selectedDate ? formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric" }) : "Archive"}</h2></div><div className="legend"><span>✓ Spoiler protected</span><span>Progress stays on this device</span></div></div>
        <div className="day-actions"><p className="result-count">{search ? `${filteredMatches.length} safe result${filteredMatches.length === 1 ? "" : "s"} for “${search}”` : `${dateMatches.length} matches · search covers teams, heroes, and casters`}</p><button type="button" onClick={catchUpToDate}>{dayIsWatched ? "Mark this day unwatched" : "Mark this day watched"}</button></div>
        <div className="series-list">
          {filteredMatches.map((match, index) => <MatchCard key={match.id} match={match} index={index} watched={watchedSet} expandedPicks={new Set(expandedPicks)} search={search} searchType={searchType} onToggleWatched={toggleWatched} onTogglePicks={(gameId) => setExpandedPicks((current) => current.includes(gameId) ? current.filter((id) => id !== gameId) : [...current, gameId])} onCatchUp={() => markMatch(match)} />)}
          {!filteredMatches.length && <p className="empty-state">No teams, heroes, or casters match “{search}”.</p>}
        </div>
      </section>

    </main>}

     <footer id="about"><span>riki-vods</span><p>No accounts. Your watch history never leaves this browser. · Only EWC 2026 and TI 2026 are in this archive. · Data: <a href={(selectedArchive ?? archive).sources.liquipedia} target="_blank" rel="noreferrer">Liquipedia</a> + <a href={(selectedArchive ?? archive).sources.opendota} target="_blank" rel="noreferrer">OpenDota</a>.</p></footer>
     <nav className="mobile-nav" aria-label="Mobile navigation"><SiteLink className={pathname.startsWith("/tournaments") ? "active" : undefined} href="/tournaments">Tournaments</SiteLink><SiteLink className={isBracketPage ? "active" : undefined} href={bracketPath(getTournament(preferredTournamentId) ?? tournaments[0])}>Bracket</SiteLink>{isTournamentPicker || isBracketPage ? <SiteLink href="/">Progress</SiteLink> : <a href="#continue">Progress</a>}<button type="button" onClick={() => setHowOpen(true)}>How</button><button type="button" onClick={() => setSettingsOpen(true)}>Cloak</button></nav>
    {howOpen && <HowItWorks onClose={() => setHowOpen(false)} onOpenSettings={() => { setHowOpen(false); setSettingsOpen(true); }} />}
    {settingsOpen && <Settings watchedCount={watchedCurrentDayMatches} total={progressTotal} onClose={() => setSettingsOpen(false)} onReset={resetProgress} />}
    {notice && <div className="toast" role="status">✓ {notice}</div>}
  </div>;
}

export default App;
