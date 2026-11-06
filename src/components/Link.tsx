import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { href, type Route } from "@/lib/route";

// A real link (so cmd-click, middle-click and "copy link" work) that navigates in place
// on a plain click.
export function Link({ to, go, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: Route;
  go: (r: Route) => void;
}) {
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(to);
  }
  return <a href={href(to)} onClick={handle} {...props} />;
}
