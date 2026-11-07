// Where you are lives in the URL, so a link can be shared, a reload keeps your place, and
// the browser's back button walks back along the trail.
//
//   /?q=wally+kane&i=flute          search results
//   /?p=<id>&trail=<id>,<id>        a player, with the players you came through
//   /?p=<id>&v=galaxy               the same player, as a galaxy

import { useCallback, useEffect, useState } from "react";

export type Route =
  | { view: "home" }
  | { view: "search"; q: string; instrument: string }
  | { view: "player"; id: string; trail: string[]; galaxy?: boolean };

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parse(search: string): Route {
  const params = new URLSearchParams(search);
  const p = params.get("p");
  if (p && MBID.test(p)) {
    const trail = (params.get("trail") ?? "").split(",").filter((id) => MBID.test(id));
    return { view: "player", id: p, trail, galaxy: params.get("v") === "galaxy" };
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
    if (route.galaxy) params.set("v", "galaxy");
  } else if (route.view === "search") {
    params.set("q", route.q);
    if (route.instrument) params.set("i", route.instrument);
  }
  const s = params.toString();
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
  // views of the same page, which shouldn't take a press of Back to undo.
  const go = useCallback((next: Route, opts?: { replace?: boolean }) => {
    if (opts?.replace) history.replaceState(null, "", href(next));
    else history.pushState(null, "", href(next));
    setRoute(next);
    if (!opts?.replace) scrollTo({ top: 0 });
  }, []);

  return [route, go] as const;
}
