// Pre-load players into the cache, so the first visit to a famous name is instant.
// MusicBrainz allows about one request a second, so a prolific player takes an hour or two and
// the whole list takes days. On the live server it runs in the background (POCKETLIST_WARM=1),
// only when nobody is waiting on anything else, and picks up where it left off after a restart:
// players already read are skipped in a moment.
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

// The well-connected: session players and bandleaders who sat in on everything, so they're the
// stepping stones for Connect and make most galaxies richer. Hubs first, the biggest catalogues
// last. IDs checked against MusicBrainz search on 2026-11-07 (top match, jazz, by disambiguation
// and tags).
const KEY: Record<string, string> = {
  "Milt Hinton": "4e525f48-6ebf-45fe-8d57-3fd730970725",
  "Hank Jones": "80d610fe-7771-4226-aa9b-950944791698",
  "George Duvivier": "fda81bdf-37b1-47e2-86fe-d639b04f8006",
  "Ray Brown (jazz bassist)": "d8a1a9e8-295d-4999-9c70-0a4c8bdb36e8",
  "Richard Davis (American jazz bassist)": "b59843a1-bb97-45f0-84b9-ff9017878cdd",
  "Osie Johnson": "7c726bbf-8ecc-4ebc-8578-d5ddf535ab44",
  "Kenny Burrell": "a85b66d2-34df-4d5a-8c0d-d585b8a14ce1",
  "Jimmy Cobb": "d0cbf65a-541b-476a-996c-fe2cd264bbd0",
  "Curtis Fuller": "006307bc-af41-4da1-aa11-b35a9c6f0316",
  "Sam Jones (US jazz bassist)": "1789de4d-0f0c-4db9-b850-a823b945c883",
  "Art Blakey": "601e7466-eaf5-4a91-9909-ffd770b7e04a",
  "Max Roach": "0b6aea55-d855-4a33-ae08-b0280dd28684",
  "Roy Haynes": "2c090b57-5e9d-49c5-9b71-6f0a331cc1ca",
  "Tommy Flanagan": "c39a1eeb-e646-43e9-b984-4ffdc92b0241",
  "Wynton Kelly": "d3f9352c-18e2-47a0-802c-13d821490e42",
  "Red Garland": "d9399921-2d82-437e-825e-16daff591a0c",
  "Philly Joe Jones": "53717b9b-62ab-4d83-94dd-e559164e10dc",
  "Kenny Clarke": "48eaf8a1-6e44-488c-a91a-736867f1ba50",
  "Percy Heath": "534362cd-66ed-45a8-9cba-b847dbf75b6f",
  "Milt Jackson": "2e38e1de-2890-4620-8467-5b0bb4641cb9",
  "J.J. Johnson (trombonist)": "33e50556-d4be-421b-a5d1-644bd536ec07",
  "Clark Terry": "2a760856-7bf1-4f65-a2d0-225e77085fcc",
  "Thad Jones": "2676ce19-1319-48af-93dd-1b6313c126ca",
  "Frank Wess": "8a271ade-5c59-4223-9b29-cdc2599bcba6",
  "Pepper Adams": "98fb6594-5984-4280-be19-9813bbb016e8",
  "Freddie Hubbard": "59ae7a1a-f454-435b-8a5a-e327e692bb5a",
  "Lee Morgan (jazz trumpeter)": "a1235272-3650-4ed7-9317-5a55a08701ec",
  "Donald Byrd (jazz trumpeter)": "69f95e5c-4b34-4c8b-b8fe-c59f9296195a",
  "Kenny Dorham": "4476453a-d37e-4c52-b60d-07c90b6fa661",
  "Hank Mobley": "026b096e-e024-42ab-82f3-107bddae77c2",
  "Cedar Walton": "115474d3-9d44-4c96-b5d0-00891187c6e8",
  "Billy Higgins (US jazz drummer)": "53019232-166e-4788-8b13-23e60ffced44",
  "Louis Hayes (jazz drummer)": "1e15c55f-e661-4910-9c0c-49a7b77b4d55",
  "Grady Tate": "16af2a0a-578e-44f4-b109-7e2fb4b83d6e",
  "Bob Cranshaw": "6bf4f019-5ac1-4b48-80fe-e48823377419",
  "Mel Lewis": "e5a7e88a-9c16-4a6b-829b-7ed30929ab44",
  "Jimmy Garrison": "5af83c93-103f-433b-b759-ea3dca37315e",
  "Tony Williams (American jazz drummer)": "b6a30b58-6b00-47c4-a031-c62a6981461f",
  "Jimmy Heath": "29c8775b-49a7-4c5a-af85-478ff25a56bb",
  "Bobby Hutcherson": "edbe5d7f-9511-4dfe-847a-8fe19080caaf",
  "Joe Henderson (tenor saxophonist)": "bcab8301-c7e5-4689-a4ad-9ee947b4ce37",
  "Horace Silver": "d185d986-ee96-4fd3-bd61-8c848a4765b6",
  "McCoy Tyner": "22fe7b6f-af38-458e-87bd-8971e7a2912e",
  "Herbie Hancock": "27613b78-1b9d-4ec3-9db5-fa0743465fdd",
  "Jack DeJohnette": "f2d13d28-6f74-4dd5-b596-8bd0b6f67615",
  "Dave Holland (British jazz bassist)": "7ea233ad-c340-4f62-8678-dbad528aa58e",
  "Charlie Haden": "1f0cdc02-c8d5-4228-8227-37ec0c289b48",
  "Chick Corea": "8446fcca-109e-4c6d-a2ff-5a269b32b4c2",
  "Charles Mingus": "f3b8e107-abe8-4743-b6a3-4a4ee995e71f",
  "Thelonious Monk": "8e8c7417-c905-46b1-b42a-5260b4274ed4",
  "Sonny Rollins": "3b47247e-5b57-49b6-a0ed-bad80243802a",
  "Dizzy Gillespie": "e9ba8ccb-505f-4e5c-b909-65998d0d35b5",
  "John Coltrane": "b625448e-bf4a-41c3-a421-72ad46cdb831",
  "Miles Davis": "561d854a-6a28-4aa7-8c99-323e6ce46c2a",
  "Christian McBride": "6035000d-b53b-4b01-b5a0-a7572c34e806",
};

/** Everything worth having read in advance, in order: the starters, then the key players. */
export const WARM_IDS = [...new Set([...STARTER_IDS, ...Object.values(KEY)])];

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
      // Background: anyone actually looking at a player goes first; this resumes after.
      const stop = watch(id, async () => {
        const p = await progress(id);
        if (Date.now() - last > 60_000) {
          last = Date.now();
          console.log(`warm ${id}: ${p.loaded}/${p.total} recordings, ${requestCount} requests so far`);
        }
        const err = jobError(id);
        if (err) console.error(`warm ${id}: stopped: ${err}`);
        if (err || (p.total > 0 && p.loaded >= p.total)) { stop(); resolve(); }
      }, { background: true });
    });
    console.log(`warm ${id}: done in ${Math.round((Date.now() - started) / 60000)} min`);
  }
  console.log("warm: all done");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  await warm(args.length ? args : WARM_IDS);
  process.exit(0);
}
