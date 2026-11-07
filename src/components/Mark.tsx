// The Pocketlist mark: a record, with a star in orbit. Colours come from the theme.
export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--foreground)" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--primary)" strokeWidth="2" />
      <circle cx="16" cy="16" r="2.6" fill="var(--primary)" />
      <circle cx="24.5" cy="9" r="2.6" fill="var(--background)" />
    </svg>
  );
}
