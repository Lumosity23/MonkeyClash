import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStatsApi } from "../src/stats-api.ts";
import { MemoryStatsStore, type RacePlayer } from "../src/stats.ts";

let server: Server;
let base: string;

beforeEach(async () => {
  const store = new MemoryStatsStore();
  const players = (winner: string, loser: string): RacePlayer[] => [
    {
      uid: winner,
      name: winner,
      valid: true,
      wpm: 120,
      acc: 98,
      position: 1,
      points: 1,
    },
    {
      uid: loser,
      name: loser,
      valid: true,
      wpm: 80,
      acc: 95,
      position: 2,
      points: 0,
    },
  ];
  await store.saveRace({
    roomId: "r",
    timestamp: 1,
    mode: "time",
    mode2: "30",
    language: "english",
    players: players("amy", "ben"),
  });
  await store.saveRace({
    roomId: "r",
    timestamp: 2,
    mode: "time",
    mode2: "30",
    language: "english",
    players: players("amy", "ben"),
  });

  const api = createStatsApi(store, ["https://friends.example"]);
  server = createServer((req, res) => {
    if (!api(req, res)) res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/tribe-api/stats`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("stats api", () => {
  it("serves the leaderboard with averages", async () => {
    const res = await fetch(`${base}/leaderboard`, {
      headers: { origin: "https://friends.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://friends.example",
    );
    const body = (await res.json()) as {
      players: { uid: string; wins: number; avgWpm: number }[];
    };
    expect(body.players.map((p) => [p.uid, p.wins, p.avgWpm])).toEqual([
      ["amy", 2, 120],
      ["ben", 0, 80],
    ]);
  });

  it("serves a player's stats and head to head", async () => {
    const body = (await (await fetch(`${base}/user/ben`)).json()) as {
      stats: { races: number };
      opponents: unknown[];
    };
    expect(body.stats.races).toBe(2);
    expect(body.opponents).toEqual([
      { uid: "amy", name: "amy", races: 2, wins: 0, losses: 2, draws: 0 },
    ]);
  });

  it("answers 404 for unknown players and paths", async () => {
    expect((await fetch(`${base}/user/nobody`)).status).toBe(404);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
