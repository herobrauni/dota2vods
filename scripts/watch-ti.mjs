#!/usr/bin/env node
/**
 * TI 2026 VOD watcher — hourly cron entrypoint for riki.vods.
 *
 * Contract (no_agent cron): print NOTHING and exit 0 when nothing changed
 * (silent run, no delivery); print a report only when games/VODs were
 * published; print to stderr + exit 1 on failure (delivered as an alert).
 *
 * Every run:
 *   1. One Liquipedia action=parse for the Group Stage page + one OpenDota
 *      league-match-list request.
 *   2. Fingerprint = publishable day dates + every (title, href) VOD link on
 *      the page + every OpenDota league match ID. Unchanged -> silent exit.
 *   3. Changed -> regenerate each publishable day snapshot (existing days get
 *      fresh games/VODs; new days are created automatically), revert files
 *      whose only diff is the generatedAt timestamp, then gate on
 *      `npm test` + `npm run build`. Only then commit + push to origin/main
 *      (which triggers the Cloudflare Pages deploy).
 *
 * Stage scope: the Liquipedia Group Stage page (days Aug 13-15 plus the
 * Elimination Round hosted on the same page). The Main Event bracket page is
 * NOT auto-parsed; extending to it needs a bracket parser.
 *
 * Env:
 *   TI_WATCH_DRY_RUN=1  regenerate + gate, but do not commit/push.
 *   TI_WATCH_FORCE=1    regenerate even when the fingerprint is unchanged.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { LiquipediaClient } from "./liquipedia.mjs";
import { fetchArchive, assertSpoilerSafe } from "./fetch-ti-day1.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const STATE_DIR = resolve(ROOT, ".cache", "ti-watch");
const FINGERPRINT_FILE = resolve(STATE_DIR, "fingerprint.json");
const LIQUIPEDIA_CACHE = resolve(STATE_DIR, "group-stage.parse.json");
const PAGE = "The_International/2026/Group_Stage";
const LEAGUE_ID = 19719;
const USER_AGENT = "dota2vods/0.1 (https://github.com/herobrauni/dota2vods; brauni@brauni.dev)";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function report(lines) {
  process.stdout.write(`${Array.isArray(lines) ? lines.join("\n") : lines}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const tail = [error.stdout, error.stderr].filter(Boolean).join("\n").trim().split("\n").slice(-12).join("\n");
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${tail || error.message}`);
  }
}

function dayNumber(date) {
  return Number(date.slice(8, 10));
}

const TOURNAMENT_START = 12; // 2026-08-13 is TI 2026 group-stage day 1

function dayIndex(date) {
  return dayNumber(date) - TOURNAMENT_START;
}

function liquipediaDateLabel(date) {
  const [year, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function stageLabel(date) {
  const day = dayNumber(date);
  if (day <= 15) return `Group Stage · Day ${day - TOURNAMENT_START}`;
  return "Group Stage · Elimination Round";
}

async function fetchLeagueMatches() {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.opendota.com/api/leagues/${LEAGUE_ID}/matches`, {
        headers: { "Accept-Encoding": "gzip", "User-Agent": USER_AGENT },
      });
      if (response.status === 429) {
        await sleep(10_000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error("response is not a list");
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(5_000);
    }
  }
  throw new Error(`OpenDota league matches failed: ${lastError?.message}`);
}

/** (title, href) pairs of every VOD link — exactly what parseDayPage consumes. */
function vodLinksFromHtml(html) {
  const document = new JSDOM(html).window.document;
  return [...document.querySelectorAll(".vodlink[title^='Watch Game'], .vodlink[title='Watch VOD']")]
    .map((element) => `${element.getAttribute("title") ?? ""}::${element.querySelector("a[href]")?.getAttribute("href") ?? ""}`)
    .sort();
}

function dateLabelsOnPage(html) {
  const labels = new Set();
  for (const match of html.matchAll(new RegExp(`\\b(${MONTHS.join("|")}) (\\d{1,2}), 2026\\b`, "g"))) {
    const month = String(MONTHS.indexOf(match[1]) + 1).padStart(2, "0");
    const day = String(Number(match[2])).padStart(2, "0");
    labels.add(`2026-${month}-${day}`);
  }
  return [...labels];
}

/** Read a committed snapshot without its generatedAt field. */
function committedSnapshot(relativePath) {
  try {
    const raw = run("git", ["show", `HEAD:${relativePath}`]);
    const data = JSON.parse(raw);
    delete data.generatedAt;
    return data;
  } catch {
    return null;
  }
}

function snapshotFacts(data) {
  const games = data.matches.flatMap((match) => match.games);
  return {
    matches: data.matches.length,
    games: games.length,
    vods: games.filter((game) => game.vodUrl).length,
  };
}

async function main() {
  const dryRun = process.env.TI_WATCH_DRY_RUN === "1";
  const force = process.env.TI_WATCH_FORCE === "1";

  if (run("git", ["status", "--porcelain"]).trim() !== "") {
    fail("dota2vods has uncommitted local changes; resolve them before the watcher runs.");
  }
  run("git", ["fetch", "origin", "main"]);
  const head = run("git", ["rev-parse", "HEAD"]).trim();
  const upstream = run("git", ["rev-parse", "origin/main"]).trim();
  if (head !== upstream) {
    run("git", ["merge", "--ff-only", "origin/main"]);
  }

  const client = new LiquipediaClient();
  const parsedPage = await client.parsePage(PAGE, { cacheFile: LIQUIPEDIA_CACHE, refresh: true });
  const leagueMatches = await fetchLeagueMatches();

  const utcMatchDates = new Set(leagueMatches.map((match) => new Date(match.start_time * 1_000).toISOString().slice(0, 10)));
  const dates = dateLabelsOnPage(parsedPage.text)
    .filter((date) => utcMatchDates.has(date))
    .sort();

  const fingerprint = JSON.stringify({
    dates,
    vods: vodLinksFromHtml(parsedPage.text),
    matchIds: leagueMatches.map((match) => match.match_id).sort((a, b) => a - b),
  });

  if (!force && existsSync(FINGERPRINT_FILE) && readFileSync(FINGERPRINT_FILE, "utf8").trim() === fingerprint) {
    return; // silent: no new games or VODs
  }

  // Regenerate every publishable day.
  const perDay = [];
  for (const date of dates) {
    const id = `ti-2026-day${dayIndex(date)}`;
    const config = {
      id,
      date,
      liquipediaDate: liquipediaDateLabel(date),
      stage: stageLabel(date),
      output: resolve(ROOT, "src", `${id}.json`),
      cache: resolve(ROOT, ".cache", id),
      liquipediaCache: LIQUIPEDIA_CACHE,
      matchIdPrefix: id,
    };
    const data = await fetchArchive(config, { refreshLeague: true, refreshLiquipedia: false, validateDetails: true });
    assertSpoilerSafe(data);
    perDay.push({ id, relative: `src/${id}.json`, data });
  }

  // Drop pure generatedAt churn: keep a regenerated file only when its
  // content (minus generatedAt) actually differs from the committed version.
  const changedDays = [];
  for (const day of perDay) {
    const { generatedAt: _drop, ...fresh } = day.data;
    const committed = committedSnapshot(day.relative);
    if (committed && JSON.stringify(committed) === JSON.stringify(fresh)) {
      run("git", ["checkout", "--", day.relative]);
    } else {
      changedDays.push(day);
    }
  }

  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(FINGERPRINT_FILE, `${fingerprint}\n`);

  const gitChanges = run("git", ["status", "--porcelain"]).trim();
  if (!gitChanges) {
    return; // silent: fingerprint moved (e.g. VODs for an unpublishable day) but nothing to publish
  }

  // Build the human diff summary before committing.
  const lines = changedDays.map((day) => {
    const committed = committedSnapshot(day.relative);
    const fresh = snapshotFacts(day.data);
    if (!committed) return `• NEW ${day.id}: ${fresh.matches} series, ${fresh.games} games, ${fresh.vods} VODs`;
    const before = snapshotFacts(committed);
    return `• ${day.id}: ${before.games}→${fresh.games} games, ${before.vods}→${fresh.vods} VODs`;
  });

  // Gate the publish on tests + build.
  run("npm", ["test"]);
  run("npm", ["run", "build"]);

  const message = ["TI 2026 archive update", "", ...lines].join("\n");
  if (dryRun) {
    report([`DRY RUN — would commit + push:\n${gitChanges}\n${message}`]);
    return;
  }

  run("git", ["add", "src/ti-2026-day*.json"]);
  run("git", ["commit", "-m", message]);
  run("git", ["push", "origin", "main"]);
  report([`🏒 TI 2026 published to riki.vods:\n${lines.join("\n")}\nPushed — Cloudflare Pages deploy on its way.`]);
}

main().catch((error) => {
  fail(`TI 2026 watcher failed: ${error.message}`);
});
