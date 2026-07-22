import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { processCampaignBatch } from '@/lib/campaign-queue-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/email/campaigns/[id]/process
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * On-demand "Process Now" — runs one batch of the same queue logic the
 * scheduled Cloud Function (functions/src/campaign-queue.ts) runs every
 * minute. Useful both as a manual trigger and as the only way campaigns
 * actually send while the project isn't yet on the Blaze plan.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'manager', 'agent']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;
  const result = await processCampaignBatch(id);
  return NextResponse.json({ success: true, ...result });
}
