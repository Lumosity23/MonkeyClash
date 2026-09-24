import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTribeServer } from "../src/server.ts";
import type {
  FinalPositions,
  PublicRoomData,
  Result,
  RoomData,
} from "../src/types.ts";

// fast timings so a whole race fits in a few seconds
const TIMINGS = {
  updateRateMs: 50,
  initDelayMs: 10,
  countdownSeconds: 1,
  finishTimerSeconds: 1,
  resultGraceMs: 100,
  showResultsMs: 50,
};

let url: string;
let close: () => Promise<void>;
const clients: Socket[] = [];

beforeEach(async () => {
  const httpServer = createServer();
  ({ close } = createTribeServer(httpServer, { timings: TIMINGS }));
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await close();
});

// connected players, with the name the server assigned them
const names = new WeakMap<Socket, string>();

async function player(name: string): Promise<Socket> {
  const socket = connect(url, {
    query: { name },
    transports: ["websocket"],
    forceNew: true,
  });
  clients.push(socket);
  // the server sends it right on connection, like the real client we listen first
  const assigned = once<{ name: string }>(socket, "user_update_name");
  await once(socket, "connect");
  names.set(socket, (await assigned).name);
  return socket;
}

async function once<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

// resolves with the first `event` payload that matches `predicate`
async function waitFor<T>(
  socket: Socket,
  event: string,
  predicate: (data: T) => boolean,
): Promise<T> {
  return new Promise((resolve) => {
    const handler = (data: T): void => {
      if (!predicate(data)) return;
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

async function stateReached(socket: Socket, state: string): Promise<unknown> {
  return waitFor<{ state: string }>(
    socket,
    "room_state_changed",
    (d) => d.state === state,
  );
}

function result(wpm: number): Result {
  return {
    wpm,
    raw: wpm + 3,
    acc: 97,
    consistency: 75,
    testDuration: 10,
    charStats: [50, 1, 0, 0],
    chartData: { wpm: [wpm], burst: [wpm], err: [0] },
    resolve: { login: false, bailedOut: false },
  };
}

// like the real client: answer every progress broadcast with our own progress
function autoProgress(socket: Socket, wpm: number): void {
  socket.on("room_progress_update", () => {
    socket.emit("room_progress_update", {
      wpm,
      raw: wpm,
      acc: 100,
      progress: 50,
      wordIndex: 5,
      letterIndex: 2,
      afk: false,
    });
  });
}

async function duelRoom(): Promise<{
  alice: Socket;
  bob: Socket;
  room: RoomData;
}> {
  const alice = await player("alice");
  const bob = await player("bob");
  const joined = once<{ room: RoomData }>(alice, "room_joined");
  alice.emit("room_create", { config: { mode: "words", words: 10 } });
  const { room } = await joined;
  const bobJoined = (await bob.emitWithAck("room_join", {
    roomId: room.id,
    fromBrowser: false,
  })) as { room: RoomData };
  expect(bobJoined.room.users[bob.id as string]).toMatchObject({ name: "bob" });
  return { alice, bob, room };
}

async function startRace(alice: Socket, bob: Socket): Promise<void> {
  const bobReady = once(alice, "room_user_is_ready");
  bob.emit("room_ready_update");
  await bobReady;
  const started = Promise.all([
    once(alice, "room_race_started"),
    once(bob, "room_race_started"),
  ]);
  alice.emit("room_init_race");
  await started;
}

describe("tribe server", () => {
  it("accepts known client versions only", async () => {
    const socket = await player("alice");
    expect(
      await socket.emitWithAck("system_version_check", { version: "25.12.4" }),
    ).toMatchObject({
      status: "ok",
    });
    expect(
      await socket.emitWithAck("system_version_check", { version: "1.0" }),
    ).toMatchObject({
      status: "mismatch",
    });
  });

  it("gives guests a unique name and sanitizes names", async () => {
    expect(names.get(await player("Guest"))).toMatch(/^Guest\d{4}$/);
    expect(names.get(await player("<img src=x>"))).toBe("imgsrcx");
  });

  it("creates a room and lets a friend join it", async () => {
    const { alice, bob, room } = await duelRoom();
    expect(room.id).toMatch(/^[0-9a-f]{6}$/);
    expect(room.users[alice.id as string]).toMatchObject({
      name: "alice",
      isLeader: true,
    });
    expect(room.state).toBe("LOBBY");

    const unknown: unknown = await bob.emitWithAck("room_join", {
      roomId: "000000",
    });
    expect(unknown).toEqual({ status: "Room not found" });
  });

  it("plays a full duel: countdown, live progress, results, positions", async () => {
    const { alice, bob } = await duelRoom();
    autoProgress(alice, 110);
    autoProgress(bob, 88);

    const initRace = once<{ seed: number }>(bob, "room_init_race");
    const typing = once<Record<string, { isTyping: boolean }>>(
      bob,
      "room_users_update",
    );
    const countdown = once<{ time: number }>(bob, "room_countdown");
    await startRace(alice, bob);
    expect(await typing).toEqual({
      [alice.id as string]: { isTyping: true },
      [bob.id as string]: { isTyping: true },
    });
    expect(typeof (await initRace).seed).toBe("number");
    expect(await countdown).toEqual({ time: 1 });

    // both players show up in the live progress, bars relative to the fastest
    const live = await waitFor<{
      users: Record<string, { wpmProgress: number }>;
      roomMaxWpm: number;
    }>(bob, "room_progress_update", (d) => Object.keys(d.users).length === 2);
    expect(live.roomMaxWpm).toBe(110);
    expect(live.users[alice.id as string]?.wpmProgress).toBe(100);
    expect(live.users[bob.id as string]?.wpmProgress).toBeCloseTo(80);

    const oneFinished = stateReached(bob, "RACE_ONE_FINISHED");
    const aliceResult = waitFor<{ userId: string }>(
      bob,
      "room_user_result",
      (d) => d.userId === alice.id,
    );
    alice.emit("room_result", { result: result(110) });
    await Promise.all([oneFinished, aliceResult]);

    const positions = once<{
      positions: FinalPositions;
      miniCrowns: { wpm: string[] };
    }>(alice, "room_final_positions");
    const readyToContinue = stateReached(alice, "READY_TO_CONTINUE");
    bob.emit("room_result", { result: result(88) });

    const final = await positions;
    expect(final.positions).toEqual({
      1: [{ id: alice.id, newPoints: 1, newPointsTotal: 1 }],
      2: [{ id: bob.id, newPoints: 0, newPointsTotal: 0 }],
    });
    expect(final.miniCrowns.wpm).toEqual([alice.id]);
    await readyToContinue;

    // the leader can go back to the lobby for a rematch
    const lobby = stateReached(bob, "LOBBY");
    alice.emit("room_back_to_lobby");
    await lobby;
  });

  it("forces the race to end when a player never finishes", async () => {
    const { alice, bob } = await duelRoom();
    await startRace(alice, bob);

    const forced = once<{ reason: string }>(bob, "room_race_force_finish");
    const noResult = waitFor<{ userId: string; result: unknown }>(
      alice,
      "room_user_result",
      (d) => d.userId === bob.id,
    );
    const positions = once<{ positions: FinalPositions }>(
      alice,
      "room_final_positions",
    );
    alice.emit("room_result", { result: result(100) });

    expect(await forced).toEqual({ reason: "time's up" });
    expect((await noResult).result).toBeUndefined();
    expect((await positions).positions).toEqual({
      1: [{ id: alice.id, newPoints: 1, newPointsTotal: 1 }],
    });
  });

  it("ends the race when the other player leaves mid-race", async () => {
    const { alice, bob } = await duelRoom();
    await startRace(alice, bob);
    alice.emit("room_result", { result: result(100) });
    await stateReached(alice, "RACE_ONE_FINISHED");

    const positions = once<{ positions: FinalPositions }>(
      alice,
      "room_final_positions",
    );
    bob.disconnect();
    expect(Object.keys((await positions).positions)).toEqual(["1"]);
  });

  it("only lets the leader start the race", async () => {
    const { alice, bob } = await duelRoom();
    let started = false;
    alice.on("room_init_race", () => (started = true));
    bob.emit("room_init_race");
    await new Promise((r) => setTimeout(r, 100));
    expect(started).toBe(false);
  });

  it("escapes chat messages", async () => {
    const { alice, bob } = await duelRoom();
    const msg = waitFor<{
      message: string;
      isSystem: boolean;
      from?: { name: string };
    }>(alice, "room_chat_message", (d) => !d.isSystem);
    bob.emit("room_chat_message", { message: " <b>hi</b> @alice 🍌" });
    expect(await msg).toMatchObject({
      message: "&#60;b&#62;hi&#60;&#47;b&#62; &#64;alice &#127820;",
      from: { name: "bob" },
    });
  });

  it("hands leadership over when the leader leaves", async () => {
    const { alice, bob } = await duelRoom();
    const leader = once<{ userId: string }>(bob, "room_leader_changed");
    const left = once(alice, "room_left");
    alice.emit("room_leave");
    await left;
    expect((await leader).userId).toBe(bob.id);
  });

  it("kicks and bans a player", async () => {
    const { alice, bob, room } = await duelRoom();
    const kicked = once(bob, "room_left");
    const gone = once<{ userId: string }>(alice, "room_player_left");
    alice.emit("room_ban_user", { userId: bob.id });
    await kicked;
    expect((await gone).userId).toBe(bob.id);

    const rejoin: unknown = await bob.emitWithAck("room_join", {
      roomId: room.id,
    });
    expect(rejoin).toEqual({ status: "You are banned from this room" });
  });

  it("counts all rooms and public rooms separately", async () => {
    const { bob } = await duelRoom();
    const stats = (await bob.emitWithAck("system_stats")) as {
      stats: [number, { custom: [number, number] }];
    };
    // one private room: counted in "create room", not in "browse public rooms"
    expect(stats.stats[1].custom).toEqual([1, 0]);
  });

  it("lists public rooms only", async () => {
    const { alice, bob, room } = await duelRoom();
    expect(
      (
        (await bob.emitWithAck("room_get_public_rooms", { search: "" })) as {
          rooms: PublicRoomData[];
        }
      ).rooms,
    ).toEqual([]);

    const visible = once(bob, "room_visibility_changed");
    alice.emit("room_toggle_visibility");
    await visible;
    const { rooms } = (await bob.emitWithAck("room_get_public_rooms", {
      search: "ALICE",
    })) as { rooms: PublicRoomData[] };
    expect(rooms).toMatchObject([
      { id: room.id, name: "alice's room", size: 2 },
    ]);
  });
});
