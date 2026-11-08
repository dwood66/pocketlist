import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Flag, List, ListMusic, Orbit } from "lucide-react";
import type { Collaborator, Player, SharedRecording, Snapshot } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/Link";
import { Galaxy, forgetGalaxy, isFullScreen } from "@/components/Galaxy";
import { ConnectBanner, ConnectFrom, GoalLine } from "@/components/Connect";
import { getPlayer, sharedRecordings, streamPlayer } from "@/lib/api";
import type { Route } from "@/lib/route";
import { cn } from "@/lib/utils";

const PAGE = 100;
let heldHeight = 0; // set when a star is clicked; see the comment on the outer div

export function PlayerView({ id, trail, galaxy, goal, go }: {
  id: string; trail: string[]; galaxy: boolean; goal?: string; go: (r: Route, opts?: { replace?: boolean; keepScroll?: boolean }) => void;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [refreshes, setRefreshes] = useState(0); // bumped by "Re-read from MusicBrainz"
  const heading = useRef<HTMLHeadingElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [hold] = useState(() => { const h = heldHeight; heldHeight = 0; return h; });

  useEffect(() => {
    setSnap(null); setProblem(null); setFilter(""); setShown(PAGE); setOpen(null); setRefreshes(0);
  }, [id]);
  useEffect(() => {
    // A snapshot means reading is going again, so it clears an earlier problem; the server
    // re-sends the problem after each snapshot for as long as it stands. A re-read keeps the
    // galaxy on screen and updates it in place.
    return streamPlayer(id, { snapshot: (s) => { setSnap(s); setProblem(null); }, problem: setProblem }, { refresh: refreshes > 0 });
  }, [id, refreshes]);

  // A new player is a new page: move focus to its name so keyboard and screen-reader
  // users start from the top, as they would after a full page load.
  const loadedId = snap?.player.id;
  // In the galaxy, focus without scrolling: the page stays put and the galaxy recentres in view.
  useEffect(() => { if (loadedId) heading.current?.focus({ preventScroll: galaxy }); }, [loadedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const list = snap?.collaborators ?? [];
    const f = filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter((c) => c.name.toLowerCase().includes(f) || c.instruments.some((i) => i.toLowerCase().includes(f)));
  }, [snap, filter]);

  const max = snap?.collaborators[0]?.sharedSessions ?? 1;
  const childTrail = [...trail, id];
  const matches = useMemo(() => (filter.trim() ? new Set(visible.map((c) => c.id)) : null), [visible, filter]);
  useEffect(() => { if (!galaxy) forgetGalaxy(); }, [galaxy]);
  const setGalaxy = (on: boolean) => go({ view: "player", id, trail, galaxy: on, goal }, { replace: true });

  return (
    // After a recentre, hold the page at the height the last galaxy left it, so keeping the
    // scroll position isn't undone by a momentarily short page (while loading, and for the
    // frame before the new canvas has measured itself).
    <div ref={box} className="flex flex-col gap-4" style={galaxy && hold ? { minHeight: hold } : undefined}>
      <Breadcrumbs trail={trail} go={go} current={snap?.player} galaxy={galaxy} goal={goal} />

      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 ref={heading} tabIndex={-1} className="text-3xl font-semibold leading-tight focus:outline-none">
            {snap?.player.name ?? <span className="text-muted-foreground">Loading…</span>}
          </h1>
          {snap && (
            <p className="text-sm text-muted-foreground">
              {[snap.player.disambiguation, snap.instruments.slice(0, 4).join(", ")].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {snap && !goal && (
          <div className="flex flex-wrap gap-2">
            <Link to={{ view: "playlist", seeds: [id], n: 10, mix: 0 }} go={go}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ListMusic className="mr-1.5 h-4 w-4" /> Playlist
            </Link>
            <Button variant="outline" size="sm" aria-expanded={connecting} onClick={() => setConnecting((v) => !v)}>
              <Flag className="h-4 w-4" /> Connect from here
            </Button>
          </div>
        )}
      </header>

      {snap && <ProgressLine snap={snap} onRefresh={() => setRefreshes((n) => n + 1)} />}
      {!snap && galaxy && isFullScreen() && (
        // Travelling in full screen: cover the page until the next galaxy arrives.
        <div className="fixed inset-0 z-50 grid place-items-center bg-card text-muted-foreground" aria-hidden>Opening…</div>
      )}
      {!snap && !problem && (
        // Where the galaxy will be, so the page doesn't jump when it arrives.
        <div className="aspect-square max-h-[72vh] w-full animate-pulse rounded-xl border border-border bg-card" aria-hidden />
      )}
      {goal
        ? <ConnectBanner id={id} trail={trail} goal={goal} snap={snap} galaxy={galaxy} go={go} onHint={(n) => { setFilter(n); setShown(PAGE); }} />
        : snap && connecting && <ConnectFrom id={id} name={snap.player.name} go={go} onClose={() => setConnecting(false)} />}
      {problem && <p role="alert" className="text-sm">{problem}</p>}

      {snap && snap.collaborators.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="View" className="flex rounded-lg border border-border p-0.5">
              <ViewButton on={galaxy} onClick={() => setGalaxy(true)} icon={<Orbit className="h-4 w-4" />}>Galaxy</ViewButton>
              <ViewButton on={!galaxy} onClick={() => setGalaxy(false)} icon={<List className="h-4 w-4" />}>List</ViewButton>
            </div>
            <label htmlFor="filter" className="sr-only">Filter by name or instrument</label>
            <Input id="filter" value={filter} onChange={(e) => { setFilter(e.target.value); setShown(PAGE); }}
              placeholder="Filter by name or instrument" autoComplete="off" className="min-w-[12rem] max-w-xs flex-1" />
            {matches && (
              <span className="text-sm text-muted-foreground" role="status">
                {visible.length.toLocaleString()} of {snap.collaborators.length.toLocaleString()}
              </span>
            )}
          </div>

          {galaxy ? (
            <Galaxy snap={snap} matches={matches} goal={goal}
              overlay={<>
                <p className="font-display text-lg font-semibold leading-tight">{snap.player.name}</p>
                {goal && <GoalLine id={id} trail={trail} goal={goal} />}
              </>}
              onPlaylist={(c) => go({ view: "playlist", seeds: [id, c.id], n: 10, mix: 0 })}
              onOpen={(c) => {
                // Measure now: the next player renders before this one is gone.
                heldHeight = box.current?.offsetHeight ?? 0;
                go({ view: "player", id: c.id, trail: childTrail, galaxy: true, goal }, { keepScroll: true });
              }} />
          ) : (
            <>
              <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                {visible.slice(0, shown).map((c) => (
                  <Row key={c.id} c={c} max={max} playerId={id} playerName={snap.player.name}
                    open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)}
                    to={{ view: "player", id: c.id, trail: childTrail, galaxy: false, goal }} go={go} />
                ))}
              </ol>
              {visible.length > shown && (
                <Button variant="outline" onClick={() => setShown(visible.length)} className="self-start">
                  Show all {visible.length.toLocaleString()}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ViewButton({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      {icon}{children}
    </button>
  );
}

function ProgressLine({ snap, onRefresh }: { snap: Snapshot; onRefresh: () => void }) {
  const { recordingsTotal: total, recordingsLoaded: loaded, done, refreshing } = snap.progress;
  const people = snap.collaborators.length;
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  // Screen readers hear the coarse version (every quarter), not every tick.
  const spoken = done ? `All ${total} recordings read.` : refreshing !== undefined ? "Re-reading from MusicBrainz."
    : total ? `Reading credits, about ${Math.floor(pct / 25) * 25} percent.` : "Finding recordings.";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">
        {done
          ? <>
              {`${people.toLocaleString()} ${people === 1 ? "person" : "people"}, from ${total.toLocaleString()} recordings. `}
              <button type="button" onClick={onRefresh} className="underline hover:text-foreground"
                title="Pick up credits added to MusicBrainz since this player was read">
                Re-read from MusicBrainz
              </button>
            </>
          : refreshing !== undefined && loaded >= total
            ? (refreshing
              ? `Re-reading from MusicBrainz: ${refreshing.toLocaleString()} ${refreshing === 1 ? "recording" : "recordings"} to go. New credits appear as they come in.`
              : "Re-reading their recording list from MusicBrainz…")
          : total
            ? `Listening through ${total.toLocaleString()} recordings: ${loaded.toLocaleString()} so far. New people appear as albums come in.`
            : "Looking up their recordings…"}
      </p>
      {!done && (
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
      )}
      <span className="sr-only" role="status">{spoken}</span>
    </div>
  );
}

function years(c: { firstYear?: number; lastYear?: number }) {
  if (!c.firstYear) return "";
  return c.firstYear === c.lastYear ? String(c.firstYear) : `${c.firstYear}–${c.lastYear}`;
}

function Row({ c, max, playerId, playerName, open, onToggle, to, go }: {
  c: Collaborator; max: number; playerId: string; playerName: string;
  open: boolean; onToggle: () => void; to: Route; go: (r: Route) => void;
}) {
  const panel = `rec-${c.id}`;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panel}
          aria-label={`${open ? "Hide" : "Show"} recordings with ${c.name}`}
          className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
          <div className="min-w-0 flex-1">
            <Link to={to} go={go} className="font-medium hover:underline focus-visible:underline focus-visible:outline-none">
              {c.name}
            </Link>
            <span className="block truncate text-sm text-muted-foreground">
              {c.instruments.slice(0, 3).join(", ") || c.disambiguation || " "}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-sm tabular-nums text-muted-foreground sm:justify-end">
            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
              <span className="block h-full bg-primary" style={{ width: `${(c.sharedSessions / max) * 100}%` }} />
            </span>
            <span>
              {c.sharedSessions} {c.sharedSessions === 1 ? "session" : "sessions"} · {c.sharedRecordings} {c.sharedRecordings === 1 ? "track" : "tracks"}
            </span>
            <span className="w-[4.5rem] text-right">{years(c)}</span>
          </div>
        </div>
      </div>
      {open && <SharedList id={panel} a={playerId} b={c.id} aName={playerName} bName={c.name} />}
    </li>
  );
}

function SharedList({ id, a, b, aName, bName }: { id: string; a: string; b: string; aName: string; bName: string }) {
  const [list, setList] = useState<SharedRecording[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    sharedRecordings(a, b, ctrl.signal).then(setList).catch((e: unknown) => {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Couldn't load recordings");
    });
    return () => ctrl.abort();
  }, [a, b]);

  const first = (name: string) => name.split(" ")[0];
  return (
    <div id={id} className="mt-2 pl-8">
      {error ? <p className="text-sm">{error}</p> : !list ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {list.map((r) => (
            <li key={r.recordingId} className="flex flex-col sm:flex-row sm:gap-3">
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{r.date ?? r.year ?? ""}</span>
              <span className="min-w-0">
                <span className="font-medium">{r.title}</span>
                {r.album && <span className="text-muted-foreground"> · {r.album}</span>}
                <span className={cn("block text-xs text-muted-foreground")}>
                  {first(aName)}: {r.instruments.player.join(", ") || "?"} · {first(bName)}: {r.instruments.collaborator.join(", ") || "?"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Breadcrumbs({ trail, go, current, galaxy, goal }: { trail: string[]; go: (r: Route) => void; current?: Player; galaxy: boolean; goal?: string }) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const ctrl = new AbortController();
    for (const id of trail) {
      getPlayer(id, ctrl.signal).then((p) => setNames((n) => ({ ...n, [id]: p.name }))).catch(() => {});
    }
    return () => ctrl.abort();
  }, [trail]);

  if (!trail.length) return null;
  return (
    <nav aria-label="Path so far">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {trail.map((id, i) => (
          <li key={`${id}-${i}`} className="flex items-center gap-1.5">
            <Link to={{ view: "player", id, trail: trail.slice(0, i), galaxy, goal }} go={go} className="hover:text-foreground hover:underline">
              {names[id] ?? "…"}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </li>
        ))}
        <li aria-current="page" className="text-foreground">{current?.name ?? "…"}</li>
        {current && (
          <li className="ml-1">
            <Link to={{ view: "pathlist", ids: [...trail, current.id], per: 2, mix: 0 }} go={go}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground hover:bg-muted">
              <ListMusic className="h-3.5 w-3.5" aria-hidden /> Playlist of this path
            </Link>
          </li>
        )}
      </ol>
    </nav>
  );
}
