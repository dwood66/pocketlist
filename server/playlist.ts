// Sampler playlists: "10 songs with Ron Carter and Herbie Hancock on them". Pure, like
// aggregate.ts, so the picking rules can be tested without a database.
//
// The rules, in order:
//   1. A song qualifies only if every seed player is credited as a performer on it.
//   2. Duplicates collapse the same way the counts do: one performance per tune per session.
//   3. Spread out: at most one song per session until every session has given one, and the
//      sessions chosen are spaced across the years, so it isn't ten takes from one album.
//   4. No tune twice: a second "So What" waits until there's nothing new left.
//   5. Deterministic: the same seeds give the same list; `mix` asks for a different one.

import type { PlaylistTrack } from "../contract/index.ts";
import { normalizeTitle } from "./aggregate.ts";

/** A seed player's credit on a recording, with what we know about where it came out. */
export type SeedCreditRow = {
  recording_id: string;
  title: string;
  first_release_date: string | null;
  rg_id: string | null;
  album: string | null;
  artist_id: string;
  instruments: string[];
  date: string | null;
};

const yearOf = (d?: string | null) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : undefined);

type Perf = PlaylistTrack & { tune: string; when: string };
const TAKE = /\((alternate|alt\b|take|rehearsal|outtake|incomplete|false start|breakdown)/i;

export function samplePlaylist(rows: SeedCreditRow[], seeds: string[], n: number, mix = 0) {
  // 1. Every seed on it.
  const byRec = new Map<string, SeedCreditRow[]>();
  for (const r of rows) byRec.set(r.recording_id, [...(byRec.get(r.recording_id) ?? []), r]);

  // 2. One performance per tune per session.
  const sessions = new Map<string, Map<string, Perf>>();
  for (const [id, credits] of byRec) {
    if (!seeds.every((s) => credits.some((c) => c.artist_id === s))) continue;
    const first = credits[0];
    const date = credits.map((c) => c.date).filter((d): d is string => !!d).sort()[0];
    const session = date ? `d:${date}` : first.rg_id ? `g:${first.rg_id}` : `r:${id}`;
    const tune = normalizeTitle(first.title);
    const instruments: Record<string, string[]> = {};
    for (const s of seeds) {
      instruments[s] = [...new Set(credits.filter((c) => c.artist_id === s).flatMap((c) => c.instruments))];
    }
    const perfs = sessions.get(session) ?? new Map<string, Perf>();
    const existing = perfs.get(tune);
    if (existing) {
      for (const s of seeds) existing.instruments[s] = [...new Set([...existing.instruments[s], ...instruments[s]])];
      // Prefer the plain title ("Oliloqui Valley") over a take ("Oliloqui Valley (alternate take)").
      if (/\(/.test(existing.title) && !/\(/.test(first.title)) Object.assign(existing, { title: first.title, recordingId: id });
      continue;
    }
    const year = yearOf(date) ?? yearOf(first.first_release_date);
    perfs.set(tune, {
      recordingId: id, title: first.title, album: first.album ?? undefined, date: date ?? undefined, year,
      instruments, tune, when: date ?? (year ? String(year) : "9999"),
    });
    sessions.set(session, perfs);
  }

  // 3. Sessions in time order; pick n of them spaced evenly, then the rest as a fallback.
  const ordered = [...sessions.values()]
    // Finished versions before takes and rehearsals, then alphabetical.
    .map((perfs) => [...perfs.values()].sort((a, b) => Number(/\(/.test(a.title)) - Number(/\(/.test(b.title)) || a.title.localeCompare(b.title)))
    .sort((a, b) => a[0].when.localeCompare(b[0].when) || a[0].title.localeCompare(b[0].title));
  const step = ordered.length / Math.max(1, n);
  const offset = step > 1 ? ((mix * 0.618034) % 1) * step : 0;
  const chosen = new Set<number>();
  for (let i = 0; i < n && i < ordered.length; i++) chosen.add(Math.min(ordered.length - 1, Math.floor(offset + i * step)));
  const order = [...chosen, ...ordered.keys()].filter((v, i, all) => all.indexOf(v) === i);

  // 4. Passes: one song per session per pass, skipping tunes already used. Finished versions
  //    first; takes and rehearsals only if there's still room after that.
  const picked: Perf[] = [];
  const tunes = new Set<string>();
  for (const takesToo of [false, true]) {
    for (let pass = 0; picked.length < n; pass++) {
      let progress = false;
      for (const i of order) {
        if (picked.length >= n) break;
        const perfs = ordered[i];
        if (pass >= perfs.length) continue;
        progress = true;
        // Rotate within a session by `mix`, so another mix can also mean other tunes.
        const fresh = perfs.map((_, k) => perfs[(k + pass + mix) % perfs.length])
          .find((p) => !tunes.has(p.tune) && !picked.includes(p) && (takesToo || !TAKE.test(p.title)));
        if (!fresh) continue;
        picked.push(fresh);
        tunes.add(fresh.tune);
      }
      if (!progress) break;
    }
  }

  const tracks: PlaylistTrack[] = picked
    .sort((a, b) => a.when.localeCompare(b.when) || a.title.localeCompare(b.title))
    .map(({ tune: _t, when: _w, ...t }) => t);
  return {
    performances: ordered.reduce((sum, perfs) => sum + perfs.length, 0),
    sessions: ordered.length,
    tracks,
  };
}
