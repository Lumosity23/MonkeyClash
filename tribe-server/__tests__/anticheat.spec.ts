import { describe, expect, it } from "vitest";
import { checkResult, RaceTrace } from "../src/anticheat.ts";
import type { ProgressIn, Result } from "../src/types.ts";

// 100 wpm for 30 s: 250 correct characters
function result(overrides: Partial<Result> = {}): Result {
  return {
    wpm: 100,
    raw: 104,
    acc: 97,
    consistency: 75,
    testDuration: 30,
    charStats: [250, 5, 0, 0],
    chartData: undefined,
    resolve: {},
    ...overrides,
  };
}

function progress(wordIndex: number, wpm = 100): ProgressIn {
  return {
    wpm,
    raw: wpm,
    acc: 100,
    progress: 50,
    wordIndex,
    letterIndex: 0,
    afk: false,
  };
}

// a race where the cursor moved from 1 s to `seconds`, last live wpm `liveWpm`
function check(r: Result, seconds = 30, liveWpm = 100): string | undefined {
  const trace = new RaceTrace();
  for (let s = 1; s <= seconds; s++)
    trace.record(progress(s, liveWpm), s * 1000);
  return checkResult(r, {
    trace,
    raceStartedAt: 0,
    now: (seconds + 1) * 1000,
    config: { mode: "time", time: 30 },
  });
}

describe("anticheat", () => {
  it("accepts an honest result", () => {
    expect(check(result())).toBeUndefined();
  });

  it("rejects a wpm the characters don't back up", () => {
    expect(check(result({ wpm: 180 }))).toBe(
      "wpm does not match the characters typed",
    );
  });

  it("rejects a raw lower than the characters typed", () => {
    expect(check(result({ raw: 80 }))).toBe(
      "raw does not match the characters typed",
    );
  });

  it("rejects impossible speeds", () => {
    expect(
      check(result({ wpm: 400, raw: 400, charStats: [1000, 0, 0, 0] })),
    ).toBe("400 wpm is not humanly possible");
  });

  it("rejects a time test that ended early", () => {
    expect(
      check(result({ wpm: 200, raw: 204, testDuration: 15 }), 15, 200),
    ).toBe("test ended before the time was up");
  });

  it("rejects a duration shorter than the race the server saw", () => {
    const words = { mode: "words", words: 50 };
    const trace = new RaceTrace();
    for (let s = 1; s <= 30; s++) trace.record(progress(s), s * 1000);
    // claims the 250 characters took 15 s (200 wpm)
    const r = result({ wpm: 200, raw: 204, testDuration: 15 });
    expect(
      checkResult(r, { trace, raceStartedAt: 0, now: 31_000, config: words }),
    ).toBe("test duration shorter than the race");
  });

  it("rejects a final wpm far from the live progress", () => {
    expect(check(result(), 30, 60)).toBe(
      "wpm does not match the live progress",
    );
  });

  it("rejects a result without any progress", () => {
    expect(
      checkResult(result(), {
        trace: new RaceTrace(),
        raceStartedAt: 0,
        now: 31_000,
        config: {},
      }),
    ).toBe("no progress received during the race");
  });
});
