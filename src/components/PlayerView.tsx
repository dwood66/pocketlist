import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, List, Orbit } from "lucide-react";
import type { Collaborator, Player, SharedRecording, Snapshot } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/Link";
import { Galaxy, forgetGalaxy } from "@/components/Galaxy";
import { getPlayer, sharedRecordings, streamPlayer } from "@/lib/api";
import type { Route } from "@/lib/route";
import { cn } from "@/lib/utils";

const PAGE = 100;

export function PlayerView({ id, trail, galaxy, go }: {
  id: string; trail: string[]; galaxy: boolean; go: (r: Route, opts?: { replace?: boolean }) => void;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setSnap(null); setProblem(null); setFilter(""); setShown(PAGE); setOpen(null);
    return streamPlayer(id, { snapshot: setSnap, problem: setProblem });
  }, [id]);

  // A new player is a new page: move focus to its name so keyboard and screen-reader
  // users start from the top, as they would after a full page load.
  const loadedId = snap?.player.id;
  useEffect(() => { if (loadedId) heading.current?.focus(); }, [loadedId]);

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
  const setGalaxy = (on: boolean) => go({ view: "player", id, trail, galaxy: on }, { replace: true });

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs trail={trail} go={go} current={snap?.player} galaxy={galaxy} />

      <header>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold focus:outline-none">
          {snap?.player.name ?? <span className="text-muted-foreground">Loading…</span>}
        </h1>
        {snap && (
          <p className="text-sm text-muted-foreground">
            {[snap.player.disambiguation, snap.instruments.slice(0, 4).join(", ")].filter(Boolean).join(" · ")}
          </p>
        )}
      </header>

      {snap && <ProgressLine snap={snap} />}
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
            <span className="text-sm text-muted-foreground">
              {visible.length.toLocaleString()} {visible.length === 1 ? "person" : "people"}
            </span>
          </div>

          {galaxy ? (
            <Galaxy snap={snap} matches={matches}
              onOpen={(c) => go({ view: "player", id: c.id, trail: childTrail, galaxy: true })} />
          ) : (
            <>
              <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                {visible.slice(0, shown).map((c) => (
                  <Row key={c.id} c={c} max={max} playerId={id} playerName={snap.player.name}
                    open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)}
                    to={{ view: "player", id: c.id, trail: childTrail, galaxy: false }} go={go} />
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

function ProgressLine({ snap }: { snap: Snapshot }) {
  const { recordingsTotal: total, recordingsLoaded: loaded, done } = snap.progress;
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  // Screen readers hear the coarse version (every quarter), not every tick.
  const spoken = done ? `All ${total} recordings read.` : total ? `Reading credits, about ${Math.floor(pct / 25) * 25} percent.` : "Finding recordings.";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">
        {done
          ? `${total.toLocaleString()} recordings read.`
          : total
            ? `Reading credits: ${loaded.toLocaleString()} of ${total.toLocaleString()} recordings. The list fills in as albums arrive.`
            : "Finding their recordings…"}
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

function Breadcrumbs({ trail, go, current, galaxy }: { trail: string[]; go: (r: Route) => void; current?: Player; galaxy: boolean }) {
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
            <Link to={{ view: "player", id, trail: trail.slice(0, i), galaxy }} go={go} className="hover:text-foreground hover:underline">
              {names[id] ?? "…"}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </li>
        ))}
        <li aria-current="page" className="text-foreground">{current?.name ?? "…"}</li>
      </ol>
    </nav>
  );
}
