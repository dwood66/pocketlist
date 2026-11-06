# Pocketlist — design doc

_Living document. Decisions get recorded here as they're made._

## One line

Type a musician's name and see everyone they've recorded with. Click any name to keep going.

## Why jazz first

Personnel is the point of a jazz record. Fans follow players from session to session, and the
credits are comparatively well documented. One genre also keeps the data manageable while we
learn what the sources actually contain.

## v1: collaborators

1. **Input:** a name, and optionally an instrument ("Bill Evans, piano").
2. **Disambiguate:** if more than one person matches, show a short "which one?" list with what
   tells them apart (instrument, years active, a well-known record).
3. **Results stream in** as recordings are fetched: each collaborator with their instrument(s)
   and the number of recordings shared, sorted by that count.
4. **Every name is a link.** Clicking one makes that player the center. A breadcrumb trail shows
   the path taken and lets you step back.
5. **Each connection can expand** to show the recordings behind it ("played together on…").

## Playlists

A secondary feature, not the headline. Output is a **downloadable file** (plain text and CSV),
with a one-line reason for each song. Streaming-service export can come later.

**Seeds.** Every mode starts from one player or several. With several, a song only qualifies if
**all of them** played on it ("everything Ron Carter and Herbie Hancock played on together").

1. **Sampler:** "10 songs with Player A on them". Picks are spread across sessions and years
   (one per session by default), so it isn't ten takes from one album. Ships first: it falls
   straight out of the collaborator data.
2. **Bridge:** "Player A → about X songs → Player B". Start on a song with A, end on one with B;
   every adjacent pair of songs shares at least one player, and each step says who
   ("both have Paul Chambers on bass"). Shortest path by default; "about X" uses a bounded
   search rather than padding with detours.

## Duplicates and identity

The hard part of any credits data, in two halves.

**The same recording, many times over.** Classic records are reissued, remastered and
compiled dozens of times, which would inflate every count.
- Count distinct MusicBrainz **recordings** (one performance, linked to every release it's on),
  not tracks on releases. That removes most reissues for free.
- Collapse remaining duplicates into **sessions**: a distinct recording date where known,
  otherwise a distinct release group. Alternate takes from one date count once.
- Drop or down-weight compilations, live releases and bootlegs, using release-group types and
  release status.

**The same person, many names.** Players are easier than "artists" (which can be bands, billing
names or one-off groups): a player is one person with an ID and aliases.
- Search by alias; disambiguate by instrument and years.
- A small local overrides table (merge, split, reassign an alias) on top of the source data.
- Later, **crowdsourced curation**: listeners flag wrong merges or missing ones. MusicBrainz is
  already crowdsourced, so the first version is a "suggest a fix on MusicBrainz" link; a review
  queue of our own covers what upstream won't model.

## Later

- **Wider credits:** a setting to count engineers, producers and other credited roles as
  connections, not just performers.
- **AI that acts, not chats:** turning an ambiguous name into the right person ("the Bill Evans
  who played with Scott LaFaro"), building a playlist from plain language ("five songs from
  Coltrane to Herbie, only through drummers"), and explaining each step in one sentence. Model
  output is validated before the app acts on it.
- More to come.

## Similar projects

| Project | What it does | How Pocketlist differs |
|---|---|---|
| [Linked Jazz](https://linkedjazz.org/52new) | Maps relationships between jazz musicians, largely from oral-history interviews | Built from recording credits; covers every credited session |
| [The Jazz Map](https://www.producthunt.com/products/the-jazz-map) | Maps bands, sidemen and influence across jazz history | Per-track personnel; any player in MusicBrainz, found by search |
| [John Dimm's collaboration graph](https://johndimm.vercel.app/collaboration) | Players on an album and what they recorded before and after | Track-level rather than album-level; alias-aware search |
| Jaxsta, Muso.ai | Industry credits databases | For listeners; moving between players is the product |

## Data sources

- **MusicBrainz:** open data, free API (~1 request/second, needs an identifying User-Agent).
  Credits are relationships on recordings: performer by instrument, engineer, producer.
- **Discogs:** strong jazz personnel on releases and tracks; API and data dumps.
- **Not AllMusic:** no public API, and scraping it would break its terms.

**M0 result:** MusicBrainz is primary (recording-level, typed roles, normalized instruments).
Discogs comes later as enrichment (free-text roles, some album-level-only credits). Search must
match aliases ("Walter Kane" is listed as "Wally Kane"). Fetch per release, not per recording:
one request returns a whole album's per-track personnel. See `data-test/FINDINGS.md`.

## Data model (sketch)

```ts
type Person    = { id: string; name: string; disambiguation?: string;
                   instruments: string[]; sources: { musicbrainz?: string; discogs?: string } };
type Recording = { id: string; title: string; date?: string; releaseIds: string[] };
type Credit    = { personId: string; recordingId: string;
                   role: 'performer' | 'engineer' | 'producer' | 'other'; instrument?: string };

// derived, never stored by hand
type Collaborator = { person: Person; sharedRecordings: number; sharedSessions: number;
                      instruments: string[]; firstYear?: number; lastYear?: number };
```

A collaboration means **two people credited on the same recording**, not just the same album.
Album-level credits would connect everyone on a compilation, which is noise.

## Architecture

- **Frontend:** `starter-app/` as the seed. React, strict TypeScript, Vite, Tailwind tokens,
  shadcn/ui, light and dark, mobile-friendly. Deployed on Vercel.
- **Backend:** small TypeScript API. Fetches from the sources with rate limiting, streams
  results to the client, and caches everything.
- **Shared types:** one `contract/` module imported by both sides.
- **Database (from M2):** Postgres, hosted (Neon or Supabase free tier). It caches source data
  and stores the people–recording–credit graph. No graph database needed at this size.
- **Not GraphQL (for now):** the sources don't offer it, and v1 needs about three endpoints.

## Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 ✅ | **Data test** (done 2026-11-05; see `data-test/FINDINGS.md`) | a script pulls credits for five players from MusicBrainz and Discogs; a short findings note says which source to use and what's missing |
| M1 | Scaffold and deploy | public repo, starter app renamed, live "hello" URL |
| M2 | **Collaborators v1** | name (+instrument) → disambiguation → streamed, clickable collaborator list with breadcrumbs; Postgres cache; README with a hero GIF. **First thing worth showing.** |
| M3 | Recordings | each connection expands to the shared recordings; recording pages |
| M4 | Playlists | sampler first (N songs for one or more seed players), then bridges (A → ~X songs → B); download as text/CSV with the reason for each step |
| M5 | AI | name disambiguation, plain-language playlists, one-sentence explanations |
| M6 | Wider credits | engineers, producers and others as an option |

## Open questions

1. **Live and bootleg recordings:** count them as connections, or studio sessions only in v1?
2. **Instrument input:** free text, or a pick list?
3. **Non-jazz sessions:** many jazz players also did pop and studio work. Show those connections in v1?
