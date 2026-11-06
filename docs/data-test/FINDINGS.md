# M0 data test — findings (2026-11-05)

Script: `datatest.mjs`. Raw output: `results.json`, `results-kane.json`. For each player it
sampled 15 recordings from MusicBrainz and 6 releases from Discogs. No API keys were used.

## Results

| Player | MusicBrainz match | Recordings with a credit (MB) | Instruments as recorded | Discogs releases listed |
|---|---|---|---|---|
| Paul Chambers | "US jazz bassist" (4 other Paul Chamberses below it) | 2,120 | double bass 1,624 · bass 565 | 1,956 |
| Ron Carter | "US jazz double-bassist" | 3,735 | double bass, bass, cello, bass guitar… | 2,700 |
| Elvin Jones | "jazz drummer" | 1,601 | drums (drum set) 1,580 · percussion | 1,378 |
| Bill Evans | "pianist" (the saxophonist and a banjoist also listed) | 2,639 | piano 2,639 · electric piano | 3,430 |
| **Walter Kane** | **no match under that name.** Listed as **"Wally Kane," US woodwind player** | 129 | woodwind, bassoon, reeds, baritone sax, flute, bass flute, contrabass clarinet… | 145 |

Every one of the 75 sampled MusicBrainz recordings had other people credited on it. None came back empty.

## What we learned

**1. MusicBrainz should be the primary source.**
- Credits are on **recordings**, with a structured type (`instrument`, `vocal`, `producer`,
  `engineer`…) and a normalized instrument name. That's exactly the "same recording, not same
  album" rule in the design.
- **Proof:** on *Kind of Blue*, "Freddie Freeloader" lists **Wynton Kelly** on piano and the other
  tracks list **Bill Evans**. Album-level credits would wrongly connect Kelly with Evans. MusicBrainz
  gets it right.
- Non-performers (Rudy Van Gelder, Alfred Lion, Fred Plaut) are typed, so v1 can filter them out
  and M6 can turn them back on.
- Each MusicBrainz artist links to the matching Discogs artist ID, so the two can be cross-referenced later.

**2. Discogs is a good second source, but noisier.**
- Roles are free text: "Written-By", "Liner Notes", "Lacquer Cut By", "Typography". Charlie Parker
  shows up as a "collaborator" of Paul Chambers because he wrote a tune. Using it needs a role parser.
- Name suffixes like "Paul Chambers (3)" are Discogs's own disambiguation, which is useful for matching.
- Some releases only have album-level credits, which the design rules out.
- Strong on big-band personnel: the Sauter-Finegan records list 40–150 credits each.
- **Use it later** to fill gaps, not as the base.

**3. Names are the hard part, as expected.**
- "Walter Kane" finds nothing. He's in MusicBrainz as **Wally Kane**, and "Walter" only matches as
  an alias. **Search has to include aliases, and the "which one?" step has to show why something
  matched** ("matched alias: Walter Kane").
- Bill Evans returns the pianist, the saxophonist and a banjoist. The instrument hint picked the right one.

**4. Fetch by album, not by recording.**
- One request per recording at 1/second means **~35 minutes** for Paul Chambers. Not usable.
- One **release** request (`inc=recordings+recording-level-rels+artist-rels`) returns per-track
  personnel for the whole album in **under a second**. That's what the *Kind of Blue* check above used.
- Plan: start from the player's recording list (one request), group by release, dedupe reissues
  (MusicBrainz has duplicate recordings: "Django" and "The Golden Striker" each appeared twice for
  Wally Kane), then fetch releases one by one, **streaming collaborators to the screen as each
  album arrives**, and cache everything. A prolific player's first visit takes a few minutes to
  fill out completely, but results start appearing within seconds. Every later visit is instant.
- If that's still too slow for demos: pre-load a jazz starter set overnight, or import the
  MusicBrainz database dump. That's when a local Postgres earns its place.

## Wally Kane: checking the results against what's known

- **MusicBrainz top collaborators:** Bernie Glow, Clark Terry, Phil Woods, Ernie Royal, Jimmy
  Cleveland, Percy Heath, Milt Jackson (Modern Jazz Quartet sessions: "Django," "The Golden Striker").
  Tom Dowd also appears (engineer).
- **Discogs top collaborators:** the Sauter-Finegan Orchestra: Nick Travis, Sonny Russo, Gene Allen,
  Harvey Estrin, Joe Venuto, Don Lamond.

**Checked against German Wikipedia (2026-11-05): same person.** Walter "Wally" Kane (Brooklyn,
1933/34 – 2021), saxophones, clarinets, flutes, bassoon and recorders. Toured with the
Sauter-Finegan Orchestra at 19 (Discogs's top results), recorded with the Modern Jazz Quartet
(MusicBrainz's top results), and was a member of the Tonight Show band. Played on Sesame Street
for 40 years. Tom Lord's jazz discography credits him with **106 jazz sessions, 1953–1990**;
MusicBrainz has **129 recordings**. Wikipedia also names **Ron Carter and Bill Evans**, two of the
other test players, so he connects to two of them directly.

**What the sources likely miss:** his pop and studio sessions (Sinatra, Steely Dan, Joni Mitchell,
Billy Joel, Roberta Flack) and 40 years of Sesame Street. Worth checking in M2 whether those are in
MusicBrainz at all, and deciding whether v1 shows non-jazz connections.

## Decisions for the design doc

- MusicBrainz primary, Discogs later as enrichment.
- Collaboration = shared **recording** with a performer relationship (`instrument` / `vocal`).
- Search must match **aliases** and explain the match.
- Fetch per **release**, stream results, cache everything, dedupe reissues.
