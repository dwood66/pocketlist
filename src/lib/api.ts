// The app's only door to the API. Every response is checked against the contract before
// the rest of the app sees it.

import {
  isAlsoOn, isAppleMatches, isPath, isPathPlaylist, isPlaylist, isSwap, type AlsoOn, type AppleMatches, type Path, type PathPlaylist, type Playlist, type Swap,
  isPlayer, isPlayerCandidate, isSharedRecording, isSnapshot,
  type Player, type PlayerCandidate, type SharedRecording, type Snapshot,
} from "../../contract/index.ts";

// Locally the API sits behind Vite's /api proxy. Deployed, it's on its own host, set at
// build time (VITE_API_URL in Vercel's environment variables).
const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(API + path, { signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error("Can't reach the Pocketlist server right now. Try again in a moment.");
  }
  if (!(res.headers.get("content-type") ?? "").includes("json")) {
    throw new Error("Can't reach the Pocketlist server right now. Try again in a moment.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof body === "object" && body && "error" in body && typeof body.error === "string"
      ? body.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

export async function search(q: string, instrument: string, signal?: AbortSignal): Promise<PlayerCandidate[]> {
  const data = await getJson(`/api/search?q=${encodeURIComponent(q)}&instrument=${encodeURIComponent(instrument)}`, signal);
  if (!Array.isArray(data)) throw new Error("Unexpected search response");
  return data.filter(isPlayerCandidate);
}

const players = new Map<string, Player>();

export function rememberPlayer(p: Player) {
  players.set(p.id, p);
}

export async function getPlayer(id: string, signal?: AbortSignal): Promise<Player> {
  const known = players.get(id);
  if (known) return known;
  const data = await getJson(`/api/players/${id}`, signal);
  if (!isPlayer(data)) throw new Error("Unexpected player response");
  players.set(id, data);
  return data;
}

export async function playlist(seeds: string[], n: number, mix: number, signal?: AbortSignal): Promise<Playlist> {
  const data = await getJson(`/api/playlist?seeds=${seeds.join(",")}&n=${n}&mix=${mix}`, signal);
  if (!isPlaylist(data)) throw new Error("Unexpected playlist response");
  for (const p of data.seeds) players.set(p.id, p);
  return data;
}

export async function pathPlaylist(ids: string[], per: number, mix: number, signal?: AbortSignal): Promise<PathPlaylist> {
  const data = await getJson(`/api/path-playlist?ids=${ids.join(",")}&per=${per}&mix=${mix}`, signal);
  if (!isPathPlaylist(data)) throw new Error("Unexpected playlist response");
  for (const p of data.players) players.set(p.id, p);
  return data;
}

/** Direct Apple Music links for recordings; see server/apple.ts. */
export async function appleMatches(ids: string[], signal?: AbortSignal): Promise<AppleMatches> {
  const data = await getJson(`/api/apple?ids=${ids.join(",")}`, signal);
  if (!isAppleMatches(data)) throw new Error("Unexpected response");
  return data;
}

/** Who else is on the most of a sampler's songs. */
export async function alsoOn(seeds: string[], signal?: AbortSignal): Promise<AlsoOn> {
  const data = await getJson(`/api/also-on?seeds=${seeds.join(",")}`, signal);
  if (!isAlsoOn(data)) throw new Error("Unexpected response");
  return data;
}

/** Another song for these players, avoiding the recordings already in the list. */
export async function swapTrack(seeds: string[], avoid: string[], mix: number, signal?: AbortSignal): Promise<Swap> {
  const data = await getJson(`/api/swap?seeds=${seeds.join(",")}&avoid=${avoid.join(",")}&mix=${mix}`, signal);
  if (!isSwap(data)) throw new Error("Unexpected response");
  return data;
}

// The best-known route between two players. Cached: it's asked for on every hop of a game.
const paths = new Map<string, Promise<Path>>();
export function shortestPath(from: string, to: string): Promise<Path> {
  const key = `${from}>${to}`;
  if (!paths.has(key)) {
    paths.set(key, getJson(`/api/path?from=${from}&to=${to}`).then((d) => {
      if (!isPath(d)) throw new Error("Unexpected path response");
      return d;
    }).catch((e: unknown) => { paths.delete(key); throw e; }));
  }
  return paths.get(key)!;
}

export async function sharedRecordings(a: string, b: string, signal?: AbortSignal): Promise<SharedRecording[]> {
  const data = await getJson(`/api/players/${a}/with/${b}`, signal);
  if (!Array.isArray(data)) throw new Error("Unexpected response");
  return data.filter(isSharedRecording);
}

/** Opens the live feed for a player. Returns a function that closes it.
 *  While the tab is hidden the feed is closed, and it reopens (with the latest) when the tab
 *  comes back: a background tab left on a player being read in shouldn't keep the server busy. */
export function streamPlayer(
  id: string,
  on: { snapshot: (s: Snapshot) => void; problem: (message: string) => void },
  opts?: { refresh?: boolean },
): () => void {
  let es: EventSource | null = null;
  let finished = false;
  let refresh = !!opts?.refresh; // only the first connection asks for a re-read

  function open() {
    if (es || finished) return;
    const source = new EventSource(`${API}/api/players/${id}/stream${refresh ? "?refresh=1" : ""}`);
    refresh = false;
    es = source;
    source.addEventListener("snapshot", (e) => {
      try {
        const data: unknown = JSON.parse((e as MessageEvent<string>).data);
        if (!isSnapshot(data)) return;
        rememberPlayer(data.player);
        on.snapshot(data);
        if (data.progress.done) {
          finished = true;
          close();
        }
      } catch (_) {
        // A malformed event is skipped; the next one replaces it anyway.
      }
    });
    source.addEventListener("problem", (e) => {
      try {
        const data: unknown = JSON.parse((e as MessageEvent<string>).data);
        if (typeof data === "object" && data && "message" in data && typeof data.message === "string") on.problem(data.message);
      } catch (_) {}
    });
    // EventSource reconnects by itself after a dropped connection. Only report a problem
    // when it has given up.
    source.onerror = () => {
      if (!finished && source.readyState === EventSource.CLOSED) on.problem("Lost the connection to the server.");
    };
  }
  function close() {
    es?.close();
    es = null;
  }
  const onVisibility = () => (document.hidden ? close() : open());

  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) open();
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    finished = true;
    close();
  };
}
