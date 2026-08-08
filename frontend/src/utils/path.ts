/** Normalize a backend file path to a full URL usable in <img src> etc.
 *  Backend stores "temp/hash.ext", nginx serves at /uploads/temp/hash.ext */
export function normalizeFilePath(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) return path;
  if (path.startsWith('/')) return path;
  return '/uploads/' + path;
}
