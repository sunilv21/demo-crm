
export type PaxType = 'adult' | 'child' | 'infant';

export type Companion = {
    name: string;
    type?: PaxType;
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  avatar?: string;
  role: 'employee' | 'manager' | 'admin' | 'agent' | 'finance';
  baseSalary?: number;
  workStartTime?: string;
  workEndTime?: string;
  lateGraceMinutes?: number;
  monthlyLeaveCap?: number;
  dailyBreakCapMinutes?: number;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
};

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'half-day'
  | 'absent'
  | 'leave'
  | 'holiday'
  | 'upcoming';

export type BreakSource = 'manual' | 'screen-lock' | 'personal';

export type AttendanceBreak = {
  id: string;            // uuid generated client-side
  start: any;            // Firestore Timestamp
  end?: any | null;      // null while ongoing
  source: BreakSource;
  durationMinutes?: number;
};

export type Attendance = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  punchIn: any;
  punchOut?: any;
  workStartTime: string;
  workEndTime: string;
  lateGraceMinutes: number;
  punchInLate: boolean;
  punchOutEarly: boolean;
  autoLoggedOut: boolean;
  workMinutes?: number;
  status: AttendanceStatus;
  notes?: string;
  // Break / away tracking. `breaks` is an ordered list; the LAST entry with
  // end == null is the one currently in progress (if any). `breakMinutes` is
  // the rolling total of CLOSED breaks for fast UI rendering.
  breaks?: AttendanceBreak[];
  breakMinutes?: number;
  // Active = workMinutes - breakMinutes (computed at punch-out and on the fly).
  activeMinutes?: number;
  /** Heartbeat written by client every minute while app is open and punched in.
   * Gaps in this timestamp are reconciled into screen-lock breaks on next login. */
  lastActiveAt?: any;
  createdAt: any;
  updatedAt: any;
};

export type LeaveType = 'casual' | 'sick' | 'earned' | 'lop';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type Leave = {
  id: string;
  userId: string;
  userName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approvedBy?: string;
  approvedAt?: any;
  rejectedBy?: string;
  rejectedAt?: any;
  rejectionReason?: string;
  createdAt: any;
  updatedAt: any;
};

export type Holiday = {
  id: string;
  date: string;
  name: string;
  createdAt: any;
  createdBy: string;
};

export type RequiredDocument = {
  name: string;
  status: 'pending' | 'uploaded' | 'verified' | 'received';
};

export type VisaHistoryItem = {
  country: string;
  status: 'approved' | 'rejected';
  date: string;
  rejectionReason?: string;
};

export type PreviousTrip = {
  country: string;
  startDate: string;
  endDate: string;
};

// A corporate account that groups multiple clients. The org holds no bookings
// or money of its own — its totals are the roll-up of its member clients'
// bookings (computed on read). See the /organizations pages.
export type Organization = {
  id: string;
  name: string;
  type: 'corporate';
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  billingAddress?: string;
  notes?: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// Hotel Master — created once, then reused across bookings (auto-filling the
// booking form) and vouchers (Terms & Conditions are fetched from here
// instead of being retyped per booking).
export type Hotel = {
  id: string;
  name: string;
  city?: string;
  country?: string;
  address?: string;
  phone?: string;
  termsAndConditions?: string; // free text, one bullet per line — printed on this hotel's vouchers
  notes?: string; // anything else worth recording about this hotel
  active: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type Client = {
  id:string;
  name: string;
  // When set, this client belongs to a corporate Organization (one org per
  // client). Empty/undefined means a standalone individual. The client still
  // appears normally in the Clients list either way.
  organizationId?: string;
  email?: string;
  phone: string;
  // Last 10 digits of `phone`, stripped of formatting/country-code — lets a
  // duplicate-phone check match regardless of how the number was formatted.
  // See normalizePhoneDigits() in lib/utils.ts. Set by ClientForm; may be
  // absent on older client docs written before this field existed.
  phoneDigits?: string;
  avatar: string;
  preferences: string;
  status: 'active' | 'inactive' | 'lead' | 'prospect';
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  nationality?: string;
  preferredDestination?: string;
  travelPurpose?: string;
  preferredTravelDates?: { from?: string; to?: string };
  // Multi-destination itinerary: each country visited on the trip with its dates
  tripDestinations?: { destination?: string; from?: string; to?: string }[];
  budget?: number;
  hotelPreference?: string;
  services?: ('flight' | 'hotel' | 'visa' | 'transfers' | 'activity' | 'localTours')[];
  additionalServices?: ('travelInsurance' | 'airportPickup' | 'localTours')[];
  assignedEmployees?: string[];
  visaStatus?: 'toStart' | 'inProcess' | 'applied' | 'approved' | 'rejected' | 'completed' | 'travelling';
  visaHistory?: VisaHistoryItem[];
  previousTrips?: PreviousTrip[];
  requiredDocuments?: RequiredDocument[];
  followUpDate?: string;
  pax?: number;
  companions?: Companion[];
  // Opt-out of bulk email campaigns (Phase 3). Excluded from campaign
  // recipient pickers regardless of other filters. Set manually here or
  // automatically via the campaign email's unsubscribe link.
  doNotEmail?: boolean;
  // Package in progress (see lib/booking-package.ts): while set, every new
  // booking created for this client auto-joins this package instead of
  // being priced on its own — the agent no longer has to link each one by
  // hand. Cleared by "End package"; bookings already linked keep their link.
  activePackageId?: string;
  activePackageLabel?: string;
  activePackageStartedAt?: any;
  activePackageStartedBy?: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type LeadStatus = 'new' | 'contacted' | 'proposal' | 'won' | 'lost';

export type Lead = {
  id: string;
  name: string;
  email?: string;
  phone: string;
  avatar: string;
  status: LeadStatus;
  source?: string;
  // Richer optional detail captured from website leads / for conversion.
  nationality?: string;
  preferredDestination?: string;
  travelPurpose?: string;
  preferredTravelDates?: { from?: string; to?: string };
  budget?: number;
  pax?: number;
  notes?: string;
  // Set when a lead has been converted into a client record.
  convertedToClientId?: string;
  convertedAt?: any;
  // Fields written by the external marketing website (/api/leads relay).
  // It uses `destination`/`message` rather than preferredDestination/notes,
  // and prefixes source as `website:<form>`.
  destination?: string;
  message?: string;
  rawPayload?: Record<string, any>;
  localRef?: { collection: string; id: string } | null;
  sourceWebsite?: string;
  phoneDigits?: string;
  phoneSuffix10?: string;
  // See Client.doNotEmail — same opt-out concept, respected by campaign
  // recipient pickers.
  doNotEmail?: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type BookingType =
| 'flight'
| 'hotel'
| 'car'
| 'activity'
| 'visa'
| 'other';

export type BookingStatus =
  | 'draft'
  | 'pending'
  | 'hold'
  | 'confirmed'
  | 'cancelled';

export type PaymentStatus =
| 'unpaid'
| 'partial'
| 'paid'
| 'refunded';

export type PaymentMode = 'cash' | 'card' | 'upi' | 'bank' | 'cheque' | 'wallet' | 'other';

// A single installment/receipt against a booking.
export type Payment = {
  id: string;
  amount: number;
  date: string; // ISO date the payment was received
  mode: PaymentMode;
  reference?: string;
  note?: string;
  createdAt?: any;
  createdBy?: string;
  createdByName?: string;
  // Which company account this payment was deposited into (Finance → Accounts).
  // Flows into the derived Finance transaction — see bookingPaymentsAsTransactions().
  accountId?: string;
  // Id of the linked Finance income transaction (booking payments flow into the
  // Finance module). Used to cancel that transaction if the payment is removed.
  financeTxnId?: string;
};

export type Booking = {
  id: string;

  // Client
  clientId: string;
  clientName: string;

  // Sales agent who OWNS this booking for revenue attribution. Auto-set to the
  // first agent who adds pricing (Cost Breakdown); if unset, attribution falls
  // back to createdBy when the creator is an agent. Separates "who sold it" from
  // "who typed it in" (an employee can create; an agent can own).
  agentId?: string;

  // Booking
  bookingType: BookingType;
  destination?: string;

  // Flight-specific
  isOneWay?: boolean;
  hasLayover?: boolean;
  layoverAirport?: string;
  isMultiCity?: boolean;
  sectors?: {
    origin?: string;
    destination?: string;
    departure?: string;
    cabinClass?: string;
    flightNumber?: string;
    airportCode?: string;
  }[];

  // Flight passenger names (the traveller(s) the ticket is booked for)
  flightPassengers?: { name?: string }[];

  // Visa applicants (one row per person on a visa booking)
  visaApplicants?: {
    name?: string;
    passportNumber?: string;
    validFrom?: string;
    validUntil?: string;
  }[];

  // Hotel guest names (printed on the voucher)
  hotelGuests?: { name?: string }[];

  // Portal the booking was made through (flight/hotel/etc.)
  bookingPortal?: string;

  startDate: string;
  endDate: string;

  status: BookingStatus;
  progress: number;

  // Financials
  total: number;
  amountPaid?: number;
  balanceAmount?: number;
  paymentStatus?: PaymentStatus;
  // Installment ledger. amountPaid/balanceAmount are kept in sync as a cache.
  payments?: Payment[];

  // Supplier
  supplierName?: string;
  supplierCost?: number;
  supplierReference?: string;

  // Profit = total (customer price) − supplierCost (booking price)
  profit?: number;

  // Generic Dynamic Data
  bookingDetails?: Record<string, any>;

  // Documents
  documents?: {
  name: string;
  url?: string;
  uploadedAt?: any;
  }[];

  // Notes
  remarks?: string;

  // Cancellation & refund (populated when status === 'cancelled').
  //   cancellationCharges = amount the agency retains (cancellation fee)
  //   refundAmount        = amount owed back to the customer (paid − charges)
  //   refundStatus        = 'pending' until the money is actually returned
  cancellationReason?: string;
  cancelledAt?: string;
  cancellationCharges?: number;
  refundAmount?: number;
  refundStatus?: 'pending' | 'processed';
  refundedAt?: string;
  refundMode?: PaymentMode;
  refundReference?: string;

  // Reconciliation (Finance → Reconciliation): staff confirms these against
  // the supplier's own portal (VFS/airline/hotel extranet) or bank statement.
  supplierCostVerified?: boolean;
  supplierCostVerifiedAt?: any;
  supplierCostVerifiedBy?: string;
  supplierCostVerifiedByName?: string;
  supplierCostVerifiedNote?: string;
  refundVerified?: boolean;
  refundVerifiedAt?: any;
  refundVerifiedBy?: string;
  refundVerifiedByName?: string;
  refundVerifiedNote?: string;

  // "Needs attention" (Reconciliation): set once a booking is cancelled
  // AFTER its supplier cost was already verified/paid — money may be sitting
  // with the supplier for a booking that no longer exists. Tracks how it was
  // resolved: clawed back from the supplier ('recovered', with a linked
  // income transaction) or accepted as a loss ('written_off', no reversal).
  supplierCostRecoveryStatus?: 'pending' | 'recovered' | 'written_off';
  supplierCostRecoveryAt?: any;
  supplierCostRecoveryBy?: string;
  supplierCostRecoveryByName?: string;
  supplierCostRecoveryNote?: string;

  // Finance-editable correction (Reconciliation): the booking was entered
  // into the system late, so `createdAt` doesn't reflect when it was really
  // made. When set, this ISO date (yyyy-mm-dd) is used instead of
  // `createdAt` for the "Booking date" column/filter — `createdAt` itself is
  // left untouched as the true record-creation timestamp.
  bookingDateOverride?: string;
  bookingDateOverrideBy?: string;
  bookingDateOverrideByName?: string;
  bookingDateOverrideAt?: any;

  // Package linking: when a client buys one bundled package (e.g. flight +
  // hotel + visa for one all-in price), each component is still its own
  // Booking document (so vouchers/type-specific fields keep working), but
  // they're linked together here. `packageGroupId` is shared by every
  // booking in the package (normally = the Client's `activePackageId` at
  // the time it was created — see lib/booking-package.ts); exactly one of
  // them has `packageIsPrimary: true` and carries the package's real
  // total/supplierCost. The rest normally have total=0/supplierCost=0
  // since that money isn't priced separately.
  packageGroupId?: string;
  packageIsPrimary?: boolean;

  // Archival: once a booking is fully paid it can be archived out of the active
  // bookings list into the client's Travel History (keeps the list uncluttered).
  // Archives manually, or automatically 15 days after the full payment is received.
  archived?: boolean;
  archivedAt?: any;
  // Set when a booking is manually un-archived, so the 15-day auto-archive rule
  // doesn't immediately pull it back into Travel History.
  archiveExempt?: boolean;

  // Timeline
  timeline?: {
  action: string;
  userId: string;
  userName: string;
  createdAt: any;
  }[];

  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};


export type Invoice = {
  id: string;
  bookingId: string;
  clientName: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'unpaid' | 'overdue';
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type CustomerLog = {
  id: string;
  clientId: string;
  clientName?: string;
  userName?: string;
  activity: string;
  userId: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type FollowUp = {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  date: string;
  notes: string | null;
  done: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// ---------------------------------------------------------------------------
// Finance module (company cash flow) — visible to admin + finance role only.
// Balances are computed on read from transactions (see src/lib/finance.ts);
// no stored currentBalance is mutated.
// ---------------------------------------------------------------------------

export type FinanceAccountType = 'cash' | 'petty-cash' | 'current' | 'savings' | 'wallet';

export type FinanceAccount = {
  id: string;
  name: string;
  type: FinanceAccountType;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  openingBalance: number;
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type FinanceSupplier = {
  id: string;
  name: string;
  category?: string; // e.g. VFS, Airline, Hotel, Courier, Utilities, Employee
  contactPerson?: string;
  phone?: string;
  email?: string;
  gst?: string;
  address?: string;
  notes?: string;
  // Links this supplier to one of their Finance accounts (typically a
  // 'wallet'-type account holding a prepaid balance for them) — lets Money
  // Out / Reconciliation pre-select the right account when paying them.
  linkedAccountId?: string;
  status: 'active' | 'inactive';
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  active: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type PaymentMethodDoc = {
  id: string;
  name: string;
  direction: 'incoming' | 'outgoing';
  requiresReference?: boolean;
  requiresAttachment?: boolean;
  active?: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// An expense logged by an agent (money they spent on the business). It is a
// PENDING REIMBURSEMENT — NOT a company expense until finance reimburses the
// agent. Reimbursing creates a real finance transaction (the company expense).
export type AgentExpense = {
  id: string;
  amount: number;
  date: string; // ISO date
  category?: string; // what kind of spend
  purpose?: string;  // what it was for (description)
  payee?: string;    // where / to whom
  paymentMethod?: string; // how the agent paid (Cash / UPI / …)
  // Reimbursement (set by finance when the company pays the agent back).
  reimbursed?: boolean;
  reimbursedAt?: string;
  reimbursedTxnId?: string; // the finance_transactions expense created on payout
  createdAt: any;
  createdBy: string;
  createdByName?: string;
  updatedAt: any;
  updatedBy: string;
};

// ---------------------------------------------------------------------------
// Email Communication module (Phase 1) — admin-only mailbox connections,
// sending, and inbox reading. Credentials are never plaintext in Firestore;
// see src/lib/mailbox-crypto.ts. See mailboxes/{id} rules in firestore.rules
// — clients may only read this collection, all writes go through the
// src/app/api/settings/mailboxes/* API routes.
// ---------------------------------------------------------------------------

export type MailboxProvider = 'gmail' | 'outlook' | 'custom';

export type Mailbox = {
  id: string;
  email: string;
  displayName: string;
  provider: MailboxProvider;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  // Encrypted (AES-256-GCM) — never plaintext. See src/lib/mailbox-crypto.ts.
  passwordCiphertext: string;
  passwordIv: string;
  passwordAuthTag: string;
  passwordKeyVersion: number;
  isDefault: boolean;
  isEnabled: boolean;
  lastTestedAt?: any;
  lastTestStatus?: 'success' | 'failed' | null;
  lastTestError?: string | null;
  lastSyncedAt?: any;
  lastSeenUid?: number | null;
  lastSeenUidValidity?: number | null;
  syncState: 'idle' | 'syncing' | 'error';
  syncError?: string | null;
  // Set when syncState flips to 'syncing', cleared on completion — lets a
  // sync run detect and reclaim a prior run that died mid-flight instead of
  // staying permanently blocked. See STUCK_SYNC_TIMEOUT_MS.
  syncStartedAt?: any;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// WhatsApp — 'whatsapp_web' is the unofficial, QR-linked personal/business number
// via a persistent whatsapp-web.js bridge process. 'twilio'/'meta_cloud' are the
// official REST+webhook APIs — no persistent process needed, so they work on the
// free (Spark) plan.
export type WhatsAppProvider = 'whatsapp_web' | 'twilio' | 'meta_cloud';
export type WhatsAppAccountStatus = 'pending_qr' | 'connected' | 'disconnected' | 'error';

export type WhatsAppAccount = {
  id: string;
  label: string;
  provider: WhatsAppProvider;
  phoneNumber?: string; // populated once connected
  status: WhatsAppAccountStatus;
  qr?: string | null; // whatsapp_web only — transient data-URL QR, cleared once connected
  connectionError?: string | null;
  isDefault: boolean;
  isEnabled: boolean;
  lastConnectedAt?: any;

  // Meta Cloud API (provider: 'meta_cloud')
  metaPhoneNumberId?: string;
  metaWabaId?: string;
  // Encrypted (AES-256-GCM) — see src/lib/mailbox-crypto.ts.
  metaAccessTokenCiphertext?: string;
  metaAccessTokenIv?: string;
  metaAccessTokenAuthTag?: string;

  // Twilio (provider: 'twilio')
  twilioAccountSid?: string;
  twilioAuthTokenCiphertext?: string;
  twilioAuthTokenIv?: string;
  twilioAuthTokenAuthTag?: string;
  twilioWhatsAppFrom?: string; // e.g. "whatsapp:+14155238886"

  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// Global Meta Cloud API settings — one Meta App backs every connected
// WABA/number, so this is a single doc (id 'meta_cloud'), not per-account.
// Configured from the UI (Accounts tab), not env vars, so it can change
// without a redeploy.
export type WhatsAppMetaSettings = {
  id: string;
  // Encrypted (AES-256-GCM) — verifies X-Hub-Signature-256 on webhook calls.
  appSecretCiphertext?: string;
  appSecretIv?: string;
  appSecretAuthTag?: string;
  // Not a high-value secret (only used for the one-time GET handshake, and
  // POST payloads are still signature-checked with appSecret) — kept in
  // plain text so the admin UI can display it for copy-pasting into Meta's
  // webhook config screen.
  verifyToken: string;
  updatedAt: any;
  updatedBy: string;
};

export type WhatsAppMessageStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type WhatsAppMessage = {
  id: string;
  accountId: string;
  chatId: string; // WhatsApp JID, e.g. "9198xxxxxxx@c.us" or "<lid>@lid"
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  body: string;
  // Best-effort contact info resolved at message time (whatsapp_web only) —
  // chatId itself isn't a readable phone number for LID-based contacts, so
  // the chat UI needs these to show something better than a raw id.
  contactName?: string | null;
  contactPhone?: string | null;
  // Set for group messages — chatId is the group's own JID ("...@g.us") in
  // that case, and msg.author (WhatsApp's term) identifies who within the
  // group actually sent it, since "from" is the group, not the person.
  isGroup?: boolean;
  groupName?: string | null;
  senderJid?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  status?: WhatsAppMessageStatus; // outbound only
  // The provider's own message id (Twilio MessageSid / Meta wamid) — outbound
  // only, captured at send time so a later delivery/read status callback can
  // find and update this exact doc.
  providerMessageId?: string;
  // Set only for messages sent by a WhatsApp campaign — lets the campaign
  // detail view join this message's live delivery status (sent/delivered/
  // read, kept current by the same ack/webhook pipelines as 1:1 chat) back
  // onto the specific recipient it was sent to.
  campaignId?: string | null;
  campaignRecipientId?: string | null;
  // Set for document messages (e.g. a voucher sent from Bookings) — the chat
  // UI renders an attachment chip instead of/alongside plain body text.
  mediaUrl?: string;
  mediaFilename?: string;
  isRead: boolean;
  timestamp: any;
  syncedAt: any;
};

export type EmailLogStatus = 'sent' | 'failed';

export type EmailLog = {
  id: string;
  mailboxId: string;
  mailboxEmail: string;
  to: string[];
  cc?: string[] | null;
  bcc?: string[] | null;
  subject: string;
  bodyPreview: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  bodyTruncated?: boolean;
  status: EmailLogStatus;
  errorMessage?: string | null;
  messageId?: string | null;
  sentBy: string;
  sentByName: string;
  relatedClientId?: string | null;
  relatedBookingId?: string | null;
  createdAt: any;
};

// Canned email text with {{variable}} tokens — see src/lib/email-template.ts.
// Not a secret, so (unlike Mailbox) this is plain client-side Firestore CRUD.
export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// Bulk email campaigns (Phase 3). Sending itself is server-only (mailbox
// password decryption), but the campaign/recipient docs themselves hold no
// secrets, so unlike Mailbox this is plain client-side Firestore CRUD.
export type CampaignStatus = 'paused' | 'running' | 'completed' | 'cancelled';

export type Campaign = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  mailboxId: string;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  scheduledStartAt: any;
  status: CampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type CampaignRecipientStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'retrying' | 'cancelled';

export type CampaignRecipient = {
  id: string;
  campaignId: string;
  recipientType: 'client' | 'lead';
  recipientId: string;
  email: string;
  name: string;
  status: CampaignRecipientStatus;
  attempts: number;
  scheduledSendAt: any;
  lastError?: string | null;
  messageId?: string | null;
  // Rendered per-recipient content at the moment it was sent — captured so
  // the Sent tab can show exactly what went out (campaign.subject/bodyHtml
  // hold the raw {{token}} template, not what any one recipient received).
  sentSubject?: string | null;
  sentBodyHtml?: string | null;
  unsubscribeToken: string;
  sentAt?: any;
  createdAt: any;
};

// Bulk WhatsApp campaigns — mirrors Campaign/CampaignRecipient above, but the
// send goes through whatever whatsapp_accounts entry is picked (any
// provider) instead of a mailbox, and content is plain text (no
// subject/HTML, no unsubscribe footer — not an email concept here).
export type WhatsAppCampaignStatus = 'paused' | 'running' | 'completed' | 'cancelled';

export type WhatsAppCampaign = {
  id: string;
  name: string;
  body: string;
  accountId: string;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  scheduledStartAt: any;
  status: WhatsAppCampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type WhatsAppCampaignRecipientStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'retrying' | 'cancelled';

export type WhatsAppCampaignRecipient = {
  id: string;
  campaignId: string;
  recipientType: 'client' | 'lead';
  recipientId: string;
  phone: string;
  name: string;
  status: WhatsAppCampaignRecipientStatus;
  attempts: number;
  scheduledSendAt: any;
  lastError?: string | null;
  // Rendered content actually sent — campaign.body holds the raw
  // {{token}} template, this is what one specific recipient received.
  sentBody?: string | null;
  sentAt?: any;
  createdAt: any;
};

// Canned WhatsApp text — see src/lib/whatsapp-template.ts. Only
// {{customer_name}} is a recognized token (that renderer leaves anything
// else untouched rather than blanking it, unlike the email template
// renderer). Not a secret, so this is plain client-side Firestore CRUD.
export type WhatsAppTemplate = {
  id: string;
  name: string;
  body: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// Append-only audit trail for higher-signal admin/email actions (Phase 4).
// Written both server-side (mailbox API routes, via adminDb) and
// client-side (campaign/template actions — see firestore.rules, immutable
// after create).
export type AuditAction =
  | 'mailbox.created'
  | 'mailbox.deleted'
  | 'mailbox.enabled'
  | 'mailbox.disabled'
  | 'campaign.started'
  | 'campaign.paused'
  | 'campaign.cancelled'
  | 'campaign.deleted'
  | 'template.created'
  | 'template.updated'
  | 'template.deleted'
  | 'whatsapp_account.created'
  | 'whatsapp_account.deleted'
  | 'whatsapp_campaign.started'
  | 'whatsapp_campaign.paused'
  | 'whatsapp_campaign.cancelled'
  | 'whatsapp_campaign.deleted'
  | 'whatsapp_template.created'
  | 'whatsapp_template.updated'
  | 'whatsapp_template.deleted'
  | 'client.merged';

export type AuditLog = {
  id: string;
  action: AuditAction;
  targetType: 'mailbox' | 'campaign' | 'template' | 'whatsapp_account' | 'whatsapp_campaign' | 'whatsapp_template' | 'client';
  targetId: string;
  targetLabel: string;
  actorId: string;
  actorName: string;
  metadata?: Record<string, any> | null;
  createdAt: any;
};

export type InboxMessage = {
  id: string;
  mailboxId: string;
  mailboxEmail: string;
  folder: string;
  uid: number;
  uidValidity: number;
  messageIdHeader?: string;
  from: { name: string; address: string };
  to: { name: string; address: string }[];
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string | null;
  bodyTruncated?: boolean;
  hasAttachments: boolean;
  attachmentsMeta?: { filename: string; size: number; contentType: string }[];
  date: any;
  isRead: boolean;
  syncedAt: any;
};

export type FinanceTxnType = 'income' | 'expense' | 'transfer';
export type FinanceTxnStatus = 'completed' | 'cancelled';

export type FinanceTransaction = {
  id: string;
  type: FinanceTxnType;
  amount: number;
  date: string; // ISO date
  // For income → destination account; expense → source account;
  // transfer → source (from) account, with toAccountId as destination.
  // An expense can also set toAccountId to fund a wallet-type account (e.g.
  // depositing cash into a supplier's Riya wallet) — the source is debited,
  // the wallet is credited, and it counts as a normal expense.
  accountId: string;
  toAccountId?: string;
  // Set when this expense draws down an already-funded wallet account (e.g.
  // paying a booking's supplier cost out of the Riya wallet balance) — the
  // deposit that funded the wallet was already counted as the expense, so
  // this draw-down still reduces the wallet's balance and still links to the
  // booking, but is excluded from expense totals/reports to avoid counting
  // the same money leaving the business twice.
  excludeFromExpenseTotal?: boolean;
  // Optional links to the commercial records.
  clientId?: string;
  clientName?: string;
  bookingId?: string;
  invoiceId?: string;
  supplierId?: string;
  supplierName?: string;
  categoryId?: string;
  categoryName?: string;
  paymentMethod?: string;
  reference?: string;
  remarks?: string;
  status: FinanceTxnStatus;
  // 'booking' = derived from / reconciled from a booking payment; 'agent' =
  // derived from an agent-logged expense; 'manual' = entered in the Finance
  // module; 'refund' = a booking refund payout.
  source?: 'booking' | 'agent' | 'manual' | 'refund';
  bookingPaymentId?: string;
  createdAt: any;
  createdBy: string;
  createdByName?: string;
  updatedAt: any;
  updatedBy: string;
};
