'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MessageCircle, Send, Loader2, PlusCircle, Check, CheckCheck, AlertCircle, FileText, Info } from 'lucide-react';
import type { Client, WhatsAppAccount, WhatsAppMessage } from '@/lib/types';
import { useAppUser, useCollection, useFirestore, useMemoFirebase, useUser, setDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, where, doc, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { sendWhatsAppMessage } from '@/lib/whatsapp-client';
import { cn } from '@/lib/utils';

// The bridge canonicalizes chatId to the contact's bare phone digits (no
// "@c.us"/"@lid" suffix) — WhatsApp's LID privacy system means the same
// contact's JID can differ by direction, so grouping by a raw JID here would
// split one conversation into two. Match that shape when starting a new chat.
function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

const ACCOUNT_STORAGE_KEY = 'whatsapp-chat-selected-account';
const CHAT_STORAGE_KEY = 'whatsapp-chat-selected-chat';

// Nothing was ever lost on refresh — messages are written straight to
// Firestore, not held in local state — but neither the selected account nor
// the selected chat was remembered across a reload, so a refresh always
// landed back on "Select a chat to read it" (or even a different account),
// which looked exactly like the conversation had disappeared. Restoring
// both from sessionStorage fixes that (per-tab only, so a fresh tab still
// starts clean rather than surprising a different user on a shared machine).
function readStoredValue(key: string): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(key) || '';
}

export function WhatsAppChatTab() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { isAdminOrManager } = useAppUser();
  const { toast } = useToast();
  const [selectedAccountId, setSelectedAccountId] = useState(() => readStoredValue(ACCOUNT_STORAGE_KEY));
  const [selectedChatId, setSelectedChatId] = useState<string | null>(() => readStoredValue(CHAT_STORAGE_KEY) || null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);

  // New chat: either pick an existing CRM client (uses their saved phone) or
  // type any number directly — covers both "someone already in the CRM" and
  // "just a contact on the phone."
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'client' | 'phone'>('client');
  const [newChatClientId, setNewChatClientId] = useState('');
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatMessage, setNewChatMessage] = useState('');
  const [isStartingChat, setIsStartingChat] = useState(false);

  const clientsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return isAdminOrManager
      ? query(collection(firestore, 'clients'), orderBy('name', 'asc'))
      : query(collection(firestore, 'clients'), where('assignedEmployees', 'array-contains', user.uid));
  }, [firestore, user, isAdminOrManager]);
  const { data: clients } = useCollection<Client>(clientsQuery);
  const clientsWithPhone = useMemo(() => (clients || []).filter((c) => c.phone?.trim()), [clients]);

  // Keyed by the last 10 digits so formatting differences (leading 0,
  // missing/extra country code) between a client's saved phone and what
  // WhatsApp reports as contactPhone still match.
  const clientNameByPhone = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientsWithPhone) {
      const digits = normalizePhone(c.phone!);
      if (digits.length >= 10) map.set(digits.slice(-10), c.name);
    }
    return map;
  }, [clientsWithPhone]);

  // chatId (the WhatsApp JID) isn't readable for LID-based contacts — prefer
  // a matching CRM client's name, then WhatsApp's own contact info (recorded
  // per-message by the bridge), falling back to the raw id as a last resort.
  function displayNameFor(latest: WhatsAppMessage | undefined, chatId: string): string {
    const phone = latest?.contactPhone;
    if (phone) {
      const clientName = clientNameByPhone.get(phone.slice(-10));
      if (clientName) return clientName;
    }
    return latest?.contactName || phone || chatId.split('@')[0];
  }

  const accountsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    // No orderBy here previously meant Firestore's arbitrary result order
    // decided which account was auto-selected — with none marked isDefault,
    // that silently landed on an old/unrelated account instead of whichever
    // was actually just connected. Most-recently-connected first fixes that.
    return query(collection(firestore, 'whatsapp_accounts'), where('status', '==', 'connected'), orderBy('lastConnectedAt', 'desc'));
  }, [firestore]);
  const { data: accounts, isLoading: accountsLoading } = useCollection<WhatsAppAccount>(accountsQuery);

  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    // Either nothing selected yet, or a restored selection that no longer
    // points at a connected account (deleted/disconnected since) — pick one.
    if (!selectedAccountId || !accounts.some((a) => a.id === selectedAccountId)) {
      const def = accounts.find((a) => a.isDefault) ?? accounts[0];
      setSelectedAccountId(def.id);
    }
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    if (selectedAccountId) window.sessionStorage.setItem(ACCOUNT_STORAGE_KEY, selectedAccountId);
  }, [selectedAccountId]);

  useEffect(() => {
    if (selectedChatId) window.sessionStorage.setItem(CHAT_STORAGE_KEY, selectedChatId);
    else window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
  }, [selectedChatId]);

  const messagesQuery = useMemoFirebase(() => {
    if (!firestore || !selectedAccountId) return null;
    return query(
      collection(firestore, 'whatsapp_messages'),
      where('accountId', '==', selectedAccountId),
      orderBy('timestamp', 'desc'),
      limit(500)
    );
  }, [firestore, selectedAccountId]);
  const { data: messages, isLoading: messagesLoading } = useCollection<WhatsAppMessage>(messagesQuery);

  // Group the flat message list into one row per chat (most recent message
  // first) — whatsapp_messages has no separate "chats" collection.
  const chats = useMemo(() => {
    const byChat = new Map<string, WhatsAppMessage[]>();
    for (const m of messages || []) {
      const list = byChat.get(m.chatId) ?? [];
      list.push(m);
      byChat.set(m.chatId, list);
    }
    return [...byChat.entries()]
      .map(([chatId, msgs]) => ({
        chatId,
        latest: msgs[0], // already sorted desc by the query
        unreadCount: msgs.filter((m) => m.direction === 'inbound' && !m.isRead).length,
      }))
      .sort((a, b) => (b.latest.timestamp?.toMillis?.() ?? 0) - (a.latest.timestamp?.toMillis?.() ?? 0));
  }, [messages]);

  const thread = useMemo(
    () => (messages || []).filter((m) => m.chatId === selectedChatId).slice().reverse(),
    [messages, selectedChatId]
  );

  // Keep the newest message in view — otherwise sending/receiving one that
  // pushes the thread past a screenful leaves you looking at older history
  // until you manually scroll down.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread, selectedChatId]);

  function openChat(chatId: string) {
    setSelectedChatId(chatId);
    if (!firestore) return;
    for (const m of messages || []) {
      if (m.chatId === chatId && m.direction === 'inbound' && !m.isRead) {
        setDocumentNonBlocking(doc(firestore, 'whatsapp_messages', m.id), { isRead: true }, { merge: true });
      }
    }
  }

  async function handleSend() {
    if (!user || !selectedAccountId || !selectedChatId || !draft.trim()) return;
    setIsSending(true);
    try {
      await sendWhatsAppMessage(user, { accountId: selectedAccountId, to: selectedChatId, body: draft.trim() });
      setDraft('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to send', description: err?.message });
    } finally {
      setIsSending(false);
    }
  }

  function closeNewChat() {
    setIsNewChatOpen(false);
    setNewChatMode('client');
    setNewChatClientId('');
    setNewChatPhone('');
    setNewChatMessage('');
  }

  async function handleStartChat() {
    if (!user || !selectedAccountId || !newChatMessage.trim()) return;
    const phone =
      newChatMode === 'client'
        ? clientsWithPhone.find((c) => c.id === newChatClientId)?.phone
        : newChatPhone;
    if (!phone?.trim()) {
      toast({ variant: 'destructive', title: 'A phone number is required.' });
      return;
    }
    const digits = normalizePhone(phone);
    if (!digits) {
      toast({ variant: 'destructive', title: 'Invalid phone number', description: 'Include the country code, e.g. 919876543210.' });
      return;
    }

    setIsStartingChat(true);
    try {
      // For whatsapp_web, the bridge may resolve `digits` to a different
      // chatId (WhatsApp's LID privacy ids) than what was typed — select
      // whatever it actually stored the message under, not our guess.
      const result = await sendWhatsAppMessage(user, { accountId: selectedAccountId, to: digits, body: newChatMessage.trim() });
      setSelectedChatId(result.chatId || digits);
      closeNewChat();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to send', description: err?.message });
    } finally {
      setIsStartingChat(false);
    }
  }

  if (!accountsLoading && (!accounts || accounts.length === 0)) {
    return (
      <div className="text-center p-12 text-muted-foreground">
        <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No connected WhatsApp numbers yet. Connect one under Accounts to start chatting here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={selectedAccountId} onValueChange={(v) => { setSelectedAccountId(v); setSelectedChatId(null); }}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Select a WhatsApp number" />
          </SelectTrigger>
          <SelectContent>
            {(accounts || []).map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.label} — {a.phoneNumber}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => setIsNewChatOpen(true)}
          disabled={!selectedAccountId}
          className="bg-[#25D366] hover:bg-[#20BD5C] text-white dark:bg-[#00A884] dark:hover:bg-[#02906F]"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Dialog open={isNewChatOpen} onOpenChange={(open) => !open && closeNewChat()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a new chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={newChatMode === 'client' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewChatMode('client')}
              >
                CRM Client
              </Button>
              <Button
                type="button"
                variant={newChatMode === 'phone' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewChatMode('phone')}
              >
                Phone Number
              </Button>
            </div>

            {newChatMode === 'client' ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Client</Label>
                <Select value={newChatClientId} onValueChange={setNewChatClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder={clientsWithPhone.length ? 'Select a client' : 'No clients with a phone number'} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientsWithPhone.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="wa-new-phone" className="text-xs text-muted-foreground">
                  Phone number (with country code)
                </Label>
                <Input
                  id="wa-new-phone"
                  placeholder="e.g. 91 98765 43210"
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="wa-new-message" className="text-xs text-muted-foreground">Message</Label>
              <Textarea
                id="wa-new-message"
                rows={3}
                placeholder="Type the opening message..."
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeNewChat}>Cancel</Button>
            <Button onClick={handleStartChat} disabled={isStartingChat || !newChatMessage.trim()}>
              {isStartingChat && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <Card className="border rounded-lg overflow-hidden">
          <ScrollArea className="h-[520px]">
            {messagesLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3 border-b space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              ))}
            {!messagesLoading && chats.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No chats yet.</div>
            )}
            {!messagesLoading &&
              chats.map((c) => (
                <button
                  key={c.chatId}
                  onClick={() => openChat(c.chatId)}
                  className={cn(
                    'w-full text-left p-3 border-b hover:bg-[#F5F6F6] dark:hover:bg-[#202C33] transition-colors',
                    selectedChatId === c.chatId && 'bg-[#F0F2F5] dark:bg-[#2A3942]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm truncate', c.unreadCount > 0 && 'font-semibold')}>
                      {displayNameFor(c.latest, c.chatId)}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25D366] dark:bg-[#00A884] px-1 text-[10px] font-semibold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className={cn('text-xs text-muted-foreground truncate', c.unreadCount > 0 && 'font-medium text-foreground')}>
                    {c.latest.direction === 'outbound' ? 'You: ' : ''}{c.latest.body}
                  </div>
                </button>
              ))}
          </ScrollArea>
        </Card>

        <Card className="border rounded-lg flex flex-col h-[520px]">
          {!selectedChatId ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a chat to read it.
            </div>
          ) : (
            <>
              <div className="border-b px-4 py-3 font-medium text-sm bg-[#075E54] text-white dark:bg-[#202C33] flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-0.5 hover:bg-white/10"
                      aria-label="Chat details"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto text-xs space-y-1">
                    <div className="font-medium text-foreground">Chat details</div>
                    <div className="text-muted-foreground">
                      WhatsApp id: <span className="font-mono text-foreground">{selectedChatId}</span>
                    </div>
                  </PopoverContent>
                </Popover>
                <span className="truncate">
                  {displayNameFor(chats.find((c) => c.chatId === selectedChatId)?.latest, selectedChatId)}
                </span>
              </div>
              <ScrollArea className="flex-1 p-4 bg-[#E5DDD5] dark:bg-[#0B141A]">
                <div className="space-y-2">
                  {thread.map((m) => (
                    <div key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm',
                          m.direction === 'outbound'
                            ? 'bg-[#D9FDD3] text-[#111B21] dark:bg-[#005C4B] dark:text-[#E9EDEF]'
                            : 'bg-white text-[#111B21] dark:bg-[#202C33] dark:text-[#E9EDEF]'
                        )}
                      >
                        {m.mediaUrl && (
                          <a
                            href={m.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-md bg-black/5 dark:bg-white/10 px-2 py-1.5 mb-1 text-xs hover:underline"
                          >
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="truncate">{m.mediaFilename || 'Attachment'}</span>
                          </a>
                        )}
                        {m.body}
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-[#667781] dark:text-[#8696A0] justify-end">
                          {m.timestamp?.toDate ? m.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          {m.direction === 'outbound' && <MessageStatusIcon status={m.status} />}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              <div className="border-t p-3 flex items-center gap-2 bg-[#F0F2F5] dark:bg-[#202C33]">
                <Input
                  placeholder="Type a message..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={isSending}
                  className="rounded-full bg-white dark:bg-[#2A3942]"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={isSending || !draft.trim()}
                  className="rounded-full bg-[#25D366] hover:bg-[#20BD5C] text-white dark:bg-[#00A884] dark:hover:bg-[#02906F] shrink-0"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// Read-receipt indicator for an outbound bubble — WhatsApp's own convention:
// single gray check (sent), double gray check (delivered), double blue
// check (read). Blue works safely here since the bubble is the WhatsApp
// green (#D9FDD3), not blue — the blend problem only existed when the
// bubble itself was bg-primary blue. Twilio/Meta both update `status` via
// their delivery webhooks (see src/app/api/webhooks/whatsapp/**); no status
// yet just shows nothing.
function MessageStatusIcon({ status }: { status?: WhatsAppMessage['status'] }) {
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-[#53BDEB]" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-[#667781] dark:text-[#8696A0]" />;
  if (status === 'sent') return <Check className="h-3.5 w-3.5 text-[#667781] dark:text-[#8696A0]" />;
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  return null;
}
