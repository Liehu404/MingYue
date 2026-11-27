const BASE = import.meta.env.BASE_URL;

/** Normalize a backend file path to a full URL usable in <img src> etc.
 *  Backend stores "temp/hash.ext"; nginx serves at {BASE}uploads/temp/hash.ext */
export function normalizeFilePath(path: string | null | undefined): string {
  if (!path) return '';
  if (/^(https?:|blob:)/.test(path)) return path;
  if (BASE !== '/' && path.startsWith(BASE)) return path;
  if (path.startsWith('/uploads/')) return `${BASE}${path.slice(1)}`;
  if (path.startsWith('/')) return path;
  return `${BASE}uploads/${path}`;
}
