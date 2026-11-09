// The rules for matching a recording to a song in Apple's catalogue. Pure, so they can be
// tested without a database or the network; apple.ts does the searching and storing.

import { normalizeTitle } from "./aggregate.ts";

export type AppleTrack = { trackName: string; artistName: string; collectionName?: string; trackTimeMillis?: number; trackViewUrl?: string };
export type Wanted = { id: string; title: string; artist: string | null; album: string | null; length: number | null };

/** Within 3 seconds, or 1.5% for long tracks (some reissues are remastered at a hair's different speed). */
export const closeEnough = (a: number, b: number) => Math.abs(a - b) <= Math.max(3000, b * 0.015);

export const bare = (t: string) => normalizeTitle(t.replace(/\s*[[(][^)\]]*[)\]]/g, "")).trim();

/** The best result for a recording, or null. Pure, so the rules can be tested. */
export function pickMatch(want: Pick<Wanted, "title" | "artist" | "album" | "length">, results: AppleTrack[]): { url: string; ms: number } | null {
  if (!want.length) return null;
  const title = bare(want.title);
  const artist = (want.artist ?? "").toLowerCase();
  const album = bare(want.album ?? "");
  const scored = results
    .filter((r) => r.trackViewUrl && r.trackTimeMillis && bare(r.trackName) === title && closeEnough(r.trackTimeMillis, want.length!))
    .map((r) => ({
      r,
      score: Math.abs(r.trackTimeMillis! - want.length!) / 1000
        - (artist && r.artistName.toLowerCase().includes(artist.split(/[ &,]/)[0]) ? 5 : 0)
        - (album && bare(r.collectionName ?? "") === album ? 3 : 0),
    }))
    .sort((a, b) => a.score - b.score);
  const best = scored[0]?.r;
  return best ? { url: best.trackViewUrl!.replace(/[?&]uo=\d+/, ""), ms: best.trackTimeMillis! } : null;
}

