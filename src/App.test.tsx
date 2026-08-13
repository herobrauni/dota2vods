import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { getTournamentDates, getVodsForDate } from "./App";
import { heroIconUrl, teamLogoUrl, vods, youtubeUrl, type Vod } from "./vods";

const tournamentUrl = "/tournaments/the-international-2026";
const dayOneUrl = `${tournamentUrl}/2026-08-13`;
const tiVods = vods.filter((vod) => vod.tournamentId === "ti-2026");

function renderAt(pathname: string, allVods: Vod[] = vods) {
  window.history.replaceState({}, "", pathname);
  return render(<App allVods={allVods} />);
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("tournament and date navigation", () => {
  it("shows the Valve affiliation disclaimer", () => {
    renderAt("/");
    expect(screen.getByText(/independent fan project is not affiliated with or endorsed by Valve/i)).toBeInTheDocument();
  });

  it("starts with TI 2026 and does not expose any matchups", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { name: "The International 2026", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /The International 2026/ })).toHaveAttribute("href", tournamentUrl);
    expect(screen.queryByText("Nigma Galaxy")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/games$/)).not.toBeInTheDocument();
  });

  it("shows dates on the tournament subpage without showing games", () => {
    renderAt(tournamentUrl);

    expect(screen.getByRole("heading", { name: "The International 2026", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /August 13, 2026/ })).toHaveAttribute("href", dayOneUrl);
    expect(screen.getByText("No games from any date are shown on this page.")).toBeInTheDocument();
    expect(screen.queryByText("Team Liquid")).not.toBeInTheDocument();
  });

  it("navigates tournament → date without rendering matches early", () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("link", { name: /The International 2026/ }));
    expect(window.location.pathname).toBe(tournamentUrl);
    expect(screen.queryByText("Nigma Galaxy")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /August 13, 2026/ }));
    expect(window.location.pathname).toBe(dayOneUrl);
    expect(screen.getAllByText("Nigma Galaxy").length).toBeGreaterThan(0);
  });

  it("strictly selects one date even when a later day exists", () => {
    const nextDay: Vod = {
      ...tiVods[0],
      id: "future-broadcast",
      date: "2026-08-14",
      stage: "Group Stage · Day 2",
      stream: "English Stream Future",
      series: [{ ...vods[0].series[0], id: "future-series", teamA: "Future Team Alpha", teamB: "Future Team Beta" }],
    };
    const expandedArchive = [...vods, nextDay];

    const tournamentView = renderAt(tournamentUrl, expandedArchive);
    expect(screen.getByRole("link", { name: /August 14, 2026/ })).toBeInTheDocument();
    expect(screen.queryByText("Future Team Alpha")).not.toBeInTheDocument();
    tournamentView.unmount();

    renderAt(dayOneUrl, expandedArchive);
    expect(screen.getAllByText("Nigma Galaxy").length).toBeGreaterThan(0);
    expect(screen.queryByText("Future Team Alpha")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("English Stream Future")).not.toBeInTheDocument();
  });

  it("derives sorted tournament dates and filters by tournament and exact date", () => {
    const nextDay = { ...tiVods[0], id: "next", date: "2026-08-14" };
    const otherTournament = { ...tiVods[0], id: "other", tournamentId: "other-event" };
    const archive = [nextDay, otherTournament, ...vods];

    expect(getTournamentDates(archive, "ti-2026")).toEqual(["2026-08-13", "2026-08-14"]);
    expect(getVodsForDate(archive, "ti-2026", "2026-08-13").map((vod) => vod.stream))
      .toEqual(["English Stream B", "English Stream D"]);
  });
});

describe("spoiler-free VOD date page", () => {
  it("renders the verified series from both completed broadcasts", () => {
    renderAt(dayOneUrl);
    expect(screen.getAllByText("Nigma Galaxy").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team Liquid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Boom Boys").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team Resilience").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Team Yandex").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OG").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("English Stream B")).toBeInTheDocument();
    expect(screen.getByLabelText("English Stream D")).toBeInTheDocument();
  });

  it("sorts broadcasts by stream name", () => {
    const { container } = renderAt(dayOneUrl);
    const streamOrder = [...container.querySelectorAll<HTMLElement>(".vod-block")].map((block) => block.getAttribute("aria-label"));
    expect(streamOrder).toEqual(["English Stream B", "English Stream D"]);
  });

  it("shows accessible team logos from OpenDota metadata", () => {
    renderAt(dayOneUrl);
    expect(screen.getAllByAltText("Nigma Galaxy logo")[0]).toHaveAttribute("src", teamLogoUrl(10136357));
    expect(screen.getByAltText("Team Liquid logo")).toHaveAttribute("src", teamLogoUrl(2163));
    expect(screen.getByAltText("Vici Gaming logo")).toHaveAttribute("src", teamLogoUrl(726228));
    expect(vods.flatMap((vod) => vod.series).every((series) => teamLogoUrl(series.teamAId) && teamLogoUrl(series.teamBId))).toBe(true);
  });

  it("always renders draft and game-start links for all three games", () => {
    renderAt(dayOneUrl);
    for (const vod of tiVods) for (const series of vod.series) {
      const label = `${series.teamA} versus ${series.teamB} games`;
      const region = screen.getByLabelText(label);
      expect(region.querySelectorAll(".game-panel")).toHaveLength(3);
      expect(region.querySelectorAll("a")).toHaveLength(6);
    }
  });

  it("builds second-accurate YouTube links", () => {
    expect(youtubeUrl("VaZpuoMhjmg", 7810)).toBe("https://www.youtube.com/watch?v=VaZpuoMhjmg&t=7810s");
    renderAt(dayOneUrl);
    expect(screen.getByLabelText("Watch game 1 draft: Nigma Galaxy versus Iron Wing"))
      .toHaveAttribute("href", "https://www.youtube.com/watch?v=VaZpuoMhjmg&t=6766s");
  });

  it("only contains English broadcasts and complete game metadata", () => {
    expect(vods.every((vod) => vod.language === "English")).toBe(true);
    expect(new Set(vods.map((vod) => vod.tournamentId)).size).toBe(2);
    expect(vods.flatMap((vod) => vod.series).flatMap((series) => series.games)).toHaveLength(252);
    expect(vods.flatMap((vod) => vod.series).flatMap((series) => series.games).every((game) => game.startSeconds > 0)).toBe(true);
    expect(vods.flatMap((vod) => vod.series).flatMap((series) => series.games).every((game) => game.draftStartSeconds < game.startSeconds)).toBe(true);
    expect(vods.flatMap((vod) => vod.series).flatMap((series) => series.games).every((game) => game.heroes.teamA.length === 5 && game.heroes.teamB.length === 5)).toBe(true);
    expect(vods.every((vod) => vod.casters.length > 0)).toBe(true);
  });

  it("finds series by hero name", () => {
    renderAt(dayOneUrl);
    const input = screen.getByPlaceholderText("Find a team, hero, or caster");
    fireEvent.change(input, { target: { value: "Huskar" } });
    expect(screen.getAllByText("Nigma Galaxy").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Team Liquid")).toHaveLength(0);
    expect(screen.getByAltText("Nigma Galaxy: Huskar")).toHaveAttribute("src", heroIconUrl("Huskar"));
  });

  it("lists casters next to each broadcast", () => {
    renderAt(dayOneUrl);
    expect(screen.getByText("Casted by ODPIXEL & Capitalist")).toBeInTheDocument();
    expect(screen.getByText("Casted by Blitz & Kyle")).toBeInTheDocument();
  });

  it("finds a broadcast by caster and reveals every series on it", () => {
    renderAt(dayOneUrl);
    const input = screen.getByPlaceholderText("Find a team, hero, or caster");
    fireEvent.change(input, { target: { value: "ODPIXEL" } });
    // Stream D matched on its caster, so all of its series stay visible...
    expect(screen.getAllByText("Team Resilience").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OG").length).toBeGreaterThan(0);
    // ...while Stream B (Blitz & Kyle) has no caster or team match and drops out.
    expect(screen.queryByText("Team Liquid")).not.toBeInTheDocument();
  });

  it("keeps OpenDota IDs for verified games without inventing one for a concealed game", () => {
    const games = vods.flatMap((vod) => vod.series).flatMap((series) => series.games);
    expect(games.filter((game) => game.source === "verified").every((game) => Boolean(game.matchId))).toBe(true);
    expect(games.filter((game) => game.source === "concealed-fallback").every((game) => game.matchId === undefined)).toBe(true);
    for (const series of vods.flatMap((vod) => vod.series).filter((candidate) => candidate.games[2].source === "concealed-fallback")) {
      expect(series.games[2].draftStartSeconds).toBe(series.games[1].draftStartSeconds);
      expect(series.games[2].heroes).toEqual(series.games[1].heroes);
    }
  });

  it("does not render score or result language", () => {
    const { container } = renderAt(dayOneUrl);
    const text = [...container.querySelectorAll(".series-list")].map((element) => element.textContent).join(" ");
    expect(text).not.toMatch(/\b[0-3]\s*[-:]\s*[0-3]\b/);
    expect(text).not.toMatch(/winner|result|series score/i);
  });
});
