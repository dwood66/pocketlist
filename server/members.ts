// A band's members, from MusicBrainz's "member of band" relationships. A band's own page is
// nearly empty, because MusicBrainz credits the people on each track rather than the band, so
// the page offers its members instead: one click from "Weather Report" to Jaco Pastorius.

import type { BandMember } from "../contract/index.ts";
import type { MbArtist } from "./mb.ts";

// Kinds of artist that have members. Everything else (Person, Character…) is treated as a person.
export const BAND_TYPES = new Set(["Group", "Orchestra", "Choir"]);

const year = (d?: string | null) => (d ? d.slice(0, 4) : "");

/** The members, one entry per person (several stints are merged), founders first, then by
 *  when they joined. Members with no dates go last, alphabetically. */
export function bandMembers(a: MbArtist): BandMember[] {
  const by = new Map<string, { m: BandMember; from: string; to: string; open: boolean }>();
  for (const r of a.relations ?? []) {
    if (r.type !== "member of band" || r.direction !== "backward" || !r.artist) continue;
    const attrs = r.attributes ?? [];
    const original = attrs.includes("original");
    const instruments = attrs.filter((x) => x !== "original" && x !== "founder" && x !== "additional");
    const from = year(r.begin), to = year(r.end);
    const e = by.get(r.artist.id);
    if (!e) {
      by.set(r.artist.id, { m: { id: r.artist.id, name: r.artist.name, instruments, original }, from, to, open: !!from && !to });
      continue;
    }
    e.m.original ||= original;
    for (const i of instruments) if (!e.m.instruments.includes(i)) e.m.instruments.push(i);
    if (from && (!e.from || from < e.from)) e.from = from;
    if (to > e.to) e.to = to;
    if (from && !to) e.open = true;
  }
  // A member with no leaving date was there until the end, if the band has ended.
  const ended = year(a["life-span"]?.end);
  return [...by.values()]
    .map((e) => (e.open && ended ? { ...e, to: ended > e.to ? ended : e.to, open: false } : e))
    .map(({ m, from, to, open }) => ({ ...m, ...(from && { years: open || !to ? `${from}–` : from === to ? from : `${from}–${to}` }), from }))
    .sort((x, y) => Number(y.original) - Number(x.original) || (x.from || "9999").localeCompare(y.from || "9999") || x.name.localeCompare(y.name))
    .map(({ from: _from, ...m }) => m);
}
