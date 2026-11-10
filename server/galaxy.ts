// A player's galaxy (the Snapshot the player page streams), built with as little database
// traffic as we can manage.
//
// Building one reads every credit on every recording the player is on: about 5 MB from the
// database for Louis Armstrong, for a summary of about 130 KB. Neon bills for what it sends
// out, and the live page used to rebuild from scratch every 1.5 seconds while a player was
// being read in. So:
//   - A finished galaxy is built once and kept in memory (`finished`) for a few hours.
//   - A galaxy still being read in from MusicBrainz keeps its credit rows in memory (`live`)
//     and each update reads only the recordings that have arrived since the last one.
//     When the reading-in finishes, it's rebuilt once in full, so release details that
//     arrived along the way are right, and that's the version kept.
//   - Two pages watching the same player share one build.

import type { Player, Snapshot } from "../contract/index.ts";
import { aggregate, ownInstruments, type CreditRow } from "./aggregate.ts";
import { Forgetful } from "./cache.ts";
import { refreshing } from "./crawler.ts";
import { rows } from "./db.ts";
import { PERFORMER_TYPES } from "./ingest.ts";

type Own = Pick<CreditRow, "artist_id" | "recording_id" | "instruments">;
type Live = { credits: CreditRow[]; seen: Set<string>; own: Own[]; ownFor: number; at: number };

const HOUR = 60 * 60_000;
// Kept by size: Louis Armstrong's galaxy is about 130 KB of JSON, most players far less.
const finished = new Forgetful<{ snap: Snapshot; bytes: number }>(24_000_000, 6 * HOUR, (f) => f.bytes);
const live = new Map<string, Live>();
const building = new Map<string, Promise<Snapshot>>();
const LIVE_IDLE_MS = 30 * 60_000;

/** The credits on this player's recordings: all of them, or only recordings not in `skip`. */
function readCredits(id: string, skip?: string[]) {
  return rows<CreditRow>(
    `with mine as (
       select distinct recording_id from credits where artist_id = $1 and rel_type = any($2)
     ), first_rg as (
       select distinct on (rr.recording_id) rr.recording_id, rl.rg_id
       from recording_releases rr join releases rl on rl.id = rr.release_id
       where rr.recording_id in (select recording_id from mine)
       ${skip ? "and not (rr.recording_id = any($3))" : ""}
       order by rr.recording_id, rl.date asc nulls last
     )
     select c.recording_id, r.title, r.first_release_date, f.rg_id, c.artist_id, c.artist_name,
            c.artist_disambiguation, c.instruments, c.date
     from credits c
     join mine m on m.recording_id = c.recording_id
     join recordings r on r.id = c.recording_id
     left join first_rg f on f.recording_id = c.recording_id
     where c.rel_type = any($2) and r.credits_loaded
       ${skip ? "and not (c.recording_id = any($3))" : ""}`,
    skip ? [id, PERFORMER_TYPES, skip] : [id, PERFORMER_TYPES],
  );
}

const readOwn = (id: string) => rows<Own>(
  `select c.recording_id, c.instruments, c.artist_id from credits c where c.artist_id = $1 and c.rel_type = any($2)`,
  [id, PERFORMER_TYPES]);

async function build(player: Player): Promise<Snapshot> {
  const id = player.id;
  const [counts] = await rows<{ total: number; loaded: number; indexed: boolean }>(
    `select count(distinct c.recording_id)::int as total,
            count(distinct c.recording_id) filter (where r.credits_loaded)::int as loaded,
            (select indexed_at is not null from artists where id = $1) as indexed
     from credits c join recordings r on r.id = c.recording_id
     where c.artist_id = $1 and c.rel_type = any($2)`,
    [id, PERFORMER_TYPES],
  );
  const again = refreshing(id);
  const done = !!counts.indexed && counts.loaded >= counts.total && again === null;

  let credits: CreditRow[];
  let own: Own[];
  const was = live.get(id);
  if (done) {
    credits = await readCredits(id);
    own = await readOwn(id);
    live.delete(id);
  } else {
    const l: Live = was ?? { credits: [], seen: new Set(), own: [], ownFor: -1, at: 0 };
    const fresh = await readCredits(id, l.seen.size ? [...l.seen] : undefined);
    for (const row of fresh) { l.credits.push(row); l.seen.add(row.recording_id); }
    // The player's own credits only change when their recording list does.
    if (l.ownFor !== counts.total) { l.own = await readOwn(id); l.ownFor = counts.total; }
    l.at = Date.now();
    live.set(id, l);
    ({ credits, own } = l);
  }

  const snap: Snapshot = {
    player,
    instruments: ownInstruments(id, own),
    progress: {
      recordingsTotal: counts.total,
      recordingsLoaded: counts.loaded,
      done,
      ...(again !== null && { refreshing: again }),
    },
    collaborators: aggregate(id, credits),
  };
  if (done) finished.set(id, { snap, bytes: JSON.stringify(snap).length });
  return snap;
}

/** The galaxy as it stands. Cheap when it's finished, or when only a little has changed. */
export function galaxy(player: Player): Promise<Snapshot> {
  const kept = finished.get(player.id);
  if (kept) return Promise.resolve({ ...kept.snap, player });
  for (const [id, l] of live) if (Date.now() - l.at > LIVE_IDLE_MS) live.delete(id);
  let p = building.get(player.id);
  if (!p) {
    p = build(player).finally(() => building.delete(player.id));
    building.set(player.id, p);
  }
  return p;
}

/** Forget what we have for a player: they're being re-read from MusicBrainz. */
export function forgetGalaxy(id: string) {
  finished.delete(id);
  live.delete(id);
}

/** The same galaxy built from scratch, for checking the incremental one. Not cached. */
export async function galaxyFromScratch(player: Player): Promise<Snapshot> {
  const credits = await readCredits(player.id);
  const own = await readOwn(player.id);
  return { player, instruments: ownInstruments(player.id, own), progress: { recordingsTotal: 0, recordingsLoaded: 0, done: false },
    collaborators: aggregate(player.id, credits) };
}
