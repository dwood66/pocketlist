// Turns raw credits into a collaborator list. Pure: no database, no network, so the rules
// that decide the counts can be tested directly (see aggregate.test.ts).

import type { Collaborator } from "../contract/index.ts";

/** One credit on a recording the player is on. */
export type CreditRow = {
  recording_id: string;
  title: string;
  first_release_date: string | null;
  /** Release group of the earliest known release with this recording. */
  rg_id: string | null;
  artist_id: string;
  artist_name: string;
  artist_disambiguation: string | null;
  instruments: string[];
  date: string | null;
};

const yearOf = (d?: string | null) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined);

/** Case, punctuation and "(take 2)"-style suffixes don't make a different tune. */
export function normalizeTitle(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\((alternate|alt\.?|take|master|version|mono|stereo|remaster)[^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type RecordingInfo = { sessionKey: string; dedupeKey: string; year?: number };

/**
 * Where a recording "happened". A session date if any credit on it carries one; otherwise
 * the album (release group) it first came out on; otherwise the recording itself.
 */
function describeRecordings(rows: CreditRow[], playerId: string): Map<string, RecordingInfo> {
  const byRec = new Map<string, CreditRow[]>();
  for (const r of rows) {
    const list = byRec.get(r.recording_id) ?? [];
    list.push(r);
    byRec.set(r.recording_id, list);
  }
  const out = new Map<string, RecordingInfo>();
  for (const [id, credits] of byRec) {
    const own = credits.find((c) => c.artist_id === playerId && c.date)?.date;
    const date = own ?? credits.map((c) => c.date).filter((d): d is string => !!d).sort()[0];
    const first = credits[0];
    const sessionKey = date ? `d:${date}` : first.rg_id ? `g:${first.rg_id}` : `r:${id}`;
    out.set(id, {
      sessionKey,
      // Two recordings of the same tune in the same session are one performance listed
      // twice (MusicBrainz has unmerged duplicates). Alternate takes collapse here too.
      dedupeKey: `${normalizeTitle(first.title)}|${sessionKey}`,
      year: yearOf(date) ?? yearOf(first.first_release_date),
    });
  }
  return out;
}

export function aggregate(playerId: string, rows: CreditRow[]): Collaborator[] {
  const recs = describeRecordings(rows, playerId);
  type Acc = {
    name: string; disambiguation?: string;
    performances: Set<string>; sessions: Set<string>;
    instruments: Map<string, number>; years: number[];
  };
  const acc = new Map<string, Acc>();

  for (const r of rows) {
    if (r.artist_id === playerId) continue;
    if (/^\[.*\]$/.test(r.artist_name)) continue; // MusicBrainz placeholders like [unknown] aren't people
    const info = recs.get(r.recording_id)!;
    let a = acc.get(r.artist_id);
    if (!a) {
      a = { name: r.artist_name, disambiguation: r.artist_disambiguation ?? undefined,
        performances: new Set(), sessions: new Set(), instruments: new Map(), years: [] };
      acc.set(r.artist_id, a);
    }
    const isNewPerformance = !a.performances.has(info.dedupeKey);
    a.performances.add(info.dedupeKey);
    a.sessions.add(info.sessionKey);
    if (isNewPerformance) {
      for (const i of r.instruments) a.instruments.set(i, (a.instruments.get(i) ?? 0) + 1);
      if (info.year) a.years.push(info.year);
    }
  }

  return [...acc.entries()]
    .map(([id, a]): Collaborator => ({
      id,
      name: a.name,
      disambiguation: a.disambiguation,
      sharedRecordings: a.performances.size,
      sharedSessions: a.sessions.size,
      instruments: [...a.instruments.entries()].sort((x, y) => y[1] - x[1]).map(([i]) => i),
      firstYear: a.years.length ? Math.min(...a.years) : undefined,
      lastYear: a.years.length ? Math.max(...a.years) : undefined,
    }))
    .sort((x, y) => y.sharedSessions - x.sharedSessions || y.sharedRecordings - x.sharedRecordings || x.name.localeCompare(y.name));
}

/** The player's own instruments, most frequent first. */
export function ownInstruments(playerId: string, rows: Pick<CreditRow, "artist_id" | "recording_id" | "instruments">[]): string[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.artist_id !== playerId || seen.has(r.recording_id + r.instruments.join())) continue;
    seen.add(r.recording_id + r.instruments.join());
    for (const i of r.instruments) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i);
}
