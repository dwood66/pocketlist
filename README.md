# Pocketlist

Type a jazz musician's name and see everyone they've recorded with, as a list or as a galaxy you
can fly through. Click any name to keep going.

**Status:** early. The data test is done ([findings](docs/data-test/FINDINGS.md)); the app is being
scaffolded. The plan and the decisions behind it are in [docs/DESIGN.md](docs/DESIGN.md).

## Why

In jazz, personnel is the point of a record. Fans follow players from session to session. The
credits exist in open data, but nothing lets you walk them.

## Stack

React, strict TypeScript, Vite and Tailwind on the front end; a small TypeScript API that fetches
credits from [MusicBrainz](https://musicbrainz.org) and caches them in Postgres. Data from
MusicBrainz is used under its open-data licence.

## Run it

```bash
npm install
npm run dev
```

## License

Copyright © 2026 Damon Wood. All rights reserved. The source is public to read; it is not
licensed for reuse. See [LICENSE](LICENSE).
