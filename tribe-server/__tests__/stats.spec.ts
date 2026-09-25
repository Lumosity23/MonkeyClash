import { describe, expect, it } from "vitest";
import {
  MemoryStatsStore,
  statsIncrements,
  type RacePlayer,
  type RaceRecord,
} from "../src/stats.ts";

function player(
  uid: string | undefined,
  position: number | undefined,
  wpm = 100,
  points = 0,
): RacePlayer {
  return {
    uid,
    name: uid ?? "guest",
    valid: position !== undefined,
    wpm: position !== undefined ? wpm : undefined,
    acc: 97,
    position,
    points,
  };
}

function race(players: RacePlayer[], timestamp = 1000): RaceRecord {
  return {
    roomId: "abc123",
    timestamp,
    mode: "words",
    mode2: "25",
    language: "english",
    players,
  };
}

describe("statsIncrements", () => {
  it("counts races, wins, podiums, points and wpm per account", () => {
    const { users } = statsIncrements(
      race([player("a", 1, 120, 2), player("b", 2, 90, 1), player("c", 3, 80)]),
    );
    expect(users.find((u) => u.uid === "a")).toMatchObject({
      inc: {
        races: 1,
        validRaces: 1,
        wins: 1,
        podiums: 1,
        points: 2,
        wpmSum: 120,
      },
      bestWpm: 120,
    });
    expect(users.find((u) => u.uid === "c")?.inc.wins).toBe(0);
  });

  it("gives guests no stats", () => {
    const { users, pairs } = statsIncrements(
      race([player("a", 1), player(undefined, 2)]),
    );
    expect(users.map((u) => u.uid)).toEqual(["a"]);
    expect(pairs).toEqual([]);
  });

  it("scores head to head, a player without result loses", () => {
    const { pairs } = statsIncrements(
      race([player("zed", undefined), player("amy", 2), player("bob", 1)]),
    );
    // pairs are keyed with the smaller uid first
    expect(pairs).toContainEqual({
      a: "amy",
      b: "bob",
      inc: { races: 1, aWins: 0, bWins: 1, draws: 0 },
    });
    expect(pairs).toContainEqual({
      a: "amy",
      b: "zed",
      inc: { races: 1, aWins: 1, bWins: 0, draws: 0 },
    });
  });

  it("counts shared positions and double no-results as draws", () => {
    const { pairs } = statsIncrements(
      race([
        player("a", 1),
        player("b", 1),
        player("c", undefined),
        player("d", undefined),
      ]),
    );
    expect(pairs.find((p) => p.a === "a" && p.b === "b")?.inc.draws).toBe(1);
    expect(pairs.find((p) => p.a === "c" && p.b === "d")?.inc.draws).toBe(1);
  });
});

describe("MemoryStatsStore", () => {
  it("accumulates stats and head to head over races", async () => {
    const store = new MemoryStatsStore();
    await store.saveRace(
      race([player("a", 1, 120, 1), player("b", 2, 100)], 1),
    );
    await store.saveRace(race([player("a", 2, 90), player("b", 1, 110, 1)], 2));
    await store.saveRace(
      race([player("a", 1, 130, 1), player("b", 2, 100)], 3),
    );

    const [first, second] = await store.leaderboard(10);
    expect(first).toMatchObject({
      uid: "a",
      races: 3,
      wins: 2,
      points: 2,
      bestWpm: 130,
      wpmSum: 340,
    });
    expect(second).toMatchObject({ uid: "b", wins: 1, lastRaceAt: 3 });

    const a = await store.user("a");
    expect(a?.opponents).toEqual([
      { uid: "b", name: "b", races: 3, wins: 2, losses: 1, draws: 0 },
    ]);
    expect(await store.user("nobody")).toBeUndefined();
  });
});
