import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { syncOneMailbox } from '@/lib/inbox-sync-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/settings/mailboxes/[id]/sync
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * On-demand "Refresh" — runs the same sync core the scheduled Cloud
 * Function (functions/src/inbox-sync.ts) runs every 5 minutes. Skips if a
 * sync is already in progress for this mailbox. Available to admin/manager/
 * agent — refreshing the inbox is a daily-use action, not credential config.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'manager', 'agent']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;
  const result = await syncOneMailbox(id);

  if (!result.ok) {
    console.error(`[Mailbox Sync Error] Mailbox ID: ${id}, Error: ${result.error}`);
    return NextResponse.json({ error: result.error || 'Sync failed.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, newCount: result.newCount });
}
