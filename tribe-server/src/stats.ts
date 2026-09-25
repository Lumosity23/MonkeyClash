// Duel stats: every finished race with at least two players is recorded, and
// per player / per pair counters are updated so reading stats stays cheap.
// Only players logged in with an account (uid) get stats, guests are ignored.

export type RacePlayer = {
  uid: string | undefined;
  name: string;
  valid: boolean;
  // why the anticheat rejected the result
  flag?: string | undefined;
  wpm: number | undefined;
  acc: number | undefined;
  // undefined when the player had no valid result (failed, afk, left)
  position: number | undefined;
  points: number;
};

export type RaceRecord = {
  roomId: string;
  timestamp: number;
  mode: string | undefined;
  mode2: string | undefined;
  language: string | undefined;
  players: RacePlayer[];
};

export type UserStats = {
  uid: string;
  name: string;
  races: number;
  validRaces: number;
  wins: number;
  podiums: number;
  points: number;
  wpmSum: number;
  // races whose result the anticheat rejected
  flaggedRaces: number;
  bestWpm: number;
  lastRaceAt: number;
};

export type HeadToHead = {
  // uids, a < b
  a: string;
  b: string;
  races: number;
  aWins: number;
  bWins: number;
  draws: number;
};

export type OpponentRecord = {
  uid: string;
  name: string;
  races: number;
  wins: number;
  losses: number;
  draws: number;
};

export type UserIncrement = {
  uid: string;
  name: string;
  timestamp: number;
  inc: Omit<UserStats, "uid" | "name" | "bestWpm" | "lastRaceAt">;
  bestWpm: number;
};

export type PairIncrement = {
  a: string;
  b: string;
  inc: Omit<HeadToHead, "a" | "b">;
};

// lower is better, players without a position are behind everyone
function rank(player: RacePlayer): number {
  return player.position ?? Number.POSITIVE_INFINITY;
}

export function statsIncrements(record: RaceRecord): {
  users: UserIncrement[];
  pairs: PairIncrement[];
} {
  const accounts = record.players.filter(
    (p): p is RacePlayer & { uid: string } => p.uid !== undefined,
  );

  const users = accounts.map((p) => {
    const validWpm = p.valid && p.wpm !== undefined ? p.wpm : undefined;
    return {
      uid: p.uid,
      name: p.name,
      timestamp: record.timestamp,
      inc: {
        races: 1,
        validRaces: validWpm !== undefined ? 1 : 0,
        wins: p.position === 1 ? 1 : 0,
        podiums: p.position !== undefined && p.position <= 3 ? 1 : 0,
        points: p.points,
        wpmSum: validWpm ?? 0,
        flaggedRaces: p.flag !== undefined ? 1 : 0,
      },
      bestWpm: validWpm ?? 0,
    };
  });

  const pairs: PairIncrement[] = [];
  for (let i = 0; i < accounts.length; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const [first, second] = [accounts[i], accounts[j]] as [
        RacePlayer & { uid: string },
        RacePlayer & { uid: string },
      ];
      if (first.uid === second.uid) continue;
      const [a, b] = first.uid < second.uid ? [first, second] : [second, first];
      const diff = rank(a) - rank(b);
      // both without a position is a draw too (Infinity - Infinity is NaN)
      const draw = Number.isNaN(diff) || diff === 0;
      pairs.push({
        a: a.uid,
        b: b.uid,
        inc: {
          races: 1,
          aWins: !draw && diff < 0 ? 1 : 0,
          bWins: !draw && diff > 0 ? 1 : 0,
          draws: draw ? 1 : 0,
        },
      });
    }
  }

  return { users, pairs };
}

export function opponentRecords(
  uid: string,
  pairs: HeadToHead[],
  names: Map<string, string>,
): OpponentRecord[] {
  return pairs
    .filter((p) => p.a === uid || p.b === uid)
    .map((p) => {
      const isA = p.a === uid;
      const opponent = isA ? p.b : p.a;
      return {
        uid: opponent,
        name: names.get(opponent) ?? "?",
        races: p.races,
        wins: isA ? p.aWins : p.bWins,
        losses: isA ? p.bWins : p.aWins,
        draws: p.draws,
      };
    })
    .sort((x, y) => y.races - x.races);
}

export type StatsStore = {
  saveRace(record: RaceRecord): Promise<void>;
  // players sorted by points
  leaderboard(limit: number): Promise<UserStats[]>;
  user(
    uid: string,
  ): Promise<{ stats: UserStats; opponents: OpponentRecord[] } | undefined>;
};

// Keeps everything in memory, for tests and local development.
export class MemoryStatsStore implements StatsStore {
  readonly races: RaceRecord[] = [];
  private readonly users = new Map<string, UserStats>();
  private readonly pairs = new Map<string, HeadToHead>();

  async saveRace(record: RaceRecord): Promise<void> {
    this.races.push(record);
    const { users, pairs } = statsIncrements(record);
    for (const u of users) {
      const s = this.users.get(u.uid) ?? {
        uid: u.uid,
        name: u.name,
        races: 0,
        validRaces: 0,
        wins: 0,
        podiums: 0,
        points: 0,
        wpmSum: 0,
        flaggedRaces: 0,
        bestWpm: 0,
        lastRaceAt: 0,
      };
      s.name = u.name;
      s.lastRaceAt = u.timestamp;
      s.bestWpm = Math.max(s.bestWpm, u.bestWpm);
      for (const key of Object.keys(u.inc) as (keyof UserIncrement["inc"])[]) {
        s[key] += u.inc[key];
      }
      this.users.set(u.uid, s);
    }
    for (const p of pairs) {
      const key = `${p.a}|${p.b}`;
      const h = this.pairs.get(key) ?? {
        a: p.a,
        b: p.b,
        races: 0,
        aWins: 0,
        bWins: 0,
        draws: 0,
      };
      for (const k of Object.keys(p.inc) as (keyof PairIncrement["inc"])[]) {
        h[k] += p.inc[k];
      }
      this.pairs.set(key, h);
    }
  }

  async leaderboard(limit: number): Promise<UserStats[]> {
    return [...this.users.values()]
      .sort((x, y) => y.points - x.points || y.wins - x.wins)
      .slice(0, limit);
  }

  async user(
    uid: string,
  ): Promise<{ stats: UserStats; opponents: OpponentRecord[] } | undefined> {
    const stats = this.users.get(uid);
    if (!stats) return undefined;
    const names = new Map([...this.users.values()].map((u) => [u.uid, u.name]));
    return {
      stats,
      opponents: opponentRecords(uid, [...this.pairs.values()], names),
    };
  }
}
