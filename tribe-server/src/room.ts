import type { Server } from "socket.io";
import { basicCheck, RaceTrace, type ResultCheck } from "./anticheat.ts";
import { computeOutcome, type RaceOutcome } from "./positions.ts";
import type { RaceRecord } from "./stats.ts";
import {
  ROOM_STATE,
  type ProgressIn,
  type PublicRoomData,
  type Result,
  type RoomConfig,
  type RoomData,
  type RoomState,
  type User,
} from "./types.ts";
import { escapeHTML, isResultValid, newSeed } from "./utils.ts";

export type RoomHooks = {
  // account of a player (undefined for guests)
  uidOf?: (socketId: string) => string | undefined;
  // called once per finished race with at least two players
  onRaceFinished?: (record: RaceRecord) => void;
  // decides whether a result can be trusted
  checkResult?: ResultCheck;
};

export type Timings = {
  // how often the server asks for and broadcasts live progress
  updateRateMs: number;
  // pause between "race is starting" and the countdown, lets clients load the test
  initDelayMs: number;
  countdownSeconds: number;
  // once the first player finished, how long the others have left
  finishTimerSeconds: number;
  // after the finish timer, how long to wait for the forced results to arrive
  resultGraceMs: number;
  // results screen before the leader can start the next race
  showResultsMs: number;
};

export const DEFAULT_TIMINGS: Timings = {
  updateRateMs: 500,
  initDelayMs: 1000,
  countdownSeconds: 5,
  finishTimerSeconds: 30,
  resultGraceMs: 3000,
  showResultsMs: 3000,
};

const LOBBY_STATES = new Set<RoomState>([
  ROOM_STATE.LOBBY,
  ROOM_STATE.SHOWING_RESULTS,
  ROOM_STATE.READY_TO_CONTINUE,
]);
const RACING_STATES = new Set<RoomState>([
  ROOM_STATE.RACE_ONGOING,
  ROOM_STATE.RACE_ONE_FINISHED,
]);

export class Room {
  readonly id: string;
  name: string;
  isPrivate = true;
  state: RoomState = ROOM_STATE.LOBBY;
  config: RoomConfig;
  seed = 0;
  readonly users = new Map<string, User>();

  private readonly io: Server;
  private readonly timings: Timings;
  private readonly banned = new Set<string>();
  private raceTimers: NodeJS.Timeout[] = [];
  private progressTicker: NodeJS.Timeout | undefined;
  private extremes = { maxWpm: 0, maxRaw: 0, minWpm: 0, minRaw: 0 };
  private readonly hooks: RoomHooks;
  // who started the current race, kept even if they leave before the end
  private readonly participants = new Map<
    string,
    { name: string; uid: string | undefined }
  >();
  // what the anticheat saw of each player during the current race
  private readonly traces = new Map<string, RaceTrace>();
  private raceStartedAt = 0;

  constructor(
    io: Server,
    timings: Timings,
    id: string,
    leader: User,
    config: RoomConfig,
    hooks: RoomHooks = {},
  ) {
    this.io = io;
    this.timings = timings;
    this.hooks = hooks;
    this.id = id;
    this.name = `${leader.name}'s room`;
    this.config = config;
    this.users.set(leader.id, { ...leader, isLeader: true });
  }

  toData(): RoomData {
    return {
      id: this.id,
      state: this.state,
      users: Object.fromEntries(this.users),
      size: this.users.size,
      updateRate: this.timings.updateRateMs,
      isPrivate: this.isPrivate,
      name: this.name,
      config: this.config,
      ...this.extremes,
      seed: this.seed,
    };
  }

  toPublicData(): PublicRoomData {
    return {
      id: this.id,
      size: this.users.size,
      name: this.name,
      state: this.state,
      config: this.config,
    };
  }

  isLeader(userId: string): boolean {
    return this.users.get(userId)?.isLeader === true;
  }

  isBanned(userId: string): boolean {
    return this.banned.has(userId);
  }

  // ---------------------------------------------------------------- members

  addUser(user: User): void {
    this.users.set(user.id, user);
    this.io.to(this.id).except(user.id).emit("room_player_joined", { user });
    this.systemMessage(`${user.name} joined`);
  }

  removeUser(userId: string, reason: "left" | "banned" = "left"): void {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.delete(userId);

    this.io.to(userId).emit("room_left");
    this.io.in(userId).socketsLeave(this.id);
    this.io.to(this.id).emit("room_player_left", { userId });
    this.systemMessage(
      reason === "banned" ? `${user.name} was banned` : `${user.name} left`,
    );

    if (user.isLeader) {
      const next = this.users.keys().next();
      if (!next.done) this.setLeader(next.value);
    }
    this.checkRaceComplete();
  }

  ban(userId: string): void {
    this.banned.add(userId);
    this.io.to(userId).emit("system_notification", {
      message: "You have been banned from the room",
      level: -1,
    });
    this.removeUser(userId, "banned");
  }

  setLeader(userId: string): void {
    const user = this.users.get(userId);
    if (!user) return;
    for (const u of this.users.values()) delete u.isLeader;
    user.isLeader = true;
    user.isReady = false;
    user.isAfk = false;
    this.io.to(this.id).emit("room_leader_changed", { userId });
    this.systemMessage(`${user.name} is now the leader`);
  }

  // --------------------------------------------------------- lobby actions

  setName(name: string): void {
    this.name = name;
    this.io.to(this.id).emit("room_name_changed", { name });
  }

  toggleVisibility(): void {
    this.isPrivate = !this.isPrivate;
    this.io
      .to(this.id)
      .emit("room_visibility_changed", { isPrivate: this.isPrivate });
  }

  updateConfig(config: RoomConfig): void {
    if (!this.isIn(ROOM_STATE.LOBBY, ROOM_STATE.READY_TO_CONTINUE)) return;
    this.config = config;
    // the client acknowledges every config change, so it must be sent with an ack
    this.io
      .to(this.id)
      .timeout(10_000)
      .emit("room_config_changed", { config }, () => undefined);
  }

  setReady(userId: string): void {
    const user = this.users.get(userId);
    if (!user || user.isLeader || user.isAfk || user.isReady) return;
    if (!LOBBY_STATES.has(this.state)) return;
    user.isReady = true;
    this.io.to(this.id).emit("room_user_is_ready", { userId });
  }

  setAfk(userId: string, isAfk: boolean): void {
    const user = this.users.get(userId);
    if (!user || user.isLeader) return;
    user.isAfk = isAfk;
    this.io.to(this.id).emit("room_user_afk_update", { userId, isAfk });
    if (isAfk && user.isReady) {
      user.isReady = false;
      this.io
        .to(this.id)
        .emit("room_users_update", { [userId]: { isReady: false } });
    }
  }

  setChatting(userId: string, isChatting: boolean): void {
    const user = this.users.get(userId);
    if (!user) return;
    user.isChatting = isChatting;
    this.io.to(this.id).emit("room_chatting_changed", { userId, isChatting });
  }

  chat(userId: string, message: string): void {
    const user = this.users.get(userId);
    if (!user) return;
    this.io.to(this.id).emit("room_chat_message", {
      message: escapeHTML(message),
      from: { id: user.id, name: user.name, isLeader: user.isLeader },
      isSystem: false,
    });
  }

  backToLobby(): void {
    if (!this.isIn(ROOM_STATE.SHOWING_RESULTS, ROOM_STATE.READY_TO_CONTINUE)) {
      return;
    }
    this.clearRaceTimers();
    this.setState(ROOM_STATE.LOBBY);
    this.io.to(this.id).emit("room_back_to_lobby");
  }

  // ------------------------------------------------------------------- race

  initRace(): void {
    if (!this.isIn(ROOM_STATE.LOBBY, ROOM_STATE.READY_TO_CONTINUE)) return;
    this.clearRaceTimers();

    // the leader and every ready, non-afk player takes part
    const typing: Record<string, { isTyping: boolean }> = {};
    this.participants.clear();
    this.traces.clear();
    for (const user of this.users.values()) {
      const takesPart =
        (user.isLeader === true || user.isReady === true) &&
        user.isAfk !== true;
      delete user.result;
      delete user.progress;
      delete user.isFinished;
      user.isTyping = takesPart;
      if (takesPart) {
        user.isFinished = false;
        this.participants.set(user.id, {
          name: user.name,
          uid: this.hooks.uidOf?.(user.id),
        });
      }
      typing[user.id] = { isTyping: takesPart };
    }
    this.seed = newSeed();
    this.extremes = { maxWpm: 0, maxRaw: 0, minWpm: 0, minRaw: 0 };

    // the client reads isTyping when it receives room_init_race, so it goes first.
    // room_init_race also moves the client to RACE_INIT on its own.
    this.io.to(this.id).emit("room_users_update", typing);
    this.state = ROOM_STATE.RACE_INIT;
    this.io.to(this.id).emit("room_init_race", { seed: this.seed });

    this.schedule(this.timings.initDelayMs, () => this.countdown());
  }

  private countdown(): void {
    this.setState(ROOM_STATE.RACE_COUNTDOWN);
    const tick = (time: number): void => {
      if (time === 0) {
        this.startRace();
        return;
      }
      this.io.to(this.id).emit("room_countdown", { time });
      this.schedule(1000, () => tick(time - 1));
    };
    tick(this.timings.countdownSeconds);
  }

  private startRace(): void {
    for (const user of this.users.values()) user.isReady = false;
    // room_race_started moves the client to RACE_ONGOING on its own
    this.state = ROOM_STATE.RACE_ONGOING;
    this.raceStartedAt = Date.now();
    this.io.to(this.id).emit("room_race_started");
    this.progressTicker = setInterval(
      () => this.broadcastProgress(),
      this.timings.updateRateMs,
    );
    this.checkRaceComplete();
  }

  // The client only sends its progress in response to this broadcast.
  private broadcastProgress(): void {
    const typing = [...this.users.values()].filter(
      (u) => u.isTyping === true && u.progress !== undefined,
    );
    const wpms = typing.map((u) => u.progress?.wpm ?? 0);
    const raws = typing.map((u) => u.progress?.raw ?? 0);
    this.extremes = {
      maxWpm: Math.max(0, ...wpms),
      maxRaw: Math.max(0, ...raws),
      minWpm: wpms.length > 0 ? Math.min(...wpms) : 0,
      minRaw: raws.length > 0 ? Math.min(...raws) : 0,
    };

    const users: Record<string, User["progress"]> = {};
    for (const user of typing) {
      if (!user.progress) continue;
      user.progress.wpmProgress =
        this.extremes.maxWpm > 0
          ? (user.progress.wpm / this.extremes.maxWpm) * 100
          : 0;
      users[user.id] = user.progress;
    }

    this.io.to(this.id).emit("room_progress_update", {
      users,
      roomMaxWpm: this.extremes.maxWpm,
      roomMaxRaw: this.extremes.maxRaw,
      roomMinWpm: this.extremes.minWpm,
      roomMinRaw: this.extremes.minRaw,
    });
  }

  setProgress(userId: string, progress: ProgressIn): void {
    const user = this.users.get(userId);
    if (!user?.isTyping || !RACING_STATES.has(this.state)) return;
    user.progress = {
      ...progress,
      wpmProgress: user.progress?.wpmProgress ?? 0,
    };
    let trace = this.traces.get(userId);
    if (!trace) {
      trace = new RaceTrace();
      this.traces.set(userId, trace);
    }
    trace.record(progress, Date.now());
  }

  setResult(userId: string, result: Result): void {
    const user = this.users.get(userId);
    if (!user?.isTyping || !RACING_STATES.has(this.state)) return;
    this.finishUser(user, this.verify(user, result));

    const someoneStillTyping = [...this.users.values()].some((u) => u.isTyping);
    if (this.state === ROOM_STATE.RACE_ONGOING && someoneStillTyping) {
      this.startFinishTimer();
    }
    this.checkRaceComplete();
  }

  // an invalid result gets no position, no points and no stats
  // The keystrokes are only read here, never stored or sent to the room.
  private verify(user: User, sent: Result): Result {
    const { keySpacing: _spacing, keyDuration: _duration, ...result } = sent;
    if (!isResultValid(result)) return result;
    const check = this.hooks.checkResult ?? basicCheck;
    const reason = check(sent, {
      trace: this.traces.get(user.id) ?? new RaceTrace(),
      raceStartedAt: this.raceStartedAt,
      now: Date.now(),
      config: this.config,
    });
    if (reason === undefined) {
      return { ...result, resolve: { ...result.resolve, verified: true } };
    }
    const uid = this.participants.get(user.id)?.uid ?? "guest";
    console.warn(`[anticheat] ${user.name} (${uid}): ${reason}`);
    return {
      ...result,
      resolve: {
        ...result.resolve,
        valid: false,
        invalidReason: reason,
        anticheat: reason,
      },
    };
  }

  private finishUser(user: User, result: Result | undefined): void {
    if (result) user.result = result;
    user.isFinished = true;
    user.isTyping = false;
    this.io.to(this.id).emit("room_user_result", { userId: user.id, result });
  }

  private startFinishTimer(): void {
    this.setState(ROOM_STATE.RACE_ONE_FINISHED);
    const tick = (time: number): void => {
      if (time === 0) {
        this.io.to(this.id).emit("room_race_force_finish", {
          reason: "time's up",
        });
        // players whose result still hasn't arrived get none
        this.schedule(this.timings.resultGraceMs, () => {
          for (const user of this.users.values()) {
            if (user.isTyping) this.finishUser(user, undefined);
          }
          this.checkRaceComplete();
        });
        return;
      }
      this.io.to(this.id).emit("room_finishTimer_countdown", { time });
      this.schedule(1000, () => tick(time - 1));
    };
    tick(this.timings.finishTimerSeconds);
  }

  private checkRaceComplete(): void {
    if (!RACING_STATES.has(this.state)) return;
    if ([...this.users.values()].some((u) => u.isTyping)) return;
    this.finishRace();
  }

  private finishRace(): void {
    this.clearRaceTimers();

    const racers = [...this.users.values()].filter(
      (u) => u.isFinished === true,
    );
    const outcome = computeOutcome(
      racers.map((u) => ({
        id: u.id,
        result: u.result,
        pointsBefore: u.points ?? 0,
      })),
    );
    for (const [id, points] of outcome.pointsTotal) {
      const user = this.users.get(id);
      if (user) user.points = points;
    }

    this.io.to(this.id).emit("room_final_positions", {
      positions: outcome.positions,
      miniCrowns: outcome.miniCrowns,
    });
    this.recordRace(outcome);
    this.setState(ROOM_STATE.SHOWING_RESULTS);
    this.schedule(this.timings.showResultsMs, () =>
      this.setState(ROOM_STATE.READY_TO_CONTINUE),
    );
  }

  // Hands the finished race to the stats. Players who left mid-race count as
  // having no result, so quitting doesn't dodge a loss.
  private recordRace(outcome: RaceOutcome): void {
    if (!this.hooks.onRaceFinished || this.participants.size < 2) return;

    const placement = new Map<string, { position: number; points: number }>();
    for (const [position, entries] of Object.entries(outcome.positions)) {
      for (const entry of entries) {
        placement.set(entry.id, {
          position: Number(position),
          points: entry.newPoints,
        });
      }
    }

    const mode = this.config["mode"];
    const mode2 =
      mode === "time"
        ? this.config["time"]
        : mode === "words"
          ? this.config["words"]
          : undefined;
    const language = this.config["language"];

    this.hooks.onRaceFinished({
      roomId: this.id,
      timestamp: Date.now(),
      mode: typeof mode === "string" ? mode : undefined,
      mode2:
        typeof mode2 === "number" || typeof mode2 === "string"
          ? String(mode2)
          : undefined,
      language: typeof language === "string" ? language : undefined,
      players: [...this.participants].map(([id, participant]) => {
        const result = this.users.get(id)?.result;
        const placed = placement.get(id);
        return {
          uid: participant.uid,
          name: participant.name,
          valid: isResultValid(result),
          flag:
            typeof result?.resolve["anticheat"] === "string"
              ? result.resolve["anticheat"]
              : undefined,
          wpm: result?.wpm,
          acc: result?.acc,
          position: placed?.position,
          points: placed?.points ?? 0,
        };
      }),
    });
  }

  // ---------------------------------------------------------------- helpers

  private isIn(...states: RoomState[]): boolean {
    return states.includes(this.state);
  }

  private setState(state: RoomState): void {
    this.state = state;
    this.io.to(this.id).emit("room_state_changed", { state });
  }

  private systemMessage(message: string): void {
    this.io.to(this.id).emit("room_chat_message", {
      message: escapeHTML(message),
      isSystem: true,
    });
  }

  private schedule(ms: number, fn: () => void): void {
    this.raceTimers.push(setTimeout(fn, ms));
  }

  private clearRaceTimers(): void {
    for (const timer of this.raceTimers) clearTimeout(timer);
    this.raceTimers = [];
    if (this.progressTicker) clearInterval(this.progressTicker);
    this.progressTicker = undefined;
  }

  dispose(): void {
    this.clearRaceTimers();
  }
}
