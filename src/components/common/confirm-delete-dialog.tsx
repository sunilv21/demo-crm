'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Exact text the user must type to enable deletion (usually the record name). */
  confirmText: string;
  title?: string;
  /** Inline description shown above the confirm input. */
  description?: React.ReactNode;
  confirmLabel?: string;
}

/**
 * A deliberate, hard-to-trigger-by-accident delete confirmation. The destructive
 * button stays disabled until the user types the record's name exactly
 * (case-insensitive, trimmed). Use for any permanent deletion.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  confirmText,
  title = 'Are you absolutely sure?',
  description,
  confirmLabel = 'Delete',
}: ConfirmDeleteDialogProps) {
  const [value, setValue] = React.useState('');

  // Reset the typed value whenever the dialog opens or closes.
  React.useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  const target = (confirmText ?? '').trim();
  const matches = target.length > 0 && value.trim().toLowerCase() === target.toLowerCase();

  const handleConfirm = () => {
    if (!matches) return;
    onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? (
              <>
                This action cannot be undone. This will permanently delete{' '}
                <span className="font-semibold text-foreground">{confirmText}</span>.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-1">
          <Label htmlFor="confirm-delete-input" className="text-sm text-muted-foreground">
            Type <span className="font-semibold text-foreground">{confirmText}</span> to confirm
          </Label>
          <Input
            id="confirm-delete-input"
            autoFocus
            autoComplete="off"
            value={value}
            placeholder={confirmText}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
              }
            }}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
