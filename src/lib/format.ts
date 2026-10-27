// Pure formatting helpers (unit-tested with plain Node).

export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const whole = Math.round(n).toString();
  return 'Rs ' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatDistance(m: number | null | undefined): string {
  if (m === null || m === undefined) return '';
  if (m < 1000) return `${Math.max(m, 10)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' for a local calendar date (never UTC-shifted). */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** Same rules as the database (FR-TRX-02, BR-03) so the form can explain problems before submitting. */
export function validateRentalDates(start: Date, due: Date, today: Date = new Date()): string | null {
  if (daysBetween(today, start) < 0) return 'Start date cannot be in the past';
  if (daysBetween(start, due) <= 0) return 'Return date must be after the start date';
  if (daysBetween(start, due) > 120) return 'A rental can last at most 120 days';
  return null;
}
