import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { getMatchesForDate, getTournamentDates } from "./App";
import { archive, archives, fallbackHeroIconUrl, matches, tournaments } from "./vods";

// Expected TI dates are derived from the snapshot files themselves so growing
// the archive (a new ti-2026-dayN.json) never breaks this suite.
const tiSnapshotModules = import.meta.glob<Record<string, unknown>>("./ti-2026-day*.json", { eager: true });
const tiSnapshotDates = Object.values(tiSnapshotModules)
  .map((snapshot) => (snapshot as { date: string }).date)
  .sort();
const tiDayTwo = archives.find((item) => item.tournament.id === "ti-2026" && item.date === "2026-08-14");
const tiDayTwoGameCards = tiDayTwo?.matches.flatMap((match) => match.games).length ?? 0;

const tiDayOneUrl = "/tournaments/the-international-2026/2026-08-13";
const tiDayTwoUrl = "/tournaments/the-international-2026/2026-08-14";
const ewcDayOneUrl = "/tournaments/esports-world-cup-2026/2026-07-07";

function renderAt(pathname: string) {
  window.history.replaceState({}, "", pathname);
  return render(<App />);
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("Riki VODs frontend", () => {
  it("shows exactly the current EWC and TI tournaments", () => {
    renderAt("/");
    expect(tournaments.map((tournament) => tournament.id)).toEqual(["ewc-2026", "ti-2026"]);
    expect(screen.getAllByRole("link", { name: "Tournaments" })[0]).toHaveAttribute("href", "/tournaments");
    expect(screen.getByRole("heading", { name: "The International 2026", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Esports World Cup 2026", level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Current tournaments", level: 2 })).not.toBeInTheDocument();
  });

  it("provides a dedicated tournament selection page", () => {
    renderAt("/tournaments");
    expect(screen.getByRole("heading", { name: "Choose your tournament", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Esports World Cup 2026", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The International 2026", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: / versus / })).not.toBeInTheDocument();
  });

  it("renders the selected TI date and all twelve matches", () => {
    renderAt(tiDayOneUrl);
    expect(screen.getByRole("heading", { name: "Thursday, August 13", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: / versus / })).toHaveLength(12);
    expect(document.querySelectorAll(".game-card")).toHaveLength(36);
    expect(screen.queryByText("Watch VOD ↗")).not.toBeInTheDocument();
  });

  it("renders an identical pre-click interface for every game and opens the VOD on first click", () => {
    renderAt(tiDayOneUrl);
    expect(screen.queryAllByRole("link", { name: /^Game \d+: .+ versus .+$/ })).toHaveLength(0);
    expect(screen.queryByText("VOD unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("This game was not played")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Game \d+: .+ versus .+$/ })).toHaveLength(36);
    expect(screen.getAllByRole("button", { name: /^Mark watched Game \d+ of .+ versus .+$/ })).toHaveLength(36);

    const vodGame = archive.matches
      .flatMap((match) => match.games.filter((game) => game.vodUrl).map((game) => ({ match, game })))
      .at(0);
    if (!vodGame) throw new Error("TI day one must contain a game with a VOD");
    const label = `Game ${vodGame.game.number}: ${vodGame.match.teamA} versus ${vodGame.match.teamB}`;
    const cardIndex = archive.matches.flatMap((match) => match.games).indexOf(vodGame.game);
    const cardElement = document.querySelectorAll(".game-card")[cardIndex] as HTMLElement | undefined;
    if (!cardElement) throw new Error("game card not rendered");

    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(within(cardElement).getByRole("button", { name: label }));
    expect(open).toHaveBeenCalledWith(vodGame.game.vodUrl, "_blank", "noopener,noreferrer");
    expect(screen.queryByRole("link", { name: /^Game \d+: .+ versus .+$/ })).not.toBeInTheDocument();
    open.mockRestore();
  });

  it("searches caster, team, and hero metadata within the selected day", () => {
    renderAt(tiDayOneUrl);
    const input = screen.getByRole("textbox", { name: "Search VODs" });

    fireEvent.change(input, { target: { value: "ODPixel" } });
    expect(screen.getByRole("article", { name: "Team Falcons versus LGD Gaming" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Team Liquid versus Vici Gaming" })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Huskar" } });
    expect(screen.getAllByRole("article", { name: / versus / })).toHaveLength(3);
    expect(screen.getByText(/safe result/)).toBeInTheDocument();
  });

  it("highlights only the games containing a searched hero", () => {
    renderAt(tiDayOneUrl);
    const hero = archive.matches[0].games[0].heroes.teamA[0].name;
    const expectedHighlightedGames = archive.matches.flatMap((match) => match.games).filter((game) => (
      [...game.heroes.teamA, ...game.heroes.teamB].some((pick) => pick.name.toLowerCase().includes(hero.toLowerCase()))
    )).length;

    fireEvent.change(screen.getByRole("textbox", { name: "Search VODs" }), { target: { value: hero } });

    expect(document.querySelectorAll(".game-card.hero-search-match")).toHaveLength(expectedHighlightedGames);
  });

  it("marks an entire match watched and persists that progress locally", () => {
    renderAt(tiDayOneUrl);
    const match = archive.matches[0];
    const matchArticle = screen.getByRole("article", { name: `${match.teamA} versus ${match.teamB}` });
    const markMatchButton = screen.getAllByRole("button", { name: "Mark match watched" })[0];

    fireEvent.click(markMatchButton);
    expect(screen.getByRole("button", { name: "Match watched" })).toBeInTheDocument();
    expect(matchArticle).toHaveTextContent(`${match.games.length}/${match.games.length} games marked watched`);
    expect(JSON.parse(window.localStorage.getItem("riki-vods-progress-v1") || "[]")).toHaveLength(match.games.length);
    expect(document.querySelector(".progress-meter")?.textContent).toContain("1/12");
    expect(screen.getByRole("progressbar", { name: "Current-day match progress" })).toHaveAttribute("aria-valuenow", "1");

    fireEvent.click(screen.getByRole("button", { name: "Match watched" }));
    expect(screen.getAllByRole("button", { name: "Mark match watched" })).toHaveLength(12);
    expect(document.querySelector(".progress-meter")?.textContent).toContain("0/12");
  });

  it("toggles the selected day watched and unwatched", () => {
    renderAt(tiDayOneUrl);
    const dayButton = screen.getByRole("button", { name: "Mark this day watched" });

    fireEvent.click(dayButton);
    expect(screen.getByRole("button", { name: "Mark this day unwatched" })).toBeInTheDocument();
    expect(document.querySelector(".progress-meter")?.textContent).toContain("12/12");
    expect(JSON.parse(window.localStorage.getItem("riki-vods-progress-v1") || "[]")).toHaveLength(
      archive.matches.flatMap((match) => match.games).length,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark this day unwatched" }));
    expect(screen.getByRole("button", { name: "Mark this day watched" })).toBeInTheDocument();
    expect(document.querySelector(".progress-meter")?.textContent).toContain("0/12");
    expect(JSON.parse(window.localStorage.getItem("riki-vods-progress-v1") || "[]")).toHaveLength(0);
  });

  it("opens hero picks and exposes source attribution", () => {
    renderAt(tiDayOneUrl);
    fireEvent.click(screen.getAllByRole("button", { name: /Hero picks/ })[0]);
    expect(screen.getAllByRole("listitem").length).toBe(10);
    expect(screen.getByText(/Data:/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Liquipedia" })).toHaveAttribute("href", archive.sources.liquipedia);
    expect(screen.getByRole("link", { name: "OpenDota" })).toHaveAttribute("href", archive.sources.opendota);
  });
});

describe("archive data helpers", () => {
  it("exposes TI and EWC dates independently", () => {
    expect(tournaments).toHaveLength(2);
    expect(getTournamentDates(matches, "ti-2026")).toEqual(tiSnapshotDates);
    expect(getMatchesForDate(matches, "ti-2026", "2026-08-13")).toHaveLength(12);
    expect(getTournamentDates(matches, "ewc-2026")).toEqual([
      "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12",
      "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19",
    ]);
    expect(getMatchesForDate(matches, "ewc-2026", "2026-07-07")).toHaveLength(12);
    expect(getMatchesForDate(matches, "ewc-2026", "2026-07-13")).toHaveLength(0);
    expect(archives.find((item) => item.date === "2026-07-14")?.stage).toContain("Survival");
    expect(archives.find((item) => item.date === "2026-07-16")?.stage).toContain("Playoffs");
    const ewcFinalDay = getMatchesForDate(matches, "ewc-2026", "2026-07-19");
    expect(ewcFinalDay.some((match) => match.bestOf === 5 && match.games.length === 5)).toBe(true);
    expect(ewcFinalDay.some((match) => match.bestOf === 3 && match.games.length === 3)).toBe(true);
  });

  it("renders an EWC dated archive with all twelve day-one matches", () => {
    renderAt(ewcDayOneUrl);
    expect(screen.getByRole("heading", { name: "Tuesday, July 7", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: / versus / })).toHaveLength(12);
  });

  it("renders only the completed TI Day 2 series", () => {
    renderAt(tiDayTwoUrl);
    expect(screen.getByRole("heading", { name: "Friday, August 14", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: / versus / })).toHaveLength(tiDayTwo?.matches.length ?? 0);
    expect(document.querySelectorAll(".game-card")).toHaveLength(tiDayTwoGameCards);
    expect(screen.getAllByRole("button", { name: /^Game \d+: .+ versus .+$/ })).toHaveLength(tiDayTwoGameCards);
    expect(screen.getAllByRole("button", { name: /^Mark watched Game \d+ of .+ versus .+$/ })).toHaveLength(tiDayTwoGameCards);
    expect(screen.queryAllByRole("link", { name: /^Game \d+: .+ versus .+$/ })).toHaveLength(0);
  });

  it("keeps the EWC final-day order and preserves the fifth BO5 game", () => {
    renderAt("/tournaments/esports-world-cup-2026/2026-07-19");
    const series = screen.getAllByRole("article", { name: / versus / });
    expect(series[0]).toHaveAccessibleName("Vici Gaming versus Team Yandex");
    expect(series[1]).toHaveAccessibleName("BB Team versus PVISION");
    expect(series[1].querySelectorAll(".game-card")).toHaveLength(5);
    expect(series[1]).toHaveTextContent("GAME 5");
  });

  it("keeps generated data spoiler-safe and has a safe hero fallback", () => {
    expect(archive.matches).toHaveLength(12);
    expect(archive.matches.flatMap((match) => match.games)).toHaveLength(36);
    const allGames = archives.flatMap((item) => item.matches.flatMap((match) => match.games));
    expect(allGames.filter((game) => game.source === "concealed-fallback").length).toBeGreaterThan(0);
    for (const game of allGames) {
      if (game.source === "opendota") {
        expect(game.heroes.teamA, `game ${game.number} (${game.matchId}) teamA picks`).toHaveLength(5);
        expect(game.heroes.teamB, `game ${game.number} (${game.matchId}) teamB picks`).toHaveLength(5);
      } else {
        expect(game.vodUrl).toBeNull();
        expect(game.heroes.teamA).toHaveLength(0);
        expect(game.heroes.teamB).toHaveLength(0);
      }
    }
    expect(JSON.stringify(archives)).not.toMatch(/radiant_win|winner|duration|score/i);
    expect(fallbackHeroIconUrl("Crystal Maiden")).toContain("crystal_maiden.png");
  });

  it("reveals concealed games without leaking picks or VODs", () => {
    renderAt(tiDayOneUrl);
    const tiDayOne = archives.find((item) => item.tournament.id === "ti-2026" && item.date === "2026-08-13");
    const concealedMatch = tiDayOne?.matches.find((match) => match.games.some((game) => game.source === "concealed-fallback"));
    const concealedGame = concealedMatch?.games.find((game) => game.source === "concealed-fallback");
    if (!concealedMatch || !concealedGame) throw new Error("TI day one must contain at least one concealed game");
    const article = screen.getByRole("article", { name: `${concealedMatch.teamA} versus ${concealedMatch.teamB}` });
    const cardElement = article.querySelectorAll(".game-card")[concealedGame.number - 1] as HTMLElement | undefined;
    if (!cardElement) throw new Error(`game card ${concealedGame.number} not rendered`);
    const card = within(cardElement);

    expect(card.queryByText("This game was not played")).not.toBeInTheDocument();
    fireEvent.click(card.getByRole("button", { name: `Game ${concealedGame.number}: ${concealedMatch.teamA} versus ${concealedMatch.teamB}` }));
    expect(card.getByText("This game was not played")).toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: /Hero picks/ }));
    expect(card.getByText("Hero picks are not available for this game.")).toBeInTheDocument();
    expect(card.queryAllByRole("listitem")).toHaveLength(0);
    expect(card.queryByRole("link", { name: /^Game \d+: .+ versus .+$/ })).not.toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: `Mark watched Game ${concealedGame.number} of ${concealedMatch.teamA} versus ${concealedMatch.teamB}` }));
    expect(card.getByText("✓ WATCHED")).toBeInTheDocument();
    expect(card.getByRole("button", { name: `Mark unwatched Game ${concealedGame.number} of ${concealedMatch.teamA} versus ${concealedMatch.teamB}` })).toBeInTheDocument();
  });

  it("reveals played games with a missing VOD through the same toggle", () => {
    // Search every TI day: Liquipedia fills VODs in over time, so a specific
    // day cannot be assumed to still contain a played-but-unlinked game. When
    // every played game has a VOD there is nothing left to verify here.
    const playedWithoutVod = archives
      .filter((item) => item.tournament.id === "ti-2026")
      .flatMap((item) => item.matches
        .flatMap((match) => match.games.filter((game) => game.source === "opendota" && !game.vodUrl)
          .map((game) => ({ item, match, game }))))
      .at(0);
    if (!playedWithoutVod) return;
    const { item, match, game } = playedWithoutVod;
    renderAt(`/tournaments/${item.tournament.slug}/${item.date}`);
    const article = screen.getByRole("article", { name: `${match.teamA} versus ${match.teamB}` });
    const cardElement = article.querySelectorAll(".game-card")[game.number - 1] as HTMLElement | undefined;
    if (!cardElement) throw new Error(`game card ${game.number} not rendered`);
    const card = within(cardElement);

    expect(screen.queryByText("VOD unavailable")).not.toBeInTheDocument();
    expect(card.queryByText("This game was not played")).not.toBeInTheDocument();
    fireEvent.click(card.getByRole("button", { name: `Game ${game.number}: ${match.teamA} versus ${match.teamB}` }));
    expect(card.getByText("VOD unavailable")).toBeInTheDocument();
    expect(card.queryByText("This game was not played")).not.toBeInTheDocument();

    fireEvent.click(card.getByRole("button", { name: /Hero picks/ }));
    expect(card.queryByText("Hero picks are not available for this game.")).not.toBeInTheDocument();
    expect(card.getAllByRole("listitem")).toHaveLength(10);
  });
});
