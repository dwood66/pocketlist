// A sampler playlist: songs every seed player is on, spread across their sessions, with what
// each of them played. Each song shows its credited artist and length (the surest way to pick
// the right take out of a streaming service's search), links to Spotify, Apple Music (straight
// to the song when its length matches; see server/apple.ts) and YouTube Music, and can be
// swapped for another. The whole list downloads as text or CSV, or copies as a list that
// TuneMyMusic or Soundiiz turn into a playlist on any service.

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardList, Download, ListMusic, RefreshCw, Route as RouteIcon, Shuffle, X } from "lucide-react";
import type { PathPlaylist, Player, Playlist, PlaylistTrack } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/Link";
import { appleMatches, pathPlaylist, playlist, swapTrack } from "@/lib/api";
import { formatLength, listenQuery, SERVICES, textListLine } from "@/lib/listen";
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
  const tracks = list?.tracks ?? [];
  const apple = useApple(tracks);
  const replace = (i: number, t: PlaylistTrack) => setList((l) => l && { ...l, tracks: l.tracks.map((x, k) => (k === i ? t : x)) });
  const title = names.length ? names.join(" + ") : "Playlist";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-primary"><ListMusic className="h-4 w-4" aria-hidden /> Playlist</p>
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
            <div role="group" aria-label="How many songs" title="Number of songs" className="flex rounded-lg border border-border p-0.5">
              {SIZES.map((size) => (
                <button key={size} type="button" aria-pressed={n === size} onClick={() => set({ n: size })}
                  className={"rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (n === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {size}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" title="Pick a different selection by the same rules" onClick={() => set({ mix: mix + 1 })} disabled={list.performances <= list.tracks.length}>
              <Shuffle className="mr-1.5 h-4 w-4" /> Another mix
            </Button>
            <Button variant="outline" size="sm" disabled={!list.tracks.length} title="Download as plain text" onClick={() => save(list, "txt")}>
              <Download className="mr-1.5 h-4 w-4" /> Text
            </Button>
            <Button variant="outline" size="sm" disabled={!list.tracks.length} title="Download as a spreadsheet (CSV)" onClick={() => save(list, "csv")}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            <CopyList lines={list.tracks.map((t) => textListLine(t, names))} />
          </div>

          <p className="text-sm text-muted-foreground" title="Songs picked, out of every performance they're all credited on, and the sessions those come from">
            {list.tracks.length
              ? `${list.tracks.length} of ${list.performances.toLocaleString()} performances, from ${list.sessions.toLocaleString()} ${list.sessions === 1 ? "session" : "sessions"}.`
              : "Nothing with all of them on, in what's been read so far."}
          </p>

          <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {list.tracks.map((t, i) => (
              <TrackRow key={t.recordingId} n={i + 1} track={t} why={why(list, t)} who={names} apple={apple[t.recordingId]}
                seeds={seeds} inList={list.tracks.map((x) => x.recordingId)} onSwap={(next) => replace(i, next)} />
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
      `${i + 1}. ${t.title}${t.artist ? ` – ${t.artist}` : ""}${t.album ? ` (${t.album}${t.albumArtist ? `, ${t.albumArtist}` : ""})` : ""}${t.date ?? t.year ? `, ${t.date ?? t.year}` : ""}${t.length ? ` [${formatLength(t.length)}]` : ""}`,
      `   ${why(list, t)}`,
    ]), "", "Credits from MusicBrainz. https://pocketlist.music", ""].join("\n");
  } else {
    // The byte-order mark tells Excel it's UTF-8, so "1963–1964" doesn't turn into mojibake.
    text = "\uFEFF" + [["#", "title", "artist", "length", "album", "album artist", "date", "players"].join(","),
      ...list.tracks.map((t, i) => [i + 1, t.title, t.artist, formatLength(t.length), t.album, t.albumArtist, t.date ?? t.year, why(list, t)].map(cell).join(","))].join("\n") + "\n";
  }
  download(name, kind, text);
}

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function download(name: string, kind: "txt" | "csv", text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: kind === "csv" ? "text/csv" : "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.${kind}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// A playlist along a path: your breadcrumb trail, a few songs for each link. The first sketch of
// the bridge playlist in DESIGN.md: every song shares a player with the next link.
// ---------------------------------------------------------------------------

export function PathPlaylistView({ ids, per, mix, go }: {
  ids: string[]; per: number; mix: number; go: (r: Route, opts?: { replace?: boolean }) => void;
}) {
  const [list, setList] = useState<PathPlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    pathPlaylist(ids, per, mix, ctrl.signal).then(setList).catch((e: unknown) => {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Couldn't make the playlist");
    });
    return () => ctrl.abort();
  }, [ids.join(","), per, mix]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (next: Partial<{ per: number; mix: number }>) => go({ view: "pathlist", ids, per, mix, ...next }, { replace: true });
  const byId = new Map((list?.players ?? []).map((p) => [p.id, p]));
  const title = list ? list.players.map((p) => p.name).join(" → ") : "Playlist of a path";
  const count = list?.links.reduce((n, l) => n + l.tracks.length, 0) ?? 0;
  const all = list?.links.flatMap((l) => l.tracks) ?? [];
  const apple = useApple(all);
  const replace = (step: number, i: number, t: PlaylistTrack) => setList((l) => l && {
    ...l, links: l.links.map((x, k) => (k === step ? { ...x, tracks: x.tracks.map((y, j) => (j === i ? t : y)) } : x)),
  });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <ListMusic className="h-4 w-4" aria-hidden /> Playlist <span className="text-muted-foreground">of a path</span> <RouteIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
        </p>
        <h1 className="text-3xl font-semibold leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          A playlist along your path: for each step, songs both players are on, so every song hands off to the next.
        </p>
      </header>

      {error && <p role="alert" className="text-sm">{error}</p>}
      {!list && !error && <p className="text-sm text-muted-foreground">Picking songs…</p>}

      {list && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Songs per step" title="Number of songs per step" className="flex items-center rounded-lg border border-border p-0.5">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" aria-pressed={per === n} onClick={() => set({ per: n })}
                  className={"rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (per === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {n}
                </button>
              ))}
              <span className="px-2 text-sm text-muted-foreground">per step</span>
            </div>
            <Button variant="outline" size="sm" title="Pick a different selection by the same rules" onClick={() => set({ mix: mix + 1 })}><Shuffle className="mr-1.5 h-4 w-4" /> Another mix</Button>
            <Button variant="outline" size="sm" disabled={!count} title="Download as plain text" onClick={() => savePath(list, "txt")}><Download className="mr-1.5 h-4 w-4" /> Text</Button>
            <Button variant="outline" size="sm" disabled={!count} title="Download as a spreadsheet (CSV)" onClick={() => savePath(list, "csv")}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
            <CopyList lines={list.links.flatMap((l) => l.tracks.map((t) => textListLine(t, [byId.get(l.from)?.name ?? ""])))} />
          </div>

          <ol className="flex flex-col gap-4">
            {list.links.map((l, i) => {
              const a = byId.get(l.from), b = byId.get(l.to);
              return (
                <li key={`${l.from}-${l.to}-${i}`} className="flex flex-col gap-2">
                  <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
                    <span className="text-sm tabular-nums text-muted-foreground" title="Step along your path: songs both of these players are on">Step {i + 1}</span>
                    {a && <Link to={{ view: "player", id: a.id, trail: [] }} go={go} className="hover:underline">{a.name}</Link>}
                    <span className="text-muted-foreground">→</span>
                    {b && <Link to={{ view: "player", id: b.id, trail: [] }} go={go} className="hover:underline">{b.name}</Link>}
                  </h2>
                  {l.tracks.length ? (
                    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                      {l.tracks.map((t, j) => (
                        <TrackRow key={t.recordingId} track={t} why={pairWhy(a, b, t)} who={[a?.name, b?.name].filter((n): n is string => !!n)}
                          apple={apple[t.recordingId]} seeds={[l.from, l.to]} inList={all.map((x) => x.recordingId)} onSwap={(next) => replace(i, j, next)} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No songs with both of them, in what's been read so far.</p>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}

function pairWhy(a: Player | undefined, b: Player | undefined, t: PlaylistTrack) {
  return [a, b].filter((p): p is Player => !!p).map((p) => `${p.name}: ${t.instruments[p.id]?.join(", ") || "?"}`).join(" · ");
}

function savePath(list: PathPlaylist, kind: "txt" | "csv") {
  const byId = new Map(list.players.map((p) => [p.id, p]));
  const name = list.players.map((p) => p.name).join(" to ");
  let n = 0;
  if (kind === "txt") {
    const lines = [`${list.players.map((p) => p.name).join(" → ")}: a Pocketlist path playlist`, ""];
    list.links.forEach((l, i) => {
      const a = byId.get(l.from), b = byId.get(l.to);
      lines.push(`Step ${i + 1}: ${a?.name} → ${b?.name}`);
      for (const t of l.tracks) {
        lines.push(`${++n}. ${t.title}${t.artist ? ` – ${t.artist}` : ""}${t.album ? ` (${t.album}${t.albumArtist ? `, ${t.albumArtist}` : ""})` : ""}${t.date ?? t.year ? `, ${t.date ?? t.year}` : ""}${t.length ? ` [${formatLength(t.length)}]` : ""}`);
        lines.push(`   ${pairWhy(a, b, t)}`);
      }
      lines.push("");
    });
    lines.push("Credits from MusicBrainz. https://pocketlist.music", "");
    download(name, kind, lines.join("\n"));
  } else {
    const rows = [["#", "step", "title", "artist", "length", "album", "album artist", "date", "players"].join(",")];
    list.links.forEach((l) => {
      const a = byId.get(l.from), b = byId.get(l.to);
      for (const t of l.tracks) rows.push([++n, `${a?.name} → ${b?.name}`, t.title, t.artist, formatLength(t.length), t.album, t.albumArtist, t.date ?? t.year, pairWhy(a, b, t)].map(cell).join(","));
    });
    download(name, kind, "\uFEFF" + rows.join("\n") + "\n");
  }
}

// ---------------------------------------------------------------------------
// One song: title and its credited artist, album and album artist, length, who played what, the
// listen links, and a button to swap it for another song by the same players.
// ---------------------------------------------------------------------------

type AppleMatch = { url: string | null; length?: number } | "pending" | undefined;

function TrackRow({ n, track: t, why: whyText, who, apple, seeds, inList, onSwap }: {
  n?: number; track: PlaylistTrack; why: string; who: string[]; apple: AppleMatch;
  seeds: string[]; inList: string[]; onSwap: (t: PlaylistTrack) => void;
}) {
  const [swapping, setSwapping] = useState(false);
  const [none, setNone] = useState(false);
  const tries = useRef(0);
  const when = t.date ?? t.year ?? "";
  const albumBy = t.albumArtist && t.albumArtist !== t.artist ? t.albumArtist : undefined;

  async function swap() {
    setSwapping(true); setNone(false);
    try {
      const { track } = await swapTrack(seeds, inList, ++tries.current);
      if (track) onSwap(track); else setNone(true);
    } catch { setNone(true); }
    finally { setSwapping(false); }
  }

  return (
    <li className={"flex gap-3 px-4 py-3 text-sm transition-opacity " + (swapping ? "opacity-50" : "")}>
      {n !== undefined && <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground" title="Position in the playlist">{n}</span>}
      <span className="min-w-0 flex-1">
        <span className="font-medium" title="Song title">{t.title}</span>
        {t.artist && <span className="text-muted-foreground"> – <span title="The recording's credited artist, as streaming services list the song">{t.artist}</span></span>}
        {t.album && <span className="text-muted-foreground"> · <cite title="Album" className="italic">{t.album}</cite>{albumBy && <> by <span title="Album artist">{albumBy}</span></>}</span>}
        <span className="block text-xs text-muted-foreground">
          <span className="tabular-nums sm:hidden">
            {when && <span title="Recording date">{when}</span>}{when && t.length ? " · " : ""}
            {t.length ? <span title="Length: look for this in a streaming service's results to find the same take">{formatLength(t.length)}</span> : null}
            {(when || t.length) ? " · " : ""}
          </span>
          <span title="What each of them played on it">{whyText}</span>
        </span>
        <Listen track={t} who={who} apple={apple} />
        {none && <span className="mt-1 block text-xs text-muted-foreground" role="status">No other songs with them, in what's been read so far.</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="hidden text-right tabular-nums text-muted-foreground sm:block">
          <span className="block" title="Recording date">{when}</span>
          {t.length ? <span className="block" title="Length: look for this in a streaming service's results to find the same take">{formatLength(t.length)}</span> : null}
        </span>
        <button type="button" onClick={swap} disabled={swapping}
          aria-label={`Swap ${t.title} for another song with ${who.join(" and ")}`}
          title="Swap for another song with the same players"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
          <RefreshCw className={"h-3.5 w-3.5 " + (swapping ? "animate-spin" : "")} aria-hidden />
        </button>
      </span>
    </li>
  );
}

// Listen links. Spotify and YouTube Music: a search (the song's title, artist and album). Apple
// Music: straight to the song when a match of the same length was found (✓), where "Add to
// Playlist" is in the ⋯ menu; otherwise a search too.
function Listen({ track, who, apple }: { track: PlaylistTrack; who: string[]; apple: AppleMatch }) {
  const q = listenQuery(track, who);
  const link = "text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-current";
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 text-xs">
      {SERVICES.map((svc) => {
        const exact = svc.name === "Apple Music" && apple && apple !== "pending" && apple.url ? apple.url : null;
        return (
          <a key={svc.name} href={exact ?? svc.url(q)} target="_blank" rel="noopener noreferrer"
            aria-label={exact ? `${track.title} on ${svc.name}, matched by length (opens in a new tab)` : `Find ${track.title} on ${svc.name} (opens in a new tab)`}
            title={exact
              ? `This exact recording on ${svc.name} (same length${apple && apple !== "pending" && apple.length ? `, ${formatLength(apple.length)}` : ""}). Add it to a playlist from the ⋯ menu.`
              : svc.name === "Apple Music" && apple === "pending" ? "Looking for this exact recording on Apple Music… (a search for now)"
              : `Search ${svc.name} for this song (opens in a new tab)`}
            className={link}>
            {svc.name}{exact && <Check className="ml-0.5 inline h-3 w-3 align-[-1px] text-primary" aria-hidden />}
          </a>
        );
      })}
    </span>
  );
}

/** Apple Music matches for these songs, asking again every few seconds while some are pending. */
function useApple(tracks: PlaylistTrack[]): Record<string, AppleMatch> {
  const [found, setFound] = useState<Record<string, AppleMatch>>({});
  const ids = tracks.map((t) => t.recordingId).join(",");
  useEffect(() => {
    if (!ids) return;
    const ctrl = new AbortController();
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const ask = async (want: string[]) => {
      try {
        const res = await appleMatches(want, ctrl.signal);
        setFound((f) => ({ ...f, ...res.found, ...Object.fromEntries(res.pending.map((id) => [id, "pending" as const])) }));
        if (res.pending.length && ++polls < 60) timer = setTimeout(() => ask(res.pending), 4000);
      } catch { /* the plain search links still work */ }
    };
    void ask(ids.split(",").slice(0, 60));
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [ids]);
  return found;
}

/** Copies the list as "Artist - Title" lines, which TuneMyMusic and Soundiiz turn into a playlist on any service. */
function CopyList({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={!lines.length}
        title="Copy as an Artist - Title list. Paste it into TuneMyMusic or Soundiiz to make the playlist on Spotify, Apple Music and more."
        onClick={() => navigator.clipboard?.writeText(lines.join("\n") + "\n").then(() => setCopied(true))}>
        {copied ? <Check className="mr-1.5 h-4 w-4" /> : <ClipboardList className="mr-1.5 h-4 w-4" />} {copied ? "Copied" : "Copy for TuneMyMusic"}
      </Button>
      {copied && (
        <span className="text-xs text-muted-foreground" role="status">
          Paste it into <a className="underline" href="https://www.tunemymusic.com/" target="_blank" rel="noopener noreferrer">TuneMyMusic</a> or{" "}
          <a className="underline" href="https://soundiiz.com/" target="_blank" rel="noopener noreferrer">Soundiiz</a> to make the playlist on any service.
        </span>
      )}
    </span>
  );
}
