// Checks a result against what the server saw during the race. The client is
// never trusted: a result that doesn't add up is marked invalid, so it gets no
// position, no points and no stats, and the room sees why.
//
// Like Monkeytype, the real checks live in a private module that is not in the
// repo (src/private/anticheat.ts, exporting `checkResult`). Without it the
// server only runs the basic checks below.

import type { ProgressIn, Result, RoomConfig } from "./types.ts";

// What the server records for one player during a race.
export class RaceTrace {
  // when the cursor first moved, and last moved forward (server clock, ms)
  firstTypedAt: number | undefined;
  lastAdvanceAt: number | undefined;
  lastProgress: ProgressIn | undefined;
  progressCount = 0;
  private furthest = 0;

  record(progress: ProgressIn, now: number): void {
    this.lastProgress = progress;
    this.progressCount++;
    const cursor = progress.wordIndex * 10_000 + progress.letterIndex;
    if (cursor <= this.furthest) return;
    this.furthest = cursor;
    this.firstTypedAt ??= now;
    this.lastAdvanceAt = now;
  }
}

export type CheckContext = {
  trace: RaceTrace;
  raceStartedAt: number;
  now: number;
  config: RoomConfig;
};

// Returns why the result can't be trusted, or undefined if it looks fine.
export type ResultCheck = (
  result: Result,
  ctx: CheckContext,
) => string | undefined;

// wpm counts only the characters of correct words, like Monkeytype
export function wpmOf(chars: number, seconds: number): number {
  return seconds > 0 ? (chars * 60) / seconds / 5 : 0;
}

export const basicCheck: ResultCheck = (result) => {
  const { wpm, testDuration, charStats } = result;
  if (testDuration <= 0) return "no duration";
  const expected = wpmOf(charStats[0] ?? 0, testDuration);
  if (Math.abs(wpm - expected) > Math.max(1, expected * 0.01)) {
    return "wpm does not match the characters typed";
  }
  return undefined;
};

// The private checks when they are installed, the basic ones otherwise.
export async function loadAnticheat(): Promise<ResultCheck> {
  // a variable path, so the public build doesn't look for the private file
  const path = "./private/anticheat.ts";
  try {
    const module = (await import(path)) as { checkResult: ResultCheck };
    console.log("[anticheat] private checks enabled");
    return module.checkResult;
  } catch (error) {
    // a broken private module must not silently turn the checks off
    const missing =
      (error as { code?: string }).code === "ERR_MODULE_NOT_FOUND" &&
      String(error).includes("private/anticheat");
    if (!missing) throw error;
    console.warn("[anticheat] no private module, basic checks only");
    return basicCheck;
  }
}
