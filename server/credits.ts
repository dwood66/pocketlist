// A recording's full credits, from the rows the crawler already stored: one entry per person,
// players first (with what they played), then everyone who made the record (with their jobs).

import type { Credit } from "../contract/index.ts";
import { PERFORMER_TYPES } from "./roles.ts";

export type CreditRow = {
  artist_id: string;
  artist_name: string;
  artist_disambiguation: string | null;
  rel_type: string;
  instruments: string[];
};

// MusicBrainz's names for the jobs, said the way a sleeve would.
const JOB_NAMES: Record<string, string> = {
  recording: "recording engineer",
  mix: "mixing",
  mastering: "mastering",
  "phonographic copyright": "℗",
  "artists and repertoire": "A&R",
  misc: "other",
};
// The order a sleeve lists them in; anything else after these, alphabetically.
const JOB_ORDER = ["arranger", "conductor", "orchestrator", "instrument arranger", "vocal arranger", "producer", "recording engineer", "engineer", "mixing", "mastering"];

function performerRoles(row: CreditRow): string[] {
  if (row.instruments.length) return row.instruments;
  if (row.rel_type === "vocal") return ["vocals"];
  if (row.rel_type === "performing orchestra") return ["orchestra"];
  return ["performer"];
}

const isPlaceholder = (name: string) => /^\[.*\]$/.test(name); // [unknown], [no artist]

export function groupCredits(rows: CreditRow[]): { players: Credit[]; crew: Credit[] } {
  const players = new Map<string, Credit>(), crew = new Map<string, Credit>();
  for (const row of rows) {
    if (isPlaceholder(row.artist_name)) continue;
    const performer = PERFORMER_TYPES.includes(row.rel_type);
    const into = performer ? players : crew;
    const roles = performer ? performerRoles(row) : [JOB_NAMES[row.rel_type] ?? row.rel_type];
    const entry = into.get(row.artist_id) ?? {
      id: row.artist_id, name: row.artist_name, ...(row.artist_disambiguation ? { disambiguation: row.artist_disambiguation } : {}), roles: [],
    };
    for (const r of roles) if (!entry.roles.includes(r)) entry.roles.push(r);
    into.set(row.artist_id, entry);
  }
  // Players by what they played, so a section reads together (all the violins), then by name.
  const byRoleThenName = (a: Credit, b: Credit) => a.roles[0].localeCompare(b.roles[0]) || a.name.localeCompare(b.name);
  const jobRank = (c: Credit) => Math.min(...c.roles.map((r) => (JOB_ORDER.includes(r) ? JOB_ORDER.indexOf(r) : JOB_ORDER.length)));
  return {
    players: [...players.values()].sort(byRoleThenName),
    crew: [...crew.values()].sort((a, b) => jobRank(a) - jobRank(b) || byRoleThenName(a, b)),
  };
}
