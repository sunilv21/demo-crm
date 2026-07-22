'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DialogFooter } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { Mailbox, MailboxProvider } from '@/lib/types';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { saveMailbox, testMailboxConnection } from '@/lib/mailbox-client';
import { PROVIDER_PRESETS } from '@/lib/mailbox-presets';

const formSchema = z.object({
  email: z.string().email({ message: 'Enter a valid email address.' }),
  displayName: z.string().min(1, { message: 'Display name is required.' }),
  provider: z.enum(['gmail', 'outlook', 'custom']),
  imapHost: z.string().min(1, { message: 'IMAP host is required.' }),
  imapPort: z.coerce.number().int().positive(),
  imapSecure: z.boolean(),
  smtpHost: z.string().min(1, { message: 'SMTP host is required.' }),
  smtpPort: z.coerce.number().int().positive(),
  smtpSecure: z.boolean(),
  username: z.string().min(1, { message: 'Username is required.' }),
  password: z.string().optional(),
  isDefault: z.boolean(),
  isEnabled: z.boolean(),
});

type MailboxFormValues = z.infer<typeof formSchema>;

interface MailboxFormProps {
  mailbox?: Mailbox;
  onSuccess: () => void;
  onCancel: () => void;
}

type TestStatus = { imap: 'idle' | 'pass' | 'fail'; smtp: 'idle' | 'pass' | 'fail'; error?: string };

export function MailboxForm({ mailbox, onSuccess, onCancel }: MailboxFormProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>({ imap: 'idle', smtp: 'idle' });

  const form = useForm<MailboxFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: mailbox?.email || '',
      displayName: mailbox?.displayName || '',
      provider: mailbox?.provider || 'gmail',
      imapHost: mailbox?.imapHost || PROVIDER_PRESETS.gmail.imapHost,
      imapPort: mailbox?.imapPort || PROVIDER_PRESETS.gmail.imapPort,
      imapSecure: mailbox?.imapSecure ?? PROVIDER_PRESETS.gmail.imapSecure,
      smtpHost: mailbox?.smtpHost || PROVIDER_PRESETS.gmail.smtpHost,
      smtpPort: mailbox?.smtpPort || PROVIDER_PRESETS.gmail.smtpPort,
      smtpSecure: mailbox?.smtpSecure ?? PROVIDER_PRESETS.gmail.smtpSecure,
      username: mailbox?.username || '',
      password: '',
      isDefault: mailbox?.isDefault ?? false,
      isEnabled: mailbox?.isEnabled ?? true,
    },
  });

  const provider = form.watch('provider');
  const isPresetProvider = provider === 'gmail' || provider === 'outlook';

  function handleProviderChange(value: MailboxProvider) {
    form.setValue('provider', value);
    if (value === 'gmail' || value === 'outlook') {
      const preset = PROVIDER_PRESETS[value];
      form.setValue('imapHost', preset.imapHost);
      form.setValue('imapPort', preset.imapPort);
      form.setValue('imapSecure', preset.imapSecure);
      form.setValue('smtpHost', preset.smtpHost);
      form.setValue('smtpPort', preset.smtpPort);
      form.setValue('smtpSecure', preset.smtpSecure);
    }
  }

  async function handleTestConnection() {
    if (!user) return;
    const values = form.getValues();
    if (!values.password && !mailbox) {
      toast({ variant: 'destructive', title: 'Password required', description: 'Enter a password to test the connection.' });
      return;
    }
    setIsTesting(true);
    setTestStatus({ imap: 'idle', smtp: 'idle' });
    try {
      const result = await testMailboxConnection(user, {
        mailboxId: !values.password ? mailbox?.id : undefined,
        imapHost: values.imapHost,
        imapPort: values.imapPort,
        imapSecure: values.imapSecure,
        smtpHost: values.smtpHost,
        smtpPort: values.smtpPort,
        smtpSecure: values.smtpSecure,
        username: values.username,
        password: values.password || undefined,
      });
      setTestStatus({
        imap: result.imap.ok ? 'pass' : 'fail',
        smtp: result.smtp.ok ? 'pass' : 'fail',
        error: [result.imap.error, result.smtp.error].filter(Boolean).join(' / '),
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Test failed', description: err?.message || 'Please try again.' });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSubmit(values: MailboxFormValues) {
    if (!user || isSaving) return;
    setIsSaving(true);
    try {
      await saveMailbox(user, {
        mailboxId: mailbox?.id,
        email: values.email,
        displayName: values.displayName,
        provider: values.provider,
        imapHost: values.imapHost,
        imapPort: values.imapPort,
        imapSecure: values.imapSecure,
        smtpHost: values.smtpHost,
        smtpPort: values.smtpPort,
        smtpSecure: values.smtpSecure,
        username: values.username,
        password: values.password || undefined,
        isDefault: values.isDefault,
        isEnabled: values.isEnabled,
      });
      toast({
        title: mailbox ? 'Mailbox updated' : 'Mailbox connected',
        description: `${values.email} has been saved.`,
      });
      onSuccess();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: err?.message || 'Please try again.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Form {...form}>
      {/* Unlike other forms in this codebase, submit awaits a server API call
          (password encryption happens there) instead of a non-blocking
          Firestore write, so the dialog can't close until save resolves. */}
      <form id="mailbox-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address *</FormLabel>
                <FormControl><Input type="email" placeholder="bookings@skyvisa.in" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display Name *</FormLabel>
                <FormControl><Input placeholder="Sky Visa Bookings" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="provider"
          render={() => (
            <FormItem>
              <FormLabel>Provider *</FormLabel>
              <Select value={provider} onValueChange={(v) => handleProviderChange(v as MailboxProvider)}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="gmail">Gmail</SelectItem>
                  <SelectItem value="outlook">Microsoft / Outlook</SelectItem>
                  <SelectItem value="custom">Custom (IMAP/SMTP)</SelectItem>
                </SelectContent>
              </Select>
              {isPresetProvider && (
                <p className="text-xs text-muted-foreground">
                  Host/port filled in automatically. You'll need an app password — see your{' '}
                  {provider === 'gmail' ? 'Google Account 2-Step Verification' : 'Microsoft 365 admin'} settings.
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="imapHost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>IMAP Host *</FormLabel>
                <FormControl><Input {...field} disabled={isPresetProvider} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="imapPort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>IMAP Port *</FormLabel>
                <FormControl><Input type="number" {...field} disabled={isPresetProvider} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="imapSecure"
            render={({ field }) => (
              <FormItem className="flex flex-col justify-end">
                <FormLabel>Use SSL/TLS</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isPresetProvider} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="smtpHost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SMTP Host *</FormLabel>
                <FormControl><Input {...field} disabled={isPresetProvider} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="smtpPort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SMTP Port *</FormLabel>
                <FormControl><Input type="number" {...field} disabled={isPresetProvider} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="smtpSecure"
            render={({ field }) => (
              <FormItem className="flex flex-col justify-end">
                <FormLabel>Use SSL/TLS</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isPresetProvider} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username *</FormLabel>
                <FormControl><Input placeholder="Usually the same as the email" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{mailbox ? 'App Password' : 'App Password *'}</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={mailbox ? 'Leave blank to keep existing' : 'App password (not your login password)'}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex items-center gap-6">
          <FormField
            control={form.control}
            name="isDefault"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Default mailbox</FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="isEnabled"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Enabled</FormLabel>
              </FormItem>
            )}
          />
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Test Connection</span>
            <Button type="button" variant="outline" size="sm" onClick={handleTestConnection} disabled={isTesting}>
              {isTesting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Test
            </Button>
          </div>
          {(testStatus.imap !== 'idle' || testStatus.smtp !== 'idle') && (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                {testStatus.imap === 'pass' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                IMAP {testStatus.imap === 'pass' ? 'connected' : 'failed'}
              </div>
              <div className="flex items-center gap-2">
                {testStatus.smtp === 'pass' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                SMTP {testStatus.smtp === 'pass' ? 'connected' : 'failed'}
              </div>
              {testStatus.error && <p className="text-xs text-muted-foreground">{testStatus.error}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 z-20 -mx-6 -mb-4 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
          <Button type="submit" disabled={isSaving} form="mailbox-form">
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mailbox ? 'Save Changes' : 'Connect Mailbox'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
