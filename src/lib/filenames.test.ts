import { test } from "node:test";
import assert from "node:assert/strict";
import { journeyFileName, samplerFileName } from "./filenames.ts";

test("Journey file names keep the ends and count the players between", () => {
  assert.equal(journeyFileName(["Louis Armstrong", "Jerome Richardson", "Merl Saunders", "Bob Weir", "Kenny Brooks", "Damon Wood"]),
    "louis-armstrong-to-damon-wood-via-4");
  assert.equal(journeyFileName(["Wayne Shorter", "Joe Zawinul"]), "wayne-shorter-to-joe-zawinul");
});

test("Sampler file names name up to two players, then count the rest", () => {
  assert.equal(samplerFileName(["Jaco Pastorius"]), "jaco-pastorius-sampler");
  assert.equal(samplerFileName(["Miles Davis", "John Coltrane"]), "miles-davis-and-john-coltrane-sampler");
  assert.equal(samplerFileName(["Miles Davis", "John Coltrane", "Bill Evans", "Paul Chambers"]), "miles-davis-and-3-others-sampler");
  assert.equal(samplerFileName(["Eric Kamau Grávátt"]), "eric-kamau-gravatt-sampler");
});
