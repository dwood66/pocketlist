// Reads a player's credits from MusicBrainz into the cache, a little at a time.
//
// Per player:
//   1. One request for the player's own recording list (every recording they're credited on).
//   2. Then, until every one of those recordings has its full personnel:
//      a. look up the next unread recording: its personnel and the releases it's on;
//      b. fetch the best of those releases (the original album, not a compilation) whole,
//         which fills in every other track on it in the same request.
//   Two requests read a whole album, so a player with 2,000 recordings takes a few hundred
//   requests rather than 2,000.
//
// One player is worked on at a time: the one most recently asked for. Clicking a new
// player moves it to the front; the previous one resumes once it's done.
//
// Re-reading. MusicBrainz keeps changing (people add credits every day), so a player read once
// isn't read forever:
//   - after REINDEX_AFTER, the next visit re-reads their recording list, which picks up
//     recordings they've been credited on since;
//   - asking for a refresh does that and also re-reads the personnel of each recording we
//     already have for them (up to RECHECK_MAX), which picks up people added to old songs.
//     One request per recording, so it's limited to once every REFRESH_COOLDOWN_MS.

import { rows } from "./db.ts";
import { ingestArtistIndex, ingestRecording, ingestRelease, PERFORMER_TYPES, skipRecording } from "./ingest.ts";
import { mb, NotFound, type MbArtist, type MbRecording, type MbRelease } from "./mb.ts";

type Listener = () => void;
type Job = {
  id: string; wantedAt: number; listeners: Set<Listener>; done: boolean; error?: string; failures: number;
  /** Listeners that are background warm-up, not a person: they keep a job alive but never outrank one. */
  background: Set<Listener>;
  /** A refresh asked for: re-read the recording list, then `recheck` these recordings. */
  reindex?: boolean;
  recheck?: string[];
  refreshedAt?: number;
};

const jobs = new Map<string, Job>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STALE_MS = 15 * 60_000; // stop filling a player nobody has looked at for 15 minutes
let running = false;
const people = (j: Job) => j.listeners.size - j.background.size;
const REINDEX_AFTER = "30 days";
export const RECHECK_MAX = 300;
const REFRESH_COOLDOWN_MS = 10 * 60_000;

function jobFor(artistId: string): Job {
  let job = jobs.get(artistId);
  if (!job) {
    job = { id: artistId, wantedAt: Date.now(), listeners: new Set(), background: new Set(), done: false, failures: 0 };
    jobs.set(artistId, job);
  }
  return job;
}

/** Ask to re-read a player from MusicBrainz. False when they were re-read only minutes ago. */
export function refresh(artistId: string): boolean {
  const job = jobFor(artistId);
  if (refreshing(artistId) !== null) return true; // already under way
  if (job.refreshedAt && Date.now() - job.refreshedAt < REFRESH_COOLDOWN_MS) return false;
  job.refreshedAt = Date.now();
  job.reindex = true;
  job.recheck = undefined;
  job.done = false;
  job.error = undefined;
  job.failures = 0;
  job.wantedAt = Date.now();
  void loop();
  return true;
}

/** Recordings still to re-read in a refresh (0 while re-reading the list itself), or null when no refresh is under way. */
export function refreshing(artistId: string): number | null {
  const job = jobs.get(artistId);
  if (!job || job.error) return null;
  if (job.reindex) return 0; // still re-reading their recording list
  return job.recheck?.length ? job.recheck.length : null;
}

export function watch(artistId: string, listener: Listener, opts?: { background?: boolean }): () => void {
  const job = jobFor(artistId);
  if (job.error) {
    // A failed crawl gets another try when someone asks again.
    job.error = undefined;
    job.done = false;
    job.failures = 0;
  }
  if (!opts?.background) job.wantedAt = Date.now();
  job.listeners.add(listener);
  if (opts?.background) job.background.add(listener);
  void loop();
  const j = job;
  return () => {
    j.listeners.delete(listener);
    if (j.background.delete(listener)) return;
    j.wantedAt = Date.now();
  };
}

export function jobError(artistId: string) {
  return jobs.get(artistId)?.error;
}

async function loop() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const now = Date.now();
      const next = [...jobs.values()]
        .filter((j) => !j.done && (j.listeners.size > 0 || now - j.wantedAt < STALE_MS))
        // People first: most watched, then most recently wanted. Background warm-up only when
        // nobody's waiting on anything else.
        .sort((a, b) => people(b) - people(a) || b.wantedAt - a.wantedAt)[0];
      if (!next) break;
      try {
        next.done = await step(next);
        next.failures = 0;
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        console.error(`crawl ${next.id}: ${why}`);
        // Give a player a few more chances, with a pause, before stopping. Everything read so
        // far is saved, so a retry carries on where it stopped.
        if (++next.failures < 3) {
          await sleep(15_000 * next.failures);
          continue;
        }
        next.error = "MusicBrainz stopped answering partway through, so this galaxy is incomplete. What's here is real. Reload in a minute or two to carry on reading.";
        next.done = true;
        next.reindex = false;
        next.recheck = undefined;
      }
      for (const l of next.listeners) l();
    }
  } finally {
    running = false;
  }
}

/** Do one unit of work for a player. Returns true when there's nothing left to do. */
async function step(job: Job): Promise<boolean> {
  const artistId = job.id;
  const [artist] = await rows<{ indexed_at: string | null; old: boolean }>(
    `select indexed_at, indexed_at < now() - interval '${REINDEX_AFTER}' as old from artists where id = $1`, [artistId]);
  if (!artist?.indexed_at || artist.old || job.reindex) {
    const a = await mb<MbArtist>(`artist/${artistId}?inc=recording-rels+aliases`);
    await ingestArtistIndex(a);
    if (job.reindex) {
      job.reindex = false;
      // Everything we'd already read for them gets read again; anything new is unread anyway.
      const read = await rows<{ id: string }>(
        `select r.id from credits c join recordings r on r.id = c.recording_id
         where c.artist_id = $1 and c.rel_type = any($2) and r.credits_loaded
         group by r.id order by min(c.date) asc nulls last, r.id limit $3`,
        [artistId, PERFORMER_TYPES, RECHECK_MAX],
      );
      job.recheck = read.map((r) => r.id);
    }
    return false;
  }

  // A refresh: re-read one recording's personnel. Its releases are already known.
  const again = job.recheck?.shift();
  if (again) {
    try {
      await ingestRecording(await mb<MbRecording>(`recording/${again}?inc=artist-rels+releases+release-groups`));
    } catch (e) {
      if (!(e instanceof NotFound)) { job.recheck!.unshift(again); throw e; }
    }
    return false;
  }

  // Next unread recording, earliest session first, so the career fills in in order.
  const [next] = await rows<{ id: string }>(
    `select r.id from credits c join recordings r on r.id = c.recording_id
     where c.artist_id = $1 and c.rel_type = any($2) and not r.credits_loaded
     group by r.id order by min(c.date) asc nulls last, r.id limit 1`,
    [artistId, PERFORMER_TYPES],
  );
  if (!next) return true;

  let rec: MbRecording;
  try {
    rec = await mb<MbRecording>(`recording/${next.id}?inc=artist-rels+releases+release-groups`);
  } catch (e) {
    if (e instanceof NotFound) {
      await skipRecording(next.id);
      return false;
    }
    throw e;
  }
  await ingestRecording(rec);

  // The release most likely to be the original album: official, an album rather than a
  // compilation or live record, earliest first.
  const [best] = await rows<{ id: string }>(
    `select rl.id from recording_releases rr join releases rl on rl.id = rr.release_id
     where rr.recording_id = $1 and not rl.fetched
     order by (rl.status = 'Official') desc nulls last,
              (rl.rg_primary = 'Album') desc nulls last,
              (cardinality(rl.rg_secondary) = 0) desc,
              rl.date asc nulls last
     limit 1`,
    [rec.id],
  );
  if (best) {
    try {
      const release = await mb<MbRelease>(`release/${best.id}?inc=recordings+recording-level-rels+artist-rels+release-groups`);
      await ingestRelease(release);
    } catch (e) {
      if (!(e instanceof NotFound)) throw e;
    }
  }
  return false;
}
