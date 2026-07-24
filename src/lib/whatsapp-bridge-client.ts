// Server-only. Thin fetch wrapper the Next.js API routes use to reach the
// whatsapp-web.js bridge process (whatsapp-bridge/) — the only thing that
// ever talks to WhatsApp itself. Never import this from a client component;
// it reads WHATSAPP_BRIDGE_URL/SECRET, server-only env vars.

function bridgeUrl(): string {
  const url = process.env.WHATSAPP_BRIDGE_URL;
  if (!url) throw new Error('WHATSAPP_BRIDGE_URL is not configured.');
  return url.replace(/\/$/, '');
}

function bridgeSecret(): string {
  const secret = process.env.WHATSAPP_BRIDGE_SECRET;
  if (!secret) throw new Error('WHATSAPP_BRIDGE_SECRET is not configured.');
  return secret;
}

async function callBridge<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${bridgeUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-secret': bridgeSecret(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'WhatsApp bridge request failed.');
  }
  return data as T;
}

export function bridgeConnectAccount(accountId: string) {
  return callBridge<{ ok: true }>(`/accounts/${accountId}/connect`);
}

export function bridgeDisconnectAccount(accountId: string) {
  return callBridge<{ ok: true }>(`/accounts/${accountId}/disconnect`);
}

export function bridgeSendMessage(
  accountId: string,
  to: string,
  body: string,
  // Tags the message doc the bridge writes so the campaign detail view can
  // join its live delivery status back onto this specific recipient.
  campaignMeta?: { campaignId: string; campaignRecipientId: string }
) {
  return callBridge<{ ok: true; chatId: string }>('/send', { accountId, to, body, ...campaignMeta });
}
