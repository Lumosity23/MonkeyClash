import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { MongoClient } from "mongodb";
import { loadAnticheat } from "./anticheat.ts";
import { firebaseAuthenticator, type Authenticate } from "./auth.ts";
import { MongoStatsStore } from "./mongo-stats.ts";
import { DEFAULT_TIMINGS } from "./room.ts";
import { createTribeServer, DEFAULT_OPTIONS } from "./server.ts";
import { createStatsApi } from "./stats-api.ts";
import { MemoryStatsStore, type StatsStore } from "./stats.ts";

const env = process.env;
const port = Number(env["PORT"] ?? 3005);
const list = (value: string | undefined): string[] | undefined =>
  value
    ?.split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
const corsOrigin = list(env["CORS_ORIGIN"]) ?? DEFAULT_OPTIONS.corsOrigin;

// With a database the stats are stored there and accounts can be verified,
// without one (local development) stats only live in memory.
let stats: StatsStore = new MemoryStatsStore();
let authenticate: Authenticate | undefined;
let mongo: MongoClient | undefined;

const mongoUri = env["MONGO_URI"];
if (mongoUri !== undefined && mongoUri !== "") {
  mongo = await MongoClient.connect(mongoUri);
  const db = mongo.db(env["DB_NAME"] ?? "monkeytype");
  const store = new MongoStatsStore(db);
  await store.createIndexes();
  stats = store;
  console.log("[tribe] duel stats stored in mongodb");

  const serviceAccount = env["FIREBASE_SERVICE_ACCOUNT"];
  if (serviceAccount !== undefined && existsSync(serviceAccount)) {
    authenticate = firebaseAuthenticator(serviceAccount, db);
    console.log("[tribe] accounts enabled");
  }
} else {
  console.log("[tribe] no MONGO_URI, duel stats kept in memory");
}

const statsApi = createStatsApi(stats, corsOrigin);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (statsApi(req, res)) return;
  res.writeHead(404).end();
});

const server = createTribeServer(httpServer, {
  version: env["TRIBE_VERSION"] ?? DEFAULT_OPTIONS.version,
  clientVersions:
    list(env["TRIBE_CLIENT_VERSIONS"]) ?? DEFAULT_OPTIONS.clientVersions,
  corsOrigin,
  timings: {
    ...DEFAULT_TIMINGS,
    finishTimerSeconds: Number(
      env["FINISH_TIMER_SECONDS"] ?? DEFAULT_TIMINGS.finishTimerSeconds,
    ),
  },
  authenticate,
  stats,
  checkResult: await loadAnticheat(),
});

httpServer.listen(port, () => {
  console.log(`[tribe] MonkeyClash tribe server listening on :${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server
      .close()
      .then(async () => mongo?.close())
      .then(() => process.exit(0));
  });
}
