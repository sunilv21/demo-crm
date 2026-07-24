'use client';

import { useRef, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Renders an HTML email body inside a sandboxed iframe instead of injecting
 * it into the app's own DOM. Real HTML email ships its own <style> blocks
 * and table-based pixel layouts meant to be rendered in total isolation
 * (exactly what every real mail client does) — embedded directly into the
 * page, DOMPurify strips <style> tags (dropping class-based layout while
 * keeping inline styles) and Tailwind's preflight strips the default
 * margins/font-sizes those emails assume, which together reliably mangle
 * real-world HTML mail. The iframe sidesteps both problems.
 */
export function EmailBodyFrame({ html }: { html: string }) {
  const [height, setHeight] = useState(200);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const sanitized = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, ADD_TAGS: ['style'] });

  // A bare style reset so the email's own content sizes itself sensibly
  // inside the frame even if it isn't a full <html>/<body> document.
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8" /><base target="_blank" />
    <style>body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#111827;}img{max-width:100%;}</style>
    </head><body>${sanitized}</body></html>`;

  const handleLoad = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) {
      // A little headroom avoids a stray inner scrollbar from rounding.
      setHeight(doc.body.scrollHeight + 16);
    }
  };

  return (
    <iframe
      ref={frameRef}
      title="Email content"
      srcDoc={srcDoc}
      onLoad={handleLoad}
      sandbox="allow-same-origin allow-popups"
      style={{ width: '100%', height, border: 0, display: 'block' }}
    />
  );
}
