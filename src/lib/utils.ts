import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats rupee amounts the Indian way: ₹85 L, ₹1.25 Cr, ₹45,000. */
export function formatINR(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 1_00_00_000) return `₹${trim(value / 1_00_00_000)} Cr`;
  if (value >= 1_00_000) return `₹${trim(value / 1_00_000)} L`;
  return `₹${new Intl.NumberFormat('en-IN').format(value)}`;
}

function trim(n: number) {
  return Number(n.toFixed(2)).toString();
}

/**
 * Normalises an Indian mobile number to +91XXXXXXXXXX for duplicate detection.
 * Returns null when the input can't be a valid number.
 */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, '');
  let d = digits.startsWith('+') ? digits.slice(1) : digits;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && /^[6-9]/.test(d)) return `+91${d}`;
  if (d.length === 12 && d.startsWith('91') && /^[6-9]/.test(d.slice(2))) return `+${d}`;
  // Non-Indian numbers: keep E.164-like international numbers as-is.
  if (digits.startsWith('+') && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}
