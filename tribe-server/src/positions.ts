import type { FinalPositions, MiniCrowns, Result } from "./types.ts";
import { isResultValid } from "./utils.ts";

export type Standing = {
  id: string;
  result: Result | undefined;
  pointsBefore: number;
};

export type RaceOutcome = {
  positions: FinalPositions;
  miniCrowns: MiniCrowns;
  pointsTotal: Map<string, number>;
};

// Ranks the players of a finished race.
// Valid results are ranked by wpm, then accuracy; exact ties share a position
// (1, 1, 3). A player earns one point per player they beat, and players with
// no valid result (failed, afk, disconnected) get no position and no points.
export function computeOutcome(standings: Standing[]): RaceOutcome {
  const valid = standings
    .filter((s) => isResultValid(s.result))
    .map((s) => ({ ...s, result: s.result as Result }))
    .sort((a, b) => b.result.wpm - a.result.wpm || b.result.acc - a.result.acc);

  const positions: FinalPositions = {};
  const pointsTotal = new Map<string, number>();
  for (const s of standings) pointsTotal.set(s.id, s.pointsBefore);

  let position = 0;
  valid.forEach((s, index) => {
    const prev = valid[index - 1];
    const tiedWithPrev =
      prev !== undefined &&
      prev.result.wpm === s.result.wpm &&
      prev.result.acc === s.result.acc;
    if (!tiedWithPrev) position = index + 1;
    const beaten = standings.length - countAtOrAbove(valid, s.result);
    const newPointsTotal = s.pointsBefore + beaten;
    pointsTotal.set(s.id, newPointsTotal);
    (positions[position] ??= []).push({
      id: s.id,
      newPoints: beaten,
      newPointsTotal,
    });
  });

  return { positions, miniCrowns: miniCrowns(valid), pointsTotal };
}

// how many valid players scored at least as well as this result (self included)
function countAtOrAbove(valid: { result: Result }[], result: Result): number {
  return valid.filter(
    (v) =>
      v.result.wpm > result.wpm ||
      (v.result.wpm === result.wpm && v.result.acc >= result.acc),
  ).length;
}

function miniCrowns(valid: { id: string; result: Result }[]): MiniCrowns {
  const best = (key: "wpm" | "raw" | "acc" | "consistency"): string[] => {
    if (valid.length === 0) return [];
    const max = Math.max(...valid.map((v) => v.result[key]));
    return valid.filter((v) => v.result[key] === max).map((v) => v.id);
  };
  return {
    wpm: best("wpm"),
    raw: best("raw"),
    acc: best("acc"),
    consistency: best("consistency"),
  };
}
