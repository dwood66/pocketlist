import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlaylist, type SeedCreditRow } from "./playlist.ts";

const RON = "ron", HERBIE = "herbie", TONY = "tony";

// One credit row; `rec` is the recording id, and the session comes from `date`.
const credit = (rec: string, title: string, artist: string, date: string | null, instruments: string[], album = "LP") =>
  ({ recording_id: rec, title, first_release_date: date, rg_id: `rg-${album}`, album, artist_id: artist, instruments, date }) satisfies SeedCreditRow;

const both = (rec: string, title: string, date: string | null, album?: string) => [
  credit(rec, title, RON, date, ["double bass"], album),
  credit(rec, title, HERBIE, date, ["piano"], album),
];

test("only songs every seed played on", () => {
  const rows = [...both("r1", "Joshua", "1963-05-14"), credit("r2", "Solo", RON, "1963-05-14", ["bass"])];
  const { tracks } = samplePlaylist(rows, [RON, HERBIE], 10);
  assert.deepEqual(tracks.map((t) => t.title), ["Joshua"]);
  assert.deepEqual(tracks[0].instruments, { ron: ["double bass"], herbie: ["piano"] });
});

test("one song per session before any second helping", () => {
  const rows = [
    ...both("a1", "Joshua", "1963-05-14"), ...both("a2", "Seven Steps", "1963-05-14"), ...both("a3", "So Near", "1963-05-14"),
    ...both("b1", "Maiden Voyage", "1965-03-17"),
  ];
  const { tracks, sessions, performances } = samplePlaylist(rows, [RON, HERBIE], 2);
  assert.equal(sessions, 2);
  assert.equal(performances, 4);
  assert.deepEqual(tracks.map((t) => t.date), ["1963-05-14", "1965-03-17"]);
});

test("duplicates and alternate takes collapse; no tune twice while there's something new", () => {
  const rows = [
    ...both("a1", "So What", "1964-02-12"), ...both("a2", "So What (alternate take)", "1964-02-12"),
    ...both("b1", "So What", "1964-07-14"), ...both("c1", "All Blues", "1964-07-26"),
  ];
  const titles = samplePlaylist(rows, [RON, HERBIE], 2).tracks.map((t) => t.title);
  assert.equal(titles.length, 2);
  assert.equal(new Set(titles.map((t) => t.replace(/ \(.*\)/, ""))).size, 2);
});

test("three seeds: all three must be on it", () => {
  const rows = [...both("r1", "Footprints", "1966-10-24"), credit("r1", "Footprints", TONY, "1966-10-24", ["drums"]),
    ...both("r2", "Eye of the Hurricane", "1965-03-17")];
  assert.deepEqual(samplePlaylist(rows, [RON, HERBIE, TONY], 10).tracks.map((t) => t.title), ["Footprints"]);
});

test("spread across the years, deterministic, and mix gives another", () => {
  const rows = Array.from({ length: 40 }, (_, i) => both(`r${i}`, `Tune ${i}`, `${1960 + i}-01-01`)).flat();
  const a = samplePlaylist(rows, [RON, HERBIE], 4).tracks.map((t) => t.year);
  assert.deepEqual(a, samplePlaylist(rows, [RON, HERBIE], 4).tracks.map((t) => t.year));
  assert.ok(a[3]! - a[0]! >= 25, `spread was ${a}`);
  assert.notDeepEqual(a, samplePlaylist(rows, [RON, HERBIE], 4, 1).tracks.map((t) => t.year));
});

test("the plain title wins over an alternate take of the same tune", () => {
  const rows = [...both("alt", "Oliloqui Valley (alternate take)", "1964-06-17"), ...both("master", "Oliloqui Valley", "1964-06-17")];
  assert.deepEqual(samplePlaylist(rows, [RON, HERBIE], 10).tracks.map((t) => [t.title, t.recordingId]), [["Oliloqui Valley", "master"]]);
});
