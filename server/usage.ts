// Usage: how many people use Pocketlist, and what they do with it. No IP addresses are kept.
//
// Each request's address is hashed together with a random salt that belongs to one UTC day.
// The salt lives in usage_salts and is deleted once its day is over, after which nobody (us
// included) can work out which address made which hash, or link a visitor across two days.
// So the counts are "distinct visitors per day", which is what we want anyway.
//
// One row per (day, visitor, kind, subject), so reloading a page counts once.
//   kind: player (subject = the player's id), search, sampler, journey, connect
//
// Read it with `npm run usage` (with DATABASE_URL set, e.g. `railway run npm run usage`).

import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { rows } from "./db.ts";
import { visitorHash } from "./usage-hash.ts";

export type UsageKind = "player" | "search" | "sampler" | "journey" | "connect";

const today = () => new Date().toISOString().slice(0, 10);
let salt: { day: string; value: string } | undefined;

async function saltFor(day: string) {
  if (salt?.day === day) return salt.value;
  await rows(`delete from usage_salts where day < $1`, [day]);
  await rows(`insert into usage_salts (day, salt) values ($1, $2) on conflict (day) do nothing`, [day, randomBytes(16).toString("hex")]);
  const [found] = await rows<{ salt: string }>(`select salt from usage_salts where day = $1`, [day]);
  salt = { day, value: found.salt };
  return salt.value;
}

/** The caller's address, as the proxy in front of us saw it. */
export function clientAddress(c: Context) {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return c.req.header("x-real-ip") ?? forwarded ?? "unknown";
}

/** Count this request. Never slows the request down, and never fails it. */
export function track(c: Context, kind: UsageKind, subject = "") {
  const address = clientAddress(c);
  const agent = c.req.header("user-agent") ?? "";
  if (/bot|crawl|spider|preview|curl|wget/i.test(agent)) return; // link unfurlers and scripts
  void (async () => {
    const day = today();
    const visitor = visitorHash(address, agent, await saltFor(day));
    await rows(`insert into usage_events (day, visitor, kind, subject) values ($1, $2, $3, $4) on conflict do nothing`,
      [day, visitor, kind, subject.slice(0, 200)]);
  })().catch((e) => console.warn(`usage: ${e instanceof Error ? e.message : String(e)}`));
}
