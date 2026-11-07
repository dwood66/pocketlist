import { ListMusic, Orbit } from "lucide-react";
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
          </section>
        )}

        <SearchForm q={route.view === "search" ? route.q : ""} instrument={route.view === "search" ? route.instrument : ""} go={go} compact={!home} />

        <main className="flex flex-col gap-6">
          {home && <Home go={go} />}
          {route.view === "search" && <SearchResults q={route.q} instrument={route.instrument} go={go} />}
          {route.view === "player" && <PlayerView key={route.id} id={route.id} trail={route.trail} galaxy={route.galaxy !== false} goal={route.goal} go={go} />}
          {route.view === "playlist" && <PlaylistView seeds={route.seeds} n={route.n} mix={route.mix} go={go} />}
          {route.view === "pathlist" && <PathPlaylistView ids={route.ids} per={route.per} mix={route.mix} go={go} />}
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
const EXPLORE = [
  { id: "b6ff4fd0-03ae-41a6-942e-7de13124b970", name: "Paul Chambers" },
  { id: "d5ac66e4-ea5d-4ebb-9e0d-bed4063208e7", name: "Elvin Jones" },
  { id: "8247a3f2-3a8e-4256-b322-6c57b03a4e36", name: "Bill Evans" },
  { id: "57db3f59-9c58-4f68-a00e-e044666c4828", name: "Ron Carter" },
];
const PAIRS = [
  { seeds: ["57db3f59-9c58-4f68-a00e-e044666c4828", "27613b78-1b9d-4ec3-9db5-fa0743465fdd"], name: "Ron Carter + Herbie Hancock" },
  { seeds: ["d5ac66e4-ea5d-4ebb-9e0d-bed4063208e7", "b625448e-bf4a-41c3-a421-72ad46cdb831"], name: "Elvin Jones + John Coltrane" },
];

const chip = "rounded-full border border-border px-3 py-1 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Home({ go }: { go: (r: Route) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StartCard icon={<Orbit className="h-5 w-5" />} title="Explore a galaxy"
        text="Everyone a player recorded with, as stars around them. Click one to travel.">
        {EXPLORE.map((p) => (
          <Link key={p.id} to={{ view: "player", id: p.id, trail: [] }} go={go} className={chip}>{p.name}</Link>
        ))}
      </StartCard>
      <ConnectIntro go={go} />
      <StartCard icon={<ListMusic className="h-5 w-5" />} title="Make a playlist"
        text="Songs two players made together, one per session, ready to download.">
        {PAIRS.map((p) => (
          <Link key={p.name} to={{ view: "playlist", seeds: p.seeds, n: 10, mix: 0 }} go={go} className={chip + " rounded-lg text-left"}>{p.name}</Link>
        ))}
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
      <div className="mt-auto flex flex-wrap gap-2 pt-1">{children}</div>
    </section>
  );
}
