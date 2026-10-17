import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { normalizePhoneDigits } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const excludeClientId = typeof body?.excludeClientId === 'string' ? body.excludeClientId : '';
  if (!phone) {
    return NextResponse.json({ error: 'Phone is required.' }, { status: 400 });
  }

  const digits = normalizePhoneDigits(phone);
  if (!digits) {
    return NextResponse.json({ duplicate: false });
  }

  let isStaff = false;
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (token) {
    try {
      await adminAuth().verifyIdToken(token);
      isStaff = true;
    } catch {
      // Invalid/expired token — treat like public form.
    }
  }

  try {
    const db = adminDb();
    const [byDigits, byPhone] = await Promise.all([
      db.collection('clients').where('phoneDigits', '==', digits).get(),
      db.collection('clients').where('phone', '==', phone).get(),
    ]);

    const matches = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of [...byDigits.docs, ...byPhone.docs]) {
      if (doc.id !== excludeClientId) matches.set(doc.id, doc);
    }
    const match = [...matches.values()][0];
    if (!match) {
      return NextResponse.json({ duplicate: false });
    }

    if (isStaff) {
      const data = match.data();
      return NextResponse.json({
        duplicate: true,
        client: { id: match.id, name: (data?.name as string) || 'Unnamed client' },
      });
    }
    return NextResponse.json({ duplicate: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Duplicate check failed.' }, { status: 500 });
  }
}
