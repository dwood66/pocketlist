import { test } from "node:test";
import assert from "node:assert/strict";
import { href, parse, type Route } from "./route.ts";

const A = "57db3f59-9c58-4f68-a00e-e044666c4828", B = "1e15c55f-e661-4910-9c0c-49a7b77b4d55", C = "b625448e-bf4a-41c3-a421-72ad46cdb831";

test("a shared Connect result round-trips", () => {
  const route: Route = { view: "pathlist", ids: [A, B, C], per: 2, mix: 0, connect: true };
  assert.equal(href(route), `/?pp=${A},${B},${C}&c=1`);
  assert.deepEqual(parse(href(route).slice(1)), route);
});

test("a plain Journey isn't marked as Connect", () => {
  const parsed = parse(`?pp=${A},${B}`);
  assert.equal(parsed.view, "pathlist");
  assert.ok(!("connect" in parsed));
});

test("a newest-first Sampler round-trips, and oldest first stays the plain link", () => {
  const route: Route = { view: "playlist", seeds: [A], n: 10, mix: 0, newest: true };
  assert.equal(href(route), `/?pl=${A}&o=new`);
  assert.deepEqual(parse(href(route).slice(1)), route);
  assert.equal(href({ view: "playlist", seeds: [A], n: 10, mix: 0 }), `/?pl=${A}`);
  assert.ok(!("newest" in parse(`?pl=${A}`)));
});
