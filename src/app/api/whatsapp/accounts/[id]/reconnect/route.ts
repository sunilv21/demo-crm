import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { bridgeConnectAccount } from '@/lib/whatsapp-bridge-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/accounts/[id]/reconnect
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Re-starts pairing for an existing account that's disconnected or in an
 * error state — the whatsapp-web.js bridge will emit a fresh QR code onto
 * the same doc.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;
  try {
    await bridgeConnectAccount(id);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to start pairing.' }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
