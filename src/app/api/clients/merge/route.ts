import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { logAudit } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ClientData = FirebaseFirestore.DocumentData;

async function authenticate(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!token) {
    return { error: NextResponse.json({ error: 'Missing authentication token.' }, { status: 401 }) };
  }
  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return { error: NextResponse.json({ error: 'Invalid or expired session. Sign in again.' }, { status: 401 }) };
  }
  const db = adminDb();
  const callerSnap = await db.doc(`users/${uid}`).get();
  const role = callerSnap.exists ? (callerSnap.data()?.role as string) : 'employee';
  if (role !== 'admin' && role !== 'manager') {
    return { error: NextResponse.json({ error: 'Only admins or managers can merge clients.' }, { status: 403 }) };
  }
  const callerName = (callerSnap.data()?.name as string) || 'Staff';
  return { uid, callerName };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dedupeByValue<T>(arr: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of arr) seen.set(JSON.stringify(item), item);
  return [...seen.values()];
}

async function countClientRecords(
  db: FirebaseFirestore.Firestore,
  clientId: string,
  financeTxnDocs: FirebaseFirestore.QueryDocumentSnapshot[]
) {
  const [bookings, customerLogs, followUps, leads, campaignRecipients, emailLogs, itineraries] = await Promise.all([
    db.collection('bookings').where('clientId', '==', clientId).get(),
    db.collection('customer_logs').where('clientId', '==', clientId).get(),
    db.collection('follow_ups').where('clientId', '==', clientId).get(),
    db.collection('leads').where('convertedToClientId', '==', clientId).get(),
    db.collection('campaign_recipients').where('recipientType', '==', 'client').where('recipientId', '==', clientId).get(),
    db.collection('email_logs').where('relatedClientId', '==', clientId).get(),
    db.collection('clients').doc(clientId).collection('itineraries').get(),
  ]);
  const financeTransactions = financeTxnDocs.filter((d) => d.data().clientId === clientId);

  return {
    bookings: bookings.docs,
    customerLogs: customerLogs.docs,
    followUps: followUps.docs,
    leads: leads.docs,
    campaignRecipients: campaignRecipients.docs,
    emailLogs: emailLogs.docs,
    itineraries: itineraries.docs,
    financeTransactions,
    counts: {
      bookings: bookings.size,
      customer_logs: customerLogs.size,
      follow_ups: followUps.size,
      finance_transactions: financeTransactions.length,
      leads: leads.size,
      campaign_recipients: campaignRecipients.size,
      email_logs: emailLogs.size,
      itineraries: itineraries.size,
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if ('error' in auth) return auth.error;
  const { uid, callerName } = auth;

  const body = await req.json().catch(() => ({}));
  const db = adminDb();

  // Mode A: compare
  if (Array.isArray(body?.compareIds)) {
    const ids: string[] = body.compareIds.filter((x: any) => typeof x === 'string' && x);
    if (ids.length < 2) {
      return NextResponse.json({ error: 'Provide at least two client ids to compare.' }, { status: 400 });
    }
    const financeSnap = await db.collection('finance_transactions').get();
    const clients = [];
    for (const id of ids) {
      const snap = await db.collection('clients').doc(id).get();
      if (!snap.exists) continue;
      const data = snap.data() as ClientData;
      const rec = await countClientRecords(db, id, financeSnap.docs);
      clients.push({
        id,
        name: data.name,
        phone: data.phone || '',
        email: data.email || null,
        status: data.status || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        assignedEmployees: data.assignedEmployees || [],
        organizationId: data.organizationId || null,
        counts: rec.counts,
      });
    }
    return NextResponse.json({ clients });
  }

  // Modes B/C: survivorId + duplicateId
  const survivorId = typeof body?.survivorId === 'string' ? body.survivorId : '';
  const duplicateId = typeof body?.duplicateId === 'string' ? body.duplicateId : '';
  const dryRun = body?.dryRun === true;

  if (!survivorId || !duplicateId) {
    return NextResponse.json({ error: 'survivorId and duplicateId are required.' }, { status: 400 });
  }
  if (survivorId === duplicateId) {
    return NextResponse.json({ error: 'Cannot merge a client with itself.' }, { status: 400 });
  }

  const [survivorSnap, duplicateSnap] = await Promise.all([
    db.collection('clients').doc(survivorId).get(),
    db.collection('clients').doc(duplicateId).get(),
  ]);
  if (!survivorSnap.exists || !duplicateSnap.exists) {
    return NextResponse.json({ error: 'One or both clients no longer exist.' }, { status: 404 });
  }
  const survivor = survivorSnap.data() as ClientData;
  const duplicate = duplicateSnap.data() as ClientData;

  if (survivor.organizationId || duplicate.organizationId) {
    return NextResponse.json(
      { error: 'Merge is not available for clients that belong to an Organization.' },
      { status: 400 }
    );
  }

  const blockingReasons: string[] = [];
  if (survivor.activePackageId && duplicate.activePackageId) {
    blockingReasons.push('Both clients have an active package. End one package before merging.');
  }
  const blocked = blockingReasons.length > 0;

  const financeSnap = await db.collection('finance_transactions').get();
  const dup = await countClientRecords(db, duplicateId, financeSnap.docs);

  const survivorAssigned: string[] = survivor.assignedEmployees || [];
  const duplicateAssigned: string[] = duplicate.assignedEmployees || [];
  const assignedEmployeesAdded = duplicateAssigned.filter((id: string) => !survivorAssigned.includes(id));

  const survivorDocs: { name: string; status: string }[] = survivor.requiredDocuments || [];
  const duplicateDocs: { name: string; status: string }[] = duplicate.requiredDocuments || [];
  const survivorDocNames = new Set(survivorDocs.map((d) => d.name));
  const requiredDocumentsCollisions = duplicateDocs.filter((d) => survivorDocNames.has(d.name)).map((d) => d.name);
  const requiredDocumentsAdded = duplicateDocs.filter((d) => !survivorDocNames.has(d.name)).map((d) => d.name);

  let activePackageResolution: 'none' | 'keptSurvivor' | 'copiedFromDuplicate' | 'conflict' = 'none';
  if (survivor.activePackageId && duplicate.activePackageId) activePackageResolution = 'conflict';
  else if (survivor.activePackageId) activePackageResolution = 'keptSurvivor';
  else if (duplicate.activePackageId) activePackageResolution = 'copiedFromDuplicate';

  const preview = {
    survivor: { id: survivorId, name: survivor.name },
    duplicate: { id: duplicateId, name: duplicate.name },
    counts: dup.counts,
    fieldMerges: {
      assignedEmployeesAdded,
      requiredDocumentsCollisions,
      requiredDocumentsAdded,
      activePackageResolution,
      companionsAdded: (duplicate.companions || []).length,
      visaHistoryAdded: (duplicate.visaHistory || []).length,
      previousTripsAdded: (duplicate.previousTrips || []).length,
      tripDestinationsAdded: (duplicate.tripDestinations || []).length,
    },
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, blocked, blockingReasons, ...preview });
  }

  if (blocked) {
    return NextResponse.json({ error: blockingReasons.join(' '), blockingReasons }, { status: 400 });
  }

  // Mode C: execute
  try {
    const runBatchedUpdates = async (
      docs: FirebaseFirestore.QueryDocumentSnapshot[],
      data: Record<string, any>
    ) => {
      for (const group of chunk(docs, 400)) {
        const batch = db.batch();
        for (const d of group) batch.update(d.ref, data);
        await batch.commit();
      }
    };

    await runBatchedUpdates(dup.bookings, { clientId: survivorId, clientName: survivor.name });
    await runBatchedUpdates(dup.customerLogs, { clientId: survivorId, clientName: survivor.name });
    await runBatchedUpdates(dup.followUps, {
      clientId: survivorId,
      clientName: survivor.name,
      clientEmail: survivor.email || '',
      clientPhone: survivor.phone || '',
    });
    await runBatchedUpdates(dup.financeTransactions, { clientId: survivorId, clientName: survivor.name });
    await runBatchedUpdates(dup.leads, { convertedToClientId: survivorId });
    await runBatchedUpdates(dup.campaignRecipients, { recipientId: survivorId });
    await runBatchedUpdates(dup.emailLogs, { relatedClientId: survivorId });

    if (dup.itineraries.length > 0) {
      for (const group of chunk(dup.itineraries, 200)) {
        const batch = db.batch();
        for (const d of group) {
          batch.set(db.collection('clients').doc(survivorId).collection('itineraries').doc(d.id), d.data());
          batch.delete(d.ref);
        }
        await batch.commit();
      }
    }

    const survivorUpdate: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    };
    if (duplicateAssigned.length > 0) {
      survivorUpdate.assignedEmployees = FieldValue.arrayUnion(...duplicateAssigned);
    }
    const mergeArrayField = (field: string, survivorArr: any[] | undefined, duplicateArr: any[] | undefined) => {
      if (!duplicateArr || duplicateArr.length === 0) return;
      survivorUpdate[field] = dedupeByValue([...(survivorArr || []), ...duplicateArr]);
    };
    mergeArrayField('companions', survivor.companions, duplicate.companions);
    mergeArrayField('visaHistory', survivor.visaHistory, duplicate.visaHistory);
    mergeArrayField('previousTrips', survivor.previousTrips, duplicate.previousTrips);
    mergeArrayField('tripDestinations', survivor.tripDestinations, duplicate.tripDestinations);
    if (requiredDocumentsAdded.length > 0) {
      survivorUpdate.requiredDocuments = [
        ...survivorDocs,
        ...duplicateDocs.filter((d) => !survivorDocNames.has(d.name)),
      ];
    }
    if (!survivor.activePackageId && duplicate.activePackageId) {
      survivorUpdate.activePackageId = duplicate.activePackageId;
      survivorUpdate.activePackageLabel = duplicate.activePackageLabel ?? null;
      survivorUpdate.activePackageStartedAt = duplicate.activePackageStartedAt ?? null;
      survivorUpdate.activePackageStartedBy = duplicate.activePackageStartedBy ?? null;
    }
    await db.collection('clients').doc(survivorId).update(survivorUpdate);

    let deleteFailed = false;
    try {
      await db.collection('clients').doc(duplicateId).delete();
    } catch {
      deleteFailed = true;
    }

    if (deleteFailed) {
      return NextResponse.json({
        success: true,
        partialSuccess: true,
        survivorId,
        counts: dup.counts,
        message:
          'All client data was migrated, but the duplicate record could not be deleted. Retrying is safe — it will complete cleanly.',
      });
    }

    try {
      await logAudit({
        action: 'client.merged',
        targetType: 'client',
        targetId: survivorId,
        targetLabel: survivor.name,
        actorId: uid,
        actorName: callerName,
        metadata: { duplicateId, duplicateName: duplicate.name, counts: dup.counts },
      });
    } catch {
      // Non-critical — don't fail a completed merge over an audit-log hiccup.
    }

    return NextResponse.json({ success: true, survivorId, counts: dup.counts });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Merge failed partway through. The duplicate record was not deleted — safe to retry.' },
      { status: 500 }
    );
  }
}
