import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractBestOf, parseBracketDayPage } from "./liquipedia.mjs";

function popup(markup) {
  return new JSDOM(`<div class="brkts-popup">${markup}</div>`).window.document.querySelector(".brkts-popup");
}

describe("Liquipedia series format parsing", () => {
  it("reads the best-of marker without retaining result metadata", () => {
    expect(extractBestOf(popup('<span class="match-info-header-scoreholder-lower">(Bo5)</span>'))).toBe(5);
    expect(extractBestOf(popup('<span class="match-info-header-scoreholder-lower">(Bo3)</span>'))).toBe(3);
  });

  it("supports the text fallback used by alternate popup markup", () => {
    expect(extractBestOf(popup("Team A vs Team B (Bo2)"))).toBe(2);
    expect(extractBestOf(popup("Team A vs Team B"))).toBeNull();
  });
});

describe("Liquipedia bracket day parsing", () => {
  const row = (game) => `<div class="brkts-popup-body-grid-row"><span class="brkts-champion-icon"><img src="/x.png" /></span><div class="brkts-popup-side-color--radiant"><a title="Pudge"></a></div><div class="brkts-popup-side-color--dire"><a title="Zeus"></a></div></div>`;
  const bracketMatch = (teams, timestampSeconds, games = 1) => `
    <div class="brkts-match">
      <div class="brkts-popup-container">
        <div class="brkts-popup">
          <div data-timestamp="${timestampSeconds}">August 16, 2026 - 15:00 UTC</div>
          <div class="match-info-header">
            <div class="match-info-header-opponent"><span class="name"><a>${teams[0]}</a></span></div>
            <div class="match-info-header-opponent"><span class="name"><a>${teams[1]}</a></span></div>
          </div>
          <span class="match-info-header-scoreholder-lower">(Bo3)</span>
          ${Array.from({ length: games }, (_, i) => row(i + 1)).join("")}
        </div>
      </div>
    </div>`;

  const html = (body) => `<div>${body}</div>`;
  // 2026-08-16T15:00:00Z = 1786892400
  const page = html(bracketMatch(["Team Liquid", "Gaimin Gladiators"], 1786892400, 2) + bracketMatch(["Team Falcons", "BetBoom Team"], 1786892400 + 4 * 3600, 3));

  it("keeps only matches scheduled on the requested UTC date with completed rows", () => {
    const result = parseBracketDayPage({ html: page, date: "2026-08-16" });
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].teams).toEqual(["Team Liquid", "Gaimin Gladiators"]);
    expect(result.matches[0].games).toHaveLength(2);
    expect(result.matches[0].bestOf).toBe(3);
    expect(result.matches[1].teams).toEqual(["Team Falcons", "BetBoom Team"]);

    const otherDay = parseBracketDayPage({ html: page, date: "2026-08-17" });
    expect(otherDay.matches).toHaveLength(0);
  });

  it("ignores scheduled matches that have no completed game rows yet", () => {
    const pending = html(bracketMatch(["TBD", "TBD"], 1786518000, 0).replace('class="brkts-champion-icon"', "class=\"brkts-standings-icon\""));
    expect(parseBracketDayPage({ html: pending, date: "2026-08-16" }).matches).toHaveLength(0);
  });

  it("never emits result-bearing fields", () => {
    const result = parseBracketDayPage({ html: page, date: "2026-08-16" });
    expect(JSON.stringify(result)).not.toMatch(/radiant_win|winner|duration|score/i);
  });
});
