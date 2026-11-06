// The app's only door to the API. Every response is checked against the contract before
// the rest of the app sees it.

import {
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

export async function sharedRecordings(a: string, b: string, signal?: AbortSignal): Promise<SharedRecording[]> {
  const data = await getJson(`/api/players/${a}/with/${b}`, signal);
  if (!Array.isArray(data)) throw new Error("Unexpected response");
  return data.filter(isSharedRecording);
}

/** Opens the live feed for a player. Returns a function that closes it. */
export function streamPlayer(
  id: string,
  on: { snapshot: (s: Snapshot) => void; problem: (message: string) => void },
): () => void {
  const es = new EventSource(`${API}/api/players/${id}/stream`);
  let finished = false;
  es.addEventListener("snapshot", (e) => {
    try {
      const data: unknown = JSON.parse((e as MessageEvent<string>).data);
      if (!isSnapshot(data)) return;
      rememberPlayer(data.player);
      on.snapshot(data);
      if (data.progress.done) {
        finished = true;
        es.close();
      }
    } catch (_) {
      // A malformed event is skipped; the next one replaces it anyway.
    }
  });
  es.addEventListener("problem", (e) => {
    try {
      const data: unknown = JSON.parse((e as MessageEvent<string>).data);
      if (typeof data === "object" && data && "message" in data && typeof data.message === "string") on.problem(data.message);
    } catch (_) {}
  });
  // EventSource reconnects by itself after a dropped connection. Only report a problem
  // when it has given up.
  es.onerror = () => {
    if (!finished && es.readyState === EventSource.CLOSED) on.problem("Lost the connection to the server.");
  };
  return () => es.close();
}
