import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCredits, type CreditRow } from "./credits.ts";

const row = (artist_id: string, artist_name: string, rel_type: string, instruments: string[] = []): CreditRow =>
  ({ artist_id, artist_name, artist_disambiguation: null, rel_type, instruments });

test("one entry per person, players by instrument, crew in sleeve order", () => {
  const { players, crew } = groupCredits([
    row("e", "Ella Fitzgerald", "vocal"),
    row("v2", "Victor Bay", "instrument", ["violin"]),
    row("v1", "Alex Beller", "instrument", ["violin"]),
    row("d", "Mel Lewis", "instrument", ["drums (drum set)"]),
    row("n", "Nelson Riddle", "conductor"),
    row("n", "Nelson Riddle", "arranger"),
    row("p", "Norman Granz", "producer"),
    row("r", "Val Valentin", "recording"),
  ]);
  assert.deepEqual(players.map((p) => `${p.name}: ${p.roles.join(", ")}`),
    ["Mel Lewis: drums (drum set)", "Alex Beller: violin", "Victor Bay: violin", "Ella Fitzgerald: vocals"]);
  assert.deepEqual(crew.map((p) => `${p.name}: ${p.roles.join(", ")}`),
    ["Nelson Riddle: conductor, arranger", "Norman Granz: producer", "Val Valentin: recording engineer"]);
});

test("someone who played and produced is in both lists; placeholders are left out", () => {
  const { players, crew } = groupCredits([
    row("q", "Quincy Jones", "instrument", ["trumpet"]),
    row("q", "Quincy Jones", "producer"),
    row("u", "[unknown]", "instrument", ["piano"]),
  ]);
  assert.deepEqual(players.map((p) => p.name), ["Quincy Jones"]);
  assert.deepEqual(crew.map((p) => p.name), ["Quincy Jones"]);
});
