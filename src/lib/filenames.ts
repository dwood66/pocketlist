// Short file names for downloads. Every name in a long Journey made names nobody wants to read
// ("louis-armstrong-to-jerome-richardson-to-merl-saunders-to-…"), so: the two ends, and how many
// players carry you between them.

const slug = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase();

/** "jaco-pastorius-sampler", "miles-davis-and-john-coltrane-sampler", "miles-davis-and-3-others-sampler". */
export function samplerFileName(names: string[]): string {
  const who = names.length <= 2 ? names.join(" and ") : `${names[0]} and ${names.length - 1} others`;
  return slug(`${who} sampler`) || "pocketlist-sampler";
}

/** "louis-armstrong-to-damon-wood-via-4": the ends, and how many players are in between. */
export function journeyFileName(names: string[]): string {
  if (names.length < 2) return slug(names[0] ?? "") || "pocketlist-journey";
  const between = names.length - 2;
  return slug(`${names[0]} to ${names[names.length - 1]}${between ? ` via ${between}` : ""}`) || "pocketlist-journey";
}
