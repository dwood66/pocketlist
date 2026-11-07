// Connect: six degrees, played in the galaxy. Get from one player to another through people
// who recorded together. The trail is your path; par is the shortest route through
// everything read so far.

import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Flag, Route as RouteIcon, X } from "lucide-react";
import type { Path, Player, PlayerCandidate, SharedRecording, Snapshot } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/Link";
import { getPlayer, search, sharedRecordings, shortestPath } from "@/lib/api";
import type { Route } from "@/lib/route";

type Go = (r: Route, opts?: { replace?: boolean; keepScroll?: boolean }) => void;

// Starts are players whose credits are already read, so the first galaxy is instant.
const PUZZLES: { from: string; fromName: string; to: string; toName: string }[] = [
  { from: "c25346e6-1ec6-41a9-bfd0-4efef8f93799", fromName: "Wally Kane", to: "46a6fac0-2e14-4214-b08e-3bdb1cffa5aa", toName: "Jaco Pastorius" },
  { from: "8247a3f2-3a8e-4256-b322-6c57b03a4e36", fromName: "Bill Evans", to: "8446fcca-109e-4c6d-a2ff-5a269b32b4c2", toName: "Chick Corea" },
  { from: "d5ac66e4-ea5d-4ebb-9e0d-bed4063208e7", fromName: "Elvin Jones", to: "8e8c7417-c905-46b1-b42a-5260b4274ed4", toName: "Thelonious Monk" },
  { from: "b6ff4fd0-03ae-41a6-942e-7de13124b970", fromName: "Paul Chambers", to: "f3b8e107-abe8-4743-b6a3-4a4ee995e71f", toName: "Charles Mingus" },
  { from: "57db3f59-9c58-4f68-a00e-e044666c4828", fromName: "Ron Carter", to: "b625448e-bf4a-41c3-a421-72ad46cdb831", toName: "John Coltrane" },
  { from: "c25346e6-1ec6-41a9-bfd0-4efef8f93799", fromName: "Wally Kane", to: "561d854a-6a28-4aa7-8c99-323e6ce46c2a", toName: "Miles Davis" },
  { from: "8247a3f2-3a8e-4256-b322-6c57b03a4e36", fromName: "Bill Evans", to: "601e7466-eaf5-4a91-9909-ffd770b7e04a", toName: "Art Blakey" },
];

/** Today's puzzle, the same for everyone on a given (UTC) day. */
export function puzzleOfTheDay(offset = 0) {
  const day = Math.floor(Date.now() / 86_400_000);
  return PUZZLES[(day + offset) % PUZZLES.length];
}

export function ConnectIntro({ go }: { go: Go }) {
  const [offset, setOffset] = useState(0);
  const p = puzzleOfTheDay(offset);
  return (
    <section aria-labelledby="connect" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <h2 id="connect" className="font-semibold">Connect</h2>
      <p className="text-sm text-muted-foreground">
        Get from one player to another through people who recorded together, in as few hops as you can.
      </p>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{offset ? "Another:" : "Today:"}</span>
        <Link to={{ view: "player", id: p.from, trail: [], goal: p.to }} go={go}
          className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground hover:opacity-90">
          {p.fromName} → {p.toName}
        </Link>
        <button type="button" onClick={() => setOffset((o) => o + 1)} className="text-muted-foreground underline hover:text-foreground">
          Try another
        </button>
      </p>
    </section>
  );
}

/** "Play Connect from here": pick a goal by name. */
export function ConnectFrom({ id, name, go }: { id: string; name: string; go: Go }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PlayerCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function find(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setFound(null); setError(null);
    try { setFound((await search(q, "")).filter((c) => c.id !== id && c.type !== "Group").slice(0, 6)); }
    catch (err) { setError(err instanceof Error ? err.message : "Search failed"); }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Flag className="mr-1.5 h-4 w-4" /> Play Connect from here
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <form onSubmit={find} className="flex flex-wrap items-center gap-2">
        <label htmlFor="goal" className="text-sm">Connect {name} to</label>
        <Input id="goal" value={q} onChange={(e) => setQ(e.target.value)} placeholder="another player" autoComplete="off" className="max-w-xs flex-1" autoFocus />
        <Button type="submit" size="sm">Find</Button>
        <Button type="button" variant="outline" size="sm" aria-label="Cancel" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
      </form>
      {error && <p className="text-sm">{error}</p>}
      {found && (found.length ? (
        <ul className="flex flex-wrap gap-2">
          {found.map((c) => (
            <li key={c.id}>
              <Button variant="outline" size="sm" onClick={() => go({ view: "player", id, trail: [], goal: c.id })}>
                {c.name}{c.disambiguation ? <span className="ml-1 text-muted-foreground">({c.disambiguation})</span> : null}
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No one by that name.</p>)}
    </div>
  );
}

/** The game's status line while playing, and the result card when you get there. */
export function ConnectBanner({ id, trail, goal, snap, galaxy, go }: {
  id: string; trail: string[]; goal: string; snap: Snapshot | null; galaxy: boolean; go: Go;
}) {
  const start = trail[0] ?? id;
  const hops = trail.length;
  const [goalPlayer, setGoalPlayer] = useState<Player | null>(null);
  const [par, setPar] = useState<Path | null | "unknown">(null);
  const [showRoute, setShowRoute] = useState(false);

  useEffect(() => { getPlayer(goal).then(setGoalPlayer).catch(() => {}); }, [goal]);
  useEffect(() => { setPar(null); shortestPath(start, goal).then(setPar).catch(() => setPar("unknown")); }, [start, goal]);

  const goalName = goalPlayer?.name ?? "the goal";
  const parHops = par && par !== "unknown" ? par.players.length - 1 : null;
  const stop = () => go({ view: "player", id, trail, galaxy }, { replace: true });

  if (id === goal) return <ConnectWin path={[...trail, id]} par={parHops} go={go} />;

  const inGalaxy = snap?.collaborators.some((c) => c.id === goal);
  return (
    <section aria-label="Connect" className="flex flex-col gap-2 rounded-xl border border-[color:var(--goal)] bg-card p-3 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-semibold">Connect: get to {goalName}</span>
        <span className="tabular-nums text-muted-foreground">
          {hops} {hops === 1 ? "hop" : "hops"} so far · par {parHops ?? (par === "unknown" ? "unknown" : "…")}
        </span>
      </p>
      {snap && (
        <p className="text-muted-foreground">
          {inGalaxy
            ? `${goalName} is right here${galaxy ? ": the gold star" : ""}. One more hop.`
            : `${goalName} isn't in this galaxy. Who here might have played with them?`}
        </p>
      )}
      {showRoute && par && par !== "unknown" && (
        <p>
          A shortest known route: {par.players.map((p) => p.name).join(" → ")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!showRoute && parHops !== null && (
          <Button variant="outline" size="sm" onClick={() => setShowRoute(true)}><RouteIcon className="mr-1.5 h-4 w-4" /> Show a route</Button>
        )}
        <Button variant="outline" size="sm" onClick={stop}><X className="mr-1.5 h-4 w-4" /> Stop playing</Button>
      </div>
    </section>
  );
}

function ConnectWin({ path, par, go }: { path: string[]; par: number | null; go: Go }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<(SharedRecording | null)[]>([]);
  const [copied, setCopied] = useState(false);
  const hops = path.length - 1;

  useEffect(() => {
    const ctrl = new AbortController();
    for (const id of path) getPlayer(id, ctrl.signal).then((p) => setNames((n) => ({ ...n, [id]: p.name }))).catch(() => {});
    Promise.all(path.slice(1).map((b, i) => sharedRecordings(path[i], b, ctrl.signal).then((r) => r[0] ?? null).catch(() => null)))
      .then((l) => { if (!ctrl.signal.aborted) setLinks(l); });
    return () => ctrl.abort();
  }, [path.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (id: string) => names[id] ?? "…";
  const linkText = (r: SharedRecording | null | undefined) =>
    r ? `“${r.title}”${r.album || r.year ? ` (${[r.album, r.year].filter(Boolean).join(", ")})` : ""}` : "";
  const verdict = par === null ? "" : hops <= par ? (hops < par ? " Better than par!" : " That's par.") : ` Par is ${par}.`;
  const share = [
    `Pocketlist Connect: ${name(path[0])} → ${name(path[hops])} in ${hops} ${hops === 1 ? "hop" : "hops"}${par !== null ? ` (par ${par})` : ""}`,
    ...path.slice(1).map((b, i) => `${name(path[i])} → ${name(b)}: ${linkText(links[i])}`),
    `${location.origin}/?p=${path[0]}&goal=${path[hops]}`,
  ].join("\n");

  return (
    <section aria-label="You made it" className="flex flex-col gap-3 rounded-xl border border-[color:var(--goal)] bg-card p-4">
      <p className="text-lg font-semibold" role="status">
        You connected {name(path[0])} to {name(path[hops])} in {hops} {hops === 1 ? "hop" : "hops"}.{verdict}
      </p>
      <ol className="flex flex-col gap-1.5 text-sm">
        {path.slice(1).map((b, i) => (
          <li key={`${path[i]}-${b}`}>
            <span className="font-medium">{name(path[i])} → {name(b)}</span>
            <span className="text-muted-foreground">{links[i] ? `: ${linkText(links[i])}` : ""}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(share).then(() => setCopied(true))}>
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />} {copied ? "Copied" : "Copy result"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => go({ view: "home" })}>Play another</Button>
      </div>
    </section>
  );
}
