import { createServer } from "node:http";
import { DEFAULT_TIMINGS } from "./room.ts";
import { createTribeServer, DEFAULT_OPTIONS } from "./server.ts";

const env = process.env;
const port = Number(env["PORT"] ?? 3005);
const list = (value: string | undefined): string[] | undefined =>
  value
    ?.split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  res.writeHead(404).end();
});

const server = createTribeServer(httpServer, {
  version: env["TRIBE_VERSION"] ?? DEFAULT_OPTIONS.version,
  clientVersions:
    list(env["TRIBE_CLIENT_VERSIONS"]) ?? DEFAULT_OPTIONS.clientVersions,
  corsOrigin: list(env["CORS_ORIGIN"]) ?? DEFAULT_OPTIONS.corsOrigin,
  timings: {
    ...DEFAULT_TIMINGS,
    finishTimerSeconds: Number(
      env["FINISH_TIMER_SECONDS"] ?? DEFAULT_TIMINGS.finishTimerSeconds,
    ),
  },
});

httpServer.listen(port, () => {
  console.log(`[tribe] MonkeyClash tribe server listening on :${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
