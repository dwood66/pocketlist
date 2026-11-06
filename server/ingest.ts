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

async function insertCredit(tx: Transaction, recordingId: string, rel: MbRelation, artist: { id: string; name: string; disambiguation?: string }) {
  await tx.query(
    `insert into credits (recording_id, artist_id, artist_name, artist_disambiguation, rel_type, instruments, date)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
    [recordingId, artist.id, artist.name, artist.disambiguation || null, rel.type, instrumentsOf(rel), rel.begin || null],
  );
}

/** An artist's own recording list: which recordings they're credited on, and as what. */
export async function ingestArtistIndex(artist: MbArtist) {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into artists (id, name, disambiguation, type, indexed_at) values ($1,$2,$3,$4, now())
       on conflict (id) do update set name = excluded.name, disambiguation = excluded.disambiguation,
       type = excluded.type, indexed_at = now()`,
      [artist.id, artist.name, artist.disambiguation || null, artist.type ?? null],
    );
    for (const rel of artist.relations ?? []) {
      if (rel["target-type"] !== "recording" || !rel.recording) continue;
      await tx.query(`insert into recordings (id, title) values ($1,$2) on conflict do nothing`, [rel.recording.id, rel.recording.title]);
      await insertCredit(tx, rel.recording.id, rel, artist);
    }
  });
}

/** Store an artist we only know by name so far (from a search or a credit). */
export async function rememberArtist(a: { id: string; name: string; disambiguation?: string; type?: string | null }) {
  await db.query(
    `insert into artists (id, name, disambiguation, type) values ($1,$2,$3,$4) on conflict (id) do nothing`,
    [a.id, a.name, a.disambiguation || null, a.type ?? null],
  );
}

/** A recording's full personnel. Replaces whatever partial credits we had for it. */
async function replaceRecording(tx: Transaction, rec: MbRecording) {
  await tx.query(
    `insert into recordings (id, title, first_release_date, credits_loaded) values ($1,$2,$3,true)
     on conflict (id) do update set title = excluded.title,
       first_release_date = coalesce(excluded.first_release_date, recordings.first_release_date),
       credits_loaded = true`,
    [rec.id, rec.title, rec["first-release-date"] || null],
  );
  await tx.query(`delete from credits where recording_id = $1`, [rec.id]);
  for (const rel of rec.relations ?? []) {
    if (rel["target-type"] !== "artist" || !rel.artist) continue;
    await insertCredit(tx, rec.id, rel, rel.artist);
  }
}

async function upsertRelease(tx: Transaction, r: MbRelease, fetched: boolean) {
  const rg = r["release-group"];
  await tx.query(
    `insert into releases (id, title, date, status, rg_id, rg_title, rg_primary, rg_secondary, fetched)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (id) do update set fetched = releases.fetched or excluded.fetched`,
    [r.id, r.title, r.date || null, r.status ?? null, rg?.id ?? null, rg?.title ?? null,
      rg?.["primary-type"] ?? null, rg?.["secondary-types"] ?? [], fetched],
  );
}

/** One recording, looked up on its own: its personnel plus every release it appears on. */
export async function ingestRecording(rec: MbRecording) {
  await db.transaction(async (tx) => {
    await replaceRecording(tx, rec);
    for (const r of rec.releases ?? []) {
      await upsertRelease(tx, r, false);
      await tx.query(`insert into recording_releases values ($1,$2) on conflict do nothing`, [rec.id, r.id]);
    }
  });
}

/** A whole release: every track's personnel in one go. */
export async function ingestRelease(release: MbRelease) {
  await db.transaction(async (tx) => {
    await upsertRelease(tx, release, true);
    for (const medium of release.media ?? []) {
      for (const track of medium.tracks ?? []) {
        await replaceRecording(tx, track.recording);
        await tx.query(`insert into recording_releases values ($1,$2) on conflict do nothing`, [track.recording.id, release.id]);
      }
    }
  });
}

/** Mark a recording as read even though MusicBrainz no longer has it (merged or deleted). */
export async function skipRecording(id: string) {
  await db.query(`update recordings set credits_loaded = true where id = $1`, [id]);
}
