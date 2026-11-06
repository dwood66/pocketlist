import { ThemeToggle } from "@/components/ThemeToggle";
import { Link } from "@/components/Link";
import { PlayerView } from "@/components/PlayerView";
import { SearchForm, SearchResults } from "@/components/Search";
import { useRoute, type Route } from "@/lib/route";

export default function App() {
  const [route, go] = useRoute();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:py-8">
        <header className="flex items-center justify-between gap-4">
          <Link to={{ view: "home" }} go={go} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            <span className="text-xl font-bold">Pocketlist</span>
            <span className="block text-sm text-muted-foreground">Who played with whom, track by track.</span>
          </Link>
          <ThemeToggle />
        </header>

        <SearchForm q={route.view === "search" ? route.q : ""} instrument={route.view === "search" ? route.instrument : ""} go={go} />

        <main className="flex flex-col gap-6">
          {route.view === "home" && <Intro go={go} />}
          {route.view === "search" && <SearchResults q={route.q} instrument={route.instrument} go={go} />}
          {route.view === "player" && <PlayerView key={route.id} id={route.id} trail={route.trail} go={go} />}
        </main>

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          Credits from <a className="underline" href="https://musicbrainz.org">MusicBrainz</a>, the open music encyclopedia.
        </footer>
      </div>
    </div>
  );
}

function Intro({ go }: { go: (r: Route) => void }) {
  const tries = [
    { q: "Paul Chambers", i: "bass" },
    { q: "Elvin Jones", i: "drums" },
    { q: "Bill Evans", i: "piano" },
    { q: "Walter Kane", i: "" },
  ];
  return (
    <section className="flex flex-col gap-3 text-sm text-muted-foreground">
      <p>
        Type a jazz musician’s name to see everyone they recorded with. It counts people on the same
        <em> track</em>, not just the same album, so a pianist who sat in on one tune doesn’t get credited
        with the whole record. Click any name to keep going.
      </p>
      <p className="flex flex-wrap items-center gap-2">
        Try:
        {tries.map((t) => (
          <Link key={t.q} to={{ view: "search", q: t.q, instrument: t.i }} go={go}
            className="rounded-full border border-border px-3 py-1 text-foreground hover:bg-muted">
            {t.q}
          </Link>
        ))}
      </p>
    </section>
  );
}
