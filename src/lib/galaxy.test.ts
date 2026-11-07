import { test } from "node:test";
import assert from "node:assert/strict";
import type { Collaborator } from "../../contract/index.ts";
import { heatOf, layout } from "./galaxy.ts";

const person = (id: string, sharedSessions: number, firstYear?: number, lastYear?: number): Collaborator => ({
  id, name: id, sharedSessions, sharedRecordings: sharedSessions * 3, instruments: [], firstYear, lastYear,
});

test("heat: too few sessions to say", () => {
  assert.equal(heatOf(person("a", 2, 1960, 1960)), null);
  assert.equal(heatOf(person("b", 10)), null); // no years
});

test("heat: a long partnership is cool, a burst is hot", () => {
  const steady = heatOf(person("hancock", 145, 1963, 2022))!; // ~2.4 a year for 60 years
  const burst = heatOf(person("coltrane", 84, 1960, 1965))!; // 14 a year
  assert.ok(steady < 0.3, `steady was ${steady}`);
  assert.ok(burst > 0.8, `burst was ${burst}`);
});

test("layout: more sessions sit closer to the centre", () => {
  const { stars } = layout([person("close", 100, 1960, 1970), person("far", 1, 1965, 1965)]);
  const dist = (i: number) => Math.hypot(stars[i].x, stars[i].y);
  assert.ok(dist(0) < dist(1));
  for (const s of stars) assert.ok(Math.hypot(s.x, s.y) <= 1);
});

test("layout: same data, same galaxy", () => {
  const people = [person("a", 30, 1958, 1975), person("b", 5, 1962, 1964), person("c", 1)];
  assert.deepEqual(layout(people).stars.map((s) => [s.x, s.y]), layout(people).stars.map((s) => [s.x, s.y]));
});

test("layout: earlier partnerships come first going clockwise from the top", () => {
  const { stars } = layout([person("early", 10, 1955, 1960), person("late", 10, 1990, 1995)]);
  // Clockwise from twelve o'clock, as an angle in [0, 2π).
  const turn = (s: { x: number; y: number }) => (Math.atan2(s.y, s.x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(turn(stars[0]) < turn(stars[1]));
});
