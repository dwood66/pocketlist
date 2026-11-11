import { Orbit } from "lucide-react";
import { SamplerIcon } from "@/components/marks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Mark } from "@/components/Mark";
import { Link } from "@/components/Link";
import { PlayerView } from "@/components/PlayerView";
import { PathPlaylistView, PlaylistView } from "@/components/PlaylistView";
import { ConnectIntro } from "@/components/Connect";
import { SearchForm, SearchResults } from "@/components/Search";
import { useEffect } from "react";
import { forgetGalaxy } from "@/components/Galaxy";
import { useRoute, type Route } from "@/lib/route";

export default function App() {
  const [route, go] = useRoute();
  const home = route.view === "home";
  // Leaving the galaxy ends full screen and the travel animation's memory.
  useEffect(() => { if (route.view !== "player") forgetGalaxy(); }, [route.view]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5 sm:py-8">
        <header className="flex items-center justify-between gap-4">
          <Link to={{ view: "home" }} go={go} aria-label="Pocketlist, home"
            className="flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Mark />
            <span className="font-display text-xl font-semibold">Pocketlist</span>
          </Link>
          <ThemeToggle />
        </header>

        {home && (
          <section className="flex flex-col gap-2 pt-2">
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Who played with whom, track by track.</h1>
            <p className="max-w-prose text-muted-foreground">
              Pick a jazz musician and see everyone they recorded with, drawn as a galaxy. Click anyone to
              travel to them, and keep going.
            </p>
            <details className="group max-w-prose text-sm text-muted-foreground">
              <summary className="w-fit cursor-pointer select-none rounded text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Why jazz?
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <p>
                  On a jazz record, who’s playing is the point. Fans follow a drummer or a bassist from session to
                  session the way other listeners follow bands, and the same few hundred players turn up on
                  thousands of records, in every combination. That makes jazz a web you can actually walk.
                </p>
                <p>
                  The credits are unusually well kept, too, down to the track, in MusicBrainz’s open data. Pocketlist
                  counts people on the same track, not just the same album, so a pianist who sat in on one tune isn’t
                  credited with the whole record.
                </p>
              </div>
            </details>
          </section>
        )}

        <SearchForm q={route.view === "search" ? route.q : ""} instrument={route.view === "search" ? route.instrument : ""} go={go} compact={!home} />

        <main className="flex flex-col gap-6">
          {home && <Home go={go} />}
          {route.view === "search" && <SearchResults q={route.q} instrument={route.instrument} go={go} />}
          {route.view === "player" && <PlayerView key={route.id} id={route.id} trail={route.trail} galaxy={route.galaxy !== false} goal={route.goal} go={go} />}
          {route.view === "playlist" && <PlaylistView seeds={route.seeds} n={route.n} mix={route.mix} newest={!!route.newest} go={go} />}
          {route.view === "pathlist" && <PathPlaylistView ids={route.ids} per={route.per} mix={route.mix} connect={route.connect} go={go} />}
        </main>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          Credits from <a className="underline" href="https://musicbrainz.org">MusicBrainz</a>, the open music encyclopedia.
          {" · "}<a className="underline" href="https://github.com/dwood66/pocketlist">Source</a>
        </footer>
      </div>
    </div>
  );
}

// Starting points that open instantly: these players' credits are already read.
// Oldest to newest, so the home page shows how far back and forward the galaxy reaches.
const EXPLORE = [
  { id: "4e525f48-6ebf-45fe-8d57-3fd730970725", name: "Milt Hinton", years: "1930s–2000s" },
  { id: "e9ba8ccb-505f-4e5c-b909-65998d0d35b5", name: "Dizzy Gillespie", years: "1930s–1990s" },
  { id: "b6ff4fd0-03ae-41a6-942e-7de13124b970", name: "Paul Chambers", years: "1950s–60s" },
  { id: "8247a3f2-3a8e-4256-b322-6c57b03a4e36", name: "Bill Evans", years: "1950s–70s" },
  { id: "d5ac66e4-ea5d-4ebb-9e0d-bed4063208e7", name: "Elvin Jones", years: "1950s–90s" },
  { id: "57db3f59-9c58-4f68-a00e-e044666c4828", name: "Ron Carter", years: "1960s–today" },
  { id: "f2d13d28-6f74-4dd5-b596-8bd0b6f67615", name: "Jack DeJohnette", years: "1960s–today" },
  { id: "6035000d-b53b-4b01-b5a0-a7572c34e806", name: "Christian McBride", years: "1990s–today" },
];
// From duos to whole bands: adding players is how you find a band.
const PAIRS = [
  { seeds: ["57db3f59-9c58-4f68-a00e-e044666c4828", "27613b78-1b9d-4ec3-9db5-fa0743465fdd"], name: "Ron Carter + Herbie Hancock", kind: "duo" },
  { seeds: ["d5ac66e4-ea5d-4ebb-9e0d-bed4063208e7", "b625448e-bf4a-41c3-a421-72ad46cdb831"], name: "Elvin Jones + John Coltrane", kind: "duo" },
  { seeds: ["601e7466-eaf5-4a91-9909-ffd770b7e04a", "a1235272-3650-4ed7-9317-5a55a08701ec"], name: "Art Blakey + Lee Morgan", kind: "Jazz Messengers" },
  { seeds: ["4e525f48-6ebf-45fe-8d57-3fd730970725", "7c726bbf-8ecc-4ebc-8578-d5ddf535ab44"], name: "Milt Hinton + Osie Johnson", kind: "session aces" },
  { seeds: ["b625448e-bf4a-41c3-a421-72ad46cdb831", "22fe7b6f-af38-458e-87bd-8971e7a2912e", "5af83c93-103f-433b-b759-ea3dca37315e", "d5ac66e4-ea5d-4ebb-9e0d-bed4063208e7"], name: "Coltrane's classic quartet", kind: "4 players",
    who: "John Coltrane, McCoy Tyner, Jimmy Garrison, Elvin Jones" },
  { seeds: ["27613b78-1b9d-4ec3-9db5-fa0743465fdd", "57db3f59-9c58-4f68-a00e-e044666c4828", "b6a30b58-6b00-47c4-a031-c62a6981461f", ""], name: "Miles's second quintet, minus Miles", kind: "4 players",
    who: "Herbie Hancock, Ron Carter, Tony Williams, Wayne Shorter" },
];


function Home({ go }: { go: (r: Route) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StartCard icon={<Orbit className="h-5 w-5" />} title="Explore a galaxy"
        text="Everyone a player recorded with, as stars around them. Click one to travel.">
        <ul className="flex w-full flex-col" aria-label="Players, oldest to newest">
          {EXPLORE.map((p) => (
            <li key={p.id}>
              <Link to={{ view: "player", id: p.id, trail: [] }} go={go}
                className="-mx-1.5 flex items-baseline justify-between gap-2 rounded px-1.5 py-0.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="hover:underline">{p.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="When they were recording">{p.years}</span>
              </Link>
            </li>
          ))}
        </ul>
      </StartCard>
      <ConnectIntro go={go} />
      <StartCard icon={<SamplerIcon className="h-5 w-5" />} title="Make a sampler"
        text="Songs two players made together, one per session. Add more players to find a band.">
        <ul className="flex w-full flex-col" aria-label="Samplers, from duos to bands">
          {PAIRS.map((p) => (
            <li key={p.name}>
              <Link to={{ view: "playlist", seeds: p.seeds, n: 10, mix: 0 }} go={go} title={p.who ?? p.name}
                className="-mx-1.5 flex items-baseline justify-between gap-2 rounded px-1.5 py-0.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="hover:underline">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{p.kind}</span>
              </Link>
            </li>
          ))}
        </ul>
      </StartCard>
    </div>
  );
}

export function StartCard({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className="text-primary">{icon}</span>{title}
      </h2>
      <p className="text-sm text-muted-foreground">{text}</p>
      <div className="flex flex-wrap gap-2 pt-1">{children}</div>
    </section>
  );
}
