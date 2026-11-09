// Connect: six degrees, played in the galaxy. Get from one player to another through people
// who recorded together. The trail is your path; par is the shortest route through
// everything read so far.

import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Flag, Lightbulb, Route as RouteIcon, X } from "lucide-react";
import type { Path, Player, PlayerCandidate, SharedRecording, Snapshot } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/Link";
import { getPlayer, search, sharedRecordings, shortestPath } from "@/lib/api";
import { JourneyIcon, SamplerIcon } from "@/components/marks";
import type { Route } from "@/lib/route";

type Go = (r: Route, opts?: { replace?: boolean; keepScroll?: boolean }) => void;

// Connect's marks, used everywhere the game appears: the route (two players joined by a path)
// is the game itself, in its rose colour; the flag is the player you're trying to reach.
export const ConnectIcon = RouteIcon;
export const GoalIcon = Flag;

/** The game's badge: route icon and name, white on rose. */
export function ConnectBadge() {
  return (
    <span className="inline-flex self-start items-center gap-1 rounded-full bg-[color:var(--goal)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--card)]">
      <ConnectIcon className="h-3.5 w-3.5" aria-hidden /> Connect
    </span>
  );
}

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

// A finished game, for the home card's "hear one" link.
const EXAMPLE = {
  from: "57db3f59-9c58-4f68-a00e-e044666c4828", via: "1e15c55f-e661-4910-9c0c-49a7b77b4d55", to: "b625448e-bf4a-41c3-a421-72ad46cdb831",
  label: "Ron Carter → Louis Hayes → John Coltrane",
};

/** Today's puzzle, the same for everyone on a given (UTC) day. */
export function puzzleOfTheDay(offset = 0) {
  const day = Math.floor(Date.now() / 86_400_000);
  return PUZZLES[(day + offset) % PUZZLES.length];
}

export function ConnectIntro({ go }: { go: Go }) {
  const [offset, setOffset] = useState(0);
  const p = puzzleOfTheDay(offset);
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ConnectIcon className="h-5 w-5 text-[color:var(--goal)]" aria-hidden />Play Connect</h2>
      <p className="text-sm text-muted-foreground">
        Six degrees, jazz style: get from one player to another through people who recorded together.
      </p>
      <p className="text-sm text-muted-foreground">
        Then listen to it. Your route becomes a{" "}
        <span className="whitespace-nowrap font-medium text-foreground"><JourneyIcon className="mr-0.5 inline h-3.5 w-3.5 align-[-2px] text-[color:var(--goal)]" aria-hidden />Journey</span>{" "}
        playlist, and any link along it a{" "}
        <span className="whitespace-nowrap font-medium text-foreground"><SamplerIcon className="mr-0.5 inline h-3.5 w-3.5 align-[-2px] text-primary" aria-hidden />Sampler</span>.{" "}
        <Link to={{ view: "pathlist", ids: [EXAMPLE.from, EXAMPLE.via, EXAMPLE.to], per: 2, mix: 0 }} go={go} className="underline hover:text-foreground">
          Hear one: {EXAMPLE.label}
        </Link>
      </p>
      <div className="mt-auto flex flex-col items-start gap-1.5 pt-1">
        <Link to={{ view: "player", id: p.from, trail: [], goal: p.to }} go={go}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--goal)] px-3 py-1.5 text-left text-sm font-medium text-[color:var(--card)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ConnectIcon className="h-4 w-4 shrink-0" aria-hidden />
          <span>{offset ? "" : "Today: "}{p.fromName} → {p.toName}</span>
        </Link>
        <button type="button" onClick={() => setOffset((o) => o + 1)} className="text-sm text-muted-foreground underline hover:text-foreground">
          Another puzzle
        </button>
      </div>
    </section>
  );
}

/** "Connect from here": pick a goal by name. */
export function ConnectFrom({ id, name, go, onClose }: { id: string; name: string; go: Go; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PlayerCandidate[] | null>(null);
  const [searched, setSearched] = useState(""); // the name `found` is for
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const play = (goal: string) => go({ view: "player", id, trail: [], goal });

  // Enter searches; Enter again (name unchanged) starts the game with the first match.
  async function find(e: FormEvent) {
    e.preventDefault();
    const name = q.trim();
    if (!name || busy) return;
    if (found?.length && name === searched) return play(found[0].id);
    setFound(null); setError(null); setBusy(true);
    try {
      const results = (await search(name, "")).filter((c) => c.id !== id && c.type !== "Group").slice(0, 6);
      setFound(results); setSearched(name);
    } catch (err) { setError(err instanceof Error ? err.message : "Search failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-[color:var(--goal)] bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <ConnectBadge />
        <Button type="button" variant="ghost" size="sm" aria-label="Cancel" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <form onSubmit={find} className="flex flex-wrap items-center gap-2">
        <label htmlFor="goal" className="text-sm">Connect <strong>{name}</strong> to</label>
        <div className="relative max-w-xs flex-1">
          <GoalIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--goal)]" aria-hidden />
          <Input id="goal" value={q} onChange={(e) => setQ(e.target.value)} placeholder="another player" autoComplete="off" className="pl-8" autoFocus />
        </div>
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Finding…" : "Find"}</Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Get from {name} to them through people who recorded together, in as few hops as you can.
      </p>
      {error && <p className="text-sm">{error}</p>}
      {found && (found.length ? (
        <div className="flex flex-col gap-1.5">
          <ul className="flex flex-wrap gap-2" aria-label="Pick who to connect to">
            {found.map((c, i) => (
              <li key={c.id}>
                <Button variant={i === 0 ? "default" : "outline"} size="sm" onClick={() => play(c.id)}>
                  <GoalIcon className="h-3.5 w-3.5" aria-hidden />
                  {c.name}{c.disambiguation ? <span className={i === 0 ? "opacity-80" : "text-muted-foreground"}>({c.disambiguation})</span> : null}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground" role="status">Press Enter to play with {found[0].name}, or pick another.</p>
        </div>
      ) : <p className="text-sm text-muted-foreground" role="status">No one by that name.</p>)}
    </div>
  );
}

/** One line for the full-screen galaxy: where you're headed and how far you've come. */
export function GoalLine({ id, trail, goal }: { id: string; trail: string[]; goal: string }) {
  const [goalName, setGoalName] = useState<string | null>(null);
  const [par, setPar] = useState<number | null>(null);
  useEffect(() => { getPlayer(goal).then((p) => setGoalName(p.name)).catch(() => {}); }, [goal]);
  useEffect(() => { shortestPath(trail[0] ?? id, goal).then((p) => setPar(p.players.length - 1)).catch(() => {}); }, [trail[0] ?? id, goal]); // eslint-disable-line react-hooks/exhaustive-deps
  if (id === goal) return <p className="text-sm text-[color:var(--goal)]">You made it. Exit full screen to see your result.</p>;
  return (
    <p className="text-sm">
      <ConnectIcon className="mr-1 inline h-4 w-4 align-[-3px] text-[color:var(--goal)]" aria-hidden />
      <span className="text-muted-foreground">Connect to </span>
      <span className="font-medium text-[color:var(--goal)]"><GoalIcon className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />{goalName ?? "…"}</span>
      <span className="tabular-nums text-muted-foreground"> · <span title="Steps you've taken so far">{trail.length} {trail.length === 1 ? "hop" : "hops"}</span>{par !== null && <> · <span title="The fewest steps it can be done in, as far as Pocketlist knows">par {par}</span></>}</span>
    </p>
  );
}

/** The game while you play: where you're going, how far you've come, what to do next, and a
 *  hint when you're stuck. The result card when you get there. */
export function ConnectBanner({ id, trail, goal, snap, galaxy, go, onHint }: {
  id: string; trail: string[]; goal: string; snap: Snapshot | null; galaxy: boolean; go: Go;
  onHint?: (name: string) => void; // highlight a player in the galaxy or list
}) {
  const start = trail[0] ?? id;
  const hops = trail.length;
  const [names, setNames] = useState<Record<string, string>>({});
  const [par, setPar] = useState<Path | null | "unknown">(null);
  const [hint, setHint] = useState<Player | "none" | null>(null);
  const [answer, setAnswer] = useState(false);

  const ids = [...trail, id, goal];
  useEffect(() => {
    for (const p of ids) if (!names[p]) getPlayer(p).then((pl) => setNames((n) => ({ ...n, [p]: pl.name }))).catch(() => {});
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPar(null); shortestPath(start, goal).then(setPar).catch(() => setPar("unknown")); }, [start, goal]);
  useEffect(() => { setHint(null); setAnswer(false); }, [id]);

  const name = (p: string) => names[p] ?? "…";
  const goalName = names[goal] ?? "the goal";
  const parHops = par && par !== "unknown" ? par.players.length - 1 : null;
  const stop = () => go({ view: "player", id, trail, galaxy }, { replace: true });

  if (id === goal) return <ConnectWin path={[...trail, id]} par={parHops} go={go} />;

  const inGalaxy = snap?.collaborators.some((c) => c.id === goal);
  const where = galaxy ? "the star marked" : "their name in the list";

  async function askHint() {
    try {
      const route = await shortestPath(id, goal);
      const next = route.players[1];
      setHint(next ?? "none");
      if (next) onHint?.(next.name);
    } catch { setHint("none"); }
  }

  return (
    <section aria-label="Connect" className="flex flex-col gap-3 rounded-xl border-2 border-[color:var(--goal)] bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <ConnectBadge />
        <h2 className="text-lg font-semibold">
          {name(start)} <span className="text-muted-foreground">→</span> <span className="text-[color:var(--goal)]">{goalName}</span>
        </h2>
      </div>

      {/* The path so far, then the gap to the goal. */}
      <ol className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Your path so far">
        {[...trail, id].map((p, i) => (
          <li key={`${p}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground" aria-hidden>→</span>}
            <span className={p === id ? "rounded-full border border-border px-2 py-0.5 font-medium" : "text-muted-foreground"}>{name(p)}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="text-muted-foreground" aria-hidden>{inGalaxy ? "→" : "⋯"}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-[color:var(--goal)] px-2 py-0.5 text-[color:var(--goal)]" title="Who you're trying to reach">
            <GoalIcon className="h-3.5 w-3.5" aria-hidden />{goalName}
          </span>
        </li>
        <li className="ml-auto tabular-nums text-muted-foreground">
          <span title="Steps you've taken so far">{hops} {hops === 1 ? "hop" : "hops"}</span> · <span title="The fewest steps it can be done in, as far as Pocketlist knows">par {parHops ?? (par === "unknown" ? "?" : "…")}</span>
        </li>
      </ol>

      {snap && (
        <p className="text-base">
          {inGalaxy ? (
            <>
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--goal)] align-middle" aria-hidden />
              {goalName} is right here. Click {where} to finish.
            </>
          ) : hops === 0 ? (
            <>Pick someone in {name(id)}’s galaxy who might have played with {goalName}. Same era, same scene, or a session player who was on everything is a good bet.</>
          ) : parHops !== null && hops >= parHops ? (
            <>Past par, but keep going: who here might know {goalName}?</>
          ) : (
            <>Not here yet. Who in {name(id)}’s circle might have played with {goalName}?</>
          )}
        </p>
      )}

      {!inGalaxy && hint && (
        <p className="text-sm">
          {hint === "none"
            ? "No hint yet: there's no known route from here."
            : <>Try <strong>{hint.name}</strong>: they’re one step closer to {goalName}. {onHint && "Highlighted below."}</>}
        </p>
      )}
      {answer && par && par !== "unknown" && (
        <p className="text-sm">One shortest route: {par.players.map((p) => p.name).join(" → ")}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!inGalaxy && !hint && snap && (
          <Button variant="outline" size="sm" onClick={askHint}><Lightbulb className="h-4 w-4" /> Hint</Button>
        )}
        {!answer && parHops !== null && (
          <button type="button" onClick={() => setAnswer(true)} className="text-sm text-muted-foreground underline hover:text-foreground">Show the answer</button>
        )}
        <button type="button" onClick={stop} className="text-sm text-muted-foreground underline hover:text-foreground">Stop playing</button>
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
    <section aria-label="You made it" className="flex flex-col gap-3 rounded-xl border-2 border-[color:var(--goal)] bg-card p-4">
      <ConnectBadge />
      <p className="text-lg font-semibold" role="status">
        You connected {name(path[0])} to {name(path[hops])} in {hops} {hops === 1 ? "hop" : "hops"}.{verdict}
      </p>
      <ol className="flex flex-col gap-1.5 text-sm">
        {path.slice(1).map((b, i) => (
          <li key={`${path[i]}-${b}`} className="flex flex-wrap items-baseline gap-x-1">
            <span className="font-medium">{name(path[i])} → {name(b)}{links[i] ? ":" : ""}</span>
            {links[i] && (
              <span className="text-muted-foreground" title="A recording they're both on">
                “{links[i]!.title}”
                {(links[i]!.album || links[i]!.year) && <> ({links[i]!.album && <cite className="italic">{links[i]!.album}</cite>}{links[i]!.album && links[i]!.year ? ", " : ""}{links[i]!.year})</>}
              </span>
            )}
            <Link to={{ view: "playlist", seeds: [path[i], b], n: 10, mix: 0 }} go={go}
              title={`A sampler of everything ${name(path[i])} and ${name(b)} recorded together`}
              className="ml-1 inline-flex items-center gap-1 self-center rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted">
              <SamplerIcon className="h-3 w-3 text-primary" aria-hidden /> Sampler
            </Link>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(share).then(() => setCopied(true))}>
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />} {copied ? "Copied" : "Copy result"}
        </Button>
        <Link to={{ view: "pathlist", ids: path, per: 2, mix: 0 }} go={go}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--goal)] px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <JourneyIcon className="h-4 w-4 text-[color:var(--goal)]" aria-hidden /> Listen to this journey
        </Link>
        <Button variant="outline" size="sm" onClick={() => go({ view: "home" })}>Play another</Button>
      </div>
    </section>
  );
}
