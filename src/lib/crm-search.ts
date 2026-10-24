/** Removes characters that have meaning in PostgREST filter syntax. */
export function sanitizeSearch(q: string) {
  return q.replace(/[,()"'*%\\:]/g, ' ').trim().slice(0, 60);
}
