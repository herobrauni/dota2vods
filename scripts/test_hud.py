from __future__ import annotations

import importlib.util
import shutil
import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from hud import (
    FrameClass,
    TimedFrameClass,
    Word,
    classify_frame,
    clock_to_seconds,
    is_stable_run,
    parse_clock,
)

DETECTOR_SPEC = importlib.util.spec_from_file_location(
    "detect_hud_cli", Path(__file__).with_name("detect-hud.py")
)
if DETECTOR_SPEC is None or DETECTOR_SPEC.loader is None:
    raise RuntimeError("could not load detect-hud.py")
DETECTOR_MODULE = importlib.util.module_from_spec(DETECTOR_SPEC)
sys.modules[DETECTOR_SPEC.name] = DETECTOR_MODULE
DETECTOR_SPEC.loader.exec_module(DETECTOR_MODULE)
CandidateScanner = DETECTOR_MODULE.CandidateScanner
DetectionError = DETECTOR_MODULE.DetectionError
select_games = DETECTOR_MODULE.select_games


WIDTH = 1280
HEIGHT = 720
FONT_PATHS = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
)


def hud_frame(
    clock: str = "32:07", left_score: str | None = "14", right_score: str | None = "21"
) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (40, 90, 60))
    draw = ImageDraw.Draw(image)
    draw.rectangle([int(WIDTH * 0.18), 0, int(WIDTH * 0.82), 40], fill=(18, 18, 22))
    font_path = next((path for path in FONT_PATHS if path.exists()), None)
    if font_path is None:
        raise unittest.SkipTest("no suitable TrueType font")

    def centered(text: str, center_x: float, y: int, size: int) -> None:
        font = ImageFont.truetype(str(font_path), size)
        text_width = draw.textlength(text, font=font)
        draw.text((center_x - text_width / 2, y), text, fill="white", font=font)

    centered(clock, WIDTH * 0.500, 13, 15)
    if left_score is not None:
        centered(left_score, WIDTH * 0.462, 8, 20)
    if right_score is not None:
        centered(right_score, WIDTH * 0.538, 8, 20)
    return image


class ClockParsingTests(unittest.TestCase):
    def test_normalizes_colon_dot_and_missing_colon(self) -> None:
        self.assertEqual(parse_clock([Word("42:31", 90)]), "42:31")
        self.assertEqual(parse_clock([Word("1.05", 90)]), "1:05")
        self.assertEqual(parse_clock([Word("023", 90)]), "0:23")
        self.assertEqual(clock_to_seconds("-0:10"), -10)

    def test_rejects_bad_seconds_and_low_confidence(self) -> None:
        self.assertIsNone(parse_clock([Word("12:89", 90)]))
        self.assertIsNone(parse_clock([Word("12:34", 20)]))


@unittest.skipUnless(shutil.which("tesseract"), "tesseract is not installed")
class FrameClassificationTests(unittest.TestCase):
    def test_detects_standard_and_negative_clock_huds(self) -> None:
        normal = classify_frame(hud_frame())
        pre_horn = classify_frame(hud_frame("-0:45", "0", "0"))
        self.assertTrue(normal.in_game)
        self.assertEqual(normal.clock, "32:07")
        self.assertTrue(pre_horn.in_game)
        self.assertEqual(pre_horn.clock_seconds, -45)

    def test_rejects_panels_and_countdowns_without_scores(self) -> None:
        panel = Image.new("RGB", (WIDTH, HEIGHT), (25, 25, 60))
        self.assertFalse(classify_frame(panel).in_game)
        self.assertFalse(classify_frame(hud_frame("5:00", None, None)).in_game)


class StableRunTests(unittest.TestCase):
    @staticmethod
    def observation(at_seconds: float, clock_seconds: int, in_game: bool = True):
        minutes, seconds = divmod(abs(clock_seconds), 60)
        sign = "-" if clock_seconds < 0 else ""
        return TimedFrameClass(
            at_seconds=at_seconds,
            available=True,
            frame=FrameClass(
                in_game=in_game,
                clock=f"{sign}{minutes}:{seconds:02d}",
                clock_seconds=clock_seconds,
                score_slots=2 if in_game else 0,
            ),
        )

    def test_accepts_progression_with_a_pause(self) -> None:
        run = [
            self.observation(100, 10),
            self.observation(130, 10),
            self.observation(160, 40),
        ]
        self.assertTrue(is_stable_run(run))

    def test_rejects_flat_or_discontinuous_clocks(self) -> None:
        flat = [self.observation(at, 10) for at in (100, 130, 160)]
        jump = [
            self.observation(100, 10),
            self.observation(130, 40),
            self.observation(160, 400),
        ]
        self.assertFalse(is_stable_run(flat))
        self.assertFalse(is_stable_run(jump))

    def test_rejects_an_isolated_hud(self) -> None:
        run = [
            self.observation(100, 10),
            self.observation(130, 40, in_game=False),
            self.observation(160, 70),
        ]
        self.assertFalse(is_stable_run(run))


class CandidateScannerTests(unittest.TestCase):
    def test_refines_a_persistent_hud_boundary(self) -> None:
        class FakeProbe:
            source = type("Source", (), {"duration": 300.0})()
            reads = 0
            failures = 0

        class FakeScanner(CandidateScanner):
            def observe(self, at_seconds: float) -> TimedFrameClass:
                in_game = at_seconds >= 100
                clock_seconds = round(at_seconds - 100) if in_game else None
                return TimedFrameClass(
                    at_seconds=round(at_seconds, 2),
                    available=True,
                    frame=FrameClass(
                        in_game=in_game,
                        clock=(f"0:{clock_seconds:02d}" if in_game else None),
                        clock_seconds=clock_seconds,
                        score_slots=2 if in_game else 0,
                    ),
                )

            def save_evidence(self, key: str, times: list[float]):
                return []

        scanner = FakeScanner(
            probe=FakeProbe(),
            evidence_directory=Path("unused"),
            report_directory=Path("unused"),
            step=30,
            precision=2,
            verbose=False,
        )
        result = scanner.scan_game(
            12,
            {
                "gameNumber": 1,
                "matchId": 99,
                "hudSearchWindow": {"fromSeconds": 40, "toSeconds": 200},
            },
        )
        self.assertEqual(result["status"], "candidate")
        self.assertEqual(result["confidence"], "high")
        self.assertAlmostEqual(result["candidateGameplayStartSeconds"], 100, delta=2)

    def test_filters_concurrent_stream_candidates_by_match_id(self) -> None:
        candidates = {
            "series": [
                {
                    "seriesId": 12,
                    "games": [
                        {"matchId": 90},
                        {"matchId": 91},
                        {"matchId": 92},
                    ],
                }
            ]
        }
        selected = select_games(candidates, {91})
        self.assertEqual([(series, game["matchId"]) for series, game in selected], [(12, 91)])
        with self.assertRaises(DetectionError):
            select_games(candidates, None, maximum_unfiltered=2)


if __name__ == "__main__":
    unittest.main()
