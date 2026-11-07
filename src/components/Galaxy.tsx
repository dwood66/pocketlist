// The galaxy: the same collaborators as the list, drawn around the player.
//
//   distance  how often they recorded together (shared sessions, log scale; closer = more)
//   angle     the year the collaboration began, clockwise from the top, like a career clock
//             (busy years get more of the circle; the decade marks show the scale)
//   colour    heat: sessions per year of the partnership. Blue is long and steady, orange is a burst
//   size      shared tracks
//
// Drawn on a canvas because a busy player has well over a thousand stars. The list stays the
// accessible view; here the keyboard can still step through stars by rank.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Collaborator, SharedRecording, Snapshot } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { sharedRecordings } from "@/lib/api";

type Star = { c: Collaborator; x: number; y: number; size: number; heat: number | null; rank: number };
type Shown = { x: number; y: number; a: number };

const MIN_HEAT_SESSIONS = 3; // two tracks in one year isn't a real burst
const ARC = 0.92; // leave a gap at the top so the start and end of a career don't touch
const MAX_LABELS = 14;

// Where the last galaxy left its stars, so the next one can grow out of it: click a star and
// it slides to the centre while everyone you both know moves to their new places.
let lastFrame: { centerId: string; at: Map<string, { x: number; y: number }> } | null = null;
export function forgetGalaxy() { lastFrame = null; }

function hash(s: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function heatOf(c: Collaborator): number | null {
  if (c.sharedSessions < MIN_HEAT_SESSIONS || !c.firstYear || !c.lastYear) return null;
  const perYear = c.sharedSessions / (c.lastYear - c.firstYear + 1);
  // Log scale: about 1.5 sessions a year or fewer is cool, 15 or more is hot.
  return Math.min(1, Math.max(0, Math.log(perYear / 1.5) / Math.log(10)));
}

function heatWords(c: Collaborator, heat: number | null) {
  if (heat === null) return null;
  const span = (c.lastYear ?? 0) - (c.firstYear ?? 0) + 1;
  if (heat >= 0.6) return span === 1 ? "all in one year" : `a burst: ${span} years`;
  if (heat <= 0.3) return `long and steady: ${span} years`;
  return `${span} years`;
}

export function layout(collaborators: Collaborator[]) {
  const max = Math.max(2, collaborators[0]?.sharedSessions ?? 2);
  const maxTracks = Math.max(1, ...collaborators.map((c) => c.sharedRecordings));
  // Time runs clockwise, but each year gets room in proportion to how many partnerships began
  // in it, so a crowded decade spreads out instead of piling into one wedge. The decade marks
  // follow the same scale, so they still say where you are.
  const years = collaborators.flatMap((c) => (c.firstYear ? [c.firstYear] : [])).sort((a, b) => a - b);
  const n = Math.max(1, years.length);
  const before = (y: number) => { let lo = 0, hi = years.length; while (lo < hi) { const m = (lo + hi) >> 1; if (years[m] < y) lo = m + 1; else hi = m; } return lo; };
  const share = (y: number) => [before(y) / n, before(y + 1) / n] as const;
  const y0 = years[0] ?? 0;
  const span = years.length ? years[years.length - 1] - y0 + 1 : 1;

  const stars: Star[] = collaborators.map((c, rank) => {
    const [lo, hi] = c.firstYear ? share(c.firstYear) : [0, 1];
    const along = lo + (hi - lo) * hash(c.id);
    const angle = -Math.PI / 2 + 0.04 + along * ARC * 2 * Math.PI;
    const near = Math.log(c.sharedSessions) / Math.log(max); // 0 for one session, 1 for the most
    const r = Math.min(0.98, 0.16 + 0.78 * (1 - near) + (hash(c.id, 7) - 0.5) * 0.06);
    return {
      c, rank,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      size: 1.4 + 5 * Math.sqrt(c.sharedRecordings / maxTracks),
      heat: heatOf(c),
    };
  });
  const ringAt = (sessions: number) => 0.16 + 0.78 * (1 - Math.log(sessions) / Math.log(max));
  const angleOf = (year: number) => -Math.PI / 2 + 0.04 + share(year)[0] * ARC * 2 * Math.PI;
  return { stars, max, y0, span, ringAt, angleOf };
}

function cssColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Galaxy({ snap, matches, onOpen }: {
  snap: Snapshot;
  matches: Set<string> | null; // the list's filter, applied here as dimming
  onOpen: (c: Collaborator) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState(0);

  const galaxy = useMemo(() => layout(snap.collaborators), [snap.collaborators]);
  const byId = useMemo(() => new Map(galaxy.stars.map((s) => [s.c.id, s])), [galaxy]);

  // Animation state lives in refs: it changes every frame and React doesn't need to know.
  const shown = useRef(new Map<string, Shown>());
  const from = useRef(new Map<string, Shown>());
  const started = useRef(0);
  const frame = useRef(0);
  const centerFrom = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ w, h: Math.round(Math.min(w, Math.max(340, innerHeight * 0.72))) });
    });
    ro.observe(el);
    const mo = new MutationObserver(() => setTheme((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);

  // New positions arrived (a fresh snapshot while streaming, or a new player): animate every
  // star from wherever it is now. On the first frame for a player we came from, start from the
  // last galaxy's positions, shifted so the clicked star is the one sliding into the centre.
  useEffect(() => {
    const prev = new Map(shown.current);
    if (prev.size === 0 && lastFrame) {
      const origin = lastFrame.at.get(snap.player.id);
      if (origin) {
        for (const [id, p] of lastFrame.at) prev.set(id, { x: p.x - origin.x, y: p.y - origin.y, a: 1 });
        prev.set(lastFrame.centerId, { x: -origin.x, y: -origin.y, a: 1 });
        centerFrom.current = { x: origin.x, y: origin.y };
      }
    }
    const next = new Map<string, Shown>();
    for (const s of galaxy.stars) next.set(s.c.id, prev.get(s.c.id) ?? { x: s.x * 0.15, y: s.y * 0.15, a: 0 });
    from.current = next;
    shown.current = new Map(next);
    started.current = performance.now();
    lastFrame = { centerId: snap.player.id, at: new Map(galaxy.stars.map((s) => [s.c.id, { x: s.x, y: s.y }])) };
  }, [galaxy, snap.player.id]);

  const R = Math.min(size.w, size.h) / 2 * 0.84;
  const toScreen = (x: number, y: number) => ({
    sx: size.w / 2 + view.x + x * R * view.k,
    sy: size.h / 2 + view.y + y * R * view.k,
  });

  // Draw. Runs every frame while stars are moving, then stops.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !size.w) return;
    const dpr = devicePixelRatio || 1;
    el.width = size.w * dpr;
    el.height = size.h * dpr;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const col = {
      fg: cssColor("--foreground"), muted: cssColor("--muted-foreground"), border: cssColor("--border"),
      primary: cssColor("--primary"), cool: cssColor("--star-cool"), hot: cssColor("--star-hot"),
      bg: cssColor("--card"),
    };
    const DURATION = reduceMotion() ? 0 : 1200;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const draw = (now: number) => {
      const t = DURATION ? Math.min(1, (now - started.current) / DURATION) : 1;
      const e = ease(t);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";

      // Guide rings for session counts, and decade marks around the edge.
      ctx.strokeStyle = col.border;
      ctx.fillStyle = col.muted;
      ctx.lineWidth = 1;
      const c0 = toScreen(0, 0);
      for (const n of [1, 3, 10, 30, 100, 300]) {
        if (n > galaxy.max) break;
        const r = galaxy.ringAt(n) * R * view.k;
        ctx.beginPath(); ctx.arc(c0.sx, c0.sy, r, 0, Math.PI * 2); ctx.stroke();
        // In the gap at the top, just left of twelve o'clock, clear of the decade marks.
        ctx.textAlign = "right";
        ctx.fillText(`${n} ${n === 1 ? "session" : "sessions"}`, c0.sx - 4, c0.sy - r - 3);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const first = Math.ceil(galaxy.y0 / 10) * 10;
      let lastMark = -Infinity;
      for (let y = first; y < galaxy.y0 + galaxy.span; y += 10) {
        const a = galaxy.angleOf(y);
        const p = toScreen(Math.cos(a) * 1.08, Math.sin(a) * 1.08);
        // Quiet decades get a thin slice; skip a mark that would sit on top of the last one.
        if ((a - lastMark) * R * view.k < 34) continue;
        lastMark = a;
        ctx.fillText(`${y}s`, p.sx, p.sy);
      }

      // Stars, dimmest first so the bright ones sit on top.
      const pos = new Map<string, { sx: number; sy: number; a: number }>();
      for (let i = galaxy.stars.length - 1; i >= 0; i--) {
        const s = galaxy.stars[i];
        const f = from.current.get(s.c.id) ?? { x: s.x, y: s.y, a: 1 };
        const cur = { x: f.x + (s.x - f.x) * e, y: f.y + (s.y - f.y) * e, a: f.a + (1 - f.a) * e };
        shown.current.set(s.c.id, cur);
        const p = toScreen(cur.x, cur.y);
        const dim = matches && !matches.has(s.c.id) ? 0.12 : 1;
        pos.set(s.c.id, { ...p, a: cur.a * dim });
        ctx.globalAlpha = cur.a * dim * (s.heat === null ? 0.55 : 0.95);
        ctx.fillStyle = s.heat === null ? col.muted : mix(col.cool, col.hot, s.heat);
        ctx.beginPath(); ctx.arc(p.sx, p.sy, s.size * Math.sqrt(view.k), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // The player at the centre, sliding in from where their star was.
      const cp = toScreen(centerFrom.current.x * (1 - e), centerFrom.current.y * (1 - e));
      ctx.fillStyle = col.primary;
      ctx.beginPath(); ctx.arc(cp.sx, cp.sy, 7, 0, Math.PI * 2); ctx.fill();
      const taken: Box[] = [label(ctx, snap.player.name, cp.sx, cp.sy + 17, col.fg, col.bg, true)];

      // Names: whatever is under the pointer or selected first, then the closest few. A name
      // that would overlap one already drawn is skipped; pointing at the star shows it.
      const named = new Set<string>();
      for (const id of [hover, selected]) if (id) named.add(id);
      for (const s of galaxy.stars.slice(0, MAX_LABELS)) if (!matches || matches.has(s.c.id)) named.add(s.c.id);
      if (matches && matches.size <= 20) matches.forEach((id) => named.add(id));
      for (const id of named) {
        const s = byId.get(id);
        const p = pos.get(id);
        if (!s || !p || p.a < 0.5) continue;
        const ring = id === hover || id === selected;
        if (ring) {
          ctx.strokeStyle = col.fg; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.sx, p.sy, s.size * Math.sqrt(view.k) + 4, 0, Math.PI * 2); ctx.stroke();
        }
        const box = label(ctx, s.c.name, p.sx, p.sy - s.size * Math.sqrt(view.k) - 9, col.fg, col.bg, ring, ring ? undefined : taken);
        if (ring) taken.push(box);
      }

      if (t < 1) frame.current = requestAnimationFrame(draw);
      else if (t === 1 && centerFrom.current.x !== 0) centerFrom.current = { x: 0, y: 0 };
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame.current);
    // toScreen and R derive from size and view, which are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxy, byId, size, view, hover, selected, matches, theme, snap.player.name]);

  // Pointer: hover shows a card, click opens (a tap selects first, a second tap opens),
  // drag pans, wheel and pinch zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; pinch?: number; touchSelected?: string | null }>({ moved: false });

  function starAt(px: number, py: number, slop: number) {
    let best: Star | null = null;
    let bestD = Infinity;
    for (const s of galaxy.stars) {
      if (matches && !matches.has(s.c.id)) continue;
      const cur = shown.current.get(s.c.id) ?? s;
      const p = toScreen(cur.x, cur.y);
      const d = Math.hypot(p.sx - px, p.sy - py) - s.size * Math.sqrt(view.k);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best && bestD <= slop ? best : null;
  }

  const local = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function zoomAt(factor: number, px = size.w / 2, py = size.h / 2) {
    setView((v) => {
      const k = Math.min(12, Math.max(0.6, v.k * factor));
      const f = k / v.k;
      const cx = size.w / 2, cy = size.h / 2;
      return { k, x: px - cx - (px - cx - v.x) * f, y: py - cy - (py - cy - v.y) * f };
    });
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    gesture.current = { moved: false, touchSelected: selected };
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const p = local(e);
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === "mouse") setHover(starAt(p.x, p.y, 8)?.c.id ?? null);
      return;
    }
    pointers.current.set(e.pointerId, p);
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (gesture.current.pinch) zoomAt(d / gesture.current.pinch, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      gesture.current.pinch = d;
      gesture.current.moved = true;
      return;
    }
    const dx = p.x - prev.x, dy = p.y - prev.y;
    if (gesture.current.moved || Math.hypot(dx, dy) > 3) {
      gesture.current.moved = true;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    const g = gesture.current;
    gesture.current = { moved: false };
    if (g.moved) return;
    const hit = starAt(p.x, p.y, e.pointerType === "mouse" ? 8 : 18);
    if (!hit) { setSelected(null); return; }
    if (e.pointerType === "mouse" || g.touchSelected === hit.c.id) onOpen(hit.c);
    else setSelected(hit.c.id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    const list = galaxy.stars.filter((s) => !matches || matches.has(s.c.id));
    const i = list.findIndex((s) => s.c.id === selected);
    const pick = (j: number) => { const s = list[(j + list.length) % list.length]; if (s) setSelected(s.c.id); };
    const keys: Record<string, () => void> = {
      ArrowRight: () => pick(i + 1), ArrowDown: () => pick(i + 1),
      ArrowLeft: () => pick(i < 0 ? -1 : i - 1), ArrowUp: () => pick(i < 0 ? -1 : i - 1),
      Home: () => pick(0), End: () => pick(-1),
      Enter: () => { const s = selected && byId.get(selected); if (s) onOpen(s.c); },
      Escape: () => setSelected(null),
      "+": () => zoomAt(1.3), "=": () => zoomAt(1.3), "-": () => zoomAt(1 / 1.3),
      "0": () => setView({ k: 1, x: 0, y: 0 }),
    };
    const run = keys[e.key];
    if (run) { e.preventDefault(); run(); }
  }

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const focus = byId.get(hover ?? selected ?? "");

  return (
    <div className="flex flex-col gap-3">
      <div ref={wrap} className="relative overflow-hidden rounded-xl border border-border bg-card">
        <canvas
          ref={canvas}
          style={{ width: size.w, height: size.h, touchAction: "none" }}
          className="block cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          tabIndex={0}
          role="application"
          aria-roledescription="galaxy"
          aria-label={`${snap.player.name} and ${galaxy.stars.length} collaborators. Arrow keys step through them, closest first; Enter opens one; plus and minus zoom. The list view shows the same people.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { pointers.current.clear(); gesture.current = { moved: false }; }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
          onKeyDown={onKeyDown}
        />
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <Button variant="outline" size="icon" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><Plus className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4)}><Minus className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 })}><RotateCcw className="h-4 w-4" /></Button>
        </div>
      </div>
      <StarCard star={focus} playerId={snap.player.id} onOpen={onOpen} />
      <Legend />
    </div>
  );
}

type Box = { x0: number; y0: number; x1: number; y1: number };

// Draws a name with a halo so it reads over stars. With `taken`, skips it if it would overlap.
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fg: string, bg: string, strong: boolean, taken?: Box[]): Box {
  ctx.font = `${strong ? "600 " : ""}12px ui-sans-serif, system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  const box = { x0: x - w / 2 - 3, y0: y - 8, x1: x + w / 2 + 3, y1: y + 8 };
  if (taken) {
    if (taken.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return box;
    taken.push(box);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = bg;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fg;
  ctx.fillText(text, x, y);
  return box;
}

const shared = new Map<string, Promise<SharedRecording[]>>();

function StarCard({ star, playerId, onOpen }: { star?: Star; playerId: string; onOpen: (c: Collaborator) => void }) {
  const [recs, setRecs] = useState<SharedRecording[] | null>(null);
  const id = star?.c.id;
  useEffect(() => {
    setRecs(null);
    if (!id) return;
    let live = true;
    const t = setTimeout(() => {
      const key = `${playerId}/${id}`;
      if (!shared.has(key)) shared.set(key, sharedRecordings(playerId, id).catch(() => { shared.delete(key); return []; }));
      shared.get(key)!.then((r) => { if (live) setRecs(r); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [id, playerId]);

  if (!star) {
    return (
      <p className="min-h-[5.5rem] text-sm text-muted-foreground" aria-live="polite">
        Point at a star (or tap one) to see who it is. Click to make them the centre.
      </p>
    );
  }
  const { c, heat } = star;
  const span = c.firstYear ? (c.firstYear === c.lastYear ? `${c.firstYear}` : `${c.firstYear}–${c.lastYear}`) : "";
  const words = heatWords(c, heat);
  return (
    <div className="flex min-h-[5.5rem] flex-col gap-1 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-medium">{c.name}</span>
        <span className="text-muted-foreground">{c.instruments.slice(0, 3).join(", ")}</span>
      </div>
      <p className="tabular-nums text-muted-foreground">
        {c.sharedSessions} {c.sharedSessions === 1 ? "session" : "sessions"} · {c.sharedRecordings} {c.sharedRecordings === 1 ? "track" : "tracks"}
        {span && ` · ${span}`}{words && ` · ${words}`}
      </p>
      {recs && recs.length > 0 && (
        <p className="truncate text-muted-foreground">
          {recs.slice(0, 3).map((r) => r.title).join(" · ")}{recs.length > 3 ? " …" : ""}
        </p>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={() => onOpen(c)}>
        Centre on {c.name}
      </Button>
    </div>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>Closer = more sessions together.</span>
      <span>Clockwise from the top = the year they first recorded together.</span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-16 rounded-full" style={{ background: "linear-gradient(90deg, var(--star-cool), var(--star-hot))" }} aria-hidden />
        long and steady → a burst
      </span>
      <span>Grey: too few sessions to say.</span>
    </p>
  );
}
