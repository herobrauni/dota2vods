"""Detect the standard Dota 2 spectator HUD in a video frame.

Adapted from herobrauni/dota2vod's OCR detector. This version deliberately
omits team-name OCR: professional broadcasts normally render team logos in
those slots, while this project already has canonical teams from OpenDota.
"""

from __future__ import annotations

import io
import os
import re
import subprocess
from dataclasses import dataclass, field

from PIL import Image, ImageOps


CLOCK_RE = re.compile(r"^-?\d{1,3}[:.]\d{2}$")
CLOCK_NO_COLON_RE = re.compile(r"^-?\d{3,5}$")
SCORE_RE = re.compile(r"^\d{1,3}$")

# Frame-size fractions measured against the standard 1280x720 spectator HUD.
CLOCK_BOX = (0.480, 0.520, 0.015, 0.040)
SCORE_BOXES = ((0.450, 0.4745, 0.010, 0.038), (0.5255, 0.550, 0.010, 0.038))

OCR_SCALE = 4
MIN_CLOCK_CONFIDENCE = 40.0
MIN_SCORE_CONFIDENCE = 40.0
CLOCK_PASSES = ("auto", "bin170", "bin190")
SCORE_PASSES = (("bin170", 7), ("auto", 7), ("bin170", 10), ("auto", 10))


@dataclass(frozen=True)
class Word:
    text: str
    confidence: float


@dataclass(frozen=True)
class FrameClass:
    in_game: bool
    clock: str | None = None
    clock_seconds: int | None = None
    score_slots: int = 0
    words: list[Word] = field(default_factory=list)


@dataclass(frozen=True)
class TimedFrameClass:
    at_seconds: float
    available: bool
    frame: FrameClass


def crop_box(image: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    width, height = image.size
    x0, x1, y0, y1 = box
    return image.crop(
        (int(width * x0), int(height * y0), int(width * x1), int(height * y1))
    )


def _prepare(crop: Image.Image, mode: str = "auto") -> Image.Image:
    grayscale = crop.convert("L")
    grayscale = grayscale.resize(
        (grayscale.width * OCR_SCALE, grayscale.height * OCR_SCALE), Image.Resampling.LANCZOS
    )
    if mode == "auto":
        return ImageOps.autocontrast(grayscale)
    threshold = int(mode.removeprefix("bin"))
    return grayscale.point(lambda pixel: 255 if pixel > threshold else 0)


def _ocr_words(image: Image.Image, psm: int, whitelist: str | None = None) -> list[Word]:
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    command = ["tesseract", "stdin", "stdout", "--psm", str(psm)]
    if whitelist:
        command += ["-c", f"tessedit_char_whitelist={whitelist}"]
    command += ["tsv"]

    # Several parallel Tesseract OpenMP pools are dramatically slower than
    # single-threaded OCR processes. The scanner itself intentionally probes
    # conservatively, but retain this guard for direct classifier use.
    environment = {**os.environ, "OMP_THREAD_LIMIT": "1"}
    try:
        result = subprocess.run(
            command,
            input=buffer.getvalue(),
            capture_output=True,
            timeout=30,
            env=environment,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []

    words: list[Word] = []
    for line in result.stdout.decode("utf-8", "replace").splitlines()[1:]:
        columns = line.split("\t")
        if len(columns) < 12 or columns[0] != "5":
            continue
        text = columns[11].strip()
        if not text:
            continue
        try:
            words.append(Word(text=text, confidence=float(columns[10])))
        except ValueError:
            continue
    return words


def parse_clock(words: list[Word]) -> str | None:
    """Normalize a plausible OCR clock, including reads with a missing colon."""
    for word in words:
        text = word.text.strip(".,")
        if word.confidence < MIN_CLOCK_CONFIDENCE:
            continue
        if CLOCK_RE.fullmatch(text):
            minutes, seconds = re.split(r"[:.]", text.lstrip("-"))
            if int(seconds) < 60:
                sign = "-" if text.startswith("-") else ""
                return f"{sign}{int(minutes)}:{seconds}"
        if CLOCK_NO_COLON_RE.fullmatch(text):
            digits = text.lstrip("-")
            if int(digits[-2:]) < 60:
                sign = "-" if text.startswith("-") else ""
                return f"{sign}{int(digits[:-2])}:{digits[-2:]}"
    return None


def clock_to_seconds(clock: str | None) -> int | None:
    if clock is None:
        return None
    sign = -1 if clock.startswith("-") else 1
    minutes, seconds = clock.lstrip("-").split(":", 1)
    return sign * (int(minutes) * 60 + int(seconds))


def _read_clock(image: Image.Image) -> tuple[str | None, list[Word]]:
    crop = crop_box(image, CLOCK_BOX)
    words: list[Word] = []
    for mode in CLOCK_PASSES:
        words = _ocr_words(_prepare(crop, mode), psm=7, whitelist="0123456789:.-")
        clock = parse_clock(words)
        if clock is not None:
            return clock, words
    return None, words


def _has_score(image: Image.Image, box: tuple[float, float, float, float]) -> bool:
    crop = crop_box(image, box)
    for mode, psm in SCORE_PASSES:
        # Tesseract otherwise drops lone early-game zeroes at the crop edge.
        prepared = ImageOps.expand(_prepare(crop, mode), border=24, fill=0)
        for word in _ocr_words(prepared, psm=psm, whitelist="0123456789"):
            if word.confidence >= MIN_SCORE_CONFIDENCE and SCORE_RE.fullmatch(word.text):
                return True
    return False


def classify_frame(image: Image.Image) -> FrameClass:
    """Classify a frame without returning any result-bearing score values."""
    clock, words = _read_clock(image)
    if clock is None:
        return FrameClass(in_game=False, words=words)

    score_slots = sum(_has_score(image, box) for box in SCORE_BOXES)
    if score_slots == 0:
        return FrameClass(
            in_game=False,
            clock=clock,
            clock_seconds=clock_to_seconds(clock),
            words=words,
        )
    return FrameClass(
        in_game=True,
        clock=clock,
        clock_seconds=clock_to_seconds(clock),
        score_slots=score_slots,
        words=words,
    )


def is_stable_run(observations: list[TimedFrameClass]) -> bool:
    """Require persistent HUD frames whose clock plausibly advances.

    Three isolated replay frames cannot satisfy this. A paused clock is
    allowed in one interval, while the complete run must make some progress.
    """
    if len(observations) < 3:
        return False
    run = observations[-3:]
    if any(not item.available or not item.frame.in_game for item in run):
        return False
    clocks = [item.frame.clock_seconds for item in run]
    if any(clock is None for clock in clocks):
        return False

    elapsed = run[-1].at_seconds - run[0].at_seconds
    clock_advance = clocks[-1] - clocks[0]
    if elapsed <= 0 or clock_advance < min(5, elapsed * 0.25):
        return False
    if clock_advance > elapsed + 30:
        return False

    for previous, current in zip(run, run[1:]):
        wall_delta = current.at_seconds - previous.at_seconds
        clock_delta = current.frame.clock_seconds - previous.frame.clock_seconds
        if clock_delta < -3 or clock_delta > wall_delta + 25:
            return False
    return True
