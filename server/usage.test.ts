import { test } from "node:test";
import assert from "node:assert/strict";
import { visitorHash } from "./usage-hash.ts";

test("same visitor, same day: same hash", () => {
  assert.equal(visitorHash("1.2.3.4", "Safari", "salt-a"), visitorHash("1.2.3.4", "Safari", "salt-a"));
});

test("a new day's salt makes the same visitor unrecognisable", () => {
  assert.notEqual(visitorHash("1.2.3.4", "Safari", "salt-a"), visitorHash("1.2.3.4", "Safari", "salt-b"));
});

test("the hash doesn't contain the address", () => {
  assert.ok(!visitorHash("1.2.3.4", "Safari", "salt-a").includes("1.2.3.4"));
});
