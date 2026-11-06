// Pocketlist API.
//   GET /api/search?q=wally%20kane&instrument=flute   → PlayerCandidate[]
//   GET /api/players/:id                              → Player
//   GET /api/players/:id/stream                       → server-sent Snapshot events
//   GET /api/players/:id/with/:otherId                → SharedRecording[]

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import type { Player, PlayerCandidate, SharedRecording, Snapshot } from "../contract/index.ts";
import { aggregate, normalizeTitle, ownInstruments, type CreditRow } from "./aggregate.ts";
import { jobError, watch } from "./crawler.ts";
import { rows } from "./db.ts";
import { PERFORMER_TYPES, rememberArtist } from "./ingest.ts";
import { mb, NotFound, type MbArtist } from "./mb.ts";

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
  return {
    player,
    instruments: ownInstruments(player.id, own),
    progress: {
      recordingsTotal: counts.total,
      recordingsLoaded: counts.loaded,
      done: !!counts.indexed && counts.loaded >= counts.total,
    },
    collaborators: aggregate(player.id, credits),
  };
}

app.get("/api/players/:id/stream", async (c) => {
  const id = c.req.param("id");
  if (!MBID.test(id)) return c.json({ error: "not a MusicBrainz ID" }, 400);
  const player = await findPlayer(id);
  if (!player) return c.json({ error: "not found" }, 404);

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
        const err = jobError(id);
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
    a_instruments: string[]; a_date: string | null; b_instruments: string[]; b_date: string | null; album: string | null;
  }>(
    `select r.id as recording_id, r.title, r.first_release_date,
            a.instruments as a_instruments, a.date as a_date, b.instruments as b_instruments, b.date as b_date,
            (select rl.rg_title from recording_releases rr join releases rl on rl.id = rr.release_id
             where rr.recording_id = r.id order by rl.date asc nulls last limit 1) as album
     from credits a
     join credits b on b.recording_id = a.recording_id
     join recordings r on r.id = a.recording_id
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
  const byKey = new Map<string, SharedRecording>();
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
      album: f.album ?? undefined, instruments: { player: f.a_instruments, collaborator: f.b_instruments },
    });
  }
  const list = [...byKey.values()].sort((x, y) =>
    (x.date ?? String(x.year ?? "9999")).localeCompare(y.date ?? String(y.year ?? "9999")) || x.title.localeCompare(y.title));
  return c.json(list);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong reading MusicBrainz. Try again in a moment." }, 502);
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`Pocketlist API on http://localhost:${port}`);

if (process.env.POCKETLIST_WARM) {
  const { warm, STARTER_IDS } = await import("./warm.ts");
  void warm(STARTER_IDS);
}
