// The Pocketlist mark: a record, with a star in orbit. Colours come from the theme.
// Inside a `group` (the home link), pointing at it or focusing it nudges the star a little
// further round its orbit; with reduced motion it stays put.
export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--foreground)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--primary)" strokeWidth="2" />
      <circle cx="16" cy="16" r="2.6" fill="var(--primary)" />
      <circle cx="24.5" cy="9" r="2.6" fill="var(--background)"
        style={{ transformBox: "view-box", transformOrigin: "16px 16px" }}
        className="transition-transform duration-500 ease-out motion-safe:group-hover:rotate-[35deg] motion-safe:group-focus-visible:rotate-[35deg]" />
    </svg>
  );
}
