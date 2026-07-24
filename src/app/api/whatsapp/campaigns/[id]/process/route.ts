import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';
import { processWhatsAppCampaignBatch } from '@/lib/whatsapp-campaign-queue-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/whatsapp/campaigns/[id]/process
 * Header: Authorization: Bearer <caller Firebase ID token>
 *
 * On-demand batch processor for a running WhatsApp campaign — mirrors
 * /api/email/campaigns/[id]/process. Unlike email there's no scheduled Cloud
 * Function backing this up: whatsapp_web sends go through the local bridge
 * process, which only this machine can reach, so the client-side auto-poll
 * in whatsapp-campaigns-tab.tsx calling this route is the only trigger.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'manager', 'agent']);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { id } = await params;
  const result = await processWhatsAppCampaignBatch(id);
  return NextResponse.json({ success: true, ...result });
}
