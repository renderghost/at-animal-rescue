/** Paths with a secret in them, such as share links (#42), as analytics may see them (#46). */
export function redactPath(path: string): string {
  return path.replace(/\/share\/[^/?#]+/g, '/share/[token]');
}
