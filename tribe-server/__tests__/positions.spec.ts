import { describe, expect, it } from "vitest";
import { computeOutcome } from "../src/positions.ts";
import type { Result } from "../src/types.ts";

function result(
  wpm: number,
  acc = 95,
  resolve: Result["resolve"] = {},
): Result {
  return {
    wpm,
    raw: wpm + 5,
    acc,
    consistency: 70,
    testDuration: 30,
    charStats: [0, 0, 0, 0],
    chartData: {},
    resolve: { login: false, bailedOut: false, ...resolve },
  };
}

describe("computeOutcome", () => {
  it("ranks by wpm and gives one point per player beaten", () => {
    const outcome = computeOutcome([
      { id: "slow", result: result(80), pointsBefore: 0 },
      { id: "fast", result: result(120), pointsBefore: 2 },
      { id: "mid", result: result(100), pointsBefore: 0 },
    ]);

    expect(outcome.positions).toEqual({
      1: [{ id: "fast", newPoints: 2, newPointsTotal: 4 }],
      2: [{ id: "mid", newPoints: 1, newPointsTotal: 1 }],
      3: [{ id: "slow", newPoints: 0, newPointsTotal: 0 }],
    });
    expect(outcome.pointsTotal.get("fast")).toBe(4);
  });

  it("breaks wpm ties with accuracy and shares exact ties", () => {
    const outcome = computeOutcome([
      { id: "a", result: result(100, 90), pointsBefore: 0 },
      { id: "b", result: result(100, 98), pointsBefore: 0 },
      { id: "c", result: result(100, 90), pointsBefore: 0 },
      { id: "d", result: result(50), pointsBefore: 0 },
    ]);

    expect(outcome.positions[1]?.map((u) => u.id)).toEqual(["b"]);
    expect(outcome.positions[2]?.map((u) => u.id)).toEqual(["a", "c"]);
    expect(outcome.positions[3]).toBeUndefined();
    expect(outcome.positions[4]?.map((u) => u.id)).toEqual(["d"]);
    // a and c both beat only d
    expect(outcome.positions[2]?.map((u) => u.newPoints)).toEqual([1, 1]);
  });

  it("leaves failed, invalid and missing results out of the ranking", () => {
    const outcome = computeOutcome([
      { id: "ok", result: result(60), pointsBefore: 0 },
      {
        id: "failed",
        result: result(150, 95, { failed: true }),
        pointsBefore: 0,
      },
      { id: "afk", result: result(150, 95, { valid: false }), pointsBefore: 0 },
      { id: "gone", result: undefined, pointsBefore: 3 },
    ]);

    expect(outcome.positions).toEqual({
      1: [{ id: "ok", newPoints: 3, newPointsTotal: 3 }],
    });
    expect(outcome.pointsTotal.get("gone")).toBe(3);
    expect(outcome.miniCrowns.wpm).toEqual(["ok"]);
  });

  it("gives mini crowns to the best of each stat", () => {
    const a = result(100, 99);
    const b = { ...result(90, 95), raw: 200, consistency: 90 };
    const outcome = computeOutcome([
      { id: "a", result: a, pointsBefore: 0 },
      { id: "b", result: b, pointsBefore: 0 },
    ]);

    expect(outcome.miniCrowns).toEqual({
      wpm: ["a"],
      acc: ["a"],
      raw: ["b"],
      consistency: ["b"],
    });
  });
});
