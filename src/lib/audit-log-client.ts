// Client-side audit_logs writer for actions that already happen as plain
// Firestore writes (campaigns, templates — see src/lib/audit-log.ts for the
// server-side equivalent used by the mailbox API routes). Fire-and-forget,
// matching this app's non-blocking write convention — an audit log failure
// shouldn't block the action it's describing.

import { addDoc, collection, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { AuditAction, AuditLog } from '@/lib/types';

export function logAuditClient(
  firestore: Firestore,
  entry: {
    action: AuditAction;
    targetType: AuditLog['targetType'];
    targetId: string;
    targetLabel: string;
    actorId: string;
    actorName: string;
    metadata?: Record<string, any> | null;
  }
) {
  addDoc(collection(firestore, 'audit_logs'), {
    ...entry,
    metadata: entry.metadata ?? null,
    createdAt: serverTimestamp(),
  }).catch((err) => console.error('[audit_logs] write failed:', err));
}
