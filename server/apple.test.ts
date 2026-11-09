import { test } from "node:test";
import assert from "node:assert/strict";
import { pickMatch, type AppleTrack } from "./apple-match.ts";

// What Apple's search really returns for "So What Miles Davis" (Nov 2026), trimmed.
const SO_WHAT: AppleTrack[] = [
  { trackName: "So What", artistName: "Miles Davis", collectionName: "Kind of Blue (Legacy Edition)", trackTimeMillis: 563_000, trackViewUrl: "https://music.apple.com/us/album/so-what/300865074?i=300865220&uo=4" },
  { trackName: "So What", artistName: "Miles Davis", collectionName: "Kind of Blue", trackTimeMillis: 548_000, trackViewUrl: "https://music.apple.com/us/album/so-what/268443092?i=268443097&uo=4" },
  { trackName: "So What (Studio Sequence 1)", artistName: "Miles Davis", collectionName: "Kind of Blue (Legacy Edition)", trackTimeMillis: 114_000, trackViewUrl: "https://x/1" },
  { trackName: "So What (Live at Kurhaus, Den Haag, Holland - April 1960)", artistName: "Miles Davis", trackTimeMillis: 1_049_000, trackViewUrl: "https://x/2" },
];

test("matches the take of the same length, and cleans the link", () => {
  const m = pickMatch({ title: "So What", artist: "Miles Davis", album: "Kind of Blue", length: 565_000 }, SO_WHAT);
  assert.deepEqual(m, { url: "https://music.apple.com/us/album/so-what/300865074?i=300865220", ms: 563_000 });
});

test("a live version with the same title isn't the same recording", () => {
  assert.equal(pickMatch({ title: "So What", artist: "Miles Davis", album: null, length: 806_000 }, SO_WHAT), null);
});

test("finds the live one when that's the recording", () => {
  assert.equal(pickMatch({ title: "So What (live)", artist: "Miles Davis", album: null, length: 1_050_000 }, SO_WHAT)?.url, "https://x/2");
});

test("no length, no match: a search is better than the wrong take", () => {
  assert.equal(pickMatch({ title: "So What", artist: "Miles Davis", album: "Kind of Blue", length: null }, SO_WHAT), null);
});
