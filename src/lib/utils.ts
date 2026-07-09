import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Copy text to the clipboard, resilient to environments where the async
// Clipboard API is unavailable — the Electron desktop build and any non-secure
// (non-HTTPS/LAN) context, where `navigator.clipboard` is undefined and calling
// it throws. Falls back to a hidden textarea + execCommand('copy'). Returns
// true on success so callers can offer a manual-copy fallback otherwise.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// Colored glow (ring + soft halo) around a client avatar, keyed to visa status.
// approved → green, rejected → red, travelling → blue, completed → sky,
// applied → orange, inProcess → purple. Unknown/none → no glow.
const VISA_GLOW_RGB: Record<string, string> = {
  approved: "34,197,94",
  completed: "14,165,233",
  travelling: "59,130,246",
  rejected: "239,68,68",
  applied: "249,115,22",
  inProcess: "234,179,8",
};

export function visaStatusGlow(status?: string): { boxShadow?: string; borderColor?: string } {
  const rgb = status ? VISA_GLOW_RGB[status] : undefined;
  if (!rgb) return {};
  return {
    boxShadow: `0 0 0 2px rgba(${rgb},0.9), 0 0 12px 3px rgba(${rgb},0.55)`,
    borderColor: `rgb(${rgb})`,
  };
}

/** Full Indian-format rupee value, e.g. ₹1,23,456. */
export function formatINR(value: number): string {
  return `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
}

/** Total collected on a booking — from the payments ledger, or the cached amountPaid. */
export function bookingPaid(b: { payments?: { amount: number }[]; amountPaid?: number }): number {
  if (b.payments && b.payments.length) {
    return b.payments.reduce((s, p) => s + (p.amount || 0), 0);
  }
  return b.amountPaid || 0;
}

/** Outstanding balance on a booking. */
export function bookingBalance(b: { total?: number; balanceAmount?: number; payments?: { amount: number }[]; amountPaid?: number }): number {
  if (b.payments && b.payments.length) {
    return Math.max(0, (b.total || 0) - bookingPaid(b));
  }
  return b.balanceAmount ?? Math.max(0, (b.total || 0) - (b.amountPaid || 0));
}

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  bank: "Bank Transfer",
  cheque: "Cheque",
  other: "Other",
};

/** Compact rupee value for axes/badges: ₹1.2Cr, ₹3.4L, ₹5.6k. */
export function formatINRCompact(value: number): string {
  const n = value || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

/**
 * Resolve a Firestore Timestamp | ISO string | Date into a JS Date.
 * Revenue is attributed by booking creation date, so callers should pass createdAt.
 */
export function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
