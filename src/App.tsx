import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { archive, fallbackHeroIconUrl, matches, tournaments, type MatchRecord, type Tournament } from "./vods";

function PlayIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.1 5.25a1 1 0 0 1 1.5-.86l9.2 6.76a1.06 1.06 0 0 1 0 1.7l-9.2 6.76a1 1 0 0 1-1.5-.86V5.25Z" /></svg>;
}

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.3 7 10 4.2-1.7 7-5.4 7-10V6l-7-3Z" /><path d="m9.5 12.2 1.7 1.8 3.7-4" /></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" /></svg>;
}

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

function SiteLink({ href, children, className, ariaLabel }: { href: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0 });
  };
  return <a href={href} className={className} aria-label={ariaLabel} onClick={follow}>{children}</a>;
}

export function getMatchesForDate(allMatches: MatchRecord[], tournamentId: string, date: string) {
  return allMatches.filter((match) => tournamentId === archive.tournament.id && date === archive.date && match.id.startsWith("ti-2026-day1-"));
}

export function getTournamentDates(allMatches: MatchRecord[], tournamentId: string) {
  return tournamentId === archive.tournament.id && allMatches.length ? [archive.date] : [];
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${date}T12:00:00Z`));
}

function tournamentPath(tournament: Tournament) {
  return `/tournaments/${tournament.slug}`;
}

function datePath(tournament: Tournament, date: string) {
  return `${tournamentPath(tournament)}/${date}`;
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

function formatCasters(casters: string[]) {
  if (casters.length <= 1) return casters[0] ?? "Caster information unavailable";
  if (casters.length === 2) return `${casters[0]} & ${casters[1]}`;
  return `${casters.slice(0, -1).join(", ")} & ${casters[casters.length - 1]}`;
}

function TeamRow({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return <div className="team-row">
    {logoUrl ? <img className="team-logo" src={logoUrl} alt={`${name} logo`} loading="lazy" width="34" height="34" /> : <span className="team-logo" aria-hidden="true" />}
    <p className="team-name">{name}</p>
  </div>;
}

function GamePanel({ match, game, query }: { match: MatchRecord; game: MatchRecord["games"][number]; query: string }) {
  const heroQuery = query.trim().toLowerCase();
  const heroes = [...game.heroes.teamA, ...game.heroes.teamB];
  const heroMatch = Boolean(heroQuery) && heroes.some((hero) => hero.name.toLowerCase().includes(heroQuery));
  return <div className="game-panel">
    <p>Game {game.number}</p>
    <div className="game-actions">
      {game.vodUrl ? <a href={game.vodUrl} target="_blank" rel="noreferrer" className="game-link" aria-label={`Watch game ${game.number}: ${match.teamA} versus ${match.teamB}`}>
        <span className="game-play"><PlayIcon /></span><span>Watch VOD ↗</span>
      </a> : <span className="game-link unavailable" aria-disabled="true">VOD unavailable</span>}
    </div>
    <details className="hero-draft" open={heroMatch || undefined}>
      <summary>{heroMatch ? "Hero match" : "View heroes"}</summary>
      <div className="hero-list">
        {([[match.teamA, game.heroes.teamA], [match.teamB, game.heroes.teamB]] as const).map(([team, picks]) => <div className="hero-team" key={team}>
          <span title={team}>{team}</span>
          <div className="hero-icons">
            {picks.map((hero) => <img key={hero.name} src={hero.iconUrl ?? fallbackHeroIconUrl(hero.name)} alt={`${team}: ${hero.name}`} title={`${team} · ${hero.name}`} loading="lazy" width="24" height="24" />)}
          </div>
        </div>)}
      </div>
    </details>
  </div>;
}

function MatchCard({ match, index, query }: { match: MatchRecord; index: number; query: string }) {
  const casterMatch = Boolean(query.trim()) && match.casters.some((caster) => caster.toLowerCase().includes(query.trim().toLowerCase()));
  return <article className="vod-block match-block" aria-label={`${match.teamA} versus ${match.teamB}`}>
    <div className="vod-heading">
      <div>
        <span>{match.teamA} <i>vs</i> {match.teamB}</span>
        <small className={casterMatch ? "cast-line cast-line-match" : "cast-line"}>Casted by {formatCasters(match.casters)}</small>
      </div>
      <small>OpenDota · Liquipedia</small>
    </div>
    <div className="broadcast-card match-card">
      <div className="series-list">
        <article className="series-card" style={{ "--delay": `${index * 55}ms` } as React.CSSProperties}>
          <div className="series-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
          <div className="matchup">
            <div className="team-stack"><TeamRow name={match.teamA} logoUrl={match.teamALogoUrl} /><span className="versus">vs</span><TeamRow name={match.teamB} logoUrl={match.teamBLogoUrl} /></div>
          </div>
          <div className="game-links" aria-label={`${match.teamA} versus ${match.teamB} games`}>
            {match.games.map((game) => <GamePanel key={game.number} match={match} game={game} query={query} />)}
          </div>
        </article>
      </div>
    </div>
  </article>;
}

function ArchivePage({ allMatches }: { allMatches: MatchRecord[] }) {
  const tournament = tournaments[0];
  return <main id="top">
    <section className="hero archive-hero" aria-labelledby="page-title"><div className="hero-glow" /><p className="eyebrow">SPOILER-FREE DOTA ARCHIVE</p><h1 id="page-title">Pick the event.<br /><em>Keep control.</em></h1><p className="hero-copy">The International 2026, indexed from OpenDota and Liquipedia. Search by caster, team, or hero after choosing the day.</p><a className="scroll-cue" href="#tournaments"><span /> Browse tournament</a></section>
    <section className="archive-section" id="tournaments" aria-labelledby="tournaments-title"><div className="archive-heading"><p className="eyebrow">TOURNAMENT</p><h2 id="tournaments-title">The archive</h2></div><div className="tournament-grid">
      <SiteLink href={tournamentPath(tournament)} className="tournament-card"><div className="tournament-year">{tournament.year}</div><div><p className="eyebrow">{tournament.shortName}</p><h3>{tournament.name}</h3><p>{getTournamentDates(allMatches, tournament.id).length} date available</p></div><span className="card-action">Choose a date <b>→</b></span></SiteLink>
    </div></section>
  </main>;
}

function TournamentPage({ tournament, allMatches }: { tournament: Tournament; allMatches: MatchRecord[] }) {
  const dates = getTournamentDates(allMatches, tournament.id);
  return <main id="top"><section className="subpage-hero" aria-labelledby="page-title"><nav className="breadcrumbs" aria-label="Breadcrumb"><SiteLink href="/">Tournaments</SiteLink><span>/</span><span>{tournament.shortName}</span></nav><p className="eyebrow">{tournament.year} ARCHIVE</p><h1 id="page-title">{tournament.name}</h1><p>Choose the day you want to search. Matchups stay hidden until you open it.</p><div className="privacy-note"><ShieldIcon /><span>No games from any other date are shown here.</span></div></section><section className="date-section" aria-labelledby="dates-title"><div className="archive-heading"><p className="eyebrow">WATCH BY DATE</p><h2 id="dates-title">Available days</h2></div><div className="date-grid">{dates.map((date) => <SiteLink href={datePath(tournament, date)} className="date-card" key={date}><div className="date-icon"><CalendarIcon /></div><div><span>{formatDate(date, { weekday: "long" })}</span><h3>{formatDate(date, { month: "long", day: "numeric", year: "numeric" })}</h3><p>{archive.stage} · {allMatches.length} matches</p></div><span className="date-arrow" aria-hidden="true">→</span></SiteLink>)}</div></section></main>;
}

function DatePage({ tournament, date, allMatches }: { tournament: Tournament; date: string; allMatches: MatchRecord[] }) {
  const [query, setQuery] = useState("");
  const dateMatches = useMemo(() => getMatchesForDate(allMatches, tournament.id, date), [allMatches, tournament.id, date]);
  const filteredMatches = dateMatches.filter((match) => !query.trim() || matchSearchable(match).includes(query.trim().toLowerCase()));
  if (!dateMatches.length) return <NotFoundPage />;
  return <main id="top"><section className="date-page-hero" aria-labelledby="page-title"><nav className="breadcrumbs" aria-label="Breadcrumb"><SiteLink href="/">Tournaments</SiteLink><span>/</span><SiteLink href={tournamentPath(tournament)}>{tournament.shortName}</SiteLink><span>/</span><span>{formatDate(date, { month: "short", day: "numeric" })}</span></nav><p className="eyebrow">{tournament.name} · {archive.stage}</p><h1 id="page-title">{formatDate(date, { weekday: "long", month: "long", day: "numeric" })}</h1><p className="date-boundary"><ShieldIcon /> Only this day is loaded. Scores and winners stay out.</p></section><section className="matches date-matches" id="matches"><div className="section-heading"><div><p className="eyebrow">SELECTED DAY</p><h2>{formatDate(date, { month: "long", day: "numeric", year: "numeric" })}</h2><p className="broadcast-meta">{dateMatches.length} matches <span /> search covers casters, teams, and heroes</p></div><label className="search-field"><span className="sr-only">Filter by team, hero, or caster</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a team, hero, or caster" /></label></div><div className="vod-list">{filteredMatches.map((match, index) => <MatchCard key={match.id} match={match} index={index} query={query} />)}{!filteredMatches.length && <p className="empty-state">No casters, teams, or heroes match “{query}”.</p>}</div></section></main>;
}

function NotFoundPage() { return <main className="not-found"><p className="eyebrow">NOT FOUND</p><h1>This archive page does not exist.</h1><SiteLink href="/" className="primary-button">Return to tournaments</SiteLink></main>; }

function Footer() { return <><section className="about" id="about"><ShieldIcon /><div><p className="eyebrow">HOW IT WORKS</p><h2>Scores stay off the page.</h2></div><p>OpenDota supplies team and hero metadata. Liquipedia supplies caster and VOD metadata. The site deliberately omits scores, winners, durations, and result-bearing titles.</p></section><footer><span>DOTA<span>VODS</span></span><div className="footer-copy"><p>Built for catching up, not spoiling the result.</p><small>Dota and the Dota 2 logo are trademarks of Valve Corporation. This independent fan project is not affiliated with or endorsed by Valve. Data: <a href={archive.sources.liquipedia} target="_blank" rel="noreferrer">Liquipedia</a> (CC BY-SA 3.0) and <a href={archive.sources.opendota} target="_blank" rel="noreferrer">OpenDota</a>.</small></div></footer></>; }

function App({ allMatches = matches }: { allMatches?: MatchRecord[] }) {
  const pathname = usePathname();
  const routeParts = pathname.split("/").filter(Boolean);
  const tournament = routeParts[0] === "tournaments" ? tournaments.find((item) => item.slug === routeParts[1]) : undefined;
  const isArchive = pathname === "/";
  const isTournament = Boolean(tournament && routeParts.length === 2);
  const isDate = Boolean(tournament && routeParts.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(routeParts[2]));
  return <div className="site-shell"><header className="topbar"><SiteLink className="brand" href="/" ariaLabel="Dota VODs home"><span className="brand-mark"><PlayIcon /></span><span>DOTA<span>VODS</span></span></SiteLink><nav aria-label="Primary navigation"><SiteLink className={isArchive || isTournament || isDate ? "active" : undefined} href="/">Tournaments</SiteLink><a href="#about">About</a></nav><div className="spoiler-badge"><ShieldIcon /> Spoiler-free</div></header>{isArchive && <ArchivePage allMatches={allMatches} />}{isTournament && tournament && <TournamentPage tournament={tournament} allMatches={allMatches} />}{isDate && tournament && <DatePage tournament={tournament} date={routeParts[2]} allMatches={allMatches} />}{!isArchive && !isTournament && !isDate && <NotFoundPage />}<Footer /></div>;
}

export default App;
