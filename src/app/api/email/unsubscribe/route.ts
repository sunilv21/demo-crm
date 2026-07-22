import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import type { CampaignRecipient } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function htmlPage(title: string, message: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;text-align:center;color:#333}</style>
</head><body><h2>${title}</h2><p>${message}</p></body></html>`;
}

/**
 * GET /api/email/unsubscribe?token=<campaign_recipients.unsubscribeToken>
 *
 * Public, no auth — opened directly from a link in a received campaign
 * email. Sets doNotEmail on the referenced client/lead so future campaign
 * recipient pickers exclude them automatically.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse(htmlPage('Invalid link', 'This unsubscribe link is missing its token.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const db = adminDb();
  const snap = await db.collection('campaign_recipients').where('unsubscribeToken', '==', token).limit(1).get();
  if (snap.empty) {
    return new NextResponse(htmlPage('Link not found', 'This unsubscribe link is invalid or has expired.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const recipient = snap.docs[0].data() as CampaignRecipient;
  const collectionName = recipient.recipientType === 'client' ? 'clients' : 'leads';
  await db.doc(`${collectionName}/${recipient.recipientId}`).update({
    doNotEmail: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return new NextResponse(
    htmlPage('Unsubscribed', "You've been removed from our email list and won't receive further campaign emails."),
    { headers: { 'Content-Type': 'text/html' } }
  );
}
