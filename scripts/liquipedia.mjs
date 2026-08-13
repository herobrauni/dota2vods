#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const API_URL = "https://liquipedia.net/dota2/api.php";
const WIKI_URL = "https://liquipedia.net/dota2";
const PAGE = "The_International/2026/Group_Stage";
const DAY_ONE_DATE = "August 13, 2026";
const CACHE_DIR = resolve(".cache", "liquipedia");
const CACHE_FILE = resolve(CACHE_DIR, "the-international-2026-group-stage.parse.json");
const USER_AGENT = process.env.LIQUIPEDIA_USER_AGENT
  ?? "dota2vods/0.1 (https://github.com/herobrauni/dota2vods; brauni@brauni.dev)";

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function cacheEntry(payload, requestUrl) {
  return {
    fetchedAt: new Date().toISOString(),
    requestUrl,
    payload,
  };
}

/**
 * A single serialized client is used for all Liquipedia calls. The two clocks
 * implement the MediaWiki API terms: one HTTP request per two seconds, and
 * one action=parse request per thirty seconds.
 */
export class LiquipediaClient {
  constructor({ apiUrl = API_URL, userAgent = USER_AGENT, fetchImpl = fetch } = {}) {
    this.apiUrl = apiUrl;
    this.userAgent = userAgent;
    this.fetchImpl = fetchImpl;
    this.lastRequestAt = 0;
    this.lastParseAt = 0;
    this.queue = Promise.resolve();
  }

  request(parameters) {
    const action = parameters.get("action");
    const run = this.queue.then(async () => {
      const now = Date.now();
      const waitForRequest = Math.max(0, this.lastRequestAt + 2_000 - now);
      const waitForParse = action === "parse"
        ? Math.max(0, this.lastParseAt + 30_000 - now)
        : 0;
      await sleep(Math.max(waitForRequest, waitForParse));
      this.lastRequestAt = Date.now();
      if (action === "parse") this.lastParseAt = this.lastRequestAt;

      const response = await this.fetchImpl(`${this.apiUrl}?${parameters}`, {
        headers: {
          "Accept-Encoding": "gzip",
          "User-Agent": this.userAgent,
        },
      });
      if (!response.ok) {
        throw new Error(`Liquipedia API returned HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload.error) {
        throw new Error(`Liquipedia API ${payload.error.code}: ${payload.error.info}`);
      }
      return payload;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async parsePage(page, { cacheFile = null, refresh = false } = {}) {
    if (cacheFile && !refresh && existsSync(cacheFile)) {
      const cached = JSON.parse(await readFile(cacheFile, "utf8"));
      return { ...cached.payload.parse, cached: true, fetchedAt: cached.fetchedAt };
    }

    const parameters = new URLSearchParams({
      action: "parse",
      format: "json",
      formatversion: "2",
      page,
      prop: "text",
    });
    const requestUrl = `${this.apiUrl}?${parameters}`;
    const payload = await this.request(parameters);
    if (cacheFile) {
      await mkdir(resolve(cacheFile, ".."), { recursive: true });
      await writeFile(cacheFile, `${JSON.stringify(cacheEntry(payload, requestUrl), null, 2)}\n`);
    }
    return { ...payload.parse, cached: false, fetchedAt: new Date().toISOString() };
  }
}

function cleanText(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function absoluteWikiUrl(href) {
  if (!href) return null;
  return new URL(href, WIKI_URL).toString();
}

function absoluteExternalUrl(href) {
  if (!href) return null;
  return new URL(href, "https://liquipedia.net").toString();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function gameNumber(text) {
  const match = cleanText(text).match(/(?:game|map)\s*([1-5])/i);
  return match ? Number(match[1]) : null;
}

function casterNames(popup) {
  const comment = [...popup.querySelectorAll(".brkts-popup-comment")]
    .find((element) => /^casters?:/i.test(cleanText(element.textContent)));
  if (!comment) return [];
  return unique([...comment.querySelectorAll("a")].map((link) => cleanText(link.textContent)));
}

export function extractBestOf(popup) {
  const formatText = popup.querySelector(".match-info-header-scoreholder-lower")?.textContent
    ?? popup.textContent.match(/\(Bo\s*[1-5]\)/i)?.[0]
    ?? "";
  const match = cleanText(formatText).match(/Bo\s*([1-5])/i);
  return match ? Number(match[1]) : null;
}

function teamNames(match) {
  const matchlistTeams = [...match.querySelectorAll(".brkts-matchlist-opponent[aria-label]")]
    .map((element) => cleanText(element.getAttribute("aria-label")));
  const bracketTeams = [...match.querySelectorAll(".match-info-header-opponent .name a")]
    .map((element) => cleanText(element.textContent));
  return unique([...(matchlistTeams.length ? matchlistTeams : bracketTeams)]).filter((name) => name && name !== "TBD");
}

function extractGames(popup) {
  const rows = [...popup.querySelectorAll(".brkts-popup-body-grid-row")]
    .filter((row) => row.querySelector(".brkts-champion-icon"));
  const vods = [...popup.querySelectorAll(".vodlink[title^='Watch Game'], .vodlink[title='Watch VOD']")]
    .map((link, index) => ({
      number: gameNumber(link.getAttribute("title")) ?? index + 1,
      url: absoluteExternalUrl(link.querySelector("a[href]")?.getAttribute("href")),
    }))
    .filter((vod) => vod.number && vod.url);

  return rows.map((row, index) => ({
    number: index + 1,
    vods: (vods.length === 1 ? vods : vods.filter((vod) => vod.number === index + 1)).map((vod) => vod.url),
    heroes: {
      radiant: unique([...row.querySelectorAll(".brkts-popup-side-color--radiant a[title]")]
        .map((link) => cleanText(link.getAttribute("title")))),
      dire: unique([...row.querySelectorAll(".brkts-popup-side-color--dire a[title]")]
        .map((link) => cleanText(link.getAttribute("title")))),
    },
  }));
}

function matchPageUrl(popup) {
  return absoluteWikiUrl(
    [...popup.querySelectorAll("a[href]")]
      .map((link) => link.getAttribute("href"))
      .find((href) => /(?:Match:|Match%3A)/i.test(href ?? "")),
  );
}

function parseBracketStage(root, stage) {
  return [...root.querySelectorAll(".brkts-popup")].map((popup) => {
    const teams = teamNames(popup);
    const rows = [...popup.querySelectorAll(".brkts-popup-body-grid-row")]
      .filter((row) => row.querySelector(".brkts-champion-icon"));
    const timestamp = popup.querySelector("[data-timestamp]")?.getAttribute("data-timestamp");
    if (teams.length !== 2 || !timestamp || !rows.length) return null;
    const date = new Date(Number(timestamp) * 1_000).toISOString().slice(0, 10);
    return {
      teams,
      scheduledText: date,
      date,
      stage,
      matchPage: matchPageUrl(popup),
      casters: casterNames(popup),
      bestOf: extractBestOf(popup),
      games: extractGames(popup),
    };
  }).filter(Boolean);
}

/**
 * Extracts non-result metadata from the server-expanded Day 1 page.
 * Scores, winners, durations, and result labels are omitted; the best-of
 * format is retained so the archive can render every possible game.
 */
export function parseDayOnePage({ html, page = PAGE, date = DAY_ONE_DATE, revisionId = null }) {
  const document = new JSDOM(html).window.document;
  const matches = [];
  for (const match of document.querySelectorAll(".brkts-matchlist-match")) {
    const popup = match.querySelector(".brkts-popup-container") ?? match;
    const popupText = cleanText(popup.textContent);
    if (!popupText.includes(date)) continue;
    const teams = teamNames(match);
    if (teams.length !== 2) continue;
    matches.push({
        teams,
        scheduledText: date,
        matchPage: matchPageUrl(popup),
        casters: casterNames(popup),
        bestOf: extractBestOf(popup),
        games: extractGames(popup),
    });
  }

  const deduplicated = [];
  const seen = new Set();
  for (const match of matches) {
    const key = `${match.teams.join(" vs ")}::${match.matchPage ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(match);
  }

  return {
    source: "Liquipedia MediaWiki API action=parse",
    attribution: `Data from Liquipedia, https://liquipedia.net/dota2/${page.replaceAll(" ", "_")}`,
    page,
    revisionId,
    date,
    matches: deduplicated,
  };
}

export function parseBracketStages({ html, page }) {
  const document = new JSDOM(html).window.document;
  const matches = [];
  for (const stage of ["Survival", "Playoffs"]) {
    let heading = document.querySelector(`#${stage}`)?.parentElement;
    while ((heading = heading?.nextElementSibling) && !heading.classList.contains("toggle-area"));
    if (heading) matches.push(...parseBracketStage(heading, stage));
  }
  const deduplicated = [];
  const seen = new Set();
  for (const match of matches) {
    const key = `${match.teams.join(" vs ")}::${match.matchPage ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(match);
  }
  return {
    source: "Liquipedia MediaWiki API action=parse",
    attribution: `Data from Liquipedia, https://liquipedia.net/dota2/${page.replaceAll(" ", "_")}`,
    page,
    matches: deduplicated,
  };
}

async function main() {
  const client = new LiquipediaClient();
  const parsed = await client.parsePage(PAGE, {
    cacheFile: CACHE_FILE,
    refresh: process.env.LIQUIPEDIA_REFRESH === "1",
  });
  const report = parseDayOnePage({
    html: parsed.text,
    page: parsed.title ?? PAGE,
    revisionId: parsed.revid ?? null,
  });
  report.fetchedAt = parsed.fetchedAt;
  report.cached = parsed.cached;
  report.apiRules = {
    userAgent: client.userAgent,
    minHttpIntervalSeconds: 2,
    minParseIntervalSeconds: 30,
    gzip: true,
    cacheFile: CACHE_FILE,
  };
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
