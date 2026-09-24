// Shapes of the data exchanged with the Tribe client.
// Mirrors frontend/src/ts/tribe/types.ts (only what the server needs to know).

export const ROOM_STATE = {
  LOBBY: "LOBBY",
  RACE_INIT: "RACE_INIT",
  RACE_COUNTDOWN: "RACE_COUNTDOWN",
  RACE_ONGOING: "RACE_ONGOING",
  RACE_ONE_FINISHED: "RACE_ONE_FINISHED",
  RACE_AWAITING_RESULTS: "RACE_AWAITING_RESULTS",
  SHOWING_RESULTS: "SHOWING_RESULTS",
  READY_TO_CONTINUE: "READY_TO_CONTINUE",
} as const;

export type RoomState = (typeof ROOM_STATE)[keyof typeof ROOM_STATE];

// The room config is the leader's test config (mode, time, language, ...).
// The server never interprets it, it only relays it to the other players.
export type RoomConfig = Record<string, unknown>;

export type ResultResolve = Record<string, unknown> & {
  valid?: boolean;
  failed?: boolean;
  saved?: boolean;
};

export type Result = {
  wpm: number;
  raw: number;
  acc: number;
  consistency: number;
  testDuration: number;
  charStats: number[];
  chartData: unknown;
  resolve: ResultResolve;
};

// what a client sends every tick
export type ProgressIn = {
  wpm: number;
  raw: number;
  acc: number;
  progress: number;
  wordIndex: number;
  letterIndex: number;
  afk: boolean;
};

// what the server broadcasts: wpmProgress is the wpm relative to the fastest player
export type Progress = ProgressIn & { wpmProgress: number };

export type User = {
  id: string;
  name: string;
  isLeader?: boolean;
  isReady?: boolean;
  result?: Result;
  progress?: Progress;
  isFinished?: boolean;
  isTyping?: boolean;
  isAfk?: boolean;
  isChatting?: boolean;
  points?: number;
};

export type RoomData = {
  id: string;
  state: RoomState;
  users: Record<string, User>;
  size: number;
  updateRate: number;
  isPrivate: boolean;
  name: string;
  config: RoomConfig;
  maxRaw: number;
  maxWpm: number;
  minRaw: number;
  minWpm: number;
  seed: number;
};

export type PublicRoomData = Pick<
  RoomData,
  "id" | "size" | "name" | "state" | "config"
>;

export type FinalPositions = Record<
  number,
  { id: string; newPoints: number; newPointsTotal: number }[]
>;

export type MiniCrowns = {
  raw: string[];
  wpm: string[];
  acc: string[];
  consistency: string[];
};
