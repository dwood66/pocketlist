// Writes MusicBrainz responses into the cache.

import { db, type Tx as Transaction } from "./db.ts";
import type { MbArtist, MbRecording, MbRelation, MbRelease } from "./mb.ts";

/** Relationship types that mean "played or sang on this recording". */
export const PERFORMER_TYPES = ["instrument", "vocal", "performer", "performing orchestra"];

// Attributes MusicBrainz puts alongside instruments that aren't instruments.
const NOT_INSTRUMENTS = new Set(["additional", "guest", "solo", "minor", "task"]);

function instrumentsOf(rel: MbRelation): string[] {
  const attrs = (rel.attributes ?? []).filter((a) => !NOT_INSTRUMENTS.has(a));
  if (attrs.length) return [...new Set(attrs)].sort();
  if (rel.type === "vocal") return ["vocals"];
  return [];
}

type Credit = [recordingId: string, artistId: string, name: string, disambiguation: string | null, relType: string, instruments: string[], date: string | null];

function credit(recordingId: string, rel: MbRelation, artist: { id: string; name: string; disambiguation?: string }): Credit {
  return [recordingId, artist.id, artist.name, artist.disambiguation || null, rel.type, instrumentsOf(rel), rel.begin || null];
}

// Many rows per statement: against a hosted database each statement is a network round trip,
// and an album or a busy session player's recording list can mean hundreds of rows. Chunked
// to stay well inside Postgres's limit on parameters per statement.
const CHUNK = 500;
async function insertMany(tx: Transaction, head: string, rows: unknown[][], tail: string) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const params: unknown[] = [];
    const values = rows.slice(i, i + CHUNK).map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(",")})`);
    await tx.query(`${head} values ${values.join(",")} ${tail}`, params);
  }
}

// An upsert that updates can't touch the same row twice in one statement, so drop repeats first.
const uniqueBy = <T>(rows: T[], key: (r: T) => string) => [...new Map(rows.map((r) => [key(r), r])).values()];

const insertCredits = (tx: Transaction, credits: Credit[]) =>
  insertMany(tx, `insert into credits (recording_id, artist_id, artist_name, artist_disambiguation, rel_type, instruments, date)`,
    credits, `on conflict do nothing`);

/** An artist's own recording list: which recordings they're credited on, and as what. */
export async function ingestArtistIndex(artist: MbArtist) {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into artists (id, name, disambiguation, type, indexed_at) values ($1,$2,$3,$4, now())
       on conflict (id) do update set name = excluded.name, disambiguation = excluded.disambiguation,
       type = excluded.type, indexed_at = now()`,
      [artist.id, artist.name, artist.disambiguation || null, artist.type ?? null],
    );
    const rels = (artist.relations ?? []).filter((rel) => rel["target-type"] === "recording" && rel.recording);
    await insertMany(tx, `insert into recordings (id, title)`,
      uniqueBy(rels, (rel) => rel.recording!.id).map((rel) => [rel.recording!.id, rel.recording!.title]), `on conflict do nothing`);
    await insertCredits(tx, rels.map((rel) => credit(rel.recording!.id, rel, artist)));
  });
}

/** Store an artist we only know by name so far (from a search or a credit). */
export async function rememberArtist(a: { id: string; name: string; disambiguation?: string; type?: string | null }) {
  await db.query(
    `insert into artists (id, name, disambiguation, type) values ($1,$2,$3,$4) on conflict (id) do nothing`,
    [a.id, a.name, a.disambiguation || null, a.type ?? null],
  );
}

/** Recordings' full personnel. Replaces whatever partial credits we had for them. */
async function replaceRecordings(tx: Transaction, recs: MbRecording[]) {
  const unique = uniqueBy(recs, (r) => r.id);
  if (!unique.length) return;
  await insertMany(tx, `insert into recordings (id, title, first_release_date, credits_loaded)`,
    unique.map((r) => [r.id, r.title, r["first-release-date"] || null, true]),
    `on conflict (id) do update set title = excluded.title,
       first_release_date = coalesce(excluded.first_release_date, recordings.first_release_date),
       credits_loaded = true`);
  await tx.query(`delete from credits where recording_id = any($1)`, [unique.map((r) => r.id)]);
  await insertCredits(tx, unique.flatMap((r) => (r.relations ?? [])
    .filter((rel) => rel["target-type"] === "artist" && rel.artist)
    .map((rel) => credit(r.id, rel, rel.artist!))));
}

async function upsertReleases(tx: Transaction, releases: MbRelease[], fetched: boolean) {
  await insertMany(tx, `insert into releases (id, title, date, status, rg_id, rg_title, rg_primary, rg_secondary, fetched)`,
    uniqueBy(releases, (r) => r.id).map((r) => {
      const rg = r["release-group"];
      return [r.id, r.title, r.date || null, r.status ?? null, rg?.id ?? null, rg?.title ?? null,
        rg?.["primary-type"] ?? null, rg?.["secondary-types"] ?? [], fetched];
    }),
    `on conflict (id) do update set fetched = releases.fetched or excluded.fetched`);
}

/** One recording, looked up on its own: its personnel plus every release it appears on. */
export async function ingestRecording(rec: MbRecording) {
  await db.transaction(async (tx) => {
    await replaceRecordings(tx, [rec]);
    const releases = rec.releases ?? [];
    await upsertReleases(tx, releases, false);
    await insertMany(tx, `insert into recording_releases (recording_id, release_id)`,
      releases.map((r) => [rec.id, r.id]), `on conflict do nothing`);
  });
}

/** A whole release: every track's personnel in one go. */
export async function ingestRelease(release: MbRelease) {
  await db.transaction(async (tx) => {
    await upsertReleases(tx, [release], true);
    const recs = (release.media ?? []).flatMap((m) => (m.tracks ?? []).map((t) => t.recording));
    await replaceRecordings(tx, recs);
    await insertMany(tx, `insert into recording_releases (recording_id, release_id)`,
      recs.map((r) => [r.id, release.id]), `on conflict do nothing`);
  });
}

/** Mark a recording as read even though MusicBrainz no longer has it (merged or deleted). */
export async function skipRecording(id: string) {
  await db.query(`update recordings set credits_loaded = true where id = $1`, [id]);
}
