// Abuse limits: how many connections an IP may open, and how fast a socket
// may send events. Everything lives in memory, like the rooms.

import type { IncomingMessage } from "node:http";

export type Limits = {
  // sockets open at the same time from one IP (friends behind one router
  // share it, so not too low)
  maxConnectionsPerIp: number;
  // new connections per IP per minute (reload / reconnect spam)
  connectionsPerMinute: number;
  // events a socket may send: a burst, then a steady rate per second
  eventBurst: number;
  eventsPerSecond: number;
  // a socket that keeps flooding after being throttled this many times is
  // disconnected
  maxStrikes: number;
  // stats api requests per IP per minute
  httpPerMinute: number;
};

export const DEFAULT_LIMITS: Limits = {
  maxConnectionsPerIp: 20,
  connectionsPerMinute: 60,
  eventBurst: 40,
  eventsPerSecond: 15,
  maxStrikes: 50,
  httpPerMinute: 120,
};

// Events that cost more than one token: they create rooms or touch many
// players.
export const EVENT_COST: Record<string, number> = {
  room_create: 10,
  room_join: 5,
  room_init_race: 5,
  room_update_config: 3,
};

// Token bucket per key: `capacity` tokens, refilled at `perSecond`.
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private readonly capacity: number;
  private readonly perSecond: number;
  private readonly now: () => number;

  constructor(capacity: number, perSecond: number, now = Date.now) {
    this.capacity = capacity;
    this.perSecond = perSecond;
    this.now = now;
  }

  take(key: string, cost = 1): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + ((now - bucket.at) / 1000) * this.perSecond,
    );
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < cost) return false;
    bucket.tokens -= cost;
    return true;
  }

  delete(key: string): void {
    this.buckets.delete(key);
  }

  // forgets full buckets, so the map doesn't grow forever
  prune(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      const tokens =
        bucket.tokens + ((now - bucket.at) / 1000) * this.perSecond;
      if (tokens >= this.capacity) this.buckets.delete(key);
    }
  }
}

// The player's IP. Behind our nginx (TRUST_PROXY) it is in X-Real-IP,
// otherwise that header could be forged and the socket address is used.
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  const header = req.headers["x-real-ip"];
  if (trustProxy && typeof header === "string" && header !== "") return header;
  return req.socket.remoteAddress ?? "unknown";
}
