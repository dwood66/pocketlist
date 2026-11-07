// Where each star goes in the galaxy. Pure arithmetic, no React or DOM, so it can be tested
// and reused (the README GIF's recording script uses it to find stars by name).

import type { Collaborator } from "../../contract/index.ts";

export type Star = { c: Collaborator; x: number; y: number; size: number; heat: number | null; rank: number };

const MIN_HEAT_SESSIONS = 3; // two tracks in one year isn't a real burst
const ARC = 0.92; // leave a gap at the top so the start and end of a career don't touch

export function hash(s: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function heatOf(c: Collaborator): number | null {
  if (c.sharedSessions < MIN_HEAT_SESSIONS || !c.firstYear || !c.lastYear) return null;
  const perYear = c.sharedSessions / (c.lastYear - c.firstYear + 1);
  // Log scale: about 1.5 sessions a year or fewer is cool, 15 or more is hot.
  return Math.min(1, Math.max(0, Math.log(perYear / 1.5) / Math.log(10)));
}

export function layout(collaborators: Collaborator[]) {
  const max = Math.max(2, collaborators[0]?.sharedSessions ?? 2);
  const maxTracks = Math.max(1, ...collaborators.map((c) => c.sharedRecordings));
  // Time runs clockwise, but each year gets room in proportion to how many partnerships began
  // in it, so a crowded decade spreads out instead of piling into one wedge. The decade marks
  // follow the same scale, so they still say where you are.
  const years = collaborators.flatMap((c) => (c.firstYear ? [c.firstYear] : [])).sort((a, b) => a - b);
  const n = Math.max(1, years.length);
  const before = (y: number) => { let lo = 0, hi = years.length; while (lo < hi) { const m = (lo + hi) >> 1; if (years[m] < y) lo = m + 1; else hi = m; } return lo; };
  const share = (y: number) => [before(y) / n, before(y + 1) / n] as const;
  const y0 = years[0] ?? 0;
  const span = years.length ? years[years.length - 1] - y0 + 1 : 1;

  const stars: Star[] = collaborators.map((c, rank) => {
    const [lo, hi] = c.firstYear ? share(c.firstYear) : [0, 1];
    const along = lo + (hi - lo) * hash(c.id);
    const angle = -Math.PI / 2 + 0.04 + along * ARC * 2 * Math.PI;
    const near = Math.log(c.sharedSessions) / Math.log(max); // 0 for one session, 1 for the most
    const r = Math.min(0.98, 0.16 + 0.78 * (1 - near) + (hash(c.id, 7) - 0.5) * 0.06);
    return {
      c, rank,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      size: 1.4 + 5 * Math.sqrt(c.sharedRecordings / maxTracks),
      heat: heatOf(c),
    };
  });
  const ringAt = (sessions: number) => 0.16 + 0.78 * (1 - Math.log(sessions) / Math.log(max));
  const angleOf = (year: number) => -Math.PI / 2 + 0.04 + share(year)[0] * ARC * 2 * Math.PI;
  return { stars, max, y0, span, ringAt, angleOf };
}
