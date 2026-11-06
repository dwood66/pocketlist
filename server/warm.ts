// Pre-load players into the cache, so the first visit to a famous name is instant.
// MusicBrainz allows about one request a second, so a prolific player takes 20–30 minutes;
// run this overnight.
//
//   npm run dev:warm                → the app as usual, warming the starter set in the background
//   npm run warm                    → warm only (dev server stopped: the local database
//   npm run warm -- <mbid> <mbid>     takes one process at a time)
//
// Whoever is using the app still goes first: a player someone is looking at outranks the
// warm-up, which resumes afterwards.

import { jobError, watch } from "./crawler.ts";
import { rows } from "./db.ts";
import { PERFORMER_TYPES } from "./ingest.ts";
import { requestCount } from "./mb.ts";
import { pathToFileURL } from "node:url";

// IDs checked against MusicBrainz search on 2026-11-06.
const STARTER: Record<string, string> = {
  "Paul Chambers (US jazz bassist)": "b6ff4fd0-03ae-41a6-942e-7de13124b970",
  "Ron Carter (US jazz double-bassist)": "57db3f59-9c58-4f68-a00e-e044666c4828",
  "Elvin Jones (jazz drummer)": "d5ac66e4-ea5d-4ebb-9e0d-bed4063208e7",
  "Bill Evans (pianist)": "8247a3f2-3a8e-4256-b322-6c57b03a4e36",
  "Wally Kane (US woodwind player)": "c25346e6-1ec6-41a9-bfd0-4efef8f93799",
};

export const STARTER_IDS = Object.values(STARTER);

async function progress(id: string) {
  const [r] = await rows<{ total: number; loaded: number }>(
    `select count(distinct c.recording_id)::int as total,
            count(distinct c.recording_id) filter (where r.credits_loaded)::int as loaded
     from credits c join recordings r on r.id = c.recording_id
     where c.artist_id = $1 and c.rel_type = any($2)`, [id, PERFORMER_TYPES]);
  return r;
}

export async function warm(ids: string[]) {
  for (const id of ids) {
    const started = Date.now();
    await new Promise<void>((resolve) => {
      let last = 0;
      const stop = watch(id, async () => {
        const p = await progress(id);
        if (Date.now() - last > 60_000) {
          last = Date.now();
          console.log(`warm ${id}: ${p.loaded}/${p.total} recordings, ${requestCount} requests so far`);
        }
        const err = jobError(id);
        if (err) console.error(`warm ${id}: stopped: ${err}`);
        if (err || (p.total > 0 && p.loaded >= p.total)) { stop(); resolve(); }
      });
    });
    console.log(`warm ${id}: done in ${Math.round((Date.now() - started) / 60000)} min`);
  }
  console.log("warm: all done");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  await warm(args.length ? args : STARTER_IDS);
  process.exit(0);
}
