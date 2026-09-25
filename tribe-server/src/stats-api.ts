import type { IncomingMessage, ServerResponse } from "node:http";
import type { StatsStore, UserStats } from "./stats.ts";

const LEADERBOARD_SIZE = 100;

function withAverages(stats: UserStats): UserStats & { avgWpm: number } {
  return {
    ...stats,
    avgWpm: stats.validRaces > 0 ? stats.wpmSum / stats.validRaces : 0,
  };
}

// Read-only JSON API for the duel stats:
//   GET /tribe-api/stats/leaderboard
//   GET /tribe-api/stats/user/<uid>
// Returns false when the request isn't for this API.
export function createStatsApi(
  store: StatsStore,
  corsOrigin: string[] | true,
): (req: IncomingMessage, res: ServerResponse) => boolean {
  const send = (
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    body: unknown,
  ): void => {
    const origin = req.headers.origin;
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (
      origin !== undefined &&
      (corsOrigin === true || corsOrigin.includes(origin))
    ) {
      headers["access-control-allow-origin"] = origin;
    }
    res.writeHead(status, headers).end(JSON.stringify(body));
  };

  return (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/tribe-api/")) return false;
    if (req.method !== "GET") {
      send(req, res, 405, { message: "method not allowed" });
      return true;
    }

    const handle = async (): Promise<void> => {
      if (url.pathname === "/tribe-api/stats/leaderboard") {
        const players = await store.leaderboard(LEADERBOARD_SIZE);
        send(req, res, 200, { players: players.map(withAverages) });
        return;
      }
      const match = /^\/tribe-api\/stats\/user\/([\w-]{1,128})$/.exec(
        url.pathname,
      );
      if (match?.[1] !== undefined) {
        const user = await store.user(match[1]);
        if (!user) {
          send(req, res, 404, { message: "no duel yet" });
          return;
        }
        send(req, res, 200, {
          stats: withAverages(user.stats),
          opponents: user.opponents,
        });
        return;
      }
      send(req, res, 404, { message: "not found" });
    };

    handle().catch((error: unknown) => {
      console.error("[tribe] stats api failed", error);
      send(req, res, 500, { message: "stats unavailable" });
    });
    return true;
  };
}
