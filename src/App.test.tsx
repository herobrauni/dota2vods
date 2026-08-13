import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { getMatchesForDate, getTournamentDates } from "./App";
import { archive, archives, fallbackHeroIconUrl, matches, tournaments } from "./vods";

const tiDayOneUrl = "/tournaments/the-international-2026/2026-08-13";
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
    const vodLinks = screen.getAllByRole("link", { name: /Watch VOD for Game/ });
    expect(vodLinks.length).toBeGreaterThan(20);
    expect(vodLinks[0]).toHaveClass("game-visual-link");
    expect(screen.queryByText("Watch VOD ↗")).not.toBeInTheDocument();
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
    expect(getTournamentDates(matches, "ti-2026")).toEqual(["2026-08-13"]);
    expect(getMatchesForDate(matches, "ti-2026", "2026-08-13")).toHaveLength(12);
    expect(getMatchesForDate(matches, "ti-2026", "2026-08-14")).toHaveLength(0);
    expect(getTournamentDates(matches, "ewc-2026")).toEqual([
      "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12",
      "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19",
    ]);
    expect(getMatchesForDate(matches, "ewc-2026", "2026-07-07")).toHaveLength(12);
    expect(getMatchesForDate(matches, "ewc-2026", "2026-07-13")).toHaveLength(0);
    expect(archives.find((item) => item.date === "2026-07-14")?.stage).toContain("Survival");
    expect(archives.find((item) => item.date === "2026-07-16")?.stage).toContain("Playoffs");
    expect(getMatchesForDate(matches, "ewc-2026", "2026-07-19").some((match) => match.games.length === 4)).toBe(true);
  });

  it("renders an EWC dated archive with all twelve day-one matches", () => {
    renderAt(ewcDayOneUrl);
    expect(screen.getByRole("heading", { name: "Tuesday, July 7", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("article", { name: / versus / })).toHaveLength(12);
  });

  it("keeps generated data spoiler-safe and has a safe hero fallback", () => {
    expect(archive.matches).toHaveLength(12);
    expect(archive.matches.flatMap((match) => match.games)).toHaveLength(36);
    expect(archives.flatMap((item) => item.matches.flatMap((match) => match.games)).every((game) => (
      game.heroes.teamA.length === 5 && game.heroes.teamB.length === 5
    ))).toBe(true);
    expect(JSON.stringify(archives)).not.toMatch(/radiant_win|winner|duration|score/i);
    expect(fallbackHeroIconUrl("Crystal Maiden")).toContain("crystal_maiden.png");
  });
});
