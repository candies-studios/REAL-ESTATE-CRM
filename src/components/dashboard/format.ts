const TZ = 'Asia/Kolkata';

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function relative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  const label = m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return diff < 0 ? `${label} ago` : `in ${label}`;
}

/** ISO instant → value for <input type="datetime-local"> in IST. */
export function toLocalInput(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const ist = new Date(d.getTime() + 5.5 * 3_600_000);
  return ist.toISOString().slice(0, 16);
}

export const CATEGORY_TONE = { hot: 'danger', warm: 'warning', cold: 'navy' } as const;
