import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { heroIconUrl, teamLogoUrl, tournaments, vods, youtubeUrl, type Series, type Tournament, type Vod } from "./vods";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.1 5.25a1 1 0 0 1 1.5-.86l9.2 6.76a1.06 1.06 0 0 1 0 1.7l-9.2 6.76a1 1 0 0 1-1.5-.86V5.25Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.6 2.8 8.3 7 10 4.2-1.7 7-5.4 7-10V6l-7-3Z" />
      <path d="M9.5 12.2 11.2 14l3.7-4" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
    </svg>
  );
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

export function getVodsForDate(allVods: Vod[], tournamentId: string, date: string) {
  return allVods
    .filter((vod) => vod.tournamentId === tournamentId && vod.date === date)
    .sort((a, b) => a.stream.localeCompare(b.stream, "en", { numeric: true }));
}

export function getTournamentDates(allVods: Vod[], tournamentId: string) {
  return [...new Set(allVods.filter((vod) => vod.tournamentId === tournamentId).map((vod) => vod.date))].sort();
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

function SeriesCard({ series, videoId, index, query }: { series: Series; videoId: string; index: number; query: string }) {
  const cleanQuery = query.trim().toLowerCase();
  return (
    <article className="series-card" style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}>
      <div className="series-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
      <div className="matchup">
        <div className="team-stack">
          <div className="team-row">
            <img className="team-logo" src={teamLogoUrl(series.teamAId)} alt={`${series.teamA} logo`} loading="lazy" width="34" height="34" />
            <p className="team-name">{series.teamA}</p>
          </div>
          <span className="versus">vs</span>
          <div className="team-row">
            <img className="team-logo" src={teamLogoUrl(series.teamBId)} alt={`${series.teamB} logo`} loading="lazy" width="34" height="34" />
            <p className="team-name">{series.teamB}</p>
          </div>
        </div>
        <span className="best-of">BEST OF 3</span>
      </div>
      <div className="game-links" aria-label={`${series.teamA} versus ${series.teamB} games`}>
        {series.games.map((game) => {
          const allHeroes = [...game.heroes.teamA, ...game.heroes.teamB];
          const heroMatch = Boolean(cleanQuery) && allHeroes.some((hero) => hero.toLowerCase().includes(cleanQuery));
          return (
            <div className="game-panel" key={game.number}>
              <p>Game {game.number}</p>
              <div className="game-actions">
                <a
                  href={youtubeUrl(videoId, game.draftStartSeconds)}
                  target="_blank"
                  rel="noreferrer"
                  className="game-link draft-link"
                  aria-label={`Watch game ${game.number} draft: ${series.teamA} versus ${series.teamB}`}
                >
                  <span>Draft</span>
                </a>
                <a
                  href={youtubeUrl(videoId, game.startSeconds)}
                  target="_blank"
                  rel="noreferrer"
                  className="game-link"
                  aria-label={`Watch game ${game.number} start: ${series.teamA} versus ${series.teamB}`}
                >
                  <span className="game-play"><PlayIcon /></span>
                  <span>Game</span>
                </a>
              </div>
              <details className="hero-draft" open={heroMatch || undefined}>
                <summary>{heroMatch ? "Hero match" : "View heroes"}</summary>
                <div className="hero-list">
                  {([
                    [series.teamA, game.heroes.teamA],
                    [series.teamB, game.heroes.teamB],
                  ] as const).map(([team, heroes]) => (
                    <div className="hero-team" key={team}>
                      <span title={team}>{team}</span>
                      <div className="hero-icons">
                        {heroes.map((hero) => (
                          <img
                            key={hero}
                            src={heroIconUrl(hero)}
                            alt={`${team}: ${hero}`}
                            title={`${team} · ${hero}`}
                            loading="lazy"
                            width="24"
                            height="24"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function BroadcastCard({ vod, query }: { vod: Vod; query: string }) {
  const clean = query.trim().toLowerCase();
  const filteredSeries = clean ? vod.series.filter((series) => {
    const searchable = [
      series.teamA,
      series.teamB,
      ...series.games.flatMap((game) => [...game.heroes.teamA, ...game.heroes.teamB]),
    ].join(" ").toLowerCase();
    return searchable.includes(clean);
  }) : vod.series;

  if (clean && !filteredSeries.length) return null;
  const streamCode = vod.stream.replace("English Stream ", "");

  return (
    <article className="vod-block" aria-label={vod.stream}>
      <div className="vod-heading">
        <div><span>{vod.stream}</span><small>{vod.stage} · {vod.language}</small></div>
        <a href={`https://www.youtube.com/watch?v=${vod.id}`} target="_blank" rel="noreferrer">Full broadcast ↗</a>
      </div>
      <div className="broadcast-card">
        <div className="broadcast-art" style={{ backgroundImage: `url(${vod.thumbnail})` }}>
          <div className="broadcast-art-overlay" />
          <span className="stream-pill">ENGLISH · STREAM {streamCode}</span>
          <div className="broadcast-title"><span>THE</span><strong>INTERNATIONAL</strong><small>GROUP STAGE</small></div>
        </div>
        <div className="series-list">
          {filteredSeries.map((series, index) => (
            <SeriesCard key={series.id} series={series} videoId={vod.id} index={index} query={query} />
          ))}
        </div>
      </div>
    </article>
  );
}

function ArchivePage({ allVods }: { allVods: Vod[] }) {
  return (
    <main id="top">
      <section className="hero archive-hero" aria-labelledby="page-title">
        <div className="hero-glow" />
        <p className="eyebrow">SPOILER-FREE DOTA ARCHIVE</p>
        <h1 id="page-title">Pick the event.<br /><em>Keep control.</em></h1>
        <p className="hero-copy">Choose a tournament, then the exact day you want to watch. No later matches appear along the way.</p>
        <a className="scroll-cue" href="#tournaments"><span /> Browse tournaments</a>
      </section>

      <section className="archive-section" id="tournaments" aria-labelledby="tournaments-title">
        <div className="archive-heading">
          <p className="eyebrow">TOURNAMENTS</p>
          <h2 id="tournaments-title">The archive</h2>
        </div>
        <div className="tournament-grid">
          {tournaments.map((tournament) => {
            const dates = getTournamentDates(allVods, tournament.id);
            return (
              <SiteLink href={tournamentPath(tournament)} className="tournament-card" key={tournament.id}>
                <div className="tournament-year">{tournament.year}</div>
                <div>
                  <p className="eyebrow">{tournament.shortName}</p>
                  <h3>{tournament.name}</h3>
                  <p>{dates.length} {dates.length === 1 ? "date" : "dates"} available</p>
                </div>
                <span className="card-action">Choose a date <b>→</b></span>
              </SiteLink>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function TournamentPage({ tournament, allVods }: { tournament: Tournament; allVods: Vod[] }) {
  const dates = getTournamentDates(allVods, tournament.id);
  return (
    <main id="top">
      <section className="subpage-hero" aria-labelledby="page-title">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <SiteLink href="/">Tournaments</SiteLink><span>/</span><span>{tournament.shortName}</span>
        </nav>
        <p className="eyebrow">{tournament.year} ARCHIVE</p>
        <h1 id="page-title">{tournament.name}</h1>
        <p>Choose the day you want to watch. Matchups stay hidden until you open a date.</p>
        <div className="privacy-note"><ShieldIcon /><span>No games from any date are shown on this page.</span></div>
      </section>

      <section className="date-section" aria-labelledby="dates-title">
        <div className="archive-heading">
          <p className="eyebrow">WATCH BY DATE</p>
          <h2 id="dates-title">Available broadcasts</h2>
        </div>
        <div className="date-grid">
          {dates.map((date) => {
            const dateVods = getVodsForDate(allVods, tournament.id, date);
            return (
              <SiteLink href={datePath(tournament, date)} className="date-card" key={date}>
                <div className="date-icon"><CalendarIcon /></div>
                <div>
                  <span>{formatDate(date, { weekday: "long" })}</span>
                  <h3>{formatDate(date, { month: "long", day: "numeric", year: "numeric" })}</h3>
                  <p>{dateVods[0]?.stage.split(" · ")[0]} · {dateVods.length} English {dateVods.length === 1 ? "broadcast" : "broadcasts"}</p>
                </div>
                <span className="date-arrow" aria-hidden="true">→</span>
              </SiteLink>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function DatePage({ tournament, date, allVods }: { tournament: Tournament; date: string; allVods: Vod[] }) {
  const [query, setQuery] = useState("");
  const dateVods = useMemo(() => getVodsForDate(allVods, tournament.id, date), [allVods, tournament.id, date]);
  const visibleVodCount = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return dateVods.length;
    return dateVods.filter((vod) => vod.series.some((series) => [
      series.teamA,
      series.teamB,
      ...series.games.flatMap((game) => [...game.heroes.teamA, ...game.heroes.teamB]),
    ].join(" ").toLowerCase().includes(clean))).length;
  }, [dateVods, query]);

  if (!dateVods.length) return <NotFoundPage />;

  return (
    <main id="top">
      <section className="date-page-hero" aria-labelledby="page-title">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <SiteLink href="/">Tournaments</SiteLink><span>/</span>
          <SiteLink href={tournamentPath(tournament)}>{tournament.shortName}</SiteLink><span>/</span>
          <span>{formatDate(date, { month: "short", day: "numeric" })}</span>
        </nav>
        <p className="eyebrow">{tournament.name} · {dateVods[0].stage}</p>
        <h1 id="page-title">{formatDate(date, { weekday: "long", month: "long", day: "numeric" })}</h1>
        <p className="date-boundary"><ShieldIcon /> Only broadcasts from this date are loaded.</p>
      </section>

      <section className="matches date-matches" id="matches">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SELECTED DATE</p>
            <h2>{formatDate(date, { month: "long", day: "numeric", year: "numeric" })}</h2>
            <p className="broadcast-meta">{dateVods[0].stage} <span /> {dateVods.length} English {dateVods.length === 1 ? "broadcast" : "broadcasts"}</p>
          </div>
          <label className="search-field">
            <span className="sr-only">Filter by team or hero</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a team or hero" />
          </label>
        </div>

        <div className="vod-list">
          {dateVods.map((vod) => <BroadcastCard key={vod.id} vod={vod} query={query} />)}
          {!visibleVodCount && <p className="empty-state">No teams or heroes match “{query}”.</p>}
        </div>
      </section>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="not-found">
      <p className="eyebrow">NOT FOUND</p>
      <h1>This archive page does not exist.</h1>
      <SiteLink href="/" className="primary-button">Return to tournaments</SiteLink>
    </main>
  );
}

function Footer() {
  return (
    <>
      <section className="about" id="about">
        <ShieldIcon />
        <div><p className="eyebrow">HOW IT WORKS</p><h2>Scores stay off the page.</h2></div>
        <p>Choose a tournament and a date before any matchups appear. Every best-of-three always shows three identical game choices, with no scores, winners, durations, or revealing thumbnails.</p>
      </section>
      <footer><span>DOTA<span>VODS</span></span><p>Built for catching up, not spoiling the result.</p><a href="https://www.youtube.com/@dota2" target="_blank" rel="noreferrer">Official dota2 channel ↗</a></footer>
    </>
  );
}

function App({ allVods = vods }: { allVods?: Vod[] }) {
  const pathname = usePathname();
  const routeParts = pathname.split("/").filter(Boolean);
  const tournament = routeParts[0] === "tournaments" ? tournaments.find((item) => item.slug === routeParts[1]) : undefined;
  const isArchive = pathname === "/";
  const isTournament = Boolean(tournament && routeParts.length === 2);
  const isDate = Boolean(tournament && routeParts.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(routeParts[2]));

  return (
    <div className="site-shell">
      <header className="topbar">
        <SiteLink className="brand" href="/" ariaLabel="Dota VODs home">
          <span className="brand-mark"><PlayIcon /></span>
          <span>DOTA<span>VODS</span></span>
        </SiteLink>
        <nav aria-label="Primary navigation">
          <SiteLink className={isArchive || isTournament || isDate ? "active" : undefined} href="/">Tournaments</SiteLink>
          <a href="#about">About</a>
        </nav>
        <div className="spoiler-badge"><ShieldIcon /> Spoiler-free</div>
      </header>

      {isArchive && <ArchivePage allVods={allVods} />}
      {isTournament && tournament && <TournamentPage tournament={tournament} allVods={allVods} />}
      {isDate && tournament && <DatePage tournament={tournament} date={routeParts[2]} allVods={allVods} />}
      {!isArchive && !isTournament && !isDate && <NotFoundPage />}

      <Footer />
    </div>
  );
}

export default App;
