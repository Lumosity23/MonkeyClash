import type { Collection, Db } from "mongodb";
import {
  opponentRecords,
  statsIncrements,
  type HeadToHead,
  type OpponentRecord,
  type RaceRecord,
  type StatsStore,
  type UserStats,
} from "./stats.ts";

// Stats in the monkeytype database, next to the backend's collections.
export class MongoStatsStore implements StatsStore {
  private readonly races: Collection<RaceRecord>;
  private readonly users: Collection<UserStats>;
  private readonly pairs: Collection<HeadToHead>;

  constructor(db: Db) {
    this.races = db.collection<RaceRecord>("tribeRaces");
    this.users = db.collection<UserStats>("tribeUserStats");
    this.pairs = db.collection<HeadToHead>("tribeHeadToHead");
  }

  async createIndexes(): Promise<void> {
    await this.users.createIndex({ uid: 1 }, { unique: true });
    await this.users.createIndex({ points: -1 });
    await this.pairs.createIndex({ a: 1, b: 1 }, { unique: true });
    await this.pairs.createIndex({ b: 1 });
    await this.races.createIndex({ "players.uid": 1, timestamp: -1 });
  }

  async saveRace(record: RaceRecord): Promise<void> {
    // insertOne adds an _id to the object it gets, keep the caller's clean
    await this.races.insertOne({ ...record });
    const { users, pairs } = statsIncrements(record);
    if (users.length > 0) {
      await this.users.bulkWrite(
        users.map((u) => ({
          updateOne: {
            filter: { uid: u.uid },
            update: {
              $set: { name: u.name, lastRaceAt: u.timestamp },
              $inc: u.inc,
              $max: { bestWpm: u.bestWpm },
            },
            upsert: true,
          },
        })),
      );
    }
    if (pairs.length > 0) {
      await this.pairs.bulkWrite(
        pairs.map((p) => ({
          updateOne: {
            filter: { a: p.a, b: p.b },
            update: { $inc: p.inc },
            upsert: true,
          },
        })),
      );
    }
  }

  async leaderboard(limit: number): Promise<UserStats[]> {
    return this.users
      .find({}, { projection: { _id: 0 } })
      .sort({ points: -1, wins: -1 })
      .limit(limit)
      .toArray();
  }

  async user(
    uid: string,
  ): Promise<{ stats: UserStats; opponents: OpponentRecord[] } | undefined> {
    const stats = await this.users.findOne({ uid }, { projection: { _id: 0 } });
    if (!stats) return undefined;
    const pairs = await this.pairs
      .find({ $or: [{ a: uid }, { b: uid }] }, { projection: { _id: 0 } })
      .toArray();
    const opponentUids = pairs.map((p) => (p.a === uid ? p.b : p.a));
    const opponents = await this.users
      .find({ uid: { $in: opponentUids } }, { projection: { uid: 1, name: 1 } })
      .toArray();
    const names = new Map(opponents.map((o) => [o.uid, o.name]));
    return { stats, opponents: opponentRecords(uid, pairs, names) };
  }
}
