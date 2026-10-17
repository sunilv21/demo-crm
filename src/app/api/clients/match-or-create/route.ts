import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { normalizePhoneDigits } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token.' }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired session. Sign in again.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided.' }, { status: 400 });
  }

  const db = adminDb();
  const resolvedByDigits = new Map<string, { id: string; name: string }>();
  const results: { index: number; clientId: string; clientName: string; created: boolean }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const phone = typeof row.phone === 'string' ? row.phone.trim() : '';
    const email = typeof row.email === 'string' ? row.email.trim() : '';
    const nationality = typeof row.nationality === 'string' ? row.nationality.trim() : '';
    const digits = normalizePhoneDigits(phone);
    if (!name || !digits) continue;

    const already = resolvedByDigits.get(digits);
    if (already) {
      results.push({ index: i, clientId: already.id, clientName: already.name, created: false });
      continue;
    }

    const [byDigitsSnap, byPhoneSnap] = await Promise.all([
      db.collection('clients').where('phoneDigits', '==', digits).limit(1).get(),
      db.collection('clients').where('phone', '==', phone).limit(1).get(),
    ]);
    const match = byDigitsSnap.docs[0] || byPhoneSnap.docs[0];

    if (match) {
      const resolved = { id: match.id, name: (match.data().name as string) || name };
      resolvedByDigits.set(digits, resolved);
      results.push({ index: i, clientId: resolved.id, clientName: resolved.name, created: false });
    } else {
      const ref = db.collection('clients').doc();
      await ref.set({
        name,
        phone,
        phoneDigits: digits,
        email: email || '',
        nationality: nationality || 'Indian',
        status: 'prospect',
        avatar: '',
        preferences: '',
        assignedEmployees: [uid],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
      const resolved = { id: ref.id, name };
      resolvedByDigits.set(digits, resolved);
      results.push({ index: i, clientId: resolved.id, clientName: resolved.name, created: true });
    }
  }

  return NextResponse.json({ results });
}
