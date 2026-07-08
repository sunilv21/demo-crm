'use client';

import { useState } from 'react';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import type { Booking, Client, Payment, PaymentMode } from '@/lib/types';
import { bookingPaid, formatINR, PAYMENT_MODE_LABELS } from '@/lib/utils';
import { ledgerFor, newPaymentId, withAddedPayment, withRemovedPayment } from '@/lib/payments';
import { COMPANY } from '@/lib/company';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Printer, Trash2, Wallet } from 'lucide-react';

const MODES: PaymentMode[] = ['cash', 'upi', 'card', 'bank', 'cheque', 'other'];
const todayISO = () => new Date().toISOString().slice(0, 10);

export function PaymentsDialog({
  booking,
  client,
  onOpenChange,
}: {
  booking: Booking | null;
  client: Client | null;
  onOpenChange: (open: boolean) => void;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [reference, setReference] = useState('');

  if (!booking) return null;

  const ledger = ledgerFor(booking);
  const total = booking.total || 0;
  const paid = bookingPaid(booking);
  const balance = Math.max(0, total - paid);

  const write = (fields: Record<string, any>) => {
    if (!firestore) return;
    updateDocumentNonBlocking(doc(firestore, 'bookings', booking.id), {
      ...fields,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid ?? null,
    });
  };

  const addPayment = () => {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) {
      toast({ variant: 'destructive', title: 'Enter a valid amount', description: 'Amount must be greater than zero.' });
      return;
    }
    if (amt > balance) {
      toast({
        variant: 'destructive',
        title: 'Amount exceeds balance',
        description: `Outstanding balance is only ${formatINR(balance)}.`,
      });
      return;
    }
    const payment: Payment = {
      id: newPaymentId(),
      amount: amt,
      date: date || todayISO(),
      mode,
      reference: reference.trim() || undefined,
      // serverTimestamp() isn't allowed inside array elements — use a client ISO stamp.
      createdAt: new Date().toISOString(),
      createdBy: user?.uid,
      createdByName: user?.displayName || user?.email?.split('@')[0] || 'Staff',
    };
    write(withAddedPayment(booking, payment));
    toast({ title: 'Payment recorded', description: `${formatINR(amt)} received via ${PAYMENT_MODE_LABELS[mode]}.` });
    setAmount('');
    setReference('');
  };

  const removePayment = (id: string) => {
    write(withRemovedPayment(booking, id));
    toast({ title: 'Payment removed' });
  };

  const printReceipt = () => {
    const html = receiptHTML(booking, client, ledger, { total, paid, balance });
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const d = iframe.contentWindow?.document;
    if (!d) {
      iframe.remove();
      return;
    }
    d.write(html);
    d.close();
    let printed = false;
    const go = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        /* ignore */
      }
      setTimeout(() => iframe.remove(), 1000);
    };
    const imgs = Array.from(d.images);
    if (imgs.length) {
      let pending = imgs.length;
      const settle = () => { if (--pending <= 0) go(); };
      imgs.forEach((img) => { if (img.complete) settle(); else { img.onload = settle; img.onerror = settle; } });
    }
    setTimeout(go, 1000);
  };

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Payments — {booking.clientName}
          </DialogTitle>
          <DialogDescription>Record each installment. The balance updates automatically.</DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold">{formatINR(total)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-bold text-green-600">{formatINR(paid)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className={`text-lg font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatINR(balance)}</p>
          </div>
        </div>

        {/* Ledger */}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                    No payments recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {[...ledger]
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                .map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.date ? format(new Date(p.date), 'dd MMM yyyy') : '—'}</TableCell>
                    <TableCell>{PAYMENT_MODE_LABELS[p.mode] || p.mode}</TableCell>
                    <TableCell className="text-muted-foreground">{p.reference || '—'}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatINR(p.amount)}</TableCell>
                    <TableCell className="text-right">
                      {p.id !== 'opening' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePayment(p.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        {/* Add payment */}
        {balance > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input type="number" min={0} max={balance} value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference (optional)</Label>
              <Input value={reference} placeholder="Txn / cheque no." onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="sm:col-span-4">
              <Button onClick={addPayment} className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Payment
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-green-600 font-medium">Fully paid — nothing outstanding. 🎉</p>
        )}

        <div className="flex justify-end border-t pt-4">
          <Button variant="outline" onClick={printReceipt} disabled={ledger.length === 0}>
            <Printer className="mr-2 h-4 w-4" /> Print Receipt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Receipt (self-contained HTML for the print iframe) ---
function receiptHTML(
  booking: Booking,
  client: Client | null,
  payments: Payment[],
  totals: { total: number; paid: number; balance: number }
): string {
  const money = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
  const now = new Date();
  const receiptNo = `RC/${format(now, 'ddMMyy')}/${booking.id.slice(-4).toUpperCase()}`;
  const rows = [...payments]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(
      (p, i) => `<tr>
        <td>${i + 1}</td>
        <td>${p.date ? format(new Date(p.date), 'dd MMM yyyy') : '-'}</td>
        <td>${PAYMENT_MODE_LABELS[p.mode] || p.mode}</td>
        <td>${p.reference ? escapeHtml(p.reference) : '-'}</td>
        <td class="r">${money(p.amount)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <title>Payment Receipt</title>
  <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/" />
  <style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;margin:0;padding:24px;font-size:12px;}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e40af;padding-bottom:12px;}
    .logo{height:64px;}
    .co{text-align:right;}
    .co-name{color:#1e3a8a;font-size:18px;font-weight:800;}
    .co-line{color:#4b5563;font-size:10.5px;margin-top:2px;}
    .title{text-align:center;color:#1e40af;font-size:22px;font-weight:800;letter-spacing:1px;margin:18px 0 6px;}
    .meta{display:flex;justify-content:space-between;margin:10px 0 16px;}
    .meta div{font-size:12px;}
    .meta .k{color:#6b7280;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}
    th{background:#eff6ff;color:#1e3a8a;text-align:left;padding:8px;border:1px solid #dbeafe;font-weight:700;}
    td{padding:8px;border:1px solid #e5e7eb;}
    td.r,th.r{text-align:right;}
    .totals{margin-top:16px;margin-left:auto;width:280px;}
    .totals .row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;}
    .totals .grand{border-top:2px solid #1e40af;margin-top:4px;padding-top:8px;font-size:16px;font-weight:800;}
    .green{color:#16a34a;} .red{color:#dc2626;} .blue{color:#1e40af;}
    .foot{margin-top:36px;display:flex;justify-content:space-between;color:#6b7280;font-size:11px;}
    .sign{text-align:center;} .sign .line{border-top:1px solid #9ca3af;width:180px;margin:24px auto 4px;}
  </style></head><body>
    <div class="head">
      <img class="logo" src="/sky.png" alt="Sky Visa" onerror="this.style.display='none'"/>
      <div class="co">
        <div class="co-name">${COMPANY.name}</div>
        <div class="co-line">${COMPANY.address}</div>
        <div class="co-line">${COMPANY.phones.join(' | ')}</div>
        <div class="co-line">${COMPANY.email} | ${COMPANY.web}</div>
      </div>
    </div>
    <div class="title">PAYMENT RECEIPT</div>
    <div class="meta">
      <div>
        <div><span class="k">Received From:</span> <b>${escapeHtml(client?.name || booking.clientName || '-')}</b></div>
        ${client?.phone ? `<div><span class="k">Phone:</span> ${escapeHtml(client.phone)}</div>` : ''}
        <div><span class="k">Booking:</span> ${escapeHtml((booking.bookingType || 'booking').toString())}${booking.destination ? ' · ' + escapeHtml(booking.destination) : ''}</div>
      </div>
      <div style="text-align:right;">
        <div><span class="k">Receipt No:</span> <b>${receiptNo}</b></div>
        <div><span class="k">Date:</span> ${format(now, 'dd MMM yyyy')}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Date</th><th>Mode</th><th>Reference</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Booking Total</span><b>${money(totals.total)}</b></div>
      <div class="row"><span>Total Paid</span><b class="green">${money(totals.paid)}</b></div>
      <div class="row grand"><span>Balance Due</span><b class="${totals.balance > 0 ? 'red' : 'green'}">${money(totals.balance)}</b></div>
    </div>
    <div class="foot">
      <div>Thank you for your payment.</div>
      <div class="sign"><div class="line"></div>Authorized Signature</div>
    </div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}
