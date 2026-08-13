#!/usr/bin/env python3
"""Timestamp an English Dota 2 broadcast with local faster-whisper."""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path

from faster_whisper import WhisperModel


DEFAULT_VOCABULARY = (
    "English Dota 2 esports broadcast. Preserve exact team, player, and hero names. "
    "Teams may include Team Spirit, Team Falcons, Team Liquid, Aurora Gaming, "
    "Xtreme Gaming, Team Yandex, Boom Boys, Iron Wing, TEAM VISION, HULIGANI, "
    "OG, GamerLegion, LGD Gaming, Nigma Galaxy, Team Resilience, and Vici Gaming. "
    "Preserve game numbers and phrases announcing drafts, the horn, or game starts."
)

MARKER_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bopening game\b",
        r"\bgame (?:one|two|three|1|2|3)\b",
        r"\b(?:game|match) (?:is |has )?(?:underway|begun|started)\b",
        r"\bwelcome (?:everybody )?(?:to|back to)\b",
        r"\bthe horn\b",
        r"\binto the game\b",
    )
]


def marker_score(text: str) -> int:
    """Score transcript segments worth reviewing; never auto-publish them."""
    return sum(bool(pattern.search(text)) for pattern in MARKER_PATTERNS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", default=os.getenv("WHISPER_MODEL", "base.en"))
    parser.add_argument("--threads", type=int, default=int(os.getenv("WHISPER_THREADS", "8")))
    parser.add_argument("--prompt", default=os.getenv("WHISPER_PROMPT", DEFAULT_VOCABULARY))
    args = parser.parse_args()

    started = time.perf_counter()
    model = WhisperModel(
        args.model,
        device="cpu",
        compute_type="int8",
        cpu_threads=args.threads,
    )
    loaded = time.perf_counter()
    stream, info = model.transcribe(
        str(args.audio),
        language="en",
        beam_size=1,
        best_of=1,
        vad_filter=False,
        condition_on_previous_text=True,
        initial_prompt=args.prompt,
    )

    segments = []
    candidates = []
    for segment in stream:
        row = {
            "startSeconds": round(segment.start, 2),
            "endSeconds": round(segment.end, 2),
            "text": segment.text.strip(),
        }
        segments.append(row)
        score = marker_score(row["text"])
        if score:
            candidates.append({**row, "markerScore": score})

    finished = time.perf_counter()
    duration = float(info.duration)
    payload = {
        "audio": str(args.audio),
        "model": args.model,
        "language": info.language,
        "durationSeconds": round(duration, 2),
        "benchmark": {
            "modelLoadSeconds": round(loaded - started, 2),
            "transcriptionSeconds": round(finished - loaded, 2),
            "realtimeFactor": round((finished - loaded) / duration, 4) if duration else None,
        },
        "reviewCandidates": candidates,
        "segments": segments,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["benchmark"]))
    print(f"Wrote {args.output} ({len(segments)} segments, {len(candidates)} review candidates)")


if __name__ == "__main__":
    main()
