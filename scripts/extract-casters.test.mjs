import { describe, expect, it } from "vitest";
import { extractCasters } from "./extract-casters.mjs";

const segment = (startSeconds, text) => ({ startSeconds, endSeconds: startSeconds + 5, text });

describe("caster extraction", () => {
  it("pulls casters from common introduction phrases", () => {
    const transcript = { segments: [
      segment(30, "Welcome back everybody, I'm ODPIXEL and joining me today is Capitalist."),
      segment(120, "I'm Trent, and alongside me is Lyrical for this next series."),
      segment(300, "This is Jenkins and Fogged casting this one for you today."),
      segment(400, "We are joined by Slacks at the desk along with Synderen."),
    ] };
    const names = extractCasters(transcript).map((candidate) => candidate.name);
    expect(names).toEqual(expect.arrayContaining([
      "ODPIXEL", "Capitalist", "Trent", "Lyrical", "Jenkins", "Fogged", "Slacks", "Synderen",
    ]));
  });

  it("ignores ordinary gameplay commentary and sentence-starters", () => {
    const transcript = { segments: [
      segment(60, "I'm going to take a look at the draft now."),
      segment(90, "This is going to be a great game for Team Liquid."),
      segment(150, "Let's see what they pick here in the first phase."),
    ] };
    expect(extractCasters(transcript)).toEqual([]);
  });

  it("only scans the opening broadcast window", () => {
    const late = segment(3 * 60 * 60, "I'm Faker and joining me is SomeGuy way past the intro.");
    const names = extractCasters({ segments: [late] }).map((candidate) => candidate.name);
    expect(names).toEqual([]);
  });

  it("records the cue and confidence, and never invents a publication decision", () => {
    const [candidate] = extractCasters({ segments: [
      segment(10, "I'm ODPIXEL, alongside me is Capitalist, and joining us is Slacks."),
      segment(40, "ODPIXEL back with you alongside Capitalist."),
    ] }).filter((item) => item.name === "Capitalist");
    expect(candidate.cues).toEqual(expect.arrayContaining(["alongside"]));
    expect(candidate.confidence).toBe("high");
  });
});
