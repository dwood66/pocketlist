// Pocketlist API.
//   GET /api/search?q=wally%20kane&instrument=flute   → PlayerCandidate[]
//   GET /api/players/:id                              → Player
//   GET /api/players/:id/stream                       → server-sent Snapshot events
//   GET /api/players/:id/with/:otherId                → SharedRecording[]

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import type { Path, PathPlaylist, Player, PlayerCandidate, Playlist, SharedRecording, Snapshot } from "../contract/index.ts";
import { aggregate, normalizeTitle, ownInstruments, type CreditRow } from "./aggregate.ts";
import { jobError, refresh, refreshing, watch } from "./crawler.ts";
import { samplePlaylist, type SampledTrack, type SeedCreditRow } from "./playlist.ts";
import { rows } from "./db.ts";
import { PERFORMER_TYPES, rememberArtist } from "./ingest.ts";
import { creditName, mb, NotFound, type MbArtist, type MbRelease } from "./mb.ts";

const app = new Hono();

// Deployed, the app (Vercel) and the API (an always-on host) are on different domains.
// Only the app's own origins may call the API from a browser. ALLOWED_ORIGINS is a
// comma-separated list; "*" matches within one label, for preview URLs, e.g.
//   https://pocketlist-tau.vercel.app,https://pocketlist-*.vercel.app
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5190")
  .split(",").map((o) => o.trim()).filter(Boolean)
  .map((o) => new RegExp("^" + o.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+") + "$"));
app.use("/api/*", cors({
  origin: (origin) => (ORIGINS.some((re) => re.test(origin)) ? origin : null),
  allowMethods: ["GET"],
}));

app.get("/api/health", (c) => c.json({ ok: true }));
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const escapeLucene = (s: string) => s.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, "\\$&");

app.get("/api/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 100);
  const instrument = fold(c.req.query("instrument") ?? "");
  if (!q) return c.json([]);

  const res = await mb<{ artists: MbArtist[] }>(`artist?query=${encodeURIComponent(escapeLucene(q))}&limit=12`);
  const want = fold(q);
  const words = want.split(" ");
  // Every typed word should appear in the name or an alias ("walter kane" shouldn't offer
  // Dick Walter). If that leaves nothing, the user probably made a typo, so fall back to
  // MusicBrainz's own fuzzy ranking.
  const hasAllWords = (a: MbArtist) =>
    [a.name, ...(a.aliases ?? []).map((x) => x.name)].some((n) => words.every((w) => fold(n).split(" ").includes(w)));
  const strict = res.artists.filter(hasAllWords);
  const candidates = (strict.length ? strict : res.artists)
    .filter((a) => (a.score ?? 0) >= 60)
    .map((a): PlayerCandidate & { score: number } => {
      const nameMatches = fold(a.name).includes(want) || want.includes(fold(a.name));
      const alias = nameMatches ? undefined : a.aliases?.find((x) => fold(x.name).includes(want) || want.includes(fold(x.name)))?.name;
      // Genre names that contain instrument words ("drum & bass") would otherwise match.
      const about = fold([a.disambiguation ?? "", ...(a.tags ?? []).map((t) => t.name)].join(" "))
        .replace(/drum (and |n )?bass|bass music|piano house|guitar pop/g, "");
      const ls = a["life-span"];
      const years = ls?.begin ? `${ls.begin.slice(0, 4)}–${ls.end ? ls.end.slice(0, 4) : ""}` : undefined;
      return {
        id: a.id, name: a.name, disambiguation: a.disambiguation || undefined, type: a.type ?? undefined,
        country: a.country ?? undefined, years, matchedAlias: alias,
        instrumentMatch: !!instrument && about.includes(instrument),
        score: a.score ?? 0,
      };
    })
    .sort((x, y) =>
      Number(y.instrumentMatch) - Number(x.instrumentMatch) ||
      Number(y.type === "Person") - Number(x.type === "Person") ||
      y.score - x.score)
    .slice(0, 8);

  for (const cand of candidates) await rememberArtist(cand);
  return c.json(candidates.map(({ score: _score, ...rest }) => rest));
});

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

async function findPlayer(id: string): Promise<Player | undefined> {
  const [a] = await rows<{ name: string; disambiguation: string | null }>(`select name, disambiguation from artists where id = $1`, [id]);
  if (a) return { id, name: a.name, disambiguation: a.disambiguation ?? undefined };
  const [credit] = await rows<{ artist_name: string; artist_disambiguation: string | null }>(
    `select artist_name, artist_disambiguation from credits where artist_id = $1 limit 1`, [id]);
  if (credit) return { id, name: credit.artist_name, disambiguation: credit.artist_disambiguation ?? undefined };
  try {
    const m = await mb<MbArtist>(`artist/${id}`);
    await rememberArtist(m);
    return { id, name: m.name, disambiguation: m.disambiguation || undefined };
  } catch (e) {
    if (e instanceof NotFound) return undefined;
    throw e;
  }
}

app.get("/api/players/:id", async (c) => {
  const id = c.req.param("id");
  if (!MBID.test(id)) return c.json({ error: "not a MusicBrainz ID" }, 400);
  const p = await findPlayer(id);
  return p ? c.json(p) : c.json({ error: "not found" }, 404);
});

async function snapshot(player: Player): Promise<Snapshot> {
  const credits = await rows<CreditRow>(
    `with mine as (
       select distinct recording_id from credits where artist_id = $1 and rel_type = any($2)
     ), first_rg as (
       select distinct on (rr.recording_id) rr.recording_id, rl.rg_id
       from recording_releases rr join releases rl on rl.id = rr.release_id
       where rr.recording_id in (select recording_id from mine)
       order by rr.recording_id, rl.date asc nulls last
     )
     select c.recording_id, r.title, r.first_release_date, f.rg_id, c.artist_id, c.artist_name,
            c.artist_disambiguation, c.instruments, c.date
     from credits c
     join mine m on m.recording_id = c.recording_id
     join recordings r on r.id = c.recording_id
     left join first_rg f on f.recording_id = c.recording_id
     where c.rel_type = any($2) and r.credits_loaded`,
    [player.id, PERFORMER_TYPES],
  );
  const own = await rows<Pick<CreditRow, "artist_id" | "recording_id" | "instruments">>(
    `select c.recording_id, c.instruments, c.artist_id from credits c where c.artist_id = $1 and c.rel_type = any($2)`,
    [player.id, PERFORMER_TYPES],
  );
  const [counts] = await rows<{ total: number; loaded: number; indexed: boolean }>(
    `select count(distinct c.recording_id)::int as total,
            count(distinct c.recording_id) filter (where r.credits_loaded)::int as loaded,
            (select indexed_at is not null from artists where id = $1) as indexed
     from credits c join recordings r on r.id = c.recording_id
     where c.artist_id = $1 and c.rel_type = any($2)`,
    [player.id, PERFORMER_TYPES],
  );
  const again = refreshing(player.id);
  return {
    player,
    instruments: ownInstruments(player.id, own),
    progress: {
      recordingsTotal: counts.total,
      recordingsLoaded: counts.loaded,
      done: !!counts.indexed && counts.loaded >= counts.total && again === null,
      ...(again !== null && { refreshing: again }),
    },
    collaborators: aggregate(player.id, credits),
  };
}

app.get("/api/players/:id/stream", async (c) => {
  const id = c.req.param("id");
  if (!MBID.test(id)) return c.json({ error: "not a MusicBrainz ID" }, 400);
  const player = await findPlayer(id);
  if (!player) return c.json({ error: "not found" }, 404);

  // ?refresh=1 re-reads the player from MusicBrainz (see crawler.ts), at most every few minutes.
  const tooSoon = c.req.query("refresh") === "1" && !refresh(id);

  return streamSSE(c, async (stream) => {
    let dirty = true;
    let closed = false;
    const unwatch = watch(id, () => { dirty = true; });
    stream.onAbort(() => { closed = true; unwatch(); });

    // Send at most one snapshot every 1.5 seconds: often enough to feel live, rarely
    // enough that a 400-person list isn't re-sent dozens of times a minute.
    while (!closed) {
      if (dirty) {
        dirty = false;
        const snap = await snapshot(player);
        await stream.writeSSE({ event: "snapshot", data: JSON.stringify(snap) });
        const err = jobError(id) ?? (tooSoon ? "Re-read from MusicBrainz a few minutes ago. Give it ten minutes before trying again." : undefined);
        if (err) await stream.writeSSE({ event: "problem", data: JSON.stringify({ message: err }) });
        if (snap.progress.done) break;
      }
      await stream.sleep(1500);
    }
    unwatch();
  });
});

app.get("/api/players/:id/with/:other", async (c) => {
  const { id, other } = c.req.param();
  if (!MBID.test(id) || !MBID.test(other)) return c.json({ error: "not a MusicBrainz ID" }, 400);
  const found = await rows<{
    recording_id: string; title: string; first_release_date: string | null;
    a_instruments: string[]; a_date: string | null; b_instruments: string[]; b_date: string | null;
    album: string | null; release_id: string | null; album_artist: string | null;
  }>(
    // The album is picked the same way as in playlists: the original official album first.
    `select r.id as recording_id, r.title, r.first_release_date,
            a.instruments as a_instruments, a.date as a_date, b.instruments as b_instruments, b.date as b_date,
            f.album, f.release_id, f.album_artist
     from credits a
     join credits b on b.recording_id = a.recording_id
     join recordings r on r.id = a.recording_id
     left join lateral (${BEST_ALBUM.replace("c.recording_id", "r.id")}) f on true
     where a.artist_id = $1 and b.artist_id = $2 and a.rel_type = any($3) and b.rel_type = any($3)`,
    [id, other, PERFORMER_TYPES],
  );
  // A recording can come back on several rows (one per credit), so merge by recording first.
  const byRecording = new Map<string, (typeof found)[number]>();
  for (const f of found) {
    const seen = byRecording.get(f.recording_id);
    if (!seen) { byRecording.set(f.recording_id, { ...f }); continue; }
    seen.a_instruments = [...new Set([...seen.a_instruments, ...f.a_instruments])];
    seen.b_instruments = [...new Set([...seen.b_instruments, ...f.b_instruments])];
    seen.a_date = [seen.a_date, f.a_date].filter(Boolean).sort()[0] ?? null;
    seen.b_date = [seen.b_date, f.b_date].filter(Boolean).sort()[0] ?? null;
  }
  // Then the same rules as the counts: one entry per performance, not per duplicate recording.
  const byKey = new Map<string, SharedRecording & { releaseId?: string }>();
  for (const f of byRecording.values()) {
    const date = f.a_date ?? f.b_date ?? undefined;
    const key = `${normalizeTitle(f.title)}|${date ?? f.album ?? f.recording_id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.instruments.player = [...new Set([...existing.instruments.player, ...f.a_instruments])];
      existing.instruments.collaborator = [...new Set([...existing.instruments.collaborator, ...f.b_instruments])];
      continue;
    }
    const y = (date ?? f.first_release_date ?? "").slice(0, 4);
    byKey.set(key, {
      recordingId: f.recording_id, title: f.title, date, year: /^\d{4}$/.test(y) ? Number(y) : undefined,
      album: f.album ?? undefined, albumArtist: f.album_artist ?? undefined, releaseId: f.release_id ?? undefined,
      instruments: { player: f.a_instruments, collaborator: f.b_instruments },
    });
  }
  const list = [...byKey.values()].sort((x, y) =>
    (x.date ?? String(x.year ?? "9999")).localeCompare(y.date ?? String(y.year ?? "9999")) || x.title.localeCompare(y.title));
  const body: SharedRecording[] = await withAlbumArtists(list);
  return c.json(body);
});

// The album a recording is best known from: an official album with no "compilation" or
// "live" tags first, then the earliest. Used wherever one album name stands for a song.
const BEST_ALBUM = `
  select rl.rg_id, rl.rg_title as album, rl.id as release_id, rl.artist_credit as album_artist
  from recording_releases rr join releases rl on rl.id = rr.release_id
  where rr.recording_id = c.recording_id
  order by (rl.status = 'Official') desc nulls last, (rl.rg_primary = 'Album') desc nulls last,
           coalesce(array_length(rl.rg_secondary, 1), 0) asc, rl.date asc nulls last
  limit 1`;

// Album artists for songs we're about to show. Releases read since this was added carry their
// artist credit; for older ones, one MusicBrainz search fetches up to 100 at a time (at most two
// searches per call, so a long list never waits more than a couple of seconds), and the answers
// are stored, so each look fills in more. Best effort: if MusicBrainz is slow, songs simply go
// out without it.
async function withAlbumArtists<T extends { albumArtist?: string; releaseId?: string }>(items: T[]): Promise<Omit<T, "releaseId">[]> {
  const missing = [...new Set(items.filter((t) => !t.albumArtist && t.releaseId).map((t) => t.releaseId!))].slice(0, 200);
  const found = new Map<string, string>();
  try {
    for (let i = 0; i < missing.length; i += 100) {
      const ids = missing.slice(i, i + 100);
      const res = await mb<{ releases?: MbRelease[] }>(`release?query=${encodeURIComponent(`reid:(${ids.join(" OR ")})`)}&limit=100`);
      for (const r of res.releases ?? []) {
        const name = creditName(r["artist-credit"]);
        if (name && ids.includes(r.id)) found.set(r.id, name);
      }
    }
    if (found.size) {
      await rows(`update releases r set artist_credit = v.ac from unnest($1::text[], $2::text[]) as v(id, ac) where r.id = v.id`,
        [[...found.keys()], [...found.values()]]);
    }
  } catch (e) {
    console.warn(`album artists: ${e instanceof Error ? e.message : String(e)}`);
  }
  return items.map(({ releaseId, ...t }) => ({ ...t, albumArtist: t.albumArtist ?? (releaseId ? found.get(releaseId) : undefined) }));
}

// Every seed's credits on the recordings they were all on, for the playlist rules.
function seedRows(seeds: string[]) {
  return rows<SeedCreditRow>(
    `with shared as (
       select recording_id from credits where artist_id = any($1) and rel_type = any($2)
       group by recording_id having count(distinct artist_id) = $3
     )
     select c.recording_id, r.title, r.first_release_date, f.rg_id, f.album, f.release_id, f.album_artist,
            c.artist_id, c.instruments, c.date
     from credits c
     join shared s on s.recording_id = c.recording_id
     join recordings r on r.id = c.recording_id
     left join lateral (${BEST_ALBUM}) f on true
     where c.artist_id = any($1) and c.rel_type = any($2) and r.credits_loaded`,
    [seeds, PERFORMER_TYPES, seeds.length],
  );
}

// Sampler playlist: ?seeds=<id>,<id>&n=10&mix=0. Songs every seed played on; see playlist.ts.
app.get("/api/playlist", async (c) => {
  const seeds = [...new Set((c.req.query("seeds") ?? "").split(",").filter((id) => MBID.test(id)))];
  if (seeds.length < 1 || seeds.length > 4) return c.json({ error: "one to four players, please" }, 400);
  const n = Math.min(50, Math.max(1, Number(c.req.query("n")) || 10));
  const mix = Math.max(0, Math.floor(Number(c.req.query("mix")) || 0));
  const players = await Promise.all(seeds.map(findPlayer));
  if (players.some((p) => !p)) return c.json({ error: "not found" }, 404);
  const sample = samplePlaylist(await seedRows(seeds), seeds, n, mix);
  const body: Playlist = { seeds: players as Player[], ...sample, tracks: await withAlbumArtists(sample.tracks) };
  return c.json(body);
});

// A playlist along a path of players (your breadcrumb trail): ?ids=<a>,<b>,<c>&per=2&mix=0.
// For each link, a few songs both players are on, picked by the same rules as the sampler.
app.get("/api/path-playlist", async (c) => {
  const ids = (c.req.query("ids") ?? "").split(",").filter((id) => MBID.test(id));
  if (ids.length < 2 || ids.length > 12) return c.json({ error: "two to twelve players, please" }, 400);
  const per = Math.min(5, Math.max(1, Number(c.req.query("per")) || 2));
  const mix = Math.max(0, Math.floor(Number(c.req.query("mix")) || 0));
  const players = await Promise.all(ids.map(findPlayer));
  if (players.some((p) => !p)) return c.json({ error: "not found" }, 404);
  // No tune twice in the whole list: a player in the middle of the path is in two pairs, so
  // the same song (or another take of it) would otherwise turn up in neighbouring steps.
  const used = new Set<string>();
  const steps: { from: string; to: string; performances: number; tracks: SampledTrack[] }[] = [];
  for (let i = 0; i + 1 < ids.length; i++) {
    const pair = [ids[i], ids[i + 1]];
    const sample = samplePlaylist(await seedRows(pair), pair, per, mix, used);
    for (const t of sample.tracks) used.add(normalizeTitle(t.title));
    steps.push({ from: ids[i], to: ids[i + 1], performances: sample.performances, tracks: sample.tracks });
  }
  const filled = await withAlbumArtists(steps.flatMap((s) => s.tracks));
  const byRec = new Map(filled.map((t) => [t.recordingId, t]));
  const links: PathPlaylist["links"] = steps.map((s) => ({ ...s, tracks: s.tracks.map((t) => byRec.get(t.recordingId)!) }));
  const body: PathPlaylist = { players: players as Player[], links };
  return c.json(body);
});

// Shortest known chain between two players: ?from=<id>&to=<id>. Breadth-first over "credited
// on the same recording", from both ends at once, through everything read so far. "Known"
// matters: reading more can only make it shorter.
const MAX_HOPS = 6;
const MAX_FRONTIER = 4000;

async function neighbours(ids: string[]) {
  return rows<{ src: string; dst: string }>(
    `select distinct a.artist_id as src, b.artist_id as dst
     from credits a
     join credits b on b.recording_id = a.recording_id
     join recordings r on r.id = a.recording_id
     where a.artist_id = any($1) and a.rel_type = any($2) and b.rel_type = any($2)
       and b.artist_id <> a.artist_id and r.credits_loaded
       and b.artist_name !~ '^\\[.*\\]$'`, // MusicBrainz placeholders like [unknown] aren't people
    [ids, PERFORMER_TYPES],
  );
}

app.get("/api/path", async (c) => {
  const from = c.req.query("from") ?? "", to = c.req.query("to") ?? "";
  if (!MBID.test(from) || !MBID.test(to)) return c.json({ error: "not a MusicBrainz ID" }, 400);
  const prev = [new Map<string, string | null>([[from, null]]), new Map<string, string | null>([[to, null]])];
  let frontier = [[from], [to]];
  let meet: string | null = from === to ? from : null;
  for (let hops = 0; !meet && hops < MAX_HOPS; hops++) {
    const side = frontier[0].length <= frontier[1].length ? 0 : 1; // grow the smaller side
    if (!frontier[side].length || frontier[side].length > MAX_FRONTIER) break;
    const next: string[] = [];
    for (const { src, dst } of await neighbours(frontier[side])) {
      if (prev[side].has(dst)) continue;
      prev[side].set(dst, src);
      next.push(dst);
      if (prev[1 - side].has(dst)) { meet = dst; break; }
    }
    frontier[side] = next;
  }
  if (!meet) return c.json({ error: "no known path yet" }, 404);

  const ids: string[] = [];
  for (let at: string | null = meet; at; at = prev[0].get(at) ?? null) ids.unshift(at);
  for (let at = prev[1].get(meet) ?? null; at; at = prev[1].get(at) ?? null) ids.push(at);

  const names = await rows<{ artist_id: string; artist_name: string; artist_disambiguation: string | null }>(
    `select distinct on (artist_id) artist_id, artist_name, artist_disambiguation from credits where artist_id = any($1)`, [ids]);
  const byId = new Map(names.map((n) => [n.artist_id, n]));
  const links: Path["links"] = [];
  for (let i = 0; i + 1 < ids.length; i++) {
    const [link] = await rows<{ recording_id: string; title: string; album: string | null; date: string | null }>(
      `select c.recording_id, r.title, f.album, coalesce(c.date, d.date, r.first_release_date) as date
       from credits c
       join credits d on d.recording_id = c.recording_id and d.artist_id = $2 and d.rel_type = any($3)
       join recordings r on r.id = c.recording_id
       left join lateral (${BEST_ALBUM}) f on true
       where c.artist_id = $1 and c.rel_type = any($3) and r.credits_loaded
       order by f.album is null, coalesce(c.date, d.date, r.first_release_date) asc nulls last
       limit 1`,
      [ids[i], ids[i + 1], PERFORMER_TYPES],
    );
    const y = (link?.date ?? "").slice(0, 4);
    links.push({ recordingId: link.recording_id, title: link.title, album: link.album ?? undefined,
      year: /^\d{4}$/.test(y) ? Number(y) : undefined });
  }
  const body: Path = {
    players: ids.map((id) => {
      const n = byId.get(id);
      return { id, name: n?.artist_name ?? "?", disambiguation: n?.artist_disambiguation ?? undefined };
    }),
    links,
  };
  return c.json(body);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong reading MusicBrainz. Try again in a moment." }, 502);
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`Pocketlist API on http://localhost:${port}`);

if (process.env.POCKETLIST_WARM) {
  const { warm, WARM_IDS } = await import("./warm.ts");
  void warm(WARM_IDS);
}
