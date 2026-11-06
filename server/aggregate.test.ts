import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, normalizeTitle, ownInstruments, type CreditRow } from "./aggregate.ts";

const P = "player";
const row = (over: Partial<CreditRow>): CreditRow => ({
  recording_id: "r1", title: "Django", first_release_date: "1960", rg_id: "g1",
  artist_id: P, artist_name: "Player", artist_disambiguation: null, instruments: ["bassoon"], date: null,
  ...over,
});

test("a shared recording counts once per collaborator", () => {
  const out = aggregate(P, [row({}), row({ artist_id: "a", artist_name: "A", instruments: ["piano"] })]);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].sharedRecordings, out[0].sharedSessions], [1, 1]);
  assert.deepEqual(out[0].instruments, ["piano"]);
});

test("unmerged duplicate recordings of one tune in one session count as one", () => {
  const out = aggregate(P, [
    row({ recording_id: "r1", date: "1960-01-05" }), row({ recording_id: "r1", artist_id: "a", artist_name: "A" }),
    row({ recording_id: "r2", date: "1960-01-05" }), row({ recording_id: "r2", artist_id: "a", artist_name: "A" }),
  ]);
  assert.equal(out[0].sharedRecordings, 1);
  assert.equal(out[0].sharedSessions, 1);
});

test("different tunes on one date are one session, two recordings", () => {
  const out = aggregate(P, [
    row({ recording_id: "r1", title: "Django", date: "1960-01-05" }), row({ recording_id: "r1", artist_id: "a", artist_name: "A" }),
    row({ recording_id: "r2", title: "Skating", date: "1960-01-05" }), row({ recording_id: "r2", artist_id: "a", artist_name: "A" }),
  ]);
  assert.deepEqual([out[0].sharedRecordings, out[0].sharedSessions], [2, 1]);
});

test("without a date, the album stands in for the session", () => {
  const out = aggregate(P, [
    row({ recording_id: "r1", title: "One", rg_id: "g1" }), row({ recording_id: "r1", artist_id: "a", artist_name: "A" }),
    row({ recording_id: "r2", title: "Two", rg_id: "g2" }), row({ recording_id: "r2", artist_id: "a", artist_name: "A", rg_id: "g2" }),
  ]);
  assert.deepEqual([out[0].sharedRecordings, out[0].sharedSessions], [2, 2]);
});

test("years come from session dates, falling back to first release", () => {
  const out = aggregate(P, [
    row({ recording_id: "r1", title: "One", date: "1956-03-01" }), row({ recording_id: "r1", artist_id: "a", artist_name: "A" }),
    row({ recording_id: "r2", title: "Two", first_release_date: "1961-02" }), row({ recording_id: "r2", artist_id: "a", artist_name: "A", first_release_date: "1961-02" }),
  ]);
  assert.deepEqual([out[0].firstYear, out[0].lastYear], [1956, 1961]);
});

test("sorted by sessions, then recordings, then name", () => {
  const out = aggregate(P, [
    row({ recording_id: "r1", title: "One", date: "1956-01-01" }),
    row({ recording_id: "r1", artist_id: "b", artist_name: "B" }),
    row({ recording_id: "r2", title: "Two", date: "1957-01-01" }),
    row({ recording_id: "r2", artist_id: "b", artist_name: "B" }),
    row({ recording_id: "r2", artist_id: "a", artist_name: "A" }),
  ]);
  assert.deepEqual(out.map((c) => c.name), ["B", "A"]);
});

test("titles normalize case, accents and take suffixes", () => {
  assert.equal(normalizeTitle("Café Blues (Alternate Take)"), normalizeTitle("cafe blues"));
  assert.notEqual(normalizeTitle("Blue in Green"), normalizeTitle("Blue Train"));
});

test("own instruments are counted per recording", () => {
  assert.deepEqual(
    ownInstruments(P, [row({ instruments: ["flute"] }), row({ recording_id: "r2", instruments: ["flute"] }), row({ recording_id: "r3", instruments: ["bassoon"] })]),
    ["flute", "bassoon"],
  );
});
