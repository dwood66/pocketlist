import { createHash } from "node:crypto";

/** A visitor's id for one day: their address and browser, hashed with that day's salt. */
export function visitorHash(address: string, userAgent: string, daySalt: string) {
  return createHash("sha256").update(`${daySalt}|${address}|${userAgent}`).digest("hex").slice(0, 16);
}
