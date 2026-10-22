import { isCountry } from './countries';
import { defaultLanguage, isLanguage, type Language } from './config';

interface WeightedTag {
  tag: string;
  q: number;
}

/** Parses an Accept-Language header into tags ordered by preference. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index): WeightedTag & { index: number } => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((t) => t.tag && t.tag !== '*' && t.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((t) => t.tag);
}

/** Saved choice first, then the browser's preferences, then the default. */
export function resolveLanguage(
  saved: string | undefined,
  acceptLanguage: string | null,
): Language {
  if (isLanguage(saved)) return saved;
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    const primary = tag.split('-')[0]?.toLowerCase();
    if (isLanguage(primary)) return primary;
  }
  return defaultLanguage;
}

/**
 * Saved choice first. Otherwise the region of the browser's preferred locale is a
 * reasonable guess (en-GB → GB), used only for defaults the user can change.
 */
export function resolveCountry(
  saved: string | undefined,
  acceptLanguage: string | null,
): string | undefined {
  const upper = saved?.toUpperCase();
  if (isCountry(upper)) return upper;
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    try {
      const region = new Intl.Locale(tag).region;
      if (isCountry(region)) return region;
    } catch {
      // Ignore malformed tags.
    }
  }
  return undefined;
}
