#!/usr/bin/env node
// Scan a faster-whisper transcript for caster (commentary talent) introductions.
//
// Casters are announced verbally at the top of a Dota 2 broadcast and between
// games ("I'm ODPIXEL, alongside me is Capitalist..."). They are public broadcast
// metadata, not a result, so they are safe to surface. faster-whisper base.en
// transcribes handles imperfectly, so this report only produces *candidates* for
// manual review. It never writes to src/vods.ts and never auto-publishes.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Caster intros usually happen at the top of the stream and during between-game
// desk segments. Searching only the opening window keeps fantasy matches out of
// later, noisier gameplay commentary.
const SCAN_WINDOW_SECONDS = 45 * 60;

// A caster handle is a short token that may mix letters, digits, underscores, and
// apostrophes (e.g. "ODPIXEL", "Aui_2000", "Slacks"). Allow an optional second
// capitalized token for two-word names a transcript might split ("Od Pixel").
const HANDLE = "[A-Z][A-Za-z0-9_']{1,}(?:[ -][A-Z][A-Za-z0-9_']+)?";

// Match the leading cue keyword whether or not it starts a sentence.
const flex = (word) => `[${word[0].toUpperCase()}${word[0].toLowerCase()}]${word.slice(1)}`;

// Each cue captures one or more handles (never a wrapping group), so every capture
// is exactly one candidate name.
const END = `(?=\\s|$|[.,!?])`;
const AND_NEXT = `(?:\\s+and\\s+(${HANDLE}))?`;
const CUES = [
  { name: "self-intro", pattern: new RegExp(`\\b[Ii](?:'| a)m\\s+(${HANDLE})${END}`, "g") },
  { name: "this-is-pair", pattern: new RegExp(`\\b${flex("this")}\\s+is\\s+(${HANDLE})\\s+(?:and|alongside|with)\\s+(${HANDLE})${END}`, "g") },
  { name: "joining-me", pattern: new RegExp(`\\b${flex("joining")}\\s+me(?:\\s+(?:today|tonight|now|here))?\\s+is\\s+(${HANDLE})${AND_NEXT}${END}`, "g") },
  { name: "alongside", pattern: new RegExp(`\\b${flex("alongside")}\\s+(?:me(?:\\s+(?:is|today|now))?\\s+)?(${HANDLE})${AND_NEXT}${END}`, "g") },
  { name: "with-me", pattern: new RegExp(`\\b${flex("with")}\\s+me(?:\\s+today)?(?:\\s+is)?\\s+(${HANDLE})${AND_NEXT}${END}`, "g") },
  { name: "joined-by", pattern: new RegExp(`\\b${flex("joined")}\\s+by\\s+(${HANDLE})${AND_NEXT}${END}`, "g") },
  { name: "casting-with", pattern: new RegExp(`\\b${flex("casting")}(?:\\s+this)?(?:\\s+one)?(?:\\s+for\\s+you)?(?:\\s+today)?[:\\s]+(${HANDLE})${AND_NEXT}${END}`, "g") },
  { name: "at-the-desk", pattern: new RegExp(`\\b${flex("at")}\\s+the\\s+desk[^.]*?\\b(?:is|are|with)\\s+(${HANDLE})(?:(?:,\\s+|\\s+and\\s+)(${HANDLE}))?(?:(?:,\\s+|\\s+and\\s+)(${HANDLE}))?${END}`, "g") },
];

// Words the handle grammar would otherwise capture from gameplay commentary or
// sentence-starters. Checked case-insensitively against the matched token.
const STOPWORDS = new Set([
  "the", "this", "that", "these", "those", "they", "them", "their", "there", "then", "than",
  "and", "but", "for", "from", "with", "without", "what", "when", "where", "which",
  "why", "how", "who", "whom", "whose", "yes", "yeah", "yep", "no", "not", "now", "here",
  "just", "very", "really", "actually", "going", "gonna", "sure", "glad", "sorry",
  "excited", "happy", "ready", "looking", "joined", "joining", "back", "let", "thank",
  "thanks", "welcome", "good", "great", "right", "well", "still", "again", "both",
  "all", "we", "you", "he", "she", "it", "so", "if", "as", "at", "be", "been", "being",
  "got", "get", "make", "made", "see", "seen", "say", "said", "way", "lot", "bit",
  "thing", "think", "thought", "come", "came", "into", "onto", "over", "under",
  "after", "before", "through", "team", "teams", "game", "games", "draft", "first",
  "second", "third", "one", "two", "three", "match", "play", "player", "hero", "guys",
  "okay", "alright", "of", "to", "in", "on", "up", "out", "or", "my", "your", "our",
]);

function normalizeHandle(raw) {
  const handle = raw.trim().replace(/[.,!?;:]+$/, "").replace(/\s+/g, " ");
  if (!handle || !/[A-Za-z]/.test(handle)) return null;
  if (STOPWORDS.has(handle.toLowerCase())) return null;
  return handle;
}

function extractFromTranscript(transcript) {
  const segments = (transcript.segments ?? []).filter(
    (segment) => segment.startSeconds < SCAN_WINDOW_SECONDS,
  );
  const byName = new Map();

  const record = (handle, segment, cue, text) => {
    const normalized = normalizeHandle(handle);
    if (!normalized) return;
    const existing = byName.get(normalized) ?? {
      name: normalized,
      count: 0,
      cues: new Set(),
      firstStartSeconds: segment.startSeconds,
      contexts: [],
    };
    existing.count += 1;
    existing.cues.add(cue);
    if (existing.contexts.length < 3) {
      existing.contexts.push({ startSeconds: segment.startSeconds, cue, text });
    }
    byName.set(normalized, existing);
  };

  for (const segment of segments) {
    const text = segment.text ?? "";
    for (const cue of CUES) {
      cue.pattern.lastIndex = 0;
      let match;
      while ((match = cue.pattern.exec(text)) !== null) {
        for (const captured of match.slice(1)) {
          if (captured) record(captured, segment, cue.name, text);
        }
      }
    }
  }

  return [...byName.values()]
    .map((entry) => ({
      name: entry.name,
      count: entry.count,
      cues: [...entry.cues],
      firstStartSeconds: entry.firstStartSeconds,
      contexts: entry.contexts,
      // Confidence is heuristic: multiple cues or repeated mentions are stronger.
      confidence: entry.cues.size >= 2 || entry.count >= 2 ? "high" : "low",
    }))
    .sort((a, b) => b.count - a.count || b.cues.length - a.cues.length);
}

export function extractCasters(transcript) {
  return extractFromTranscript(transcript);
}

function main() {
  const transcriptPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!transcriptPath || !outputPath) {
    console.error("Usage: node scripts/extract-casters.mjs <transcript.local.json> <casters.candidates.json>");
    process.exit(1);
  }
  const transcript = JSON.parse(readFileSync(transcriptPath, "utf8"));
  const candidates = extractFromTranscript(transcript);
  const report = {
    source: "faster-whisper transcript",
    generatedAt: new Date().toISOString(),
    transcript: transcriptPath,
    scanWindowSeconds: SCAN_WINDOW_SECONDS,
    caveat: "Whisper handles are imperfect. Review the candidate names and the surrounding context before copying any into src/vods.ts; this report never changes site data automatically.",
    candidates,
  };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Casters: ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}; wrote ${outputPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
