// The app's only door to the API. Every response is checked against the contract before
// the rest of the app sees it.

import {
  isAlsoOn, isAppleMatches, isPath, isPathPlaylist, isPlaylist, isSwap, type AlsoOn, type AppleMatches, type Path, type PathPlaylist, type Playlist, type Swap,
  isMembers, isPlayer, isRecordingCredits, type RecordingCredits, isPlayerCandidate, isSharedRecording, isSnapshot,
  type Members, type Player, type PlayerCandidate, type SharedRecording, type Snapshot,
} from "../../contract/index.ts";

// Locally the API sits behind Vite's /api proxy. Deployed, it's on its own host, set at
// build time (VITE_API_URL in Vercel's environment variables).
const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function withQuery(path: string, query: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== false) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

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
  const data = await getJson(withQuery("/api/search", { q, instrument }), signal);
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
  const data = await getJson(withQuery("/api/playlist", { seeds: seeds.join(","), n, mix }), signal);
  if (!isPlaylist(data)) throw new Error("Unexpected playlist response");
  for (const p of data.seeds) players.set(p.id, p);
  return data;
}

export async function pathPlaylist(ids: string[], per: number, mix: number, signal?: AbortSignal): Promise<PathPlaylist> {
  const data = await getJson(withQuery("/api/path-playlist", { ids: ids.join(","), per, mix }), signal);
  if (!isPathPlaylist(data)) throw new Error("Unexpected playlist response");
  for (const p of data.players) players.set(p.id, p);
  return data;
}

/** Direct Apple Music links for recordings; see server/apple.ts. */
export async function appleMatches(ids: string[], signal?: AbortSignal): Promise<AppleMatches> {
  const data = await getJson(withQuery("/api/apple", { ids: ids.join(",") }), signal);
  if (!isAppleMatches(data)) throw new Error("Unexpected response");
  return data;
}

/** Who else is on the most of a sampler's songs. */
export async function alsoOn(seeds: string[], signal?: AbortSignal): Promise<AlsoOn> {
  const data = await getJson(withQuery("/api/also-on", { seeds: seeds.join(",") }), signal);
  if (!isAlsoOn(data)) throw new Error("Unexpected response");
  return data;
}

/** Another song for these players, avoiding the recordings already in the list. */
export async function swapTrack(seeds: string[], avoid: string[], mix: number, signal?: AbortSignal): Promise<Swap> {
  const data = await getJson(withQuery("/api/swap", { seeds: seeds.join(","), avoid: avoid.join(","), mix }), signal);
  if (!isSwap(data)) throw new Error("Unexpected response");
  return data;
}

// The best-known route between two players. Cached: it's asked for on every hop of a game.
const paths = new Map<string, Promise<Path>>();
export function shortestPath(from: string, to: string): Promise<Path> {
  const key = `${from}>${to}`;
  if (!paths.has(key)) {
    paths.set(key, getJson(withQuery("/api/path", { from, to })).then((d) => {
      if (!isPath(d)) throw new Error("Unexpected path response");
      return d;
    }).catch((e: unknown) => { paths.delete(key); throw e; }));
  }
  return paths.get(key)!;
}

const memberLists = new Map<string, Promise<Members>>();

/** A band's members (`band: false` for a person). Asked once per page load per player. */
export function bandMembers(id: string): Promise<Members> {
  let p = memberLists.get(id);
  if (!p) {
    p = getJson(`/api/players/${id}/members`).then((data) => {
      if (!isMembers(data)) throw new Error("Unexpected members response");
      return data;
    });
    p.catch(() => memberLists.delete(id)); // let a later visit try again
    memberLists.set(id, p);
  }
  return p;
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
    const source = new EventSource(API + withQuery(`/api/players/${id}/stream`, { refresh: refresh ? 1 : undefined }));
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

// A song's full credits, asked for once per recording (they don't change once read).
const creditLists = new Map<string, Promise<RecordingCredits>>();
export function recordingCredits(id: string): Promise<RecordingCredits> {
  let p = creditLists.get(id);
  if (!p) {
    p = getJson(`/api/recordings/${encodeURIComponent(id)}/credits`).then((d) => {
      if (!isRecordingCredits(d)) throw new Error("Unexpected credits response");
      return d;
    });
    p.catch(() => creditLists.delete(id)); // a failure can be tried again
    creditLists.set(id, p);
  }
  return p;
}
