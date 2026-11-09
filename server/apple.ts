// Apple Music matches: for a recording, the exact song in Apple's catalogue, so a playlist can
// link straight to it (where "Add to Playlist" is one tap) instead of to a search.
//
// How: Apple's public search API (no key, no sign-in) for the title and artist, then keep only
// results with the same title whose length is within a few seconds of the recording's. Length is
// the best clue to which take is which. Not exact: mastering, edits or an earlier fade can move a
// reissue of the same recording by a second or more, hence the tolerance; but a re-recording, a
// live version or an alternate take is usually off by much more. No length, no match: we'd
// rather send someone to a search than to the wrong take.
//
// Apple allows about 20 searches a minute, so lookups go through one slow queue and every answer
// (including "no confident match") is stored in apple_matches. Pages ask again until theirs are done.

import { rows } from "./db.ts";
import { bare, pickMatch, type AppleTrack, type Wanted } from "./apple-match.ts";

const GAP_MS = 3200; // ~19 a minute
const ITUNES = "https://itunes.apple.com/search";

const queue = new Map<string, Wanted>();
let running = false;
let pauseUntil = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(w: Wanted): Promise<AppleTrack[]> {
  const term = [bare(w.title) || w.title, w.artist ?? ""].join(" ").trim();
  const res = await fetch(`${ITUNES}?term=${encodeURIComponent(term)}&entity=song&media=music&country=US&limit=25`, {
    headers: { "User-Agent": "Pocketlist/0.1 (https://pocketlist.music)" }, signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 403 || res.status === 429) throw Object.assign(new Error("Apple asked us to slow down"), { slowDown: true });
  if (!res.ok) throw new Error(`Apple search ${res.status}`);
  const body = (await res.json()) as { results?: AppleTrack[] };
  return body.results ?? [];
}

async function work() {
  if (running) return;
  running = true;
  try {
    for (const [id, w] of queue) {
      const wait = Math.max(pauseUntil - Date.now(), 0);
      if (wait) await sleep(wait);
      try {
        const match = pickMatch(w, await search(w));
        await rows(`insert into apple_matches (recording_id, url, track_ms) values ($1, $2, $3)
                    on conflict (recording_id) do update set url = excluded.url, track_ms = excluded.track_ms, matched_at = now()`,
          [id, match?.url ?? null, match?.ms ?? null]);
        queue.delete(id);
      } catch (e) {
        if ((e as { slowDown?: boolean }).slowDown) pauseUntil = Date.now() + 60_000;
        else { console.warn(`apple ${id}: ${e instanceof Error ? e.message : String(e)}`); queue.delete(id); }
      }
      await sleep(GAP_MS);
    }
  } finally {
    running = false;
    if (queue.size) void work();
  }
}

/** Known matches for these recordings, and which are still being looked up. */
export async function appleMatches(ids: string[]) {
  const known = await rows<{ recording_id: string; url: string | null; track_ms: number | null }>(
    `select recording_id, url, track_ms from apple_matches where recording_id = any($1)`, [ids]);
  const found: Record<string, { url: string | null; length?: number }> = {};
  for (const k of known) found[k.recording_id] = { url: k.url, length: k.track_ms ?? undefined };

  const unknown = ids.filter((id) => !found[id] && !queue.has(id));
  if (unknown.length) {
    const info = await rows<Wanted & { album_artist: string | null }>(
      `select r.id, r.title, r.length_ms as length, r.artist_credit as artist, f.album, f.album_artist
       from recordings r
       left join lateral (
         select rl.rg_title as album, rl.artist_credit as album_artist
         from recording_releases rr join releases rl on rl.id = rr.release_id
         where rr.recording_id = r.id
         order by (rl.status = 'Official') desc nulls last, (rl.rg_primary = 'Album') desc nulls last,
                  coalesce(array_length(rl.rg_secondary, 1), 0) asc, rl.date asc nulls last
         limit 1) f on true
       where r.id = any($1)`, [unknown]);
    for (const w of info) {
      // Without a length there's nothing to confirm a match with; leave it to a plain search.
      if (!w.length) { found[w.id] = { url: null }; continue; }
      queue.set(w.id, { ...w, artist: w.artist ?? w.album_artist });
    }
    void work();
  }
  return { found, pending: ids.filter((id) => queue.has(id)) };
}
