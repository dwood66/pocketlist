// MusicBrainz client. Every request in the process goes through one queue, because the
// limit (about one request per second, with an identifying User-Agent) is per client, not
// per player being crawled. https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting

const UA = "Pocketlist/0.1 (https://github.com/dwood66/pocketlist)";
const BASE = "https://musicbrainz.org/ws/2/";
const GAP_MS = 1100;

let chain: Promise<unknown> = Promise.resolve();
let last = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NotFound extends Error {}

/** Count of requests sent since start, for logging. */
export let requestCount = 0;

export function mb<T = unknown>(path: string): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const wait = last + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      requestCount++;
      const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}fmt=json`;
      let res: Response;
      let body: unknown;
      try {
        res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
        body = res.ok ? await res.json() : undefined;
      } catch (e) {
        // The connection dropped, timed out or never opened ("fetch failed"). Usually a blip:
        // wait and try again. The real reason hides in e.cause, so log that.
        const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : e instanceof Error ? e.message : String(e);
        console.warn(`MusicBrainz network error (attempt ${attempt + 1}) for ${path}: ${cause}`);
        if (attempt < 4) { await sleep(3000 * (attempt + 1)); continue; }
        throw new Error(`Couldn't reach MusicBrainz: ${cause}`);
      }
      if (res.ok) return body as T;
      if (res.status === 404) throw new NotFound(path);
      // 503 is MusicBrainz saying "slow down". Back off and try again a few times.
      if ((res.status === 503 || res.status >= 500) && attempt < 4) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error(`MusicBrainz ${res.status} for ${path}`);
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

// ---------------------------------------------------------------------------
// The slices of MusicBrainz's JSON we use. Everything else is ignored.
// ---------------------------------------------------------------------------

export type MbArtistRef = { id: string; name: string; disambiguation?: string; type?: string | null };

export type MbRelation = {
  type: string; // instrument, vocal, performer, producer, engineer…
  "target-type": string;
  direction: "forward" | "backward";
  attributes?: string[];
  begin?: string | null;
  end?: string | null;
  artist?: MbArtistRef;
  recording?: { id: string; title: string; length?: number | null };
};

export type MbReleaseGroup = {
  id: string;
  title: string;
  "primary-type"?: string | null;
  "secondary-types"?: string[];
  "first-release-date"?: string;
};

export type MbArtistCredit = { name: string; joinphrase?: string }[];

/** "Miles Davis Quintet", "Art Blakey & The Jazz Messengers": a credit as it's printed. */
export function creditName(ac?: MbArtistCredit): string | null {
  const s = (ac ?? []).map((a) => a.name + (a.joinphrase ?? "")).join("").trim();
  return s || null;
}

export type MbRelease = {
  id: string;
  title: string;
  date?: string;
  status?: string | null;
  "artist-credit"?: MbArtistCredit;
  "release-group"?: MbReleaseGroup;
  media?: { tracks?: { recording: MbRecording }[] }[];
};

export type MbRecording = {
  id: string;
  title: string;
  length?: number | null;
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit;
  relations?: MbRelation[];
  releases?: MbRelease[];
};

export type MbArtist = MbArtistRef & {
  "life-span"?: { begin?: string | null; end?: string | null };
  country?: string | null;
  aliases?: { name: string }[];
  tags?: { name: string }[];
  relations?: MbRelation[];
  score?: number;
};
