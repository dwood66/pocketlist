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
import { Info, Maximize2, Minimize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { Collaborator, SharedRecording, Snapshot } from "../../contract/index.ts";
import { Button } from "@/components/ui/button";
import { sharedRecordings } from "@/lib/api";
import { layout, type Star } from "@/lib/galaxy";

type Shown = { x: number; y: number; a: number };

const MAX_LABELS = 14;

// Where the last galaxy left its stars, so the next one can grow out of it: click a star and
// it slides to the centre while everyone you both know moves to their new places.
let lastFrame: { centerId: string; at: Map<string, { x: number; y: number }> } | null = null;
export function forgetGalaxy() { lastFrame = null; fullScreen = false; }

let fullScreen = false;
/** Whether the galaxy is full screen, so the page can cover the gap while the next player loads. */
export const isFullScreen = () => fullScreen;

function heatWords(c: Collaborator, heat: number | null) {
  if (heat === null) return null;
  const span = (c.lastYear ?? 0) - (c.firstYear ?? 0) + 1;
  if (heat >= 0.6) return span === 1 ? "all in one year" : `a burst: ${span} years`;
  if (heat <= 0.3) return `long and steady: ${span} years`;
  return `${span} years`;
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

export function Galaxy({ snap, matches, goal, onOpen, onPlaylist, overlay }: {
  snap: Snapshot;
  overlay?: React.ReactNode; // shown over the galaxy in full screen (the player's name, the goal)
  matches: Set<string> | null; // the list's filter, applied here as dimming
  goal?: string; // Connect's target, marked in gold wherever it appears
  onOpen: (c: Collaborator) => void;
  onPlaylist?: (c: Collaborator) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  // Full screen, remembered across players so travelling star to star stays full screen.
  const [expanded, setExpandedState] = useState(fullScreen);
  const expandedRef = useRef(expanded);
  const setExpanded = (on: boolean) => { fullScreen = on; expandedRef.current = on; setExpandedState(on); };
  useEffect(() => {
    expandedRef.current = expanded;
    // Re-measure for the new frame, and keep the page behind from scrolling.
    const el = wrap.current;
    if (el) setSize({ w: el.clientWidth, h: Math.round(expanded ? el.clientHeight : Math.min(el.clientWidth, Math.max(340, innerHeight * 0.72))) });
    if (!expanded) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = before; removeEventListener("keydown", onKey); };
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState(0);

  // While a player is still being read, every batch of credits would nudge every star (the
  // scales depend on everyone). Stars already placed stay put until reading finishes, so you
  // can click one without it sliding away; then everything settles into its final place.
  const placed = useRef(new Map<string, { x: number; y: number }>());
  const galaxy = useMemo(() => {
    const fresh = layout(snap.collaborators);
    const settle = snap.progress.done;
    const stars = fresh.stars.map((s) => {
      const keep = settle ? undefined : placed.current.get(s.c.id);
      return keep ? { ...s, ...keep } : s;
    });
    placed.current = new Map(stars.map((s) => [s.c.id, { x: s.x, y: s.y }]));
    return { ...fresh, stars };
  }, [snap.collaborators, snap.progress.done]);
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
      const h = expandedRef.current ? el.clientHeight : Math.min(w, Math.max(340, innerHeight * 0.72));
      setSize({ w, h: Math.round(h) });
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
      bg: cssColor("--card"), goal: cssColor("--goal"),
    };
    const DURATION = reduceMotion() ? 0 : 1200;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const draw = (now: number) => {
      const t = DURATION ? Math.min(1, (now - started.current) / DURATION) : 1;
      const e = ease(t);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.font = "11px Inter, ui-sans-serif, system-ui, sans-serif";

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
      for (const id of [goal, hover, selected]) if (id) named.add(id);
      for (const s of galaxy.stars.slice(0, MAX_LABELS)) if (!matches || matches.has(s.c.id)) named.add(s.c.id);
      if (matches && matches.size <= 20) matches.forEach((id) => named.add(id));
      for (const id of named) {
        const s = byId.get(id);
        const p = pos.get(id);
        if (!s || !p || p.a < 0.5) continue;
        const isGoal = id === goal;
        const ring = isGoal || id === hover || id === selected;
        if (isGoal) {
          ctx.fillStyle = col.goal;
          ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(5, s.size * Math.sqrt(view.k)), 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = col.goal; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.sx, p.sy, s.size * Math.sqrt(view.k) + 7, 0, Math.PI * 2); ctx.stroke();
        }
        if (ring && !isGoal) {
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
  }, [galaxy, byId, size, view, hover, selected, matches, theme, snap.player.name, goal]);

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
      if (e.pointerType === "mouse") hoverSoon(starAt(p.x, p.y, 8)?.c.id ?? null);
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
    if (e.pointerType === "mouse" && e.shiftKey && onPlaylist) onPlaylist(hit.c);
    else if (e.pointerType === "mouse" || g.touchSelected === hit.c.id) onOpen(hit.c);
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

  // Hover lingers for a beat after the pointer leaves a star, so the card doesn't flicker.
  const hoverTimer = useRef(0);
  function hoverSoon(id: string | null) {
    clearTimeout(hoverTimer.current);
    if (id) { setHover(id); seen(); }
    else hoverTimer.current = window.setTimeout(() => setHover(null), 120);
  }
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // A one-time hint on how to use it, until the first star is pointed at or tapped.
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem(HINT_KEY); } catch { return true; } });
  function seen() {
    if (!hint) return;
    setHint(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* private mode: show it again next time */ }
  }
  useEffect(() => { if (selected) seen(); }); // eslint-disable-line react-hooks/exhaustive-deps
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const [keyOpen, setKeyOpen] = useState(false);

  const hovered = hover ? byId.get(hover) : undefined;
  const picked = selected ? byId.get(selected) : undefined;
  const at = (s: Star) => { const cur = shown.current.get(s.c.id) ?? s; return toScreen(cur.x, cur.y); };

  return (
    <div className="flex flex-col gap-3">
      <div ref={wrap} className={expanded ? "fixed inset-0 z-50 overflow-hidden bg-card" : "relative overflow-hidden rounded-xl border border-border bg-card"}
        role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={expanded ? `${snap.player.name}'s galaxy, full screen` : undefined}>
        <canvas
          ref={canvas}
          style={{ width: size.w, height: size.h, touchAction: "none" }}
          className={"block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring " + (hover ? "cursor-pointer" : "cursor-grab")}
          tabIndex={0}
          role="application"
          aria-roledescription="galaxy"
          aria-label={`${snap.player.name} and ${galaxy.stars.length} collaborators. Arrow keys step through them, closest first; Enter opens one; plus and minus zoom. The list view shows the same people.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { pointers.current.clear(); gesture.current = { moved: false }; }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") hoverSoon(null); }}
          onKeyDown={onKeyDown}
        />

        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[70%] flex-col items-start gap-1.5">
          {!snap.progress.done && (
            <span className="flex items-center gap-2 rounded-full bg-card/85 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
              Still reading: stars appear as albums arrive
            </span>
          )}
          {hint && (
            <span className="pointer-events-auto flex items-center gap-1 rounded-lg bg-card/90 py-1 pl-2.5 pr-1 text-xs shadow-sm backdrop-blur">
              {coarse ? "Tap a star to see who it is, tap again to go there. Pinch to zoom." : "Point at a star to see who it is. Click to go there. Scroll to zoom, drag to move."}
              <button type="button" aria-label="Dismiss hint" onClick={seen} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <Button variant="outline" size="icon" className="bg-card/85 backdrop-blur" aria-label="Zoom in" onClick={() => zoomAt(1.4)}><Plus className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/85 backdrop-blur" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4)}><Minus className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/85 backdrop-blur" aria-label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 })}><RotateCcw className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="bg-card/85 backdrop-blur" aria-label={expanded ? "Exit full screen" : "Full screen"}
            aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" className="bg-card/85 backdrop-blur" aria-label="How to read it" aria-expanded={keyOpen} onClick={() => setKeyOpen((v) => !v)}><Info className="h-4 w-4" /></Button>
        </div>

        {expanded && overlay && (
          <div className="pointer-events-auto absolute left-1/2 top-3 max-w-[60%] -translate-x-1/2 rounded-lg bg-card/90 px-3 py-1.5 text-center shadow-sm backdrop-blur">
            {overlay}
          </div>
        )}

        <Key open={keyOpen} />

        {picked && expanded && (
          <div className="absolute bottom-12 left-2 right-2 z-10 sm:left-auto sm:w-80">
            <StarCard star={picked} playerId={snap.player.id} onOpen={onOpen} onPlaylist={onPlaylist} />
          </div>
        )}

        {hovered && !coarse && (
          <FloatingCard star={hovered} at={at(hovered)} box={size} playerId={snap.player.id} onOpen={onOpen} onPlaylist={onPlaylist} />
        )}
      </div>
      {picked && !expanded && <StarCard star={picked} playerId={snap.player.id} onOpen={onOpen} onPlaylist={onPlaylist} />}
    </div>
  );
}

const HINT_KEY = "pocketlist.galaxy-hint-seen";

// How to read it, on the canvas: always on wider screens, behind the (i) button on phones.
function Key({ open }: { open: boolean }) {
  return (
    <div className={(open ? "flex" : "hidden sm:flex") + " pointer-events-none absolute bottom-2 left-2 right-2 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:right-auto"}>
      <span className="rounded bg-card/85 px-1.5 py-0.5 backdrop-blur">Closer = more sessions together</span>
      <span className="rounded bg-card/85 px-1.5 py-0.5 backdrop-blur">Clockwise from the top = when they first recorded</span>
      <span className="flex items-center gap-1.5 rounded bg-card/85 px-1.5 py-0.5 backdrop-blur">
        <span className="h-1.5 w-10 rounded-full" style={{ background: "linear-gradient(90deg, var(--star-cool), var(--star-hot))" }} aria-hidden />
        steady → a burst · grey: too few to say
      </span>
    </div>
  );
}

// The hover card on desktop: a tooltip beside the star, on the side away from the centre so
// it doesn't cover the closest partners. It never takes the pointer, so it can't block the
// next star you're heading for; clicking the star goes there, shift-click makes a playlist.
// (Touch and keyboard get the full card with buttons below the galaxy.)
function FloatingCard({ star, at, box, ...rest }: {
  star: Star; at: { sx: number; sy: number }; box: { w: number; h: number }; playerId: string;
  onOpen: (c: Collaborator) => void; onPlaylist?: (c: Collaborator) => void;
}) {
  const W = 260, H = 120, GAP = 16;
  const outward = at.sx < box.w / 2 ? at.sx - GAP - W : at.sx + GAP;
  const left = Math.min(Math.max(8, outward), box.w - W - 8);
  const top = Math.min(Math.max(8, at.sy > box.h / 2 ? at.sy + 4 : at.sy - H + 4), box.h - H - 8);
  return (
    <div className="pointer-events-none absolute z-10 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur" style={{ left, top, width: W }}>
      <StarCard star={star} {...rest} compact tooltip={rest.onPlaylist ? "Click to go there · shift-click for a playlist together" : "Click to go there"} />
    </div>
  );
}

type Box = { x0: number; y0: number; x1: number; y1: number };

// Draws a name with a halo so it reads over stars. With `taken`, skips it if it would overlap.
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fg: string, bg: string, strong: boolean, taken?: Box[]): Box {
  ctx.font = `${strong ? "600" : "500"} 12px Inter, ui-sans-serif, system-ui, sans-serif`;
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

function StarCard({ star, playerId, onOpen, onPlaylist, compact, tooltip }: {
  star: Star; playerId: string; onOpen: (c: Collaborator) => void; onPlaylist?: (c: Collaborator) => void;
  compact?: boolean; tooltip?: string; // tooltip: no buttons, this line instead
}) {
  const [recs, setRecs] = useState<SharedRecording[] | null>(null);
  const id = star.c.id;
  useEffect(() => {
    setRecs(null);
    let live = true;
    const t = setTimeout(() => {
      const key = `${playerId}/${id}`;
      if (!shared.has(key)) shared.set(key, sharedRecordings(playerId, id).catch(() => { shared.delete(key); return []; }));
      shared.get(key)!.then((r) => { if (live) setRecs(r); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [id, playerId]);

  const { c, heat } = star;
  const span = c.firstYear ? (c.firstYear === c.lastYear ? `${c.firstYear}` : `${c.firstYear}–${c.lastYear}`) : "";
  const words = heatWords(c, heat);
  return (
    <div className={"flex flex-col gap-1 text-sm " + (compact ? "" : "rounded-xl border border-border bg-card p-3")} aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">{c.name}</span>
        <span className="text-muted-foreground">{c.instruments.slice(0, 3).join(", ")}</span>
      </div>
      <p className="tabular-nums text-muted-foreground">
        {c.sharedSessions} {c.sharedSessions === 1 ? "session" : "sessions"} · {c.sharedRecordings} {c.sharedRecordings === 1 ? "track" : "tracks"}
        {span && ` · ${span}`}{words && ` · ${words}`}
      </p>
      <p className="truncate text-muted-foreground">
        {recs ? recs.slice(0, 3).map((r) => r.title).join(" · ") + (recs.length > 3 ? " …" : "") : "\u00a0"}
      </p>
      {tooltip ? <p className="text-xs text-primary">{tooltip}</p> : (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onOpen(c)}>Go to {c.name.split(" ")[0]}</Button>
          {onPlaylist && <Button variant="outline" size="sm" onClick={() => onPlaylist(c)}>Playlist together</Button>}
        </div>
      )}
    </div>
  );
}
