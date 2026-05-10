// Mirror of src/lib/keywords.ts so the edge function and frontend stay in sync.
export function matchesPenalty(text: string, keywords: string[]): boolean {
  if (!keywords.length) return false;
  const lc = text.toLowerCase();
  return keywords.some((rawKw) => {
    const kw = rawKw.trim().toLowerCase();
    if (!kw) return false;
    if (kw.length <= 2) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
      return re.test(lc);
    }
    return lc.includes(kw);
  });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
