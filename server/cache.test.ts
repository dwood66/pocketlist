import { test } from "node:test";
import assert from "node:assert/strict";
import { Forgetful } from "./cache.ts";

test("keeps what fits, dropping the least recently used first", () => {
  const c = new Forgetful<string>(10, 60_000, (v) => v.length);
  c.set("a", "aaaa");
  c.set("b", "bbbb");
  c.get("a"); // a is now the most recently used
  c.set("c", "cccc"); // 12 > 10: b goes
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), "aaaa");
  assert.equal(c.get("c"), "cccc");
  assert.equal(c.weight, 8);
});

test("forgets entries older than the time limit", () => {
  let t = 0;
  const c = new Forgetful<number>(100, 1000, () => 1, () => t);
  c.set("x", 1);
  t = 999;
  assert.equal(c.get("x"), 1);
  t = 2001; // get() doesn't refresh the clock: 2001 - 0 > 1000
  assert.equal(c.get("x"), undefined);
  assert.equal(c.size, 0);
});

test("never keeps something bigger than the whole limit, and replacing keeps the weight right", () => {
  const c = new Forgetful<string>(5, 60_000, (v) => v.length);
  c.set("big", "123456");
  assert.equal(c.get("big"), undefined);
  c.set("k", "12");
  c.set("k", "1234");
  assert.equal(c.weight, 4);
  c.delete("k");
  assert.equal(c.weight, 0);
});
