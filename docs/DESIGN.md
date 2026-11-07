# Pocketlist — design doc

_Living document. Decisions get recorded here as they're made._

## One line

Type a musician's name and see everyone they've recorded with, as a list or as a galaxy you can
fly through. Click any name to keep going.

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

## The galaxy view

The other way to see the same data, and the fun one. The selected player sits at the center;
every collaborator is a star around them.

- **Distance = how often they recorded together**, counted in shared sessions. Closer means
  more. A log or square-root scale keeps a few prolific partners from crowding the center and
  pushing everyone else onto one far ring.
- **Heat = how concentrated the collaboration was in time:** shared sessions divided by the
  years from first to last (+1). A burst of sessions in one year is **hot**; the same number
  spread over twenty years is a long, steady partnership, **cool**. Distance says *how much*,
  heat says *how intense*.
- **Navigable:** click a star and it becomes the center, with an animated re-layout and the
  breadcrumb trail kept. Pinch-zoom and proper tap targets on mobile.
- **Hover or tap a star:** name, instrument, shared sessions and tracks, first–last year, a few
  of the shared recordings.
- **The list stays** as the accessible, screen-reader-friendly view of the same data.

**As built (2026-11-07):** a canvas, no physics: every star's place is computed, so the same
data always draws the same galaxy and a thousand stars stay smooth.
- **Angle = the year the collaboration began**, clockwise from the top. Each year gets room in
  proportion to how many partnerships began in it, so a busy decade spreads out instead of
  piling into one wedge; the decade marks follow the same scale.
- **Heat** = sessions per year of the partnership on a log scale: about 1.5 a year or fewer is
  cool, 15 or more is hot. Fewer than 3 sessions stays grey.
- Clicking a star recentres on it: the clicked star slides to the middle and shared
  collaborators move to their new places. A player still being read fills in live.
- Keyboard: arrow keys step through stars closest-first, Enter opens, +/- zoom. The list's
  filter dims everyone who doesn't match. The galaxy is the default view (2026-11-07); `?v=list` in the URL keeps the list when shared.

**Open:** a minimum session count before heat applies (2 tracks in 1 year shouldn't look like a
real burst); a time slider to watch the galaxy form (stretch); SVG with d3-force up to a few
hundred stars, canvas beyond that.

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

## Playlist games: hide one half

A bridge is two lists woven together: the **songs**, and the **connections** between them
(the shared players). Hide one half and the playlist becomes a low-key game.

1. **Reveal:** the songs are shown and the connections are hidden. Listen, guess who links
   each pair, then tap **Show connection** to reveal them one step at a time. Works as a
   listening companion: put the playlist on and reveal as you go.
2. **Guess the song:** the reverse. The connections are shown ("Paul Chambers on bass →
   Philly Joe Jones on drums → ...") and the songs are hidden. Work out which recording each
   step is; reveal one at a time.

**Notes**
- Both are display modes over the same bridge result, so they come almost free once bridges
   exist (M4). The text/CSV download can include a "spoilers" section at the end.
- Hints before a full reveal, cheapest first: year → album → instrument → first letter.
- "Guess the song" needs a way to type a guess: matched against the title with the same
   normalizing as dedupe (case, accents, "(take 2)"). Or multiple choice from songs in the same
   session, which makes a fair, hard set of decoys.
- Keep it low-key: no timers or leaderboards to start. A share link that opens the same puzzle
   is enough.
- Accessibility: hidden items are real buttons ("Show connection 3 of 8"), and a revealed item
   is announced politely.

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
| M1 ✅ | Scaffold and deploy (live 2026-11-06: Vercel + Railway + Neon) | public repo, starter app renamed, live "hello" URL |
| M2 ✅ | **Collaborators v1** (live 2026-11-06; GIF 2026-11-07) | name (+instrument) → disambiguation → streamed, clickable collaborator list with breadcrumbs; Postgres cache; README with a hero GIF. **First thing worth showing.** |
| M3 🔨 | **Galaxy view** (first version live 2026-11-07) | collaborators as a navigable galaxy: distance = shared sessions, heat = intensity over time; list stays as the accessible view. **The hero GIF.** |
| M3b | Recordings | each connection expands to the shared recordings; recording pages |
| M4 | Playlists | sampler first (N songs for one or more seed players), then bridges (A → ~X songs → B); download as text/CSV with the reason for each step; then the reveal and guess-the-song modes |
| M5 | AI | name disambiguation, plain-language playlists, one-sentence explanations |
| M6 | Wider credits | engineers, producers and others as an option |

## Open questions

1. **Live and bootleg recordings:** count them as connections, or studio sessions only in v1?
2. **Instrument input:** free text, or a pick list?
3. **Non-jazz sessions:** many jazz players also did pop and studio work. Show those connections in v1?
