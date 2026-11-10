// Share: a link to what's on screen. On a phone, the system share sheet (Messages, Mail, …);
// elsewhere, the link (and a line about it) is copied, and a tick flashes. The button keeps its
// name, so it never jumps around.

import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { href, type Route } from "@/lib/route";

/** The full address of a page, to send to someone. */
export const shareUrl = (route: Route) => `${location.origin}${href(route)}`;

export function ShareButton({ url, title, text, label = "Share", variant = "outline" }: {
  url: string; title: string; text?: string; label?: string; variant?: "default" | "outline";
}) {
  const [flash, setFlash] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

  async function share() {
    if (touch && navigator.share) {
      try { await navigator.share({ title, text, url }); } catch { /* closed the sheet */ }
      return;
    }
    await navigator.clipboard?.writeText(text ? `${text}\n${url}` : url);
    setFlash(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(false), 2000);
  }

  return (
    <>
      <Button variant={variant} size="sm" onClick={share} title={touch ? "Send a link to this" : "Copy a link to this"}>
        {flash ? <Check className="mr-1.5 h-4 w-4" aria-hidden /> : <Share2 className="mr-1.5 h-4 w-4" aria-hidden />} {label}
      </Button>
      <span className="sr-only" role="status">{flash ? "Link copied" : ""}</span>
      {flash && <span className="text-xs text-muted-foreground" aria-hidden>Link copied</span>}
    </>
  );
}
