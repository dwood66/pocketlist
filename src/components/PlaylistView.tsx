// A sampler playlist: songs every seed player is on, spread across their sessions, with what
// each of them played. Downloads as plain text or CSV; streaming-service export comes later.

import { useEffect, useState } from "react";
import { Download, Shuffle, X } from "lucide-react";
import type { Playlist, PlaylistTrack } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/Link";
import { playlist } from "@/lib/api";
import type { Route } from "@/lib/route";

const SIZES = [10, 20, 30];

export function PlaylistView({ seeds, n, mix, go }: {
  seeds: string[]; n: number; mix: number; go: (r: Route, opts?: { replace?: boolean }) => void;
}) {
  const [list, setList] = useState<Playlist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    playlist(seeds, n, mix, ctrl.signal).then(setList).catch((e: unknown) => {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Couldn't make the playlist");
    });
    return () => ctrl.abort();
  }, [seeds.join(","), n, mix]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (next: Partial<{ seeds: string[]; n: number; mix: number }>) =>
    go({ view: "playlist", seeds, n, mix, ...next }, { replace: true });
  const names = list?.seeds.map((s) => s.name) ?? [];
  const title = names.length ? names.join(" + ") : "Playlist";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {names.length > 1 ? "Songs they all played on" : "Songs with them on"}, one per session, spread across the years.
        </p>
        {list && (
          <ul className="flex flex-wrap gap-2" aria-label="Players in this playlist">
            {list.seeds.map((p) => (
              <li key={p.id} className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-3 pr-1 text-sm">
                <Link to={{ view: "player", id: p.id, trail: [] }} go={go} className="hover:underline">{p.name}</Link>
                {seeds.length > 1 && (
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => set({ seeds: seeds.filter((s) => s !== p.id), mix: 0 })}
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </header>

      {error && <p role="alert" className="text-sm">{error}</p>}
      {!list && !error && <p className="text-sm text-muted-foreground">Picking songs…</p>}

      {list && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="How many songs" className="flex rounded-lg border border-border p-0.5">
              {SIZES.map((size) => (
                <button key={size} type="button" aria-pressed={n === size} onClick={() => set({ n: size })}
                  className={"rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (n === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {size}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => set({ mix: mix + 1 })} disabled={list.performances <= list.tracks.length}>
              <Shuffle className="mr-1.5 h-4 w-4" /> Another mix
            </Button>
            <Button variant="outline" size="sm" disabled={!list.tracks.length} onClick={() => save(list, "txt")}>
              <Download className="mr-1.5 h-4 w-4" /> Text
            </Button>
            <Button variant="outline" size="sm" disabled={!list.tracks.length} onClick={() => save(list, "csv")}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {list.tracks.length
              ? `${list.tracks.length} of ${list.performances.toLocaleString()} performances, from ${list.sessions.toLocaleString()} ${list.sessions === 1 ? "session" : "sessions"}.`
              : "Nothing with all of them on, in what's been read so far."}
          </p>

          <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {list.tracks.map((t, i) => (
              <li key={t.recordingId} className="flex gap-3 px-4 py-3 text-sm">
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{t.title}</span>
                  {t.album && <span className="text-muted-foreground"> · {t.album}</span>}
                  <span className="block text-xs text-muted-foreground">
                    <span className="tabular-nums sm:hidden">{t.date ?? t.year ?? ""}{(t.date ?? t.year) ? " · " : ""}</span>{why(list, t)}
                  </span>
                </span>
                <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:block">{t.date ?? t.year ?? ""}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/** "Ron Carter: double bass · Herbie Hancock: piano" */
function why(list: Playlist, t: PlaylistTrack) {
  return list.seeds.map((s) => `${s.name}: ${t.instruments[s.id]?.join(", ") || "?"}`).join(" · ");
}

function save(list: Playlist, kind: "txt" | "csv") {
  const name = list.seeds.map((s) => s.name).join(" + ");
  let text: string;
  if (kind === "txt") {
    text = [`${name}: a Pocketlist playlist`, "", ...list.tracks.flatMap((t, i) => [
      `${i + 1}. ${t.title}${t.album ? ` (${t.album})` : ""}${t.date ?? t.year ? `, ${t.date ?? t.year}` : ""}`,
      `   ${why(list, t)}`,
    ]), "", "Credits from MusicBrainz. https://pocketlist.damonwood.dev", ""].join("\n");
  } else {
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    // The byte-order mark tells Excel it's UTF-8, so "1963–1964" doesn't turn into mojibake.
    text = "\uFEFF" + [["#", "title", "album", "date", "players"].join(","),
      ...list.tracks.map((t, i) => [i + 1, t.title, t.album, t.date ?? t.year, why(list, t)].map(cell).join(","))].join("\n") + "\n";
  }
  const url = URL.createObjectURL(new Blob([text], { type: kind === "csv" ? "text/csv" : "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.${kind}`;
  a.click();
  URL.revokeObjectURL(url);
}
