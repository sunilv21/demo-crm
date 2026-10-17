// Minimal CSV export: builds a CSV string from rows and triggers a browser download.
function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  if (typeof window === 'undefined') return;
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  // Leading BOM so Excel opens UTF-8 (e.g. ₹, non-Latin names) without mangling it.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
