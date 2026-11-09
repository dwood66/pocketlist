import { useEffect, useState, type FormEvent } from "react";
import { Meta } from "@/components/Meta";
import { Search as SearchIcon } from "lucide-react";
import type { PlayerCandidate } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/components/Link";
import { rememberPlayer, search } from "@/lib/api";
import type { Route } from "@/lib/route";

// `compact` (away from the home page): one row on a phone, with the instrument field only on
// wider screens, so the player underneath gets the space.
export function SearchForm({ q, instrument, go, compact }: { q: string; instrument: string; go: (r: Route) => void; compact?: boolean }) {
  const [name, setName] = useState(q);
  const [inst, setInst] = useState(instrument);
  useEffect(() => { setName(q); setInst(instrument); }, [q, instrument]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n) go({ view: "search", q: n, instrument: inst.trim() });
  }

  return (
    <form onSubmit={submit} className={compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row"} role="search">
      <label className="sr-only" htmlFor="q">Musician's name</label>
      <Input id="q" value={name} onChange={(e) => setName(e.target.value)} placeholder="A musician, e.g. Paul Chambers"
        autoComplete="off" spellCheck={false} className={compact ? "min-w-0 flex-[2]" : "sm:flex-[2]"} />
      <label className="sr-only" htmlFor="i">Instrument (optional)</label>
      <Input id="i" value={inst} onChange={(e) => setInst(e.target.value)} placeholder="Instrument (optional)"
        autoComplete="off" className={compact ? "hidden flex-1 sm:block" : "sm:flex-1"} />
      <Button type="submit" className="shrink-0" aria-label={compact ? "Find" : undefined}>
        <SearchIcon className="h-4 w-4" aria-hidden /> <span className={compact ? "hidden sm:inline" : undefined}>Find</span>
      </Button>
    </form>
  );
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; results: PlayerCandidate[] };

export function SearchResults({ q, instrument, go }: { q: string; instrument: string; go: (r: Route) => void }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading" });
    search(q, instrument, ctrl.signal)
      .then((results) => setState({ status: "done", results }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setState({ status: "error", message: e instanceof Error ? e.message : "Search failed" });
      });
    return () => ctrl.abort();
  }, [q, instrument]);

  if (state.status === "loading") return <p className="text-sm text-muted-foreground" role="status">Searching MusicBrainz…</p>;
  if (state.status === "error") return <p className="text-sm" role="alert">{state.message}</p>;
  if (!state.results.length) {
    return <p className="text-sm text-muted-foreground" role="status">Nobody by that name. Try another spelling, or just a surname.</p>;
  }

  return (
    <section aria-labelledby="which">
      <h2 id="which" className="mb-2 text-sm font-medium text-muted-foreground">
        {state.results.length === 1 ? "One match" : "Which one?"}
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
        {state.results.map((c) => (
          <li key={c.id}>
            <Link to={{ view: "player", id: c.id, trail: [] }} go={go} onClick={() => rememberPlayer(c)}
              className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
              <span className="font-medium">
                {c.name}
                {c.instrumentMatch && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary" title="Credited with this instrument in MusicBrainz">plays {instrument}</span>}
              </span>
              <span className="text-sm text-muted-foreground">
                {(c.disambiguation || c.years || c.type !== "Person" || c.country) ? (
                  <Meta parts={[
                    c.disambiguation && [c.disambiguation, "MusicBrainz's description, to tell them from others with the same name"],
                    c.years && [c.years, "Years active, from MusicBrainz"],
                    c.type !== "Person" && c.type && [c.type, "Kind of artist"],
                    c.country && [c.country, "Country"],
                  ]} />
                ) : "No description in MusicBrainz"}
              </span>
              {c.matchedAlias && <span className="text-xs text-muted-foreground">Matched “{c.matchedAlias}”, a name they’re also credited as</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
