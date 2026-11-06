// Copy the local cache (PGlite in ./.data) into a hosted Postgres, so the deployed site
// starts with everything already read.
//
//   DATABASE_URL='postgres://…' npm run copy-to-postgres
//
// Stop the local server first: PGlite's files take one process at a time. Safe to re-run;
// rows already on the target are left alone.

import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL to the target database.");

// db.ts creates the schema on whatever DATABASE_URL points at.
await import("./db.ts");

const source = new PGlite(process.env.POCKETLIST_DATA ?? "./.data/pglite");
const target = new pg.Pool({ connectionString: url, max: 2 });

const TABLES: { name: string; cols: string[] }[] = [
  { name: "artists", cols: ["id", "name", "disambiguation", "type", "indexed_at"] },
  { name: "recordings", cols: ["id", "title", "first_release_date", "credits_loaded"] },
  { name: "releases", cols: ["id", "title", "date", "status", "rg_id", "rg_title", "rg_primary", "rg_secondary", "fetched"] },
  { name: "recording_releases", cols: ["recording_id", "release_id"] },
  { name: "credits", cols: ["recording_id", "artist_id", "artist_name", "artist_disambiguation", "rel_type", "instruments", "date"] },
];
const BATCH = 500;

for (const t of TABLES) {
  const { rows } = await source.query<Record<string, unknown>>(`select ${t.cols.join(", ")} from ${t.name}`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const params: unknown[] = [];
    const values = rows.slice(i, i + BATCH).map((r) =>
      `(${t.cols.map((c) => { params.push(r[c]); return `$${params.length}`; }).join(", ")})`);
    await target.query(`insert into ${t.name} (${t.cols.join(", ")}) values ${values.join(", ")} on conflict do nothing`, params);
  }
  console.log(`${t.name}: ${rows.length.toLocaleString()} rows`);
}
await target.end();
await source.close();
process.exit(0);
