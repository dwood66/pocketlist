// A sampler playlist: songs every seed player is on, spread across their sessions, with what
// each of them played. Each song shows its credited artist and length (the best clue for picking
// the right take out of a streaming service's search), links to Spotify, Apple Music (straight
// to the song when its length matches; see server/apple.ts) and YouTube Music, and can be
// swapped for another. The whole list downloads as text or CSV, or copies as a list that
// TuneMyMusic or Soundiiz turn into a playlist on any service.

import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Check, ChevronDown, Download, Loader2, Plus, RefreshCw, Shuffle, X } from "lucide-react";
import { journeyFileName, samplerFileName } from "@/lib/filenames";
import { JourneyIcon, SamplerIcon } from "@/components/marks";
import { TuneMyMusicMark } from "@/components/TuneMyMusicMark";
import type { Credit, PathPlaylist, Player, Playlist, PlaylistTrack, RecordingCredits } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/Link";
import { alsoOn, appleMatches, pathPlaylist, playlist, recordingCredits, swapTrack } from "@/lib/api";
import { bandcampUrl, formatLength, listenQuery, SERVICES, textListLine } from "@/lib/listen";
import { href, type Route } from "@/lib/route";
import { ShareButton, shareUrl } from "@/components/Share";
import { ConnectResult } from "@/components/Connect";
import { journeyPer, rememberJourneyPer, rememberSamplerSize, samplerSize } from "@/lib/prefs";

type Go = (r: Route, opts?: { replace?: boolean }) => void;

const SIZES = [10, 20, 30];

/** Another mix's icon: the shuffle, or a spinner while the new mix is on its way. */
function MixIcon({ busy }: { busy: boolean }) {
  return busy
    ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" aria-hidden />
    : <Shuffle className="h-4 w-4 sm:mr-1.5" aria-hidden />;
}

/** A failed refresh, shown where you were looking (under the buttons), over the list you still have. */
function Problem({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
      <span className="flex-1">{message} The list below is the one you had.</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </p>
  );
}

export function PlaylistView({ seeds, mix, newest, go }: {
  seeds: string[]; mix: number; newest: boolean; go: (r: Route, opts?: { replace?: boolean }) => void;
}) {
  // How many songs is yours, not the link's: 10 until you pick another, then whatever you picked.
  const [n, setN] = useState(samplerSize);
  const [list, setList] = useState<Playlist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // fetching a new list while the old one is on screen

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    setBusy(true);
    let timer: ReturnType<typeof setTimeout>;
    playlist(seeds, n, mix, ctrl.signal).then((l) => {
      setBusy(false);
      // The server sends oldest first. The list is kept in the order shown, so swapping a song
      // and the downloads follow it.
      setList(newest ? { ...l, tracks: [...l.tracks].reverse() } : l);
      // The first look at older data can come back before every song's details are in; they
      // keep filling in on the server, so ask once more and add them to the songs on screen.
      if (l.tracks.some(lacksDetails)) {
        timer = setTimeout(() => playlist(seeds, n, mix, ctrl.signal)
          .then((again) => setList((cur) => cur && { ...cur, tracks: withDetailsFrom(cur.tracks, again.tracks) })).catch(() => {}), 4000);
      }
    }).catch((e: unknown) => {
      if (!ctrl.signal.aborted) { setBusy(false); setError(e instanceof Error ? e.message : "Couldn't make the playlist"); }
    });
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [seeds.join(","), n, mix]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (next: Partial<{ seeds: string[]; mix: number }>) =>
    go({ view: "playlist", seeds, mix, newest, ...next }, { replace: true });
  // Flipping the order doesn't need the server: turn the list round where it is.
  const flip = () => {
    setList((l) => l && { ...l, tracks: [...l.tracks].reverse() });
    go({ view: "playlist", seeds, mix, newest: !newest }, { replace: true });
  };
  const names = list?.seeds.map((s) => s.name) ?? [];
  const tracks = list?.tracks ?? [];
  const apple = useApple(tracks);
  const replace = (i: number, t: PlaylistTrack) => setList((l) => l && { ...l, tracks: l.tracks.map((x, k) => (k === i ? t : x)) });
  const title = names.length ? names.join(" + ") : "Sampler";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary"><SamplerIcon className="h-4 w-4" aria-hidden /> Sampler</p>
          {list && <span className="flex items-center gap-2"><ShareButton url={shareUrl({ view: "playlist", seeds, mix, newest })} title={`${title} · Pocketlist`} /></span>}
        </div>
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
        {list && seeds.length < 4 && list.performances > 0 && (
          <AddPlayer seeds={seeds} performances={list.performances} names={names} add={(id) => set({ seeds: [...seeds, id], mix: 0 })} />
        )}
        <Notes />
      </header>

      {error && !list && <p role="alert" className="text-sm">{error}</p>}
      {!list && !error && <p className="text-sm text-muted-foreground">Picking songs…</p>}

      {list && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="How many songs" title="Number of songs" className="flex rounded-lg border border-border p-0.5">
              {SIZES.map((size) => (
                <button key={size} type="button" aria-pressed={n === size} onClick={() => { rememberSamplerSize(size); setN(size); }}
                  className={"rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (n === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {size}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" aria-label="Another mix" title="Pick a different selection by the same rules" aria-disabled={busy} onClick={() => { if (!busy) set({ mix: mix + 1 }); }} disabled={list.performances <= list.tracks.length}>
              <MixIcon busy={busy} /><Label>Another mix</Label>
            </Button>
            <Button variant="outline" size="sm" disabled={list.tracks.length < 2} aria-pressed={newest} onClick={flip} aria-label={newest ? "Newest first" : "Oldest first"}
              // Tinted while newest first, so the state shows even when the button is only its icon.
              className={newest ? "border-primary/60 bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary" : undefined}
              title={newest ? "Newest first. Click for oldest first." : "Oldest first. Click for newest first."}>
              <ArrowDownUp className="h-4 w-4 sm:mr-1.5" aria-hidden /><Label>{newest ? "Newest first" : "Oldest first"}</Label>
            </Button>
          </div>
          {/* Saving: making it a real playlist comes first; the files are for everything else. */}
          <div className="flex flex-wrap items-center gap-2">
            <CopyList lines={list.tracks.map((t) => textListLine(t, names))} />
            <DownloadMenu disabled={!list.tracks.length} onPick={(kind) => save(list, kind)} />
          </div>
          {error && <Problem message={error} onClose={() => setError(null)} />}
          {busy && <p className="text-sm text-foreground" role="status">Picking another mix…</p>}

          <div aria-busy={busy} className={"flex flex-col gap-4 transition-opacity duration-200 " + (busy ? "pointer-events-none opacity-40" : "")}>
          <p className="text-sm text-muted-foreground" title="Songs picked, out of every performance they're all credited on, and the sessions those come from">
            {list.tracks.length
              ? `${list.tracks.length} of ${list.performances.toLocaleString()} performances, from ${list.sessions.toLocaleString()} ${list.sessions === 1 ? "session" : "sessions"}.`
              : "Nothing with all of them on, in what's been read so far."}
          </p>

          <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {list.tracks.map((t, i) => (
              <TrackRow key={t.recordingId} n={i + 1} track={t} why={why(list, t)} who={names} apple={apple[t.recordingId]}
                seeds={seeds} inList={list.tracks.map((x) => x.recordingId)} onSwap={(next) => replace(i, next)} go={go} />
            ))}
          </ol>
          </div>
        </>
      )}
    </div>
  );
}

const lacksDetails = (t: PlaylistTrack) => !t.artist || !t.length || (t.album && !t.albumArtist);

/** The songs on screen (which may have been swapped), with any details the fresh copy has. */
function withDetailsFrom(shown: PlaylistTrack[], fresh: PlaylistTrack[]) {
  const byId = new Map(fresh.map((t) => [t.recordingId, t]));
  return shown.map((t) => {
    const f = byId.get(t.recordingId);
    return f ? { ...t, artist: t.artist ?? f.artist, length: t.length ?? f.length, albumArtist: t.albumArtist ?? f.albumArtist } : t;
  });
}

/** "Ron Carter: double bass · Herbie Hancock: piano" */
function why(list: Playlist, t: PlaylistTrack) {
  return list.seeds.map((s) => `${s.name}: ${t.instruments[s.id]?.join(", ") || "?"}`).join(" · ");
}

function save(list: Playlist, kind: "txt" | "csv") {
  const name = list.seeds.map((s) => s.name).join(" + ");
  let text: string;
  if (kind === "txt") {
    text = [`${name}: a Pocketlist sampler`, "", ...list.tracks.flatMap((t, i) => [
      `${i + 1}. ${t.title}${t.artist ? ` – ${t.artist}` : ""}${t.album ? ` (${t.album}${t.albumArtist ? `, ${t.albumArtist}` : ""})` : ""}${t.date ?? t.year ? `, ${t.date ?? t.year}` : ""}${t.length ? ` [${formatLength(t.length)}]` : ""}`,
      `   ${why(list, t)}`,
    ]), "", "Credits from MusicBrainz. https://pocketlist.music", ""].join("\n");
  } else {
    // The byte-order mark tells Excel it's UTF-8, so "1963–1964" doesn't turn into mojibake.
    text = "\uFEFF" + [["#", "title", "artist", "length", "album", "album artist", "date", "players"].join(","),
      ...list.tracks.map((t, i) => [i + 1, t.title, t.artist, formatLength(t.length), t.album, t.albumArtist, t.date ?? t.year, why(list, t)].map(cell).join(","))].join("\n") + "\n";
  }
  download(samplerFileName(list.seeds.map((s) => s.name)), kind, text);
}

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** `file` is already a file name without its extension (see lib/filenames.ts). */
function download(file: string, kind: "txt" | "csv", text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: kind === "csv" ? "text/csv" : "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${file}.${kind}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// A playlist along a path: your breadcrumb trail, a few songs for each link. The first sketch of
// the bridge playlist in DESIGN.md: every song shares a player with the next link.
// ---------------------------------------------------------------------------

export function PathPlaylistView({ ids, mix, connect, go }: {
  ids: string[]; mix: number; connect?: boolean; go: (r: Route, opts?: { replace?: boolean }) => void;
}) {
  // Songs per step is yours, not the link's: 2 until you pick another, then whatever you picked.
  const [per, setPer] = useState(journeyPer);
  const [list, setList] = useState<PathPlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // fetching a new list while the old one is on screen

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    setBusy(true);
    let timer: ReturnType<typeof setTimeout>;
    pathPlaylist(ids, per, mix, ctrl.signal).then((l) => {
      setBusy(false);
      setList(l);
      if (l.links.some((x) => x.tracks.some(lacksDetails))) {
        timer = setTimeout(() => pathPlaylist(ids, per, mix, ctrl.signal).then((again) => {
          const fresh = again.links.flatMap((x) => x.tracks);
          setList((cur) => cur && { ...cur, links: cur.links.map((x) => ({ ...x, tracks: withDetailsFrom(x.tracks, fresh) })) });
        }).catch(() => {}), 4000);
      }
    }).catch((e: unknown) => {
      if (!ctrl.signal.aborted) { setBusy(false); setError(e instanceof Error ? e.message : "Couldn't make the playlist"); }
    });
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [ids.join(","), per, mix]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (next: Partial<{ mix: number }>) => go({ view: "pathlist", ids, mix, connect, ...next }, { replace: true });
  const byId = new Map((list?.players ?? []).map((p) => [p.id, p]));
  const ends = list ? [list.players[0], list.players[list.players.length - 1]] : [];
  const title = list ? `${ends[0].name} → ${ends[1].name}` : "Journey";
  const count = list?.links.reduce((n, l) => n + l.tracks.length, 0) ?? 0;
  const all = list?.links.flatMap((l) => l.tracks) ?? [];
  const apple = useApple(all);
  const replace = (step: number, i: number, t: PlaylistTrack) => setList((l) => l && {
    ...l, links: l.links.map((x, k) => (k === step ? { ...x, tracks: x.tracks.map((y, j) => (j === i ? t : y)) } : x)),
  });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        {connect && list && <ConnectResult path={ids} names={byId} go={go} />}
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--goal)]">
            <JourneyIcon className="h-4 w-4" aria-hidden /> Journey
          </p>
          {list && (
            <span className="flex items-center gap-2">
              <ShareButton url={shareUrl({ view: "pathlist", ids, mix, connect })} title={`${title} · Pocketlist`} />
            </span>
          )}
        </div>
        <h1 className="text-3xl font-semibold leading-tight">{title}</h1>
        {list && (
          <ol className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="The route">
            {list.players.map((p, i) => (
              <li key={`${p.id}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground" aria-hidden>→</span>}
                <Link to={{ view: "player", id: p.id, trail: [] }} go={go}
                  className={"rounded-full border px-2 py-0.5 hover:bg-muted " +
                    (i === 0 || i === list.players.length - 1 ? "border-[color:var(--goal)] text-[color:var(--goal)]" : "border-border")}>
                  {p.name}
                </Link>
              </li>
            ))}
          </ol>
        )}
        <p className="text-sm text-muted-foreground">
          From {ends[0]?.name ?? "one player"} to {ends[1]?.name ?? "another"}, hand to hand: for each step, songs both players are on, so every song passes to the next.
        </p>
        <Notes />
      </header>

      {error && !list && <p role="alert" className="text-sm">{error}</p>}
      {!list && !error && <p className="text-sm text-muted-foreground">Picking songs…</p>}

      {list && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Songs per step" title="Number of songs per step" className="flex items-center rounded-lg border border-border p-0.5">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" aria-pressed={per === n} onClick={() => { rememberJourneyPer(n); setPer(n); }}
                  className={"rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (per === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  {n}
                </button>
              ))}
              <span className="px-2 text-sm text-muted-foreground">per step</span>
            </div>
            <Button variant="outline" size="sm" aria-label="Another mix" title="Pick a different selection by the same rules" aria-disabled={busy} onClick={() => { if (!busy) set({ mix: mix + 1 }); }}><MixIcon busy={busy} /><Label>Another mix</Label></Button>
            <Button variant="outline" size="sm" aria-label="Reverse" title={`Go the other way: ${[...list.players].reverse().map((p) => p.name).join(" → ")}`}
              onClick={() => go({ view: "pathlist", ids: [...ids].reverse(), mix, connect }, { replace: true })}>
              <ArrowDownUp className="h-4 w-4 sm:mr-1.5" aria-hidden /><Label>Reverse</Label>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyList lines={list.links.flatMap((l) => l.tracks.map((t) => textListLine(t, [byId.get(l.from)?.name ?? ""])))} />
            <DownloadMenu disabled={!count} onPick={(kind) => savePath(list, kind)} />
          </div>
          {error && <Problem message={error} onClose={() => setError(null)} />}
          {busy && <p className="text-sm text-foreground" role="status">Picking another mix…</p>}

          {/* A route map: a line down the left with a stop at each player, and the songs that
              carry you from one stop to the next hanging between them. */}
          <ol aria-busy={busy} className={"relative pl-8 transition-opacity duration-200 " + (busy ? "pointer-events-none opacity-40" : "")} aria-label="Journey, step by step">
            <span aria-hidden className="absolute bottom-3 left-[9px] top-3 w-0.5 rounded-full bg-[color:var(--goal)] opacity-40" />
            {list.links.map((l, i) => {
              const a = byId.get(l.from), b = byId.get(l.to);
              return (
                <li key={`${l.from}-${l.to}-${i}`} className="flex flex-col gap-2 pb-5">
                  <Stop player={a} edge={i === 0} go={go} />
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span title="Songs both of these players are on">Step {i + 1} · {a?.name} and {b?.name} together</span>
                    <Link to={{ view: "playlist", seeds: [l.from, l.to], mix: 0 }} go={go}
                      title={`A sampler of everything ${a?.name ?? "they"} and ${b?.name ?? "the next player"} recorded together`}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-foreground hover:bg-muted">
                      <SamplerIcon className="h-3 w-3 text-primary" aria-hidden /> Sampler of these two
                    </Link>
                  </p>
                  {l.tracks.length ? (
                    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                      {l.tracks.map((t, j) => (
                        <TrackRow key={t.recordingId} track={t} why={pairWhy(a, b, t)} who={[a?.name, b?.name].filter((n): n is string => !!n)}
                          apple={apple[t.recordingId]} seeds={[l.from, l.to]} inList={all.map((x) => x.recordingId)} onSwap={(next) => replace(i, j, next)} go={go} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No songs with both of them, in what's been read so far.</p>
                  )}
                </li>
              );
            })}
            <li><Stop player={byId.get(list.links[list.links.length - 1]?.to ?? "")} edge go={go} /></li>
          </ol>
        </>
      )}
    </div>
  );
}

/** A stop on the route map: a dot on the line, and the player's name. The ends are filled in. */
function Stop({ player, edge, go }: { player?: Player; edge?: boolean; go: (r: Route) => void }) {
  if (!player) return null;
  return (
    <div className="relative flex items-center">
      <span aria-hidden className={"absolute -left-[29px] h-3.5 w-3.5 rounded-full border-2 border-[color:var(--goal)] " +
        (edge ? "bg-[color:var(--goal)]" : "bg-card")} />
      <Link to={{ view: "player", id: player.id, trail: [] }} go={go} className="font-display text-lg font-semibold hover:underline">{player.name}</Link>
    </div>
  );
}

function pairWhy(a: Player | undefined, b: Player | undefined, t: PlaylistTrack) {
  return [a, b].filter((p): p is Player => !!p).map((p) => `${p.name}: ${t.instruments[p.id]?.join(", ") || "?"}`).join(" · ");
}

/** A full link to a sampler of two players, for the downloads. */
const samplerUrl = (a: string, b: string) => `${location.origin}${href({ view: "playlist", seeds: [a, b], mix: 0 })}`;

function savePath(list: PathPlaylist, kind: "txt" | "csv") {
  const byId = new Map(list.players.map((p) => [p.id, p]));
  let n = 0;
  if (kind === "txt") {
    const lines = [`${list.players.map((p) => p.name).join(" → ")}: a Pocketlist journey`, ""];
    list.links.forEach((l, i) => {
      const a = byId.get(l.from), b = byId.get(l.to);
      lines.push(`Step ${i + 1}: ${a?.name} → ${b?.name}`, `   Sampler of these two: ${samplerUrl(l.from, l.to)}`);
      for (const t of l.tracks) {
        lines.push(`${++n}. ${t.title}${t.artist ? ` – ${t.artist}` : ""}${t.album ? ` (${t.album}${t.albumArtist ? `, ${t.albumArtist}` : ""})` : ""}${t.date ?? t.year ? `, ${t.date ?? t.year}` : ""}${t.length ? ` [${formatLength(t.length)}]` : ""}`);
        lines.push(`   ${pairWhy(a, b, t)}`);
      }
      lines.push("");
    });
    lines.push("Credits from MusicBrainz. https://pocketlist.music", "");
    download(journeyFileName(list.players.map((p) => p.name)), kind, lines.join("\n"));
  } else {
    const rows = [["#", "step", "title", "artist", "length", "album", "album artist", "date", "players", "sampler of these two"].join(",")];
    list.links.forEach((l) => {
      const a = byId.get(l.from), b = byId.get(l.to);
      for (const t of l.tracks) rows.push([++n, `${a?.name} → ${b?.name}`, t.title, t.artist, formatLength(t.length), t.album, t.albumArtist, t.date ?? t.year, pairWhy(a, b, t), samplerUrl(l.from, l.to)].map(cell).join(","));
    });
    download(journeyFileName(list.players.map((p) => p.name)), kind, "\uFEFF" + rows.join("\n") + "\n");
  }
}

// ---------------------------------------------------------------------------
// "Add a player": who else is on the most of these songs. Suggestions come from the list itself,
// with how many of its performances each is on, so adding one always leaves a real playlist and
// you can see how far it narrows. Adding players one at a time is how you find a band.
// ---------------------------------------------------------------------------

function AddPlayer({ seeds, performances, names, add }: {
  seeds: string[]; performances: number; names: string[]; add: (id: string) => void;
}) {
  const [found, setFound] = useState<{ player: Player; performances: number }[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setFound(null);
    alsoOn(seeds, ctrl.signal).then((r) => setFound(r.players)).catch(() => setFound([]));
    return () => ctrl.abort();
  }, [seeds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!found?.length) return null;
  const these = names.length > 1 ? "these" : `${names[0]}'s`;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Add a player:</span> who else is on {these} {performances.toLocaleString()} performances?
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Players to add">
        {found.map(({ player, performances: n }) => (
          <li key={player.id}>
            <button type="button" onClick={() => add(player.id)}
              title={`Add ${player.name}: the list narrows to the ${n.toLocaleString()} performances they're on too`}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border py-0.5 pl-2 pr-2.5 text-sm hover:border-solid hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Plus className="h-3.5 w-3.5 text-primary" aria-hidden />
              {player.name}
              <span className="tabular-nums text-muted-foreground">· {n.toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes about this feature: why finding these songs on a streaming service is hard, and how the
// page helps. Closed until asked for.
// ---------------------------------------------------------------------------

function Notes() {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Notes about this feature</summary>
      <div className="mt-2 flex max-w-prose flex-col gap-2 rounded-lg border border-border bg-card p-4 text-muted-foreground">
        <p className="text-foreground">
          Playlisting is really <em>the</em> thing I've wanted to get out of this for 25+ years. <span className="text-muted-foreground">— Damon</span>
        </p>
        <p className="font-medium text-foreground">Why finding these songs is harder than it looks</p>
        <p>
          In jazz, a tune is rarely recorded once. Standards were played again and again: by different bands, by the
          same band years apart, live and in the studio. Reissues get new titles, compilations repackage the same
          recording under other names, and streaming services label songs their own way. A title search is a guess.
        </p>
        <p>
          The best clue is length. It isn't exact: mastering, a different edit or a fade-out that comes in earlier
          can move the same recording on a reissue by a second or more. But a different take, a live version or a
          re-recording is usually off by much more than that. So each song here shows its length, and Apple Music
          links marked <Check className="mx-0.5 inline h-3 w-3 align-[-1px] text-primary" aria-label="with a tick" /> go
          straight to a song whose length is within a few seconds. Everything else is a search, and the length tells
          you which result is most likely the one.
        </p>
        <p>
          Credits come from <a className="underline" href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer">MusicBrainz</a>,
          which is only as complete as the people who have entered them, so some sessions are missing players or dates.
        </p>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// One song: title and its credited artist, album and album artist, length, who played what, the
// listen links, and a button to swap it for another song by the same players.
// ---------------------------------------------------------------------------

type AppleMatch = { url: string | null; length?: number } | "pending" | undefined;

function TrackRow({ n, track: t, why: whyText, who, apple, seeds, inList, onSwap, go }: {
  n?: number; track: PlaylistTrack; why: string; who: string[]; apple: AppleMatch;
  seeds: string[]; inList: string[]; onSwap: (t: PlaylistTrack) => void; go: Go;
}) {
  const [swapping, setSwapping] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
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
        <Listen track={t} who={who} apple={apple}>
          <button type="button" onClick={() => setShowCredits((v) => !v)} aria-expanded={showCredits} aria-controls={`credits-${t.recordingId}`}
            className="inline-flex items-center gap-0.5 text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-current">
            Credits<ChevronDown className={"h-3 w-3 transition-transform " + (showCredits ? "rotate-180" : "")} aria-hidden />
          </button>
        </Listen>
        {showCredits && <Credits id={t.recordingId} seeds={seeds} go={go} />}
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
// Music: straight to the song when one within a few seconds of its length was found (✓), where "Add to
// Playlist" is in the ⋯ menu; otherwise a search too. Bandcamp, last: a search for the album, to buy it.
function Listen({ track, who, apple, children }: { track: PlaylistTrack; who: string[]; apple: AppleMatch; children?: React.ReactNode }) {
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
              ? `This exact recording on ${svc.name} (within a few seconds of its length${apple && apple !== "pending" && apple.length ? `: ${formatLength(apple.length)}` : ""}). Add it to a playlist from the ⋯ menu.`
              : svc.name === "Apple Music" && apple === "pending" ? "Looking for this exact recording on Apple Music… (a search for now)"
              : `Search ${svc.name} for this song (opens in a new tab)`}
            className={link}>
            {svc.name}{exact && <Check className="ml-0.5 inline h-3 w-3 align-[-1px] text-primary" aria-hidden />}
          </a>
        );
      })}
      <a href={bandcampUrl(track, who)} target="_blank" rel="noopener noreferrer" className={link}
        aria-label={`Find ${track.album ?? track.title} on Bandcamp (opens in a new tab)`}
        title={track.album ? `Search Bandcamp for the album, ${track.album}: the place to buy it, if it's there` : "Search Bandcamp for this song"}>
        Bandcamp
      </a>
      {children}
    </span>
  );
}

/** A song's full credits, under its row: who played what, then who made the record. Each name
 *  opens that person's galaxy; the playlist's own players are in bold. */
function Credits({ id, seeds, go }: { id: string; seeds: string[]; go: Go }) {
  const [credits, setCredits] = useState<RecordingCredits | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    recordingCredits(id).then((c) => { if (live) setCredits(c); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id]);
  const person = (c: Credit) => (
    <li key={c.id} className="flex gap-2">
      <Link to={{ view: "player", id: c.id, trail: [] }} go={go} title={c.disambiguation ? `${c.name} (${c.disambiguation})` : `Open ${c.name}'s galaxy`}
        className={"max-w-[60%] shrink-0 underline decoration-border underline-offset-2 hover:decoration-current " + (seeds.includes(c.id) ? "font-semibold text-foreground" : "text-foreground")}>
        {c.name}
      </Link>
      <span className="text-muted-foreground">{c.roles.join(", ")}</span>
    </li>
  );
  return (
    <div id={`credits-${id}`} className="mt-2 rounded-lg border border-border bg-muted/50 p-3 text-xs" aria-live="polite">
      {failed ? <p>Couldn’t load the credits. Close and try again.</p>
        : !credits ? <p className="text-muted-foreground">Loading credits…</p>
        : (
          <div className="flex flex-col gap-3">
            {!credits.loaded && <p className="text-muted-foreground">Still reading this recording’s credits; there may be more soon.</p>}
            {credits.players.length > 0 && (
              <section>
                <h4 className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">Played</h4>
                <ul className="flex flex-col gap-0.5">{credits.players.map(person)}</ul>
              </section>
            )}
            {credits.crew.length > 0 && (
              <section>
                <h4 className="mb-1 font-medium uppercase tracking-wide text-muted-foreground">Made by</h4>
                <ul className="flex flex-col gap-0.5">{credits.crew.map(person)}</ul>
              </section>
            )}
            <p className="text-muted-foreground">From <a className="underline" href={`https://musicbrainz.org/recording/${id}`} target="_blank" rel="noopener noreferrer">MusicBrainz</a>, where anyone can add what’s missing.</p>
          </div>
        )}
    </div>
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

/** Text and CSV in one menu: a native select, so it works the same with a mouse, a keyboard and
 *  a phone. It always shows "Download"; picking a format downloads it and puts it back. A select
 *  is as wide as its longest option, so the options stay short: on a phone it shares a line. */
function DownloadMenu({ onPick, disabled }: { onPick: (kind: "txt" | "csv") => void; disabled?: boolean }) {
  return (
    <span className="relative inline-flex">
      <Download className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
      <select aria-label="Download the list" disabled={disabled} value=""
        onChange={(e) => { const kind = e.target.value; if (kind === "txt" || kind === "csv") onPick(kind); }}
        className="h-9 cursor-pointer appearance-none rounded-md border border-border bg-background pl-8 pr-7 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
        <option value="" disabled>Download</option>
        <option value="txt">Text (.txt)</option>
        <option value="csv">CSV (.csv)</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </span>
  );
}

/** Copies the list as "Artist - Title" lines and opens TuneMyMusic, whose "Free text" source
 *  turns them into a playlist on any service. TuneMyMusic has no link straight to that step, so
 *  the note says where it is: at the bottom of its list of sources, easy to miss. */
// A settings button's words: icon-only on a phone, where the row would otherwise wrap; the
// button's aria-label and title still say what it does.
function Label({ children }: { children: React.ReactNode }) {
  return <span className="hidden sm:inline">{children}</span>;
}

const TUNEMYMUSIC = "https://www.tunemymusic.com/transfer";

function CopyList({ lines }: { lines: string[] }) {
  // The button stays put and keeps its name, so you can copy again; a tick flashes on its icon
  // and the note about where to paste it stays beside it.
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(false);
  const [failed, setFailed] = useState(false); // the browser wouldn't let us copy
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () => {
    // Start the copy while this page still has focus, then open the tab inside the same click,
    // so pop-up blockers let it through.
    const done = navigator.clipboard?.writeText(lines.join("\n") + "\n");
    window.open(TUNEMYMUSIC, "_blank", "noopener");
    if (!done) { setFailed(true); return; }
    done.then(() => {
      setCopied(true); setFlash(true); setFailed(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlash(false), 2000);
    }, () => setFailed(true));
  };
  // `contents`: the button sits in the row with the others, and the note gets a line of its own
  // (basis-full) at the end of the row (order-last), under Download, so nothing moves when it appears.
  return (
    <span className="contents">
      <Button size="sm" disabled={!lines.length} onClick={copy}
        title="Copies the list and opens TuneMyMusic, which makes it a playlist on Spotify, Apple Music and more">
        {flash ? <Check className="mr-1.5 h-4 w-[27px]" aria-hidden /> : <TuneMyMusicMark className="mr-1.5 h-4 w-[27px]" aria-hidden />} Transfer to playlist
      </Button>
      <span className="sr-only" role="status">{flash ? "Copied" : ""}</span>
      {failed && !copied && (
        // Copy by hand: the lines, already selected, in the format TuneMyMusic's Free text reads.
        <span className="order-last flex basis-full flex-col gap-1">
          <span className="text-xs text-muted-foreground" role="alert">
            This browser wouldn’t let Pocketlist copy. Copy these lines yourself, then in TuneMyMusic choose <strong className="font-medium text-foreground">Free text</strong> (at the bottom of the sources) and paste.
          </span>
          <textarea readOnly rows={Math.min(lines.length, 8)} value={lines.join("\n")} aria-label="The playlist, one Artist - Title per line"
            ref={(el) => { el?.focus(); el?.select(); }}
            className="w-full max-w-xl rounded-md border border-border bg-card p-2 font-mono text-xs" />
        </span>
      )}
      {copied && (
        <span className="order-last basis-full text-xs text-muted-foreground">
          Copied. In <a className="underline" href={TUNEMYMUSIC} target="_blank" rel="noopener noreferrer">TuneMyMusic</a>,
          scroll to the bottom of the sources, choose <strong className="font-medium text-foreground">Free text</strong>, and paste.
          (<a className="underline" href="https://soundiiz.com/" target="_blank" rel="noopener noreferrer">Soundiiz</a> takes it too.)
        </span>
      )}
    </span>
  );
}
