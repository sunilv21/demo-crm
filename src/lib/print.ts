// Print an HTML fragment via a hidden iframe. Works in the browser and in the
// Electron desktop app (no popup to be blocked). The fragment is expected to
// carry its own scoped <style> (e.g. PrintableBookings' .inv styles).
export function printContentHtml(contentHTML: string) {
  if (typeof window === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }

  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8" />
    <base href="${window.location.origin}/" />
    <style>
      *{ -webkit-print-color-adjust:exact; print-color-adjust:exact; box-sizing:border-box; }
      body{ margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; color:#111827; }
      .print-container{ max-width:210mm; margin:0 auto; padding:16px; }
      @page{ size:A4; margin:12mm; }
    </style></head><body><div class="print-container">${contentHTML}</div></body></html>`);
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
  const imgs = Array.from(doc.images);
  if (imgs.length) {
    let pending = imgs.length;
    const settle = () => { if (--pending <= 0) go(); };
    imgs.forEach((img) => { if (img.complete) settle(); else { img.onload = settle; img.onerror = settle; } });
  }
  setTimeout(go, 1000);
}
