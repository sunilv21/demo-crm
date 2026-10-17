import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { normalizePhoneDigits } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token.' }, { status: 401 });
  }

  let callerUid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired session. Sign in again.' }, { status: 401 });
  }

  try {
    const db = adminDb();
    const callerSnap = await db.doc(`users/${callerUid}`).get();
    const role = callerSnap.exists ? (callerSnap.data()?.role as string) : 'employee';
    const seesAll = role === 'admin' || role === 'manager' || role === 'finance';

    const clientsSnap = await db.collection('clients').get();
    const groups = new Map<string, { id: string; name: string; assignedEmployees?: string[]; createdBy?: string }[]>();

    for (const doc of clientsSnap.docs) {
      const data = doc.data();
      const key = (data.phoneDigits as string) || normalizePhoneDigits(data.phone as string);
      if (!key) continue;
      const entry = {
        id: doc.id,
        name: (data.name as string) || 'Unnamed client',
        assignedEmployees: (data.assignedEmployees as string[]) || undefined,
        createdBy: data.createdBy as string | undefined,
      };
      const list = groups.get(key);
      if (list) list.push(entry);
      else groups.set(key, [entry]);
    }

    const canSee = (c: { assignedEmployees?: string[]; createdBy?: string }) =>
      seesAll || c.createdBy === callerUid || !!c.assignedEmployees?.includes(callerUid);

    const byClient: Record<string, { id: string; name: string }[]> = {};
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const visible = seesAll ? members : members.filter(canSee);
      if (visible.length < 2) continue;
      for (const m of visible) {
        byClient[m.id] = visible.filter((o) => o.id !== m.id).map((o) => ({ id: o.id, name: o.name }));
      }
    }

    return NextResponse.json({ byClient });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not scan for duplicates.' }, { status: 500 });
  }
}
