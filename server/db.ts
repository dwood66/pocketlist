// The cache. Every MusicBrainz response we use is stored here, so a player's second
// visit costs no requests at all.
//
// Locally this is PGlite: real Postgres compiled to WebAssembly, kept in ./.data, with
// nothing to install. The SQL is plain Postgres, so the deployed version can point the
// same queries at a hosted database (Neon or Supabase).

import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";

const DIR = process.env.POCKETLIST_DATA ?? "./.data/pglite";
mkdirSync(DIR, { recursive: true });
export const db = new PGlite(DIR);

await db.exec(`
  create table if not exists artists (
    id text primary key,
    name text not null,
    disambiguation text,
    type text,
    -- set once the artist's own recording list has been read
    indexed_at timestamptz
  );

  create table if not exists recordings (
    id text primary key,
    title text not null,
    first_release_date text,
    -- true once the recording's full personnel has been read
    credits_loaded boolean not null default false
  );

  -- One row per credited role on a recording.
  create table if not exists credits (
    recording_id text not null references recordings(id),
    artist_id text not null,
    artist_name text not null,
    artist_disambiguation text,
    rel_type text not null,
    instruments text[] not null default '{}',
    date text,
    primary key (recording_id, artist_id, rel_type, instruments)
  );
  create index if not exists credits_artist on credits(artist_id);

  create table if not exists releases (
    id text primary key,
    title text not null,
    date text,
    status text,
    rg_id text,
    rg_title text,
    rg_primary text,
    rg_secondary text[] not null default '{}',
    -- true once the whole release, with every track's personnel, has been read
    fetched boolean not null default false
  );

  create table if not exists recording_releases (
    recording_id text not null,
    release_id text not null,
    primary key (recording_id, release_id)
  );
  create index if not exists recording_releases_release on recording_releases(release_id);
`);

export async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
