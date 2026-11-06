import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  // The class on <html> is derived from this state, so an effect keeps it in
  // sync — that is what effects are for.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // The stored value carries a stronger meaning: "the user picked this." The
  // seed script in index.html prefers it over the OS setting, so writing one is
  // a standing override of the system preference — only an actual click earns
  // that, which is why it happens in the handler and not in the effect above.
  function choose(next: boolean) {
    setDark(next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch (_) {}
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-11 w-11 shrink-0"
      aria-label="Toggle light/dark theme"
      aria-pressed={dark}
      onClick={() => choose(!dark)}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
