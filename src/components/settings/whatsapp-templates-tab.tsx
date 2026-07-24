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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, PlusCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { WhatsAppTemplate } from '@/lib/types';
import {
  useCollection,
  useFirestore,
  useUser,
  useMemoFirebase,
  addDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase';
import { collection, doc, query, orderBy } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { WhatsAppTemplateForm } from '@/components/forms/whatsapp-template-form';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { logAuditClient } from '@/lib/audit-log-client';

// Mirrors src/components/settings/templates-tab.tsx (email).
export function WhatsAppTemplatesTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<WhatsAppTemplate | null>(null);

  const templatesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'whatsapp_templates'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: templates, isLoading } = useCollection<WhatsAppTemplate>(templatesQuery);

  function audit(action: 'whatsapp_template.created' | 'whatsapp_template.updated' | 'whatsapp_template.deleted', targetId: string, name: string) {
    if (!firestore || !user) return;
    logAuditClient(firestore, {
      action,
      targetType: 'whatsapp_template',
      targetId,
      targetLabel: name,
      actorId: user.uid,
      actorName: user.displayName || user.email || user.uid,
    });
  }

  const handleAdd = (data: Partial<WhatsAppTemplate>) => {
    if (!firestore) return;
    addDocumentNonBlocking(collection(firestore, 'whatsapp_templates'), data).then((ref) => {
      if (ref) audit('whatsapp_template.created', ref.id, data.name || '');
    });
    setIsFormOpen(false);
    toast({ title: 'Template Created', description: `"${data.name}" has been added.` });
  };

  const handleUpdate = (data: Partial<WhatsAppTemplate>) => {
    if (!firestore || !editingTemplate) return;
    setDocumentNonBlocking(doc(firestore, 'whatsapp_templates', editingTemplate.id), data, { merge: true });
    audit('whatsapp_template.updated', editingTemplate.id, data.name || editingTemplate.name);
    setEditingTemplate(null);
    toast({ title: 'Template Updated', description: `"${data.name}" has been updated.` });
  };

  const handleDelete = () => {
    if (!firestore || !templateToDelete) return;
    deleteDocumentNonBlocking(doc(firestore, 'whatsapp_templates', templateToDelete.id));
    audit('whatsapp_template.deleted', templateToDelete.id, templateToDelete.name);
    toast({ variant: 'destructive', title: 'Template Deleted', description: `"${templateToDelete.name}" has been deleted.` });
    setTemplateToDelete(null);
  };

  const list = templates || [];

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle>Create WhatsApp Template</DialogTitle>
            </DialogHeader>
            <WhatsAppTemplateForm onSubmit={handleAdd} onCancel={() => setIsFormOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Edit {editingTemplate?.name}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <WhatsAppTemplateForm template={editingTemplate} onSubmit={handleUpdate} onCancel={() => setEditingTemplate(null)} />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!templateToDelete}
        onOpenChange={(open) => !open && setTemplateToDelete(null)}
        onConfirm={handleDelete}
        confirmText={templateToDelete?.name || ''}
        description={
          <>
            This will permanently delete the template{' '}
            <span className="font-semibold text-foreground">{templateToDelete?.name}</span>.
          </>
        }
      />

      <Card className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[56px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                  <TableCell><MoreHorizontal className="h-4 w-4 ml-auto" /></TableCell>
                </TableRow>
              ))}
            {!isLoading &&
              list.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      {t.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{t.body}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Open template actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditingTemplate(t)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={() => setTemplateToDelete(t)}>
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {!isLoading && list.length === 0 && (
          <div className="text-center p-8 text-muted-foreground">
            <p>No templates yet. Create one to reuse canned text when messaging clients.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
