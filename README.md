# Pocketlist

Type a jazz musician's name and see everyone they've recorded with, as a list or as a galaxy you
can fly through. Click any name to keep going.

**Live:** https://pocketlist.damonwood.dev

**Status:** the collaborator list works: search (alias-aware, with a "which one?" step),
a list that streams in as credits are read, click-through with a breadcrumb trail, and the shared
recordings behind each connection. The app is on Vercel; the API and crawler run on Railway;
the cache is Postgres on Neon. The plan and the decisions behind it are in
[docs/DESIGN.md](docs/DESIGN.md).

## Why

In jazz, personnel is the point of a record. Fans follow players from session to session. The
credits exist in open data, but nothing lets you walk them.

## Stack

React, strict TypeScript, Vite and Tailwind on the front end; a small TypeScript API
([Hono](https://hono.dev)) that reads credits from [MusicBrainz](https://musicbrainz.org) and caches
them in Postgres. Locally that's [PGlite](https://pglite.dev), Postgres in WebAssembly, so there's
nothing to install. Data from MusicBrainz is used under its open-data licence.

## How it works

- `contract/` holds the types both sides share, with guards for anything that crosses the network.
- `server/crawler.ts` reads a player's credits. MusicBrainz allows about one request a second, so
  it reads whole albums at a time: look up one unread recording, then fetch its original album,
  which brings every other track's personnel with it. The player you're looking at goes first.
- `server/aggregate.ts` turns credits into counts. A **collaboration** is two people on the same
  recording, not just the same album. Duplicate recordings of one performance count once, and a
  **session** is a recording date (or, without one, an album). Tested in `aggregate.test.ts`.
- The page streams: results appear within seconds and fill in as albums arrive.

## Run it

```bash
npm install
npm run dev      # app on http://localhost:5190, API on :8787
npm test
```

A prolific player's first visit takes 20–30 minutes to fill in completely (results appear right
away). To have some ready in advance, run `npm run dev:warm`: the app as usual, pre-loading a starter
set in the background. Anyone looking at a player still goes first.

## License

Copyright © 2026 Damon Wood. All rights reserved. The source is public to read; it is not
licensed for reuse. See [LICENSE](LICENSE).
