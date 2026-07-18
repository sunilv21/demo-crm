// Shared print/PDF helpers for the printable voucher content.
//
//   printContentHtml()  → opens the print dialog (paper, or Save-as-PDF)
//   pdfFilename()       → the shared file-naming convention
//
// Both "Print" and "Download PDF" go through the browser's own print engine.
// That keeps the PDF vector (selectable text, exact layout, correct page breaks)
// and guarantees it matches what Print produces. A client-side rasterising
// library (html2canvas/html2pdf) was tried here and rejected: it re-renders the
// layout from scratch and mangles the voucher.
//
// The fragment is expected to carry its own scoped <style> (e.g.
// PrintableBookings' .inv styles); the page chrome below adds only the A4 frame.

interface PrintOptions {
  /** Document title. Browsers use this as the default "Save as PDF" filename. */
  title?: string;
}

function wrapDocument(contentHTML: string, title: string, origin: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>${title}</title>
    <base href="${origin}/" />
    <style>
      *{ -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
      body{ margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; color:#111827; background:#fff; }
      .print-container{ max-width:210mm; margin:0 auto; padding:16px; }
      @page{ size:A4; margin:12mm; }
    </style></head><body><div class="print-container">${contentHTML}</div></body></html>`;
}

/**
 * Build a safe, descriptive filename with a given extension, e.g.
 *   SkyVisa-Booking-Ravi-Kumar-2026-07-15.pdf
 * Shared by pdfFilename() below and the Other Format .docx export.
 */
export function safeFilename(label: string, subject: string | undefined, ext: string): string {
  // Fold accents to ASCII first (José → Jose) so names stay readable rather
  // than losing the letter entirely, then reduce to filesystem-safe characters.
  const clean = (s: string) =>
    s.normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const date = new Date().toISOString().slice(0, 10);
  const parts = ['SkyVisa', clean(label), subject ? clean(subject) : '', date].filter(Boolean);
  return `${parts.join('-')}.${ext}`;
}

/**
 * Build a safe, descriptive PDF filename, e.g.
 *   SkyVisa-Booking-Ravi-Kumar-2026-07-15.pdf
 */
export function pdfFilename(label: string, subject?: string): string {
  return safeFilename(label, subject, 'pdf');
}

/** The `title` form of a filename — no .pdf suffix (the browser appends it). */
export const pdfTitle = (label: string, subject?: string) =>
  pdfFilename(label, subject).replace(/\.pdf$/, '');

/**
 * Print an HTML fragment via a hidden iframe. Works in the browser and in the
 * Electron desktop app (no popup to be blocked). Passing `title` pre-fills the
 * filename when the user chooses "Save as PDF" as the print destination.
 */
export function printContentHtml(contentHTML: string, options: PrintOptions = {}) {
  if (typeof window === 'undefined') return;
  const title = options.title || 'Booking Summary';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  doc.write(wrapDocument(contentHTML, title, window.location.origin));
  doc.close();

  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      /* printing unavailable */
    }
    setTimeout(() => iframe.remove(), 1000);
  };
  // Print once the logo and any other images have settled, else they drop out.
  const imgs = Array.from(doc.images);
  if (imgs.length) {
    let pending = imgs.length;
    const settle = () => { if (--pending <= 0) go(); };
    imgs.forEach((img) => { if (img.complete) settle(); else { img.onload = settle; img.onerror = settle; } });
  }
  setTimeout(go, 1000);
}
