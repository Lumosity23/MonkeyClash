import { createResource, For, JSXElement, Show, type Resource } from "solid-js";
import { envConfig } from "virtual:env-config";

import { getAuthenticatedUser } from "../../../firebase";
import { getActivePage } from "../../../states/core";
import { getSnapshot } from "../../../states/snapshot";
import { cn } from "../../../utils/cn";

// Duel stats served by the MonkeyClash tribe server (tribe-server/src/stats-api.ts)

type PlayerStats = {
  uid: string;
  name: string;
  races: number;
  validRaces: number;
  wins: number;
  podiums: number;
  points: number;
  bestWpm: number;
  avgWpm: number;
};

type Opponent = {
  uid: string;
  name: string;
  races: number;
  wins: number;
  losses: number;
  draws: number;
};

const apiBase = `${
  envConfig.tribeUrl !== "" ? envConfig.tribeUrl : window.location.origin
}/tribe-api/stats`;

async function getJson<T>(path: string): Promise<T | undefined> {
  const response = await fetch(`${apiBase}${path}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`stats api: ${response.status}`);
  return (await response.json()) as T;
}

const round = (n: number): number => Math.round(n);
const winRate = (s: { wins: number; races: number }): string =>
  s.races > 0 ? `${Math.round((s.wins / s.races) * 100)}%` : "-";

export function TribeStats(): JSXElement {
  // undefined while the page is closed, so every visit fetches fresh stats
  const onTribePage = (): true | undefined =>
    getActivePage() === "tribe" ? true : undefined;
  // the snapshot is set once logged in (its own uid field stays empty), the
  // uid comes from the firebase user
  const loggedUid = (): string | undefined =>
    getSnapshot() !== undefined ? getAuthenticatedUser()?.uid : undefined;
  const myUid = (): string | undefined =>
    onTribePage() ? loggedUid() : undefined;

  const [leaderboard] = createResource(onTribePage, async () =>
    getJson<{ players: PlayerStats[] }>("/leaderboard"),
  );
  const [me] = createResource(myUid, async (uid) =>
    getJson<{ stats: PlayerStats; opponents: Opponent[] }>(
      `/user/${encodeURIComponent(uid)}`,
    ),
  );

  return (
    <div class="grid gap-8">
      <div class="grid gap-4">
        <div class="text-sub">your duels</div>
        <Show
          when={getSnapshot() !== undefined}
          fallback={
            <div class="text-sub">
              <a href="/login" router-link>
                Log in
              </a>{" "}
              to keep your duel stats.
            </div>
          }
        >
          <Show
            when={me()}
            fallback={
              <div class="text-sub">
                No duel yet: create a room and race a friend.
              </div>
            }
          >
            {(data) => <MyStats stats={data().stats} />}
          </Show>
        </Show>
      </div>

      <Show when={(me()?.opponents.length ?? 0) > 0}>
        <div class="grid gap-2">
          <div class="text-sub">head to head</div>
          <For each={me()?.opponents}>
            {(opponent) => <HeadToHead opponent={opponent} />}
          </For>
        </div>
      </Show>

      <Leaderboard leaderboard={leaderboard} myUid={loggedUid()} />
    </div>
  );
}

function Stat(props: { label: string; value: string }): JSXElement {
  return (
    <div class="grid gap-1 rounded bg-sub-alt p-4">
      <div class="text-xs text-sub">{props.label}</div>
      <div class="text-2xl leading-none text-text">{props.value}</div>
    </div>
  );
}

function MyStats(props: { stats: PlayerStats }): JSXElement {
  return (
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      <Stat label="races" value={`${props.stats.races}`} />
      <Stat label="wins" value={`${props.stats.wins}`} />
      <Stat label="win rate" value={winRate(props.stats)} />
      <Stat label="podiums" value={`${props.stats.podiums}`} />
      <Stat label="points" value={`${props.stats.points}`} />
      <Stat label="best wpm" value={`${round(props.stats.bestWpm)}`} />
      <Stat label="avg wpm" value={`${round(props.stats.avgWpm)}`} />
    </div>
  );
}

function HeadToHead(props: { opponent: Opponent }): JSXElement {
  const decided = (): number => props.opponent.wins + props.opponent.losses;
  const share = (): number =>
    decided() > 0 ? (props.opponent.wins / decided()) * 100 : 50;
  return (
    <div class="grid grid-cols-[8rem_auto_1fr] items-center gap-4 rounded bg-sub-alt px-4 py-2">
      <div class="truncate text-text">{props.opponent.name}</div>
      <div class="text-sub">
        <span class="text-main">{props.opponent.wins}</span> -{" "}
        {props.opponent.losses}
        <Show when={props.opponent.draws > 0}>
          {" "}
          ({props.opponent.draws} draw{props.opponent.draws > 1 ? "s" : ""})
        </Show>
      </div>
      {/* your share of the decided races, in the theme's main color */}
      <div class="h-2 overflow-hidden rounded bg-sub">
        <div class="h-full bg-main" style={{ width: `${share()}%` }}></div>
      </div>
    </div>
  );
}

function Leaderboard(props: {
  leaderboard: Resource<{ players: PlayerStats[] } | undefined>;
  myUid: string | undefined;
}): JSXElement {
  const headers = [
    "#",
    "name",
    "points",
    "races",
    "wins",
    "win rate",
    "avg wpm",
    "best wpm",
  ];
  return (
    <div class="grid gap-2">
      <div class="text-sub">leaderboard</div>
      <Show
        when={(props.leaderboard()?.players.length ?? 0) > 0}
        fallback={
          <div class="text-sub">
            {props.leaderboard.error !== undefined
              ? "Stats are unavailable right now."
              : "No duel played with an account yet."}
          </div>
        }
      >
        <table class="w-full border-collapse text-left">
          <thead>
            <tr class="text-xs text-sub">
              <For each={headers}>
                {(header) => <th class="px-4 py-2 font-normal">{header}</th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.leaderboard()?.players}>
              {(player, index) => (
                <tr
                  class={cn("odd:bg-sub-alt", {
                    "text-main": player.uid === props.myUid,
                    "text-text": player.uid !== props.myUid,
                  })}
                >
                  <td class="rounded-l px-4 py-2">{index() + 1}</td>
                  <td class="px-4 py-2">{player.name}</td>
                  <td class="px-4 py-2">{player.points}</td>
                  <td class="px-4 py-2">{player.races}</td>
                  <td class="px-4 py-2">{player.wins}</td>
                  <td class="px-4 py-2">{winRate(player)}</td>
                  <td class="px-4 py-2">{round(player.avgWpm)}</td>
                  <td class="rounded-r px-4 py-2">{round(player.bestWpm)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}
