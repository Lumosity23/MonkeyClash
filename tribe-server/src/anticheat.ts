// Checks a result against what the server saw during the race. The client is
// never trusted: a result that doesn't add up is marked invalid, so it gets no
// position, no points and no stats, and the room sees why.
//
// These checks catch a tampered result, not a bot that types for real.

import type { ProgressIn, Result, RoomConfig } from "./types.ts";

// fastest believable wpm, human records are around 300 on short tests
export const MAX_WPM = 300;
// allowed gap between the client's clock and ours (network, event loop)
const CLOCK_SLACK_S = 2;
// below this, live wpm is too noisy to compare with the final one
const MIN_CHECKED_SPAN_S = 5;

// What the server records for one player during a race.
export class RaceTrace {
  // when the cursor first moved, and last moved forward (server clock, ms)
  firstTypedAt: number | undefined;
  lastAdvanceAt: number | undefined;
  lastProgress: ProgressIn | undefined;
  private furthest = 0;

  record(progress: ProgressIn, now: number): void {
    this.lastProgress = progress;
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

// wpm counts only the characters of correct words, like Monkeytype
function wpmOf(chars: number, seconds: number): number {
  return seconds > 0 ? (chars * 60) / seconds / 5 : 0;
}

function differs(a: number, b: number, tolerance: number, min = 1): boolean {
  return Math.abs(a - b) > Math.max(min, Math.abs(b) * tolerance);
}

// Returns why the result can't be trusted, or undefined if it looks fine.
export function checkResult(
  result: Result,
  ctx: CheckContext,
): string | undefined {
  const { wpm, raw, testDuration, charStats } = result;
  const [correctWord = 0, incorrect = 0, extra = 0] = charStats;
  const { trace } = ctx;

  if (testDuration <= 0) return "no duration";
  if (wpm > MAX_WPM) return `${Math.round(wpm)} wpm is not humanly possible`;

  // the numbers must agree with each other
  if (differs(wpm, wpmOf(correctWord, testDuration), 0.01)) {
    return "wpm does not match the characters typed";
  }
  if (raw + 1 < wpmOf(correctWord + incorrect + extra, testDuration)) {
    return "raw does not match the characters typed";
  }

  // time mode lasts exactly the chosen time
  const time = ctx.config["time"];
  if (
    ctx.config["mode"] === "time" &&
    typeof time === "number" &&
    time > 0 &&
    testDuration < time - CLOCK_SLACK_S
  ) {
    return "test ended before the time was up";
  }

  // the client can't have typed for less time than we saw its cursor move
  if (trace.firstTypedAt !== undefined && trace.lastAdvanceAt !== undefined) {
    const typingSpan = (trace.lastAdvanceAt - trace.firstTypedAt) / 1000;
    if (testDuration < typingSpan - CLOCK_SLACK_S) {
      return "test duration shorter than the race";
    }

    // live wpm right before the end is close to the final wpm
    const live = trace.lastProgress?.wpm;
    if (
      typingSpan >= MIN_CHECKED_SPAN_S &&
      live !== undefined &&
      differs(wpm, live, 0.25, 20)
    ) {
      return "wpm does not match the live progress";
    }
  }

  // a real player reports progress while typing
  const raceSpan = (ctx.now - ctx.raceStartedAt) / 1000;
  if (
    trace.firstTypedAt === undefined &&
    correctWord > 0 &&
    raceSpan >= MIN_CHECKED_SPAN_S
  ) {
    return "no progress received during the race";
  }

  return undefined;
}
