// Trigger a browser download from a base64 payload returned by a Server
// Action (Server Actions can't stream binary directly — the caller gets a
// base64 string and turns it into a Blob here).
export function downloadBase64File(base64: string, filename: string, mime: string) {
  if (typeof window === 'undefined') return;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
