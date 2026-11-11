// Where you are lives in the URL, so a link can be shared, a reload keeps your place, and
// the browser's back button walks back along the trail.
//
//   /?q=wally+kane&i=flute          search results
//   /?p=<id>&trail=<id>,<id>        a player, with the players you came through
//   /?p=<id>&v=list                 the same player, as a list (the galaxy is the default)
//   /?p=<id>&goal=<id>              playing Connect: get from here to the goal
//   /?pl=<id>,<id>&n=10&mix=0       a sampler playlist of songs all of them played on
//   /?pl=<id>&o=new                 the same, newest first (oldest first is the default)
//   /?pp=<a>,<b>,<c>&mix=0          a playlist along a path: a few songs for each link (how many
//                                   is your own setting, kept in this browser: see lib/prefs.ts)
//   /?pp=<a>,<b>,<c>&c=1            the same, shared as a solved Connect puzzle

import { useCallback, useEffect, useState } from "react";

export type Route =
  | { view: "home" }
  | { view: "search"; q: string; instrument: string }
  | { view: "player"; id: string; trail: string[]; galaxy?: boolean; goal?: string } // galaxy unless false
  | { view: "playlist"; seeds: string[]; n: number; mix: number; newest?: boolean }
  | { view: "pathlist"; ids: string[]; mix: number; connect?: boolean }; // connect: a solved puzzle

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parse(search: string): Route {
  const params = new URLSearchParams(search);
  const pp = (params.get("pp") ?? "").split(",").filter((id) => MBID.test(id));
  if (pp.length >= 2) {
    return { view: "pathlist", ids: pp.slice(0, 12),
      mix: Math.max(0, Math.floor(Number(params.get("mix")) || 0)), ...(params.get("c") === "1" ? { connect: true } : {}) };
  }
  const pl = (params.get("pl") ?? "").split(",").filter((id) => MBID.test(id));
  if (pl.length) {
    return { view: "playlist", seeds: [...new Set(pl)].slice(0, 4), n: Math.min(50, Math.max(1, Number(params.get("n")) || 10)),
      mix: Math.max(0, Math.floor(Number(params.get("mix")) || 0)), ...(params.get("o") === "new" ? { newest: true } : {}) };
  }
  const p = params.get("p");
  if (p && MBID.test(p)) {
    const trail = (params.get("trail") ?? "").split(",").filter((id) => MBID.test(id));
    const goal = params.get("goal");
    return { view: "player", id: p, trail, galaxy: params.get("v") !== "list", ...(goal && MBID.test(goal) ? { goal } : {}) };
  }
  const q = params.get("q")?.trim();
  if (q) return { view: "search", q, instrument: params.get("i")?.trim() ?? "" };
  return { view: "home" };
}

export function href(route: Route): string {
  const params = new URLSearchParams();
  if (route.view === "player") {
    params.set("p", route.id);
    if (route.trail.length) params.set("trail", route.trail.join(","));
    if (route.galaxy === false) params.set("v", "list");
    if (route.goal) params.set("goal", route.goal);
  } else if (route.view === "pathlist") {
    params.set("pp", route.ids.join(","));
    if (route.mix) params.set("mix", String(route.mix));
    if (route.connect) params.set("c", "1");
  } else if (route.view === "playlist") {
    params.set("pl", route.seeds.join(","));
    if (route.n !== 10) params.set("n", String(route.n));
    if (route.mix) params.set("mix", String(route.mix));
    if (route.newest) params.set("o", "new");
  } else if (route.view === "search") {
    params.set("q", route.q);
    if (route.instrument) params.set("i", route.instrument);
  }
  const s = params.toString().replace(/%2C/gi, ","); // commas are safe in a query, and readable in a shared link
  return s ? `/?${s}` : "/";
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parse(location.search));

  useEffect(() => {
    const onPop = () => setRoute(parse(location.search));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  // `replace` swaps the current history entry and keeps the scroll position: for switching
  // views of the same page, which shouldn't take a press of Back to undo. `keepScroll` is a
  // new page that stays where it is on screen: clicking a star recentres the galaxy in place.
  const go = useCallback((next: Route, opts?: { replace?: boolean; keepScroll?: boolean }) => {
    if (opts?.replace) history.replaceState(null, "", href(next));
    else history.pushState(null, "", href(next));
    setRoute(next);
    if (!opts?.replace && !opts?.keepScroll) scrollTo({ top: 0 });
  }, []);

  return [route, go] as const;
}
