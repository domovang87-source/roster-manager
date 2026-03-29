/**
 * Try to match a screenshot filename (e.g. "Sarah texts.png", "IMG_0234.jpg") to a roster name.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\bimg[-_]?\d+\b/gi, "")
    .replace(/\bscreenshot\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function guessProspectIdFromFilename(
  filename: string,
  prospects: ReadonlyArray<{ id: string; name: string }>
): string | undefined {
  if (!filename.trim() || prospects.length === 0) return undefined;

  const fileNorm = normalize(filename);
  if (fileNorm.length < 2) return undefined;

  const exact = prospects.find((p) => normalize(p.name) === fileNorm);
  if (exact) return exact.id;

  for (const p of prospects) {
    const pn = normalize(p.name);
    if (pn.length < 2) continue;
    if (fileNorm.includes(pn) || pn.includes(fileNorm)) return p.id;
  }

  const ambiguous = prospects.filter((p) => {
    const pn = normalize(p.name);
    return pn.length >= 3 && fileNorm.includes(pn);
  });
  if (ambiguous.length === 1) return ambiguous[0].id;

  return undefined;
}
