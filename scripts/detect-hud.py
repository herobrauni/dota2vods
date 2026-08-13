#!/usr/bin/env python3
"""Find persistent gameplay HUDs inside OpenDota candidate windows.

The output is private review evidence, not publication-ready VOD data. It
contains no scores, winners, YouTube title, or OCR-derived team names.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

from hud import FrameClass, TimedFrameClass, classify_frame, is_stable_run


OFFICIAL_DOTA_CHANNEL_ID = "UCTQKT5QqO3h7y32G8VzuySQ"
ENGLISH_TITLE_RE = re.compile(r"^\[EN(?:-[A-Z])?\]", re.IGNORECASE)


class DetectionError(RuntimeError):
    pass


@dataclass(frozen=True)
class VideoSource:
    input_url: str
    stream_url: str
    duration: float
    video_id: str
    format_id: str
    height: int | None
    http_headers: dict[str, str] = field(default_factory=dict)


def _ffprobe_duration(path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            path,
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise DetectionError(f"ffprobe failed: {result.stderr.strip()}")
    return float(json.loads(result.stdout)["format"]["duration"])


def resolve_source(target: str, height: int) -> VideoSource:
    local_path = Path(target)
    if local_path.exists():
        return VideoSource(
            input_url=str(local_path.resolve()),
            stream_url=str(local_path.resolve()),
            duration=_ffprobe_duration(str(local_path.resolve())),
            video_id=local_path.stem,
            format_id="local",
            height=None,
        )

    try:
        import yt_dlp
    except ImportError as error:
        raise DetectionError("yt-dlp is required; install requirements.txt") from error

    # Prefer a seekable H.264 video stream. On finalized YouTube live VODs the
    # generic `bestvideo` selector can choose AV1 streams that FFmpeg cannot
    # reliably range-seek, even though metadata extraction succeeds.
    format_selector = (
        f"bestvideo[vcodec^=avc1][height<={height}]"
        f"/best[vcodec^=avc1][height<={height}]"
    )
    options = {
        "format": format_selector,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(target, download=False)
    if info is None:
        raise DetectionError("yt-dlp returned no video metadata")
    if "entries" in info:
        info = info["entries"][0]
    if info.get("is_live"):
        raise DetectionError("the broadcast is still live")

    if info.get("extractor_key", "").lower().startswith("youtube"):
        if info.get("channel_id") != OFFICIAL_DOTA_CHANNEL_ID:
            raise DetectionError("refusing a YouTube VOD outside the official @dota2 channel")
        if not ENGLISH_TITLE_RE.match(info.get("title") or ""):
            raise DetectionError("refusing a YouTube VOD not marked [EN] or [EN-*]")

    formats = info.get("requested_formats") or [info]
    chosen = next((item for item in formats if item.get("vcodec") != "none"), formats[0])
    if not (chosen.get("vcodec") or "").startswith("avc1"):
        raise DetectionError("yt-dlp could not resolve a seekable H.264 stream")
    stream_url = chosen.get("url")
    if not stream_url:
        raise DetectionError("yt-dlp returned no direct stream URL")
    duration = info.get("duration") or _ffprobe_duration(stream_url)
    return VideoSource(
        input_url=target,
        stream_url=stream_url,
        duration=float(duration),
        video_id=info.get("id") or "",
        format_id=str(chosen.get("format_id") or "unknown"),
        height=chosen.get("height"),
        http_headers=chosen.get("http_headers") or info.get("http_headers") or {},
    )


class FrameProbe:
    def __init__(self, source: VideoSource, timeout: int = 60):
        self.source = source
        self.timeout = timeout
        self.reads = 0
        self.failures = 0

    def grab(self, at_seconds: float, retries: int = 1) -> Image.Image | None:
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{at_seconds:.2f}",
        ]
        if self.source.http_headers:
            headers = "".join(
                f"{key}: {value}\r\n" for key, value in self.source.http_headers.items()
            )
            command += ["-headers", headers]
        command += [
            "-i",
            self.source.stream_url,
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-c:v",
            "png",
            "-",
        ]
        for _ in range(retries + 1):
            self.reads += 1
            try:
                result = subprocess.run(
                    command,
                    capture_output=True,
                    timeout=self.timeout,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                continue
            if result.returncode == 0 and result.stdout:
                try:
                    image = Image.open(io.BytesIO(result.stdout)).convert("RGB")
                    image.load()
                    return image
                except OSError:
                    continue
        self.failures += 1
        return None


class CandidateScanner:
    def __init__(
        self,
        probe: FrameProbe,
        evidence_directory: Path,
        report_directory: Path,
        step: float,
        precision: float,
        verbose: bool,
    ):
        self.probe = probe
        self.evidence_directory = evidence_directory
        self.report_directory = report_directory
        self.step = step
        self.precision = precision
        self.verbose = verbose
        self._cache: dict[float, TimedFrameClass] = {}

    def observe(self, at_seconds: float) -> TimedFrameClass:
        at_seconds = round(max(0.0, min(at_seconds, self.probe.source.duration)), 2)
        if at_seconds not in self._cache:
            image = self.probe.grab(at_seconds)
            available = image is not None
            frame = classify_frame(image) if image is not None else FrameClass(in_game=False)
            self._cache[at_seconds] = TimedFrameClass(at_seconds, available, frame)
            if self.verbose:
                state = "ERR" if not available else ("HUD" if frame.in_game else "---")
                clock = f" clock={frame.clock}" if frame.clock else ""
                print(f"  {at_seconds:8.2f} {state}{clock}", file=sys.stderr, flush=True)
        return self._cache[at_seconds]

    def refine_start(
        self, stable_run: list[TimedFrameClass], window_start: float
    ) -> tuple[float, TimedFrameClass | None]:
        first_positive = stable_run[0]
        cursor = first_positive.at_seconds
        last_negative: TimedFrameClass | None = None

        # Walk backward rather than immediately binary-searching. This avoids
        # bridging a discontinuous replay or isolated HUD appearance.
        while cursor > window_start:
            previous_time = max(window_start, cursor - min(10.0, self.step))
            if previous_time == cursor:
                break
            previous = self.observe(previous_time)
            if not previous.available or not previous.frame.in_game:
                last_negative = previous
                break
            cursor = previous_time

        if last_negative is None:
            return cursor, None

        low = last_negative.at_seconds
        high = cursor
        while high - low > self.precision:
            midpoint = (low + high) / 2
            observation = self.observe(midpoint)
            if not observation.available:
                break
            if observation.frame.in_game:
                high = midpoint
            else:
                low = midpoint
        return high, last_negative

    @staticmethod
    def serialize_observation(observation: TimedFrameClass) -> dict[str, Any]:
        return {
            "atSeconds": observation.at_seconds,
            "available": observation.available,
            "inGame": observation.frame.in_game,
            "clock": observation.frame.clock,
            "clockSeconds": observation.frame.clock_seconds,
            "scoreSlotsDetected": observation.frame.score_slots,
        }

    def save_evidence(
        self, key: str, times: list[float]
    ) -> list[dict[str, Any]]:
        directory = self.evidence_directory / key
        directory.mkdir(parents=True, exist_ok=True)
        saved = []
        for index, at_seconds in enumerate(dict.fromkeys(round(time, 2) for time in times)):
            image = self.probe.grab(at_seconds)
            if image is None:
                continue
            strip_height = max(1, int(image.height * 0.08))
            strip = image.crop((0, 0, image.width, strip_height))
            filename = f"{index + 1:02d}-{at_seconds:.2f}.png"
            path = directory / filename
            strip.save(path, "PNG", optimize=True)
            try:
                report_path = path.relative_to(self.report_directory)
            except ValueError:
                report_path = path
            saved.append({"atSeconds": at_seconds, "path": str(report_path)})
        return saved

    def scan_game(self, series_id: int | None, game: dict[str, Any]) -> dict[str, Any]:
        window = game["hudSearchWindow"]
        window_start = float(window["fromSeconds"])
        window_end = float(window["toSeconds"])
        observations: list[TimedFrameClass] = []
        stable: list[TimedFrameClass] | None = None

        at_seconds = window_start
        while at_seconds <= window_end:
            observations.append(self.observe(at_seconds))
            if is_stable_run(observations):
                stable = observations[-3:]
                break
            at_seconds += self.step

        base = {
            "seriesId": series_id,
            "gameNumber": game["gameNumber"],
            "matchId": game["matchId"],
            "searchWindow": {
                "fromSeconds": window_start,
                "toSeconds": window_end,
            },
            "coarseObservations": [self.serialize_observation(item) for item in observations],
        }
        if stable is None:
            failures = sum(not item.available for item in observations)
            return {
                **base,
                "status": "probe-errors" if failures else "not-found",
                "candidateGameplayStartSeconds": None,
                "confidence": None,
                "stableRun": [],
                "evidenceFrames": [],
            }

        candidate_start, previous = self.refine_start(stable, window_start)
        evidence_times = []
        if previous is not None:
            evidence_times.append(previous.at_seconds)
        evidence_times += [candidate_start, *(item.at_seconds for item in stable)]
        match_id = game["matchId"]
        evidence_frames = self.save_evidence(f"match-{match_id}", evidence_times)
        all_score_slots = all(item.frame.score_slots == 2 for item in stable)
        return {
            **base,
            "status": "candidate",
            "candidateGameplayStartSeconds": round(candidate_start, 2),
            "confidence": "high" if all_score_slots else "medium",
            "previousNonGameplayObservation": (
                self.serialize_observation(previous) if previous is not None else None
            ),
            "stableRun": [self.serialize_observation(item) for item in stable],
            "evidenceFrames": evidence_frames,
        }


def load_candidates(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload.get("series"), list):
        raise DetectionError("candidate report has no series list")
    return payload


def select_games(
    candidates: dict[str, Any], match_ids: set[int] | None, maximum_unfiltered: int = 12
) -> list[tuple[int | None, dict[str, Any]]]:
    available = [
        (series.get("seriesId"), game)
        for series in candidates["series"]
        for game in series.get("games", [])
    ]
    if match_ids:
        selected = [item for item in available if int(item[1]["matchId"]) in match_ids]
        found_ids = {int(item[1]["matchId"]) for item in selected}
        missing = sorted(match_ids - found_ids)
        if missing:
            raise DetectionError(f"requested match IDs are absent from the report: {missing}")
        return selected
    if len(available) > maximum_unfiltered:
        raise DetectionError(
            f"candidate report contains {len(available)} games from concurrent streams; "
            "set HUD_MATCH_IDS (or pass --match-ids) to select this broadcast"
        )
    return available


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", help="official English YouTube URL or local video")
    parser.add_argument("candidates", type=Path, help="OpenDota candidate JSON")
    parser.add_argument("output", type=Path, help="HUD evidence JSON")
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--step", type=float, default=30.0)
    parser.add_argument("--precision", type=float, default=2.0)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--match-ids", help="comma-separated OpenDota match IDs")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if args.step <= 0 or args.precision <= 0:
        parser.error("--step and --precision must be positive")

    try:
        for executable in ("ffmpeg", "ffprobe", "tesseract"):
            if shutil.which(executable) is None:
                raise DetectionError(f"required executable is not on PATH: {executable}")
        candidates = load_candidates(args.candidates)
        match_ids = None
        if args.match_ids:
            try:
                match_ids = {int(value.strip()) for value in args.match_ids.split(",") if value.strip()}
            except ValueError as error:
                raise DetectionError("--match-ids must contain only integers") from error
            if not match_ids:
                raise DetectionError("--match-ids did not contain any IDs")
        selected_games = select_games(candidates, match_ids)
        source = resolve_source(args.source, args.height)
        if candidates.get("videoId") and source.video_id != candidates["videoId"]:
            raise DetectionError("candidate report belongs to a different video")

        args.output.parent.mkdir(parents=True, exist_ok=True)
        evidence_directory = args.evidence_dir or args.output.parent / "hud-evidence"
        scanner = CandidateScanner(
            probe=FrameProbe(source),
            evidence_directory=evidence_directory,
            report_directory=args.output.parent,
            step=args.step,
            precision=args.precision,
            verbose=args.verbose,
        )
        games = []
        for series_id, game in selected_games:
            print(
                f"Scanning match {game['matchId']} HUD window…",
                file=sys.stderr,
                flush=True,
            )
            games.append(scanner.scan_game(series_id, game))

        found = sum(game["status"] == "candidate" for game in games)
        report = {
            "source": "HUD OCR review evidence",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "videoId": source.video_id,
            "classifier": {
                "clockAndScoreHud": True,
                "teamOcr": False,
                "coarseStepSeconds": args.step,
                "boundaryPrecisionSeconds": args.precision,
                "videoFormatId": source.format_id,
                "videoHeight": source.height,
            },
            "caveat": (
                "Candidates require human review. Confirm matching teams and continuous live "
                "clock progression; never publish from this report automatically."
            ),
            "summary": {
                "gamesScanned": len(games),
                "availableCandidateGames": sum(
                    len(series.get("games", [])) for series in candidates["series"]
                ),
                "candidatesFound": found,
                "frameReads": scanner.probe.reads,
                "frameProbeFailures": scanner.probe.failures,
            },
            "games": games,
        }
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.output}: {found}/{len(games)} HUD candidates")
        return 0
    except (DetectionError, KeyError, OSError, ValueError) as error:
        print(f"HUD detection failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
