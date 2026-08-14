#!/usr/bin/env node

import { fetchArchive } from "./fetch-ti-day1.mjs";

fetchArchive({
  id: "ti-2026-day2",
  date: "2026-08-14",
  liquipediaDate: "August 14, 2026",
  stage: "Group Stage · Day 2",
  output: "src/ti-2026-day2.json",
  cache: ".cache/ti-2026-day2",
  liquipediaCache: ".cache/liquipedia/the-international-2026-group-stage-day2.parse.json",
  matchIdPrefix: "ti-2026-day2",
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
