import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Safe number formatting helpers
export function asNumber(value: any): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  const parsed = parseFloat(value || '0');
  return isNaN(parsed) ? 0 : parsed;
}

export function fmt(value: any, decimals: number = 2): string {
  return asNumber(value).toFixed(decimals);
}

export function fmtPct(value: any, decimals: number = 1): string {
  return `${fmt(value, decimals)}%`;
}
