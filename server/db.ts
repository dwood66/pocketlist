// The cache. Every MusicBrainz response we use is stored here, so a player's second
// visit costs no requests at all.
//
// Two backends, one interface, the same SQL:
//   - DATABASE_URL set (deployed): a hosted Postgres such as Neon, through node-postgres.
//   - otherwise (local): PGlite, real Postgres compiled to WebAssembly, kept in ./.data,
//     with nothing to install.

import { mkdirSync } from "node:fs";

export type Tx = { query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
export type Db = Tx & {
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
};

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    const query = async <T,>(sql: string, params: unknown[] = []) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    };
    return {
      query,
      exec: (sql) => pool.query(sql),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const out = await fn({
            query: async <T,>(sql: string, params: unknown[] = []) => ({ rows: (await client.query(sql, params)).rows as T[] }),
          });
          await client.query("commit");
          return out;
        } catch (e) {
          await client.query("rollback").catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.POCKETLIST_DATA ?? "./.data/pglite";
  mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir);
  return {
    query: <T,>(sql: string, params: unknown[] = []) => lite.query<T>(sql, params),
    exec: (sql) => lite.exec(sql),
    transaction: (fn) => lite.transaction((tx) => fn({ query: <T,>(sql: string, params: unknown[] = []) => tx.query<T>(sql, params) })),
  };
}

export const db = await connect();

export const SCHEMA = `
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
`;

await db.exec(SCHEMA);

export async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
