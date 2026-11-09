// `npm run usage [days]`: who used Pocketlist lately, and what for. See usage.ts.
// Against production: `railway run npm run usage`.

import { rows } from "./db.ts";

const days = Math.max(1, Number(process.argv[2]) || 14);
const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

const daily = await rows<{ day: string; visitors: number; players: number; samplers: number; journeys: number; connects: number }>(
  `select day::text as day, count(distinct visitor)::int as visitors,
          count(*) filter (where kind = 'player')::int as players,
          count(*) filter (where kind = 'sampler')::int as samplers,
          count(*) filter (where kind = 'journey')::int as journeys,
          count(*) filter (where kind = 'connect')::int as connects
   from usage_events where day >= $1 group by day order by day`, [since]);

const [all] = await rows<{ visitors: number; makers: number }>(
  `select count(distinct (day, visitor))::int as visitors,
          count(distinct (day, visitor)) filter (where kind in ('sampler', 'journey'))::int as makers
   from usage_events where day >= $1`, [since]);

const top = await rows<{ name: string; visitors: number }>(
  `select coalesce((select artist_name from credits where artist_id = u.subject limit 1), u.subject) as name,
          count(*)::int as visitors
   from usage_events u where kind = 'player' and day >= $1
   group by u.subject order by visitors desc, name limit 15`, [since]);

console.log(`\nPocketlist, last ${days} days (since ${since})\n`);
console.log(`Visitor-days: ${all.visitors}   made a playlist: ${all.makers}\n`);
console.table(daily.map((d) => ({ day: d.day, visitors: d.visitors, "players opened": d.players,
  samplers: d.samplers, journeys: d.journeys, "connect games": d.connects })));
if (top.length) {
  console.log("\nMost looked-up players");
  console.table(top);
}
process.exit(0);
