import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { extractBestOf } from "./liquipedia.mjs";

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
