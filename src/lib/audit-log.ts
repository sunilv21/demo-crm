// Server-only. Shared audit_logs writer for the mailbox API routes
// (Admin SDK). Campaign/template actions log the same shape but write
// directly via the client Firestore SDK instead (see campaign-detail-dialog.tsx,
// new-campaign-dialog.tsx, templates-tab.tsx) since those actions already
// happen as plain client-side writes.

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import type { AuditAction } from '@/lib/types';

export async function logAudit(entry: {
  action: AuditAction;
  targetType: 'mailbox' | 'campaign' | 'template';
  targetId: string;
  targetLabel: string;
  actorId: string;
  actorName: string;
  metadata?: Record<string, any> | null;
}): Promise<void> {
  await adminDb()
    .collection('audit_logs')
    .add({ ...entry, metadata: entry.metadata ?? null, createdAt: FieldValue.serverTimestamp() });
}
