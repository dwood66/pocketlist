import { test } from "node:test";
import assert from "node:assert/strict";
import { bandMembers } from "./members.ts";
import type { MbRelation } from "./mb.ts";

const rel = (name: string, attributes: string[] = [], begin?: string, end?: string, id = name): MbRelation => ({
  type: "member of band", "target-type": "artist", direction: "backward", attributes, begin, end, artist: { id, name },
});

test("founders first, then by when they joined, undated last; stints merged", () => {
  const m = bandMembers({ id: "wr", name: "Weather Report", relations: [
    rel("Peter Erskine", ["drums (drum set)"]),
    rel("Jaco Pastorius", [], "1975", "1982"),
    rel("Wayne Shorter", ["original"], "1971", "1986"),
    rel("Joe Zawinul", ["original", "keyboard"], "1971"),
    rel("Jaco Pastorius", ["bass guitar"], "1976", "1983"), // a second stint
    { ...rel("Weather Update"), type: "subgroup" },
    { ...rel("Someone else"), direction: "forward" }, // a band this one was in, not a member
  ] });
  assert.deepEqual(m.map((x) => x.name), ["Joe Zawinul", "Wayne Shorter", "Jaco Pastorius", "Peter Erskine"]);
  assert.deepEqual(m.map((x) => x.years), ["1971–", "1971–1986", "1975–1983", undefined]);
  assert.deepEqual(m[0].instruments, ["keyboard"]);
  assert.deepEqual(m[2].instruments, ["bass guitar"]);
  assert.equal(m[0].original, true);
});

test("an open-ended membership closes when the band did", () => {
  const m = bandMembers({ id: "wr", name: "Weather Report", "life-span": { begin: "1970", end: "1986" },
    relations: [rel("Joe Zawinul", ["original"], "1971")] });
  assert.equal(m[0].years, "1971–1986");
});
