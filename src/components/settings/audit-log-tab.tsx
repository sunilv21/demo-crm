'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditLog } from '@/lib/types';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';

const ACTION_LABEL: Record<AuditLog['action'], string> = {
  'mailbox.created': 'Mailbox connected',
  'mailbox.deleted': 'Mailbox deleted',
  'mailbox.enabled': 'Mailbox enabled',
  'mailbox.disabled': 'Mailbox disabled',
  'campaign.started': 'Campaign started',
  'campaign.paused': 'Campaign paused',
  'campaign.cancelled': 'Campaign cancelled',
  'campaign.deleted': 'Campaign deleted',
  'template.created': 'Template created',
  'template.updated': 'Template updated',
  'template.deleted': 'Template deleted',
  'whatsapp_account.created': 'WhatsApp number connected',
  'whatsapp_account.deleted': 'WhatsApp number deleted',
  'whatsapp_campaign.started': 'WhatsApp campaign started',
  'whatsapp_campaign.paused': 'WhatsApp campaign paused',
  'whatsapp_campaign.cancelled': 'WhatsApp campaign cancelled',
  'whatsapp_campaign.deleted': 'WhatsApp campaign deleted',
  'whatsapp_template.created': 'WhatsApp template created',
  'whatsapp_template.updated': 'WhatsApp template updated',
  'whatsapp_template.deleted': 'WhatsApp template deleted',
};

const LOAD_STEP = 200;

export function AuditLogTab() {
  const firestore = useFirestore();
  const [rowLimit, setRowLimit] = useState(LOAD_STEP);

  const logsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'audit_logs'), orderBy('createdAt', 'desc'), limit(rowLimit));
  }, [firestore, rowLimit]);
  const { data: logs, isLoading } = useCollection<AuditLog>(logsQuery);

  const list = logs || [];

  return (
    <div>
      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>By</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              list.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{ACTION_LABEL[log.action] || log.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.targetLabel}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.actorName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : ''}
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && list.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No audit entries yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      {!isLoading && list.length === rowLimit && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setRowLimit((n) => n + LOAD_STEP)}>
          Load more
        </Button>
      )}
    </div>
  );
}
