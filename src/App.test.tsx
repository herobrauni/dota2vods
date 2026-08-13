import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { getMatchesForDate, getTournamentDates } from "./App";
import { archive, fallbackHeroIconUrl, matches, tournaments } from "./vods";

const tournamentUrl = "/tournaments/the-international-2026";
const dayOneUrl = `${tournamentUrl}/2026-08-13`;

function renderAt(pathname: string) {
  window.history.replaceState({}, "", pathname);
  return render(<App />);
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("spoiler-safe TI Day 1 archive", () => {
  it("shows only the tournament before a date is selected", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: "The International 2026", level: 3 })).toBeInTheDocument();
    expect(screen.queryByText("Team Liquid")).not.toBeInTheDocument();
  });

  it("shows the single Day 1 date without matchups on the tournament page", () => {
    renderAt(tournamentUrl);
    expect(screen.getByRole("heading", { name: "The International 2026", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /August 13, 2026/ })).toHaveAttribute("href", dayOneUrl);
    expect(screen.queryByText("Team Liquid")).not.toBeInTheDocument();
  });

  it("renders all Day 1 matches with three game controls and direct VOD links", () => {
    renderAt(dayOneUrl);
    expect(screen.getAllByRole("article", { name: / versus / })).toHaveLength(12);
    for (const match of matches) {
      const region = screen.getByLabelText(`${match.teamA} versus ${match.teamB} games`);
      expect(region.querySelectorAll(".game-panel")).toHaveLength(3);
    }
    expect(screen.getAllByText("Watch VOD ↗").length).toBeGreaterThan(20);
  });

  it("searches caster, team, and hero metadata without exposing results", () => {
    renderAt(dayOneUrl);
    const input = screen.getByPlaceholderText("Find a team, hero, or caster");

    fireEvent.change(input, { target: { value: "ODPixel" } });
    expect(screen.getByRole("article", { name: "Team Falcons versus LGD Gaming" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Team Liquid versus Vici Gaming" })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Huskar" } });
    expect(screen.getAllByAltText(/Huskar/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("article", { name: "Team Liquid versus Vici Gaming" })).not.toBeInTheDocument();
  });

  it("keeps the generated data limited to spoiler-safe fields", () => {
    expect(matches).toHaveLength(12);
    expect(matches.flatMap((match) => match.games)).toHaveLength(36);
    expect(matches.flatMap((match) => match.games).every((game) => (
      game.heroes.teamA.length === 5 && game.heroes.teamB.length === 5
    ))).toBe(true);
    expect(JSON.stringify(archive)).not.toMatch(/radiant_win|winner|duration|score/i);
  });

  it("exposes source attribution", () => {
    renderAt(dayOneUrl);
    expect(screen.getByText(/Data:/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Liquipedia" })).toHaveAttribute("href", archive.sources.liquipedia);
    expect(screen.getByRole("link", { name: "OpenDota" })).toHaveAttribute("href", archive.sources.opendota);
  });
});

describe("archive data helpers", () => {
  it("only exposes the one generated tournament date", () => {
    expect(tournaments).toHaveLength(1);
    expect(getTournamentDates(matches, "ti-2026")).toEqual(["2026-08-13"]);
    expect(getMatchesForDate(matches, "ti-2026", "2026-08-13")).toHaveLength(12);
    expect(getMatchesForDate(matches, "ti-2026", "2026-08-14")).toHaveLength(0);
  });

  it("has a safe icon fallback for heroes without a CDN path", () => {
    expect(fallbackHeroIconUrl("Crystal Maiden")).toContain("crystal_maiden.png");
  });
});
