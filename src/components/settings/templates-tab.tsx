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
import type { EmailTemplate } from '@/lib/types';
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
import { EmailTemplateForm } from '@/components/forms/email-template-form';
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog';
import { useToast } from '@/hooks/use-toast';
import { logAuditClient } from '@/lib/audit-log-client';

// Templates are canned text, not credentials — plain client-side Firestore
// CRUD (like hotels), no API route needed. Usable by anyone who can already
// reach this tab (admin on Settings, admin/manager/agent on Inbox).
export function TemplatesTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);

  const templatesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'email_templates'), orderBy('name', 'asc'));
  }, [firestore]);
  const { data: templates, isLoading } = useCollection<EmailTemplate>(templatesQuery);

  function audit(action: 'template.created' | 'template.updated' | 'template.deleted', targetId: string, name: string) {
    if (!firestore || !user) return;
    logAuditClient(firestore, {
      action,
      targetType: 'template',
      targetId,
      targetLabel: name,
      actorId: user.uid,
      actorName: user.displayName || user.email || user.uid,
    });
  }

  const handleAdd = (data: Partial<EmailTemplate>) => {
    if (!firestore) return;
    addDocumentNonBlocking(collection(firestore, 'email_templates'), data).then((ref) => {
      if (ref) audit('template.created', ref.id, data.name || '');
    });
    setIsFormOpen(false);
    toast({ title: 'Template Created', description: `"${data.name}" has been added.` });
  };

  const handleUpdate = (data: Partial<EmailTemplate>) => {
    if (!firestore || !editingTemplate) return;
    setDocumentNonBlocking(doc(firestore, 'email_templates', editingTemplate.id), data, { merge: true });
    audit('template.updated', editingTemplate.id, data.name || editingTemplate.name);
    setEditingTemplate(null);
    toast({ title: 'Template Updated', description: `"${data.name}" has been updated.` });
  };

  const handleDelete = () => {
    if (!firestore || !templateToDelete) return;
    deleteDocumentNonBlocking(doc(firestore, 'email_templates', templateToDelete.id));
    audit('template.deleted', templateToDelete.id, templateToDelete.name);
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
              <DialogTitle>Create Email Template</DialogTitle>
            </DialogHeader>
            <EmailTemplateForm onSubmit={handleAdd} onCancel={() => setIsFormOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Edit {editingTemplate?.name}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <EmailTemplateForm template={editingTemplate} onSubmit={handleUpdate} onCancel={() => setEditingTemplate(null)} />
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
              <TableHead>Subject</TableHead>
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
                  <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{t.subject}</TableCell>
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
            <p>No templates yet. Create one to reuse canned text when emailing clients.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
