import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { bridgeDisconnectAccount } from '@/lib/whatsapp-bridge-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/accounts/[id]/disconnect
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * Logs the device out on WhatsApp's side without deleting the account
 * record — the account stays visible with status 'disconnected' and can be
 * re-paired later via reconnect.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;
  try {
    await bridgeDisconnectAccount(id);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to disconnect.' }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
