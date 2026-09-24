import { randomBytes, randomInt } from "node:crypto";
import type { ProgressIn, Result } from "./types.ts";

// Same escaping as the client's escapeHTML: the client renders chat messages
// as HTML and builds its @mention regex from this exact format.
// Works on code points (u flag) so emojis stay a single valid entity.
export function escapeHTML(str: string): string {
  return str.replace(/[^\w. ]/gu, (c) => `&#${c.codePointAt(0)};`);
}

// Player and room names are rendered as raw HTML by the client, so they are
// restricted to a safe charset instead of being escaped.
export function sanitizeName(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const clean = name.replace(/[^\w.-]/g, "").slice(0, 16);
  return clean === "" ? undefined : clean;
}

export function sanitizeRoomName(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const clean = name
    .replace(/[^\w .'!?-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  return clean === "" ? undefined : clean;
}

export function guestName(): string {
  return `Guest${randomInt(1000, 10000)}`;
}

// the client only accepts 6 hex characters as a room code
export function newRoomId(taken: (id: string) => boolean): string {
  let id: string;
  do {
    id = randomBytes(3).toString("hex");
  } while (taken(id));
  return id;
}

export function newSeed(): number {
  return randomInt(0, 2 ** 31);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

export function parseProgress(data: unknown): ProgressIn | undefined {
  if (!isRecord(data)) return undefined;
  const wpm = num(data["wpm"], 0, 1000);
  const raw = num(data["raw"], 0, 1000);
  const acc = num(data["acc"], 0, 100);
  const progress = num(data["progress"], 0, 200);
  const wordIndex = num(data["wordIndex"], 0, 100_000);
  const letterIndex = num(data["letterIndex"], 0, 10_000);
  if (
    wpm === undefined ||
    raw === undefined ||
    acc === undefined ||
    progress === undefined ||
    wordIndex === undefined ||
    letterIndex === undefined
  ) {
    return undefined;
  }
  return {
    wpm,
    raw,
    acc,
    progress: Math.min(progress, 100),
    wordIndex,
    letterIndex,
    afk: data["afk"] === true,
  };
}

export function parseResult(data: unknown): Result | undefined {
  if (!isRecord(data)) return undefined;
  const wpm = num(data["wpm"], 0, 1000);
  const raw = num(data["raw"], 0, 1000);
  const acc = num(data["acc"], 0, 100);
  const consistency = num(data["consistency"], 0, 100);
  const testDuration = num(data["testDuration"], 0, 60 * 60 * 24);
  const charStats = data["charStats"];
  const resolve = data["resolve"];
  if (
    wpm === undefined ||
    raw === undefined ||
    acc === undefined ||
    consistency === undefined ||
    testDuration === undefined ||
    !Array.isArray(charStats) ||
    !charStats.every((n): n is number => typeof n === "number") ||
    !isRecord(resolve)
  ) {
    return undefined;
  }
  return {
    wpm,
    raw,
    acc,
    consistency,
    testDuration,
    charStats,
    chartData: data["chartData"],
    resolve,
  };
}

export function isResultValid(result: Result | undefined): boolean {
  if (result === undefined) return false;
  const { resolve } = result;
  if (resolve.failed === true) return false;
  if ("valid" in resolve && resolve.valid === false) return false;
  return true;
}
