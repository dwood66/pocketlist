// Small choices remembered in this browser, so the next time starts the way you left it.
// They stay out of links: a Journey you share opens with the other person's own setting.

const PER_KEY = "journey-per";

/** Songs per step for a new Journey: the last one you picked, or 2. */
export function journeyPer(): number {
  try {
    const n = Number(localStorage.getItem(PER_KEY));
    return n >= 1 && n <= 3 ? n : 2;
  } catch { return 2; } // storage blocked (private mode): the default
}

export function rememberJourneyPer(n: number) {
  try { localStorage.setItem(PER_KEY, String(n)); } catch { /* not remembered, no harm */ }
}

const SIZE_KEY = "sampler-size";
const SIZES = [10, 20, 30];

/** Songs in a new Sampler: the last size you picked, or 10. */
export function samplerSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    return SIZES.includes(n) ? n : 10;
  } catch { return 10; }
}

export function rememberSamplerSize(n: number) {
  try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* not remembered, no harm */ }
}
