#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getOpenDotaCandidates } from "./opendota.mjs";
const OFFICIAL_CHANNEL_ID = "UCTQKT5QqO3h7y32G8VzuySQ";
const input = process.argv[2];
const validateOnly = process.argv.includes("--validate-only");
const hudOnly = process.argv.includes("--hud-only");
const skipHud = process.argv.includes("--skip-hud");
if (!input) {
  console.error("Usage: npm run ingest -- <youtube-url-or-local-audio> [--validate-only|--hud-only|--skip-hud]");
  process.exit(1);
}

const isUrl = /^https?:\/\//.test(input);
const parsed = isUrl ? new URL(input) : null;
const videoId = parsed?.searchParams.get("v") ?? "local-audio";
if (isUrl && !videoId) throw new Error("Expected a YouTube watch URL containing ?v=");
if (hudOnly && (!isUrl || skipHud)) {
  throw new Error("--hud-only requires a YouTube URL and cannot be combined with --skip-hud");
}

const root = resolve(".cache", videoId);
const audioPath = isUrl ? join(root, "audio.m4a") : resolve(input);
const transcriptPath = join(root, "transcript.local.json");
const venv = resolve(".venv", "bin");
const ytDlp = existsSync(join(venv, "yt-dlp")) ? join(venv, "yt-dlp") : "yt-dlp";
const python = existsSync(join(venv, "python")) ? join(venv, "python") : "python3";
const candidatePath = join(root, "opendota.candidates.json");
const hudEvidencePath = join(root, "hud.evidence.json");
await mkdir(root, { recursive: true });

async function command(name, args) {
  await new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(name, args, { stdio: "inherit" });
    child.once("error", rejectCommand);
    child.once("exit", (code) => code === 0
      ? resolveCommand()
      : rejectCommand(new Error(`${name} exited with code ${code}`)));
  });
}

function hudCacheMatchesSelection(path, matchIds) {
  try {
    const report = JSON.parse(readFileSync(path, "utf8"));
    const cached = new Set(report.games.map((game) => String(game.matchId)));
    if (!matchIds) {
      return report.summary.gamesScanned === report.summary.availableCandidateGames;
    }
    const requested = new Set(matchIds.split(",").map((value) => value.trim()).filter(Boolean));
    return cached.size === requested.size && [...cached].every((value) => requested.has(value));
  } catch {
    return false;
  }
}

async function validateOfficialEnglishVod(sourceUrl) {
  const pageUrl = new URL(sourceUrl);
  pageUrl.searchParams.set("hl", "en");
  const response = await fetch(pageUrl, { headers: { "Accept-Language": "en-US,en;q=0.9" } });
  if (!response.ok) throw new Error(`Could not inspect YouTube VOD (${response.status})`);
  const html = await response.text();
  const match = html.match(/"videoDetails":\{"videoId":"[^"]+","title":"((?:\\.|[^"\\])*)","lengthSeconds":"[^"]+","channelId":"([^"]+)"/);
  if (!match) throw new Error("Could not read the VOD's YouTube metadata");
  const title = JSON.parse(`"${match[1]}"`);
  const channelId = match[2];
  if (channelId !== OFFICIAL_CHANNEL_ID) {
    throw new Error("Refusing VOD: it is not from the official @dota2 channel");
  }
  if (!/^\[EN(?:-[A-Z])?\]/i.test(title)) {
    throw new Error("Refusing VOD: its broadcast title is not marked English ([EN] or [EN-*])");
  }
  console.log(`Validated official English broadcast: ${title.replace(/\s*\|.*$/, "")}`);
  const broadcastMatch = html.match(/"liveBroadcastDetails":\{[^}]*"startTimestamp":"([^"]+)"[^}]*"endTimestamp":"([^"]+)"/);
  if (!broadcastMatch) throw new Error("Could not read the broadcast's start/end timestamps");
  return { title, streamStart: broadcastMatch[1], streamEnd: broadcastMatch[2] };
}

if (isUrl) {
  const metadata = await validateOfficialEnglishVod(input);
  if (existsSync(candidatePath) && process.env.OPENDOTA_REFRESH !== "1") {
    console.log(`OpenDota: using cached candidates at ${candidatePath}`);
  } else {
    try {
      const candidates = await getOpenDotaCandidates({
        ...metadata,
        videoId,
        leagueId: process.env.OPENDOTA_LEAGUE_ID,
      });
      await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
      console.log(`OpenDota: found ${candidates.series.length} candidate series; wrote ${candidatePath}`);
    } catch (error) {
      console.warn(`OpenDota enrichment unavailable: ${error.message}`);
    }
  }
  if (validateOnly) process.exit(0);

  if (!skipHud) {
    if (!existsSync(candidatePath)) {
      const message = "HUD detection requires an OpenDota candidate report";
      if (hudOnly) throw new Error(message);
      console.warn(`${message}; continuing without HUD evidence`);
    } else if (
      existsSync(hudEvidencePath)
      && process.env.HUD_REFRESH !== "1"
      && hudCacheMatchesSelection(hudEvidencePath, process.env.HUD_MATCH_IDS)
    ) {
      console.log(`HUD: using cached evidence at ${hudEvidencePath}`);
    } else {
      try {
        await command(python, [
          resolve("scripts", "detect-hud.py"),
          input,
          candidatePath,
          hudEvidencePath,
          ...(process.env.HUD_MATCH_IDS ? ["--match-ids", process.env.HUD_MATCH_IDS] : []),
          ...(process.env.HUD_VERBOSE === "1" ? ["--verbose"] : []),
        ]);
      } catch (error) {
        if (hudOnly) throw error;
        console.warn(`HUD detection unavailable: ${error.message}`);
      }
    }
  }
  if (hudOnly) process.exit(0);
}

if (isUrl && !existsSync(audioPath)) {
  console.log("Downloading low-bandwidth English broadcast audio…");
  await command(ytDlp, [
    "--js-runtimes", "node",
    "--no-playlist",
    "-f", "139/bestaudio[ext=m4a]/bestaudio",
    "-x", "--audio-format", "m4a",
    "-o", audioPath,
    input,
  ]);
}

if (!existsSync(audioPath)) throw new Error(`Audio not found: ${audioPath}`);

console.log(`Transcribing locally with ${process.env.WHISPER_MODEL || "base.en"}…`);
await command(python, [
  resolve("scripts", "transcribe-local.py"),
  audioPath,
  transcriptPath,
  "--model", process.env.WHISPER_MODEL || "base.en",
]);

console.log("Next: review OpenDota, HUD, and transcript evidence; candidates are never auto-published.");
